from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionDocumentModel,
    PreAdmissionEventModel,
)
from src.infrastructure.repositories.sqlalchemy_pre_admission_repository import (
    SQLAlchemyPreAdmissionRepository,
)
from src.interface.api.schemas.pre_admission_schemas import (
    AdmissionBlockerSchema,
    AdmissionCandidateSummarySchema,
    AdmissionCaseSummarySchema,
    AdmissionCaseWorkspaceResponse,
    AdmissionCaseWorkspaceSummarySchema,
    AdmissionChecklistItemSchema,
    AdmissionChecklistSummarySchema,
    AdmissionDocumentSummarySchema,
    AdmissionJobSummarySchema,
    AdmissionNextActionSchema,
    AdmissionRecentEventSchema,
)

READY_ITEM_STATUSES = {"approved", "waived"}
TERMINAL_NOT_EXPORTABLE_STATUSES = {"cancelled", "offer_declined"}


class AdmissionReadinessError(Exception):
    def __init__(self, blockers: list[AdmissionBlockerSchema]) -> None:
        self.blockers = blockers
        super().__init__("Caso de pré-admissão possui pendências para exportação.")


class AdmissionCaseWorkspaceService:
    def __init__(self, repository: SQLAlchemyPreAdmissionRepository) -> None:
        self._repository = repository

    async def get_workspace(self, *, case_id: UUID) -> AdmissionCaseWorkspaceResponse:
        case, pipeline, candidate, job = await self._load_workspace_context(case_id)
        return await self._workspace_response(
            case=case,
            pipeline=pipeline,
            candidate=candidate,
            job=job,
        )

    async def approve_checklist_item(
        self,
        *,
        item_id: UUID,
        actor_id: UUID | None,
    ) -> AdmissionCaseWorkspaceResponse:
        case, item = await self._required_item_context(item_id)
        now = datetime.now(UTC)
        item.status = "approved"
        item.updated_at = now
        document = self._latest_active_document(item)
        if document is not None:
            document.status = "approved"
            document.reviewed_at = now
            document.reviewed_by = actor_id
            document.review_notes = None
            document.updated_at = now
        await self._repository.flush()
        await self._event(
            case_id=case.id,
            event_type="checklist_item_approved",
            actor_id=actor_id,
            payload={
                "checklist_item_id": str(item.id),
                "document_id": str(document.id) if document else None,
            },
        )
        await self._recalculate_case_readiness(case)
        return await self.get_workspace(case_id=case.id)

    async def reject_checklist_item(
        self,
        *,
        item_id: UUID,
        actor_id: UUID | None,
    ) -> AdmissionCaseWorkspaceResponse:
        return await self._reject_or_request_correction(
            item_id=item_id,
            actor_id=actor_id,
            event_type="checklist_item_rejected",
            review_notes="Item rejeitado.",
        )

    async def request_checklist_item_correction(
        self,
        *,
        item_id: UUID,
        actor_id: UUID | None,
    ) -> AdmissionCaseWorkspaceResponse:
        return await self._reject_or_request_correction(
            item_id=item_id,
            actor_id=actor_id,
            event_type="checklist_item_correction_requested",
            review_notes="Correção solicitada.",
        )

    async def mark_checklist_item_not_required(
        self,
        *,
        item_id: UUID,
        actor_id: UUID | None,
    ) -> AdmissionCaseWorkspaceResponse:
        case, item = await self._required_item_context(item_id)
        item.status = "waived"
        item.required = False
        item.updated_at = datetime.now(UTC)
        await self._repository.flush()
        await self._event(
            case_id=case.id,
            event_type="checklist_item_marked_not_required",
            actor_id=actor_id,
            payload={"checklist_item_id": str(item.id)},
        )
        await self._recalculate_case_readiness(case)
        return await self.get_workspace(case_id=case.id)

    async def mark_ready_for_export(
        self,
        *,
        case_id: UUID,
        actor_id: UUID | None,
    ) -> AdmissionCaseWorkspaceResponse:
        case, pipeline, candidate, job = await self._load_workspace_context(case_id)
        blockers = self._readiness_blockers(case=case, pipeline_is_active=True)
        if blockers:
            case.ready_for_export = False
            case.ready_for_export_at = None
            case.ready_for_export_by = None
            await self._repository.flush()
            raise AdmissionReadinessError(blockers)

        now = datetime.now(UTC)
        case.ready_for_export = True
        case.ready_for_export_at = now
        case.ready_for_export_by = actor_id
        case.status = "ready_for_admission"
        case.updated_at = now
        await self._repository.flush()
        await self._event(
            case_id=case.id,
            event_type="case_ready_for_export",
            actor_id=actor_id,
            payload={"ready_for_export": True},
        )
        return await self._workspace_response(
            case=case,
            pipeline=pipeline,
            candidate=candidate,
            job=job,
        )

    async def _reject_or_request_correction(
        self,
        *,
        item_id: UUID,
        actor_id: UUID | None,
        event_type: str,
        review_notes: str,
    ) -> AdmissionCaseWorkspaceResponse:
        case, item = await self._required_item_context(item_id)
        now = datetime.now(UTC)
        item.status = "rejected"
        item.updated_at = now
        document = self._latest_active_document(item)
        if document is not None:
            document.status = "rejected"
            document.reviewed_at = now
            document.reviewed_by = actor_id
            document.review_notes = review_notes
            document.updated_at = now
        await self._repository.flush()
        await self._event(
            case_id=case.id,
            event_type=event_type,
            actor_id=actor_id,
            payload={
                "checklist_item_id": str(item.id),
                "document_id": str(document.id) if document else None,
            },
        )
        await self._recalculate_case_readiness(case)
        return await self.get_workspace(case_id=case.id)

    async def _load_workspace_context(
        self,
        case_id: UUID,
    ) -> tuple[PreAdmissionCaseModel, CandidateJobPipelineModel, CandidateModel, JobModel]:
        case = await self._repository.get_case(case_id)
        if case is None:
            raise NotFoundException("Caso de pré-admissão não encontrado.")

        pipeline = await self._repository.get_active_pipeline_for_candidate(
            candidate_id=case.candidate_id,
        )
        if pipeline is None or pipeline.job_id != case.job_id:
            raise ValidationException(
                "Caso de pré-admissão não pertence ao pipeline ativo do candidato."
            )

        candidate = await self._repository.get_candidate(pipeline.candidate_id)
        job = await self._repository.get_job(pipeline.job_id)
        if candidate is None:
            raise NotFoundException("Candidato do pipeline ativo não encontrado.")
        if job is None:
            raise NotFoundException("Vaga do pipeline ativo não encontrada.")
        return case, pipeline, candidate, job

    async def _required_item_context(
        self,
        item_id: UUID,
    ) -> tuple[PreAdmissionCaseModel, PreAdmissionChecklistItemModel]:
        item = await self._repository.get_checklist_item_by_id(item_id)
        if item is None:
            raise NotFoundException("Item de checklist não encontrado.")
        case = await self._repository.get_case(item.case_id)
        if case is None:
            raise NotFoundException("Caso de pré-admissão não encontrado.")
        await self._load_workspace_context(case.id)
        return case, item

    async def _workspace_response(
        self,
        *,
        case: PreAdmissionCaseModel,
        pipeline: CandidateJobPipelineModel,
        candidate: CandidateModel,
        job: JobModel,
    ) -> AdmissionCaseWorkspaceResponse:
        events = await self._repository.list_recent_events(case_id=case.id, limit=10)
        user_names = await self._user_names_for(case=case, events=events)
        blockers = self._readiness_blockers(case=case, pipeline_is_active=True)
        ready_for_export = not blockers
        return AdmissionCaseWorkspaceResponse(
            case=AdmissionCaseSummarySchema(
                id=case.id,
                status=case.status,
                current_stage=pipeline.pipeline_stage,
                created_at=case.created_at,
                updated_at=case.updated_at,
            ),
            candidate=AdmissionCandidateSummarySchema(
                id=candidate.id,
                name=candidate.full_name,
                initials=self._initials(candidate.full_name),
                avatar_url=candidate.google_picture_url,
            ),
            job=AdmissionJobSummarySchema(id=job.id, title=job.title),
            checklist=self._checklist_summary(case=case, events=events, user_names=user_names),
            documents=self._document_summaries(case),
            main_blockers=blockers,
            next_actions=self._next_actions(ready_for_export=ready_for_export),
            summary=AdmissionCaseWorkspaceSummarySchema(
                responsible_name=user_names.get(case.created_by) if case.created_by else None,
                created_at=case.created_at,
                last_update_at=case.updated_at,
                readiness_status="ready" if ready_for_export else "not_ready",
                ready_for_export=ready_for_export,
            ),
            recent_events=[self._recent_event(event) for event in events],
        )

    async def _recalculate_case_readiness(self, case: PreAdmissionCaseModel) -> None:
        pipeline = await self._repository.get_active_pipeline_for_candidate(
            candidate_id=case.candidate_id,
        )
        pipeline_is_active = pipeline is not None and pipeline.job_id == case.job_id
        ready = not self._readiness_blockers(case=case, pipeline_is_active=pipeline_is_active)
        now = datetime.now(UTC)
        case.ready_for_export = ready
        if not ready:
            case.ready_for_export_at = None
            case.ready_for_export_by = None
        case.updated_at = now
        await self._repository.flush()

    def _readiness_blockers(
        self,
        *,
        case: PreAdmissionCaseModel,
        pipeline_is_active: bool,
    ) -> list[AdmissionBlockerSchema]:
        blockers: list[AdmissionBlockerSchema] = []
        if not pipeline_is_active:
            blockers.append(
                AdmissionBlockerSchema(
                    type="inactive_pipeline",
                    severity="high",
                    title="Pipeline ativo divergente",
                    description="O caso não está vinculado à vaga ativa atual do candidato.",
                    action="review_pipeline",
                )
            )
        if case.status in TERMINAL_NOT_EXPORTABLE_STATUSES:
            blockers.append(
                AdmissionBlockerSchema(
                    type="case_cancelled",
                    severity="high",
                    title="Caso encerrado",
                    description="Casos cancelados ou com oferta recusada não podem ser exportados.",
                    action="review_case",
                )
            )

        for item in case.checklist_items:
            active_document = self._latest_active_document(item)
            if item.status == "rejected":
                blockers.append(
                    AdmissionBlockerSchema(
                        type="rejected_item",
                        severity="high",
                        title=f"{item.title} rejeitado",
                        description="Resolva a rejeição antes de liberar o caso para exportação.",
                        action="request_correction",
                    )
                )
                continue

            if item.required and item.status != "waived" and active_document is None:
                blockers.append(
                    AdmissionBlockerSchema(
                        type="missing_document",
                        severity="high",
                        title=f"{item.title} ausente",
                        description="Solicite o envio para prosseguir com o checklist.",
                        action="request_document",
                    )
                )
                continue

            if item.required and item.status not in READY_ITEM_STATUSES:
                blockers.append(
                    AdmissionBlockerSchema(
                        type="pending_checklist_item",
                        severity="medium",
                        title=f"{item.title} pendente",
                        description=(
                            "Revise e aprove o item obrigatório ou marque-o como não obrigatório."
                        ),
                        action="approve_document",
                    )
                )
        return blockers

    def _checklist_summary(
        self,
        *,
        case: PreAdmissionCaseModel,
        events: list[PreAdmissionEventModel],
        user_names: dict[UUID, str],
    ) -> AdmissionChecklistSummarySchema:
        items = sorted(case.checklist_items, key=lambda item: (item.created_at, str(item.id)))
        response_items: list[AdmissionChecklistItemSchema] = []
        for position, item in enumerate(items, start=1):
            active_document = self._latest_active_document(item)
            actor_id = self._latest_item_actor_id(item=item, events=events)
            response_items.append(
                AdmissionChecklistItemSchema(
                    id=item.id,
                    title=item.title,
                    status=self._workspace_item_status(item.status),
                    required=item.required,
                    position=position,
                    updated_at=item.updated_at,
                    updated_by_name=user_names.get(actor_id) if actor_id else None,
                    document_id=active_document.id if active_document else None,
                )
            )

        return AdmissionChecklistSummarySchema(
            total=len(items),
            approved=sum(1 for item in items if item.status == "approved"),
            pending=sum(1 for item in items if item.status in {"pending", "received"}),
            blocked=sum(1 for item in items if item.status == "rejected"),
            items=response_items,
        )

    def _document_summaries(
        self,
        case: PreAdmissionCaseModel,
    ) -> list[AdmissionDocumentSummarySchema]:
        documents: list[AdmissionDocumentSummarySchema] = []
        for item in case.checklist_items:
            for document in item.documents:
                if document.status == "replaced" or document.deleted_at is not None:
                    continue
                documents.append(
                    AdmissionDocumentSummarySchema(
                        id=document.id,
                        filename=document.original_filename,
                        document_type=item.item_type,
                        status=document.status,
                        uploaded_at=document.uploaded_at,
                        approved_at=document.reviewed_at if document.status == "approved" else None,
                    )
                )
        return sorted(documents, key=lambda document: document.uploaded_at, reverse=True)

    async def _user_names_for(
        self,
        *,
        case: PreAdmissionCaseModel,
        events: list[PreAdmissionEventModel],
    ) -> dict[UUID, str]:
        user_ids = {event.actor_id for event in events if event.actor_id is not None}
        if case.created_by is not None:
            user_ids.add(case.created_by)
        for item in case.checklist_items:
            for document in item.documents:
                if document.reviewed_by is not None:
                    user_ids.add(document.reviewed_by)
        return await self._repository.get_user_names(user_ids)

    async def _event(
        self,
        *,
        case_id: UUID,
        event_type: str,
        actor_id: UUID | None,
        payload: dict | None,
    ) -> None:
        await self._repository.add_event(
            PreAdmissionEventModel(
                case_id=case_id,
                event_type=event_type,
                actor_id=actor_id,
                payload_json=payload,
                created_at=datetime.now(UTC),
            )
        )

    @staticmethod
    def _latest_active_document(
        item: PreAdmissionChecklistItemModel,
    ) -> PreAdmissionDocumentModel | None:
        documents = [
            document
            for document in item.documents
            if document.status != "replaced" and document.deleted_at is None
        ]
        if not documents:
            return None
        return max(
            documents,
            key=lambda document: (document.uploaded_at, document.created_at, str(document.id)),
        )

    @staticmethod
    def _latest_item_actor_id(
        *,
        item: PreAdmissionChecklistItemModel,
        events: list[PreAdmissionEventModel],
    ) -> UUID | None:
        for event in events:
            payload = event.payload_json or {}
            if (
                payload.get("checklist_item_id") == str(item.id)
                or payload.get("item_id") == str(item.id)
            ):
                return event.actor_id
        document = AdmissionCaseWorkspaceService._latest_active_document(item)
        return document.reviewed_by if document is not None else None

    @staticmethod
    def _next_actions(*, ready_for_export: bool) -> list[AdmissionNextActionSchema]:
        return [
            AdmissionNextActionSchema(
                type="approve_document",
                label="Aprovar documento",
                enabled=True,
            ),
            AdmissionNextActionSchema(
                type="request_correction",
                label="Solicitar correção",
                enabled=True,
            ),
            AdmissionNextActionSchema(
                type="open_protheus_integration",
                label="Abrir integração Protheus",
                enabled=ready_for_export,
                disabled_reason=None if ready_for_export else "Checklist incompleto",
            ),
        ]

    @staticmethod
    def _recent_event(event: PreAdmissionEventModel) -> AdmissionRecentEventSchema:
        payload = event.payload_json or {}
        filename = payload.get("original_filename")
        titles = {
            "case_created": "Caso criado",
            "case_ready_for_export": "Caso pronto para exportação",
            "checklist_item_approved": "Item aprovado",
            "checklist_item_rejected": "Item rejeitado",
            "checklist_item_correction_requested": "Correção solicitada",
            "checklist_item_marked_not_required": "Item dispensado",
            "document_uploaded": "Documento enviado",
            "document_approved": "Documento aprovado",
            "document_rejected": "Documento rejeitado",
        }
        descriptions = {
            "case_created": "Caso de pré-admissão criado.",
            "case_ready_for_export": "Caso validado e marcado como pronto para exportação.",
            "checklist_item_approved": "Item do checklist aprovado.",
            "checklist_item_rejected": "Item do checklist rejeitado.",
            "checklist_item_correction_requested": (
                "Foi solicitada correção para um item do checklist."
            ),
            "checklist_item_marked_not_required": "Item marcado como não obrigatório.",
            "document_uploaded": (
                f"{filename} foi enviado pelo candidato."
                if filename
                else "Documento enviado pelo candidato."
            ),
            "document_approved": "Documento aprovado.",
            "document_rejected": "Documento rejeitado.",
        }
        return AdmissionRecentEventSchema(
            id=event.id,
            type=event.event_type,
            title=titles.get(event.event_type, event.event_type.replace("_", " ").title()),
            description=descriptions.get(
                event.event_type,
                "Evento registrado no caso de pré-admissão.",
            ),
            created_at=event.created_at,
        )

    @staticmethod
    def _workspace_item_status(status: str) -> str:
        if status == "waived":
            return "not_required"
        return status

    @staticmethod
    def _initials(name: str) -> str:
        parts = [part for part in name.strip().split() if part]
        if not parts:
            return ""
        if len(parts) == 1:
            return parts[0][:2].upper()
        return f"{parts[0][0]}{parts[-1][0]}".upper()
