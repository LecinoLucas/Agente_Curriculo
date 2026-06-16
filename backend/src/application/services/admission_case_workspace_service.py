from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import httpx

from src.core.settings import settings
from src.application.services.pre_admission_state_machine import (
    PRE_ADMISSION_CASE_ENTITY,
    PRE_ADMISSION_CHECKLIST_ITEM_ENTITY,
    PRE_ADMISSION_DOCUMENT_ENTITY,
    READY_CHECKLIST_ITEM_STATUSES,
    TERMINAL_CASE_STATUSES,
    derive_case_status_from_checklist,
    transition_payload,
    transition_status,
)
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
    AdmissionCaseDocumentsResponse,
    AdmissionCaseEventsPageResponse,
    AdmissionCaseOverviewResponse,
    AdmissionCaseSummarySchema,
    AdmissionCaseWorkspaceResponse,
    AdmissionCaseWorkspaceSummarySchema,
    AdmissionChecklistItemSchema,
    AdmissionChecklistSummarySchema,
    AdmissionDocumentSummarySchema,
    AdmissionIntegrationStatusSchema,
    AdmissionJobSummarySchema,
    AdmissionNextActionSchema,
    AdmissionProtheusBridgeLatestTraceSchema,
    AdmissionProtheusBridgeSafetySchema,
    AdmissionProtheusBridgeSummaryResponse,
    AdmissionProgressSchema,
    AdmissionRecentEventSchema,
)

TERMINAL_NOT_EXPORTABLE_STATUSES = {"cancelled", "offer_declined", "dismissed"}


class AdmissionReadinessError(Exception):
    def __init__(self, blockers: list[AdmissionBlockerSchema]) -> None:
        self.blockers = blockers
        super().__init__("Caso de pré-admissão possui pendências para exportação.")


class AdmissionCaseWorkspaceService:
    def __init__(self, repository: SQLAlchemyPreAdmissionRepository) -> None:
        self._repository = repository

    async def get_overview(self, *, case_id: UUID) -> AdmissionCaseOverviewResponse:
        case, pipeline, candidate, job = await self._load_overview_context(case_id)
        user_names = await self._repository.get_user_names(
            {case.created_by} if case.created_by is not None else set()
        )
        return self._overview_response(
            case=case,
            pipeline=pipeline,
            candidate=candidate,
            job=job,
            responsible_name=user_names.get(case.created_by) if case.created_by else None,
        )

    async def get_documents(self, *, case_id: UUID) -> AdmissionCaseDocumentsResponse:
        case, _pipeline, _candidate, _job = await self._load_workspace_context(case_id)
        events = await self._repository.list_recent_events(case_id=case.id, limit=10)
        user_names = await self._user_names_for(case=case, events=events)
        return AdmissionCaseDocumentsResponse(
            checklist=self._checklist_summary(case=case, events=events, user_names=user_names),
            documents=self._document_summaries(case=case, user_names=user_names),
        )

    async def get_events(
        self,
        *,
        case_id: UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> AdmissionCaseEventsPageResponse:
        case = await self._repository.get_case_overview(case_id)
        if case is None:
            raise NotFoundException("Caso de pré-admissão não encontrado.")
        pipeline = await self._repository.get_latest_pipeline_for_job_candidate(
            candidate_id=case.candidate_id,
            job_id=case.job_id,
        )
        if pipeline is None:
            raise ValidationException(
                "Caso de pré-admissão não possui pipeline vinculado."
            )

        offset = (page - 1) * page_size
        total = await self._repository.count_events(case_id=case.id)
        events = await self._repository.list_events_page(
            case_id=case.id,
            offset=offset,
            limit=page_size,
        )
        user_names = await self._repository.get_user_names(
            {event.actor_id for event in events if event.actor_id is not None}
        )
        return AdmissionCaseEventsPageResponse(
            items=[self._recent_event(event, user_names=user_names) for event in events],
            total=total,
            page=page,
            page_size=page_size,
            has_next=offset + len(events) < total,
        )

    async def get_workspace(self, *, case_id: UUID) -> AdmissionCaseWorkspaceResponse:
        case, pipeline, candidate, job = await self._load_workspace_context(case_id)
        return await self._workspace_response(
            case=case,
            pipeline=pipeline,
            candidate=candidate,
            job=job,
        )

    async def get_protheus_bridge_summary(
        self,
        *,
        case_id: UUID,
    ) -> AdmissionProtheusBridgeSummaryResponse:
        await self._load_workspace_context(case_id)
        return await self._load_bridge_summary()

    async def approve_checklist_item(
        self,
        *,
        item_id: UUID,
        actor_id: UUID | None,
    ) -> AdmissionCaseWorkspaceResponse:
        case, item = await self._required_item_context(item_id)
        now = datetime.now(UTC)
        transition_status(item, entity=PRE_ADMISSION_CHECKLIST_ITEM_ENTITY, to_status="approved")
        item.updated_at = now
        document = self._latest_active_document(item)
        if document is not None:
            transition_status(document, entity=PRE_ADMISSION_DOCUMENT_ENTITY, to_status="approved")
            document.reviewed_at = now
            document.reviewed_by = actor_id
            document.review_notes = None
            document.updated_at = now
        await self._repository.flush()
        await self._sync_case_status_after_checklist_change(
            case=case,
            actor_id=actor_id,
            reason="checklist_item_approved",
        )
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
            rejection_reason_public="Este documento foi rejeitado pelo RH. Envie uma nova versão ou entre em contato com o RH para mais informações.",
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
            rejection_reason_public="O RH solicitou correção deste documento. Envie uma nova versão ou entre em contato com o RH para mais detalhes.",
        )

    async def mark_checklist_item_not_required(
        self,
        *,
        item_id: UUID,
        actor_id: UUID | None,
    ) -> AdmissionCaseWorkspaceResponse:
        case, item = await self._required_item_context(item_id)
        transition_status(item, entity=PRE_ADMISSION_CHECKLIST_ITEM_ENTITY, to_status="waived")
        item.required = False
        item.updated_at = datetime.now(UTC)
        await self._repository.flush()
        await self._sync_case_status_after_checklist_change(
            case=case,
            actor_id=actor_id,
            reason="checklist_item_marked_not_required",
        )
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
        old_status, new_status = transition_status(
            case,
            entity=PRE_ADMISSION_CASE_ENTITY,
            to_status="ready_for_admission",
        )
        case.updated_at = now
        await self._repository.flush()
        await self._event(
            case_id=case.id,
            event_type="case_ready_for_export",
            actor_id=actor_id,
            payload={
                "ready_for_export": True,
                **transition_payload(old_status=old_status, new_status=new_status),
            },
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
        rejection_reason_public: str | None = None,
    ) -> AdmissionCaseWorkspaceResponse:
        case, item = await self._required_item_context(item_id)
        now = datetime.now(UTC)
        transition_status(item, entity=PRE_ADMISSION_CHECKLIST_ITEM_ENTITY, to_status="rejected")
        item.updated_at = now
        document = self._latest_active_document(item)
        if document is not None:
            transition_status(document, entity=PRE_ADMISSION_DOCUMENT_ENTITY, to_status="rejected")
            document.reviewed_at = now
            document.reviewed_by = actor_id
            document.review_notes = review_notes
            document.rejection_reason_public = rejection_reason_public
            document.updated_at = now
        await self._repository.flush()
        await self._sync_case_status_after_checklist_change(
            case=case,
            actor_id=actor_id,
            reason=event_type,
        )
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

        pipeline = await self._repository.get_active_pipeline_for_job_candidate(
            candidate_id=case.candidate_id,
            job_id=case.job_id,
        )
        if pipeline is None:
            raise ValidationException(
                "Caso de pré-admissão não possui pipeline ativo vinculado."
            )

        candidate = await self._repository.get_candidate(pipeline.candidate_id)
        job = await self._repository.get_job(pipeline.job_id)
        if candidate is None:
            raise NotFoundException("Candidato do pipeline ativo não encontrado.")
        if job is None:
            raise NotFoundException("Vaga do pipeline ativo não encontrada.")
        return case, pipeline, candidate, job

    async def _load_overview_context(
        self,
        case_id: UUID,
    ) -> tuple[PreAdmissionCaseModel, CandidateJobPipelineModel, CandidateModel, JobModel]:
        case = await self._repository.get_case_overview(case_id)
        if case is None:
            raise NotFoundException("Caso de pré-admissão não encontrado.")

        pipeline = await self._repository.get_latest_pipeline_for_job_candidate(
            candidate_id=case.candidate_id,
            job_id=case.job_id,
        )
        if pipeline is None:
            raise ValidationException(
                "Caso de pré-admissão não possui pipeline vinculado."
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
            documents=self._document_summaries(case=case, user_names=user_names),
            main_blockers=blockers,
            next_actions=self._next_actions(ready_for_export=ready_for_export),
            summary=AdmissionCaseWorkspaceSummarySchema(
                responsible_name=user_names.get(case.created_by) if case.created_by else None,
                created_at=case.created_at,
                last_update_at=case.updated_at,
                readiness_status="ready" if ready_for_export else "not_ready",
                ready_for_export=ready_for_export,
            ),
            recent_events=[self._recent_event(event, user_names=user_names) for event in events],
        )

    async def _load_bridge_summary(self) -> AdmissionProtheusBridgeSummaryResponse:
        dashboard_url = settings.PROTHEUS_BRIDGE_DASHBOARD_URL.rstrip("/")
        safety = AdmissionProtheusBridgeSafetySchema()

        if not settings.PROTHEUS_BRIDGE_ENABLED:
            return AdmissionProtheusBridgeSummaryResponse(
                enabled=False,
                available=False,
                status="disabled",
                message="Integração Protheus Bridge desativada neste ambiente.",
                environment=None,
                storage_mode=None,
                readiness=None,
                latest_trace=None,
                safety=safety,
                next_action="Ative a bridge apenas em ambientes controlados de simulação técnica.",
                dashboard_url=dashboard_url,
            )

        base_url = settings.PROTHEUS_BRIDGE_BASE_URL.rstrip("/")
        if not base_url or not settings.PROTHEUS_BRIDGE_INTERNAL_API_KEY.strip():
            return AdmissionProtheusBridgeSummaryResponse(
                enabled=True,
                available=False,
                status="unavailable",
                message="Protheus Bridge não está configurada corretamente neste ambiente.",
                environment=None,
                storage_mode=None,
                readiness=None,
                latest_trace=None,
                safety=safety,
                next_action="Revise as variáveis PROTHEUS_BRIDGE_BASE_URL e PROTHEUS_BRIDGE_INTERNAL_API_KEY.",
                dashboard_url=dashboard_url,
            )

        request_url = f"{base_url}/internal/protheus/dashboard/status"
        try:
            async with httpx.AsyncClient(
                timeout=settings.PROTHEUS_BRIDGE_TIMEOUT_SECONDS,
                follow_redirects=False,
            ) as client:
                response = await client.get(
                    request_url,
                    headers={"X-Internal-Api-Key": settings.PROTHEUS_BRIDGE_INTERNAL_API_KEY},
                )
                response.raise_for_status()
                payload = response.json()
        except httpx.TimeoutException:
            return AdmissionProtheusBridgeSummaryResponse(
                enabled=True,
                available=False,
                status="unavailable",
                message="Protheus Bridge indisponível no momento.",
                environment=None,
                storage_mode=None,
                readiness=None,
                latest_trace=None,
                safety=safety,
                next_action="Verifique se o serviço da bridge está rodando em modo memory ou full.",
                dashboard_url=dashboard_url,
            )
        except (httpx.RequestError, httpx.HTTPStatusError, ValueError):
            return AdmissionProtheusBridgeSummaryResponse(
                enabled=True,
                available=False,
                status="unavailable",
                message="Protheus Bridge indisponível no momento.",
                environment=None,
                storage_mode=None,
                readiness=None,
                latest_trace=None,
                safety=safety,
                next_action="Verifique se o serviço da bridge está rodando em modo memory ou full.",
                dashboard_url=dashboard_url,
            )

        bridge = payload if isinstance(payload, dict) else {}
        latest_trace_payload = bridge.get("latest_trace")
        latest_trace_data = latest_trace_payload if isinstance(latest_trace_payload, dict) else {}
        latest_trace = self._bridge_latest_trace(latest_trace_data)

        overall_status = str(bridge.get("overall_status") or bridge.get("status") or "unknown").lower()
        storage_mode = str(bridge.get("storage_mode") or "unknown")
        environment = str(
            bridge.get("logical_environment")
            or bridge.get("environment")
            or bridge.get("protheus_environment")
            or "unknown"
        )
        real_send_enabled = bool(bridge.get("real_send_enabled"))
        erp_allow_real_send = bool(bridge.get("erp_allow_real_send"))
        summary_status = self._bridge_status(
            overall_status=overall_status,
            latest_trace=latest_trace,
            real_send_enabled=real_send_enabled,
            erp_allow_real_send=erp_allow_real_send,
        )

        return AdmissionProtheusBridgeSummaryResponse(
            enabled=True,
            available=True,
            status=summary_status,
            message=self._bridge_message(summary_status),
            environment=environment,
            storage_mode=storage_mode,
            readiness=overall_status,
            latest_trace=latest_trace,
            safety=safety,
            next_action=self._bridge_next_action(
                status=summary_status,
                real_send_enabled=real_send_enabled,
                erp_allow_real_send=erp_allow_real_send,
            ),
            dashboard_url=dashboard_url,
        )

    def _overview_response(
        self,
        *,
        case: PreAdmissionCaseModel,
        pipeline: CandidateJobPipelineModel,
        candidate: CandidateModel,
        job: JobModel,
        responsible_name: str | None,
    ) -> AdmissionCaseOverviewResponse:
        progress = self._progress_summary(case=case)
        blockers = self._overview_blockers(case=case, pipeline_is_active=True)
        ready_for_export = not blockers
        next_actions = self._next_actions(ready_for_export=ready_for_export)
        return AdmissionCaseOverviewResponse(
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
            status_label=self._case_status_label(case.status),
            progress=progress,
            main_blocker=blockers[0] if blockers else None,
            main_blockers=blockers,
            next_action=next_actions[0] if next_actions else None,
            next_actions=next_actions,
            summary=AdmissionCaseWorkspaceSummarySchema(
                responsible_name=responsible_name,
                created_at=case.created_at,
                last_update_at=case.updated_at,
                readiness_status="ready" if ready_for_export else "not_ready",
                ready_for_export=ready_for_export,
            ),
            integration_status=self._integration_status(case=case, blockers=blockers),
            updated_at=case.updated_at,
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

    def _progress_summary(self, *, case: PreAdmissionCaseModel) -> AdmissionProgressSchema:
        items = list(case.checklist_items)
        approved = sum(1 for item in items if item.status == "approved")
        waived = sum(1 for item in items if item.status == "waived")
        rejected = sum(1 for item in items if item.status == "rejected")
        in_review = sum(1 for item in items if item.status == "received")
        pending = sum(1 for item in items if item.status == "pending")
        return AdmissionProgressSchema(
            total=len(items),
            approved=approved,
            pending=pending,
            rejected=rejected,
            in_review=in_review,
            waived=waived,
        )

    @staticmethod
    def _bridge_latest_trace(
        payload: dict[str, object],
    ) -> AdmissionProtheusBridgeLatestTraceSchema | None:
        if not payload:
            return None

        created_at_raw = payload.get("created_at")
        created_at: datetime | None = None
        if isinstance(created_at_raw, str):
            try:
                created_at = datetime.fromisoformat(created_at_raw.replace("Z", "+00:00"))
            except ValueError:
                created_at = None

        return AdmissionProtheusBridgeLatestTraceSchema(
            trace_id=str(payload.get("trace_id")) if payload.get("trace_id") is not None else None,
            action_type=(
                str(payload.get("action_type"))
                if payload.get("action_type") is not None
                else (
                    str(payload.get("action"))
                    if payload.get("action") is not None
                    else None
                )
            ),
            status=str(payload.get("status")) if payload.get("status") is not None else None,
            blocked_reason=(
                str(payload.get("blocked_reason"))
                if payload.get("blocked_reason") is not None
                else None
            ),
            error_code=str(payload.get("error_code")) if payload.get("error_code") is not None else None,
            created_at=created_at,
        )

    @staticmethod
    def _bridge_status(
        *,
        overall_status: str,
        latest_trace: AdmissionProtheusBridgeLatestTraceSchema | None,
        real_send_enabled: bool,
        erp_allow_real_send: bool,
    ) -> str:
        latest_trace_status = (latest_trace.status or "").lower() if latest_trace else ""
        latest_trace_error_code = latest_trace.error_code or "" if latest_trace else ""
        if latest_trace and (
            latest_trace_status in {"blocked", "nonexec_blocked"}
            or latest_trace.blocked_reason
            or latest_trace_error_code.startswith("ERR_NONEXEC_")
        ):
            return "blocked"
        if real_send_enabled or erp_allow_real_send:
            return "warning"
        normalized_overall_status = overall_status.lower()
        if normalized_overall_status in {"blocked", "nonexec_blocked"}:
            return "blocked"
        if normalized_overall_status in {"ready", "ok", "healthy"}:
            return "ready"
        if normalized_overall_status in {"warning", "degraded", "partial"}:
            return "warning"
        return "warning"

    @staticmethod
    def _bridge_message(status: str) -> str:
        if status == "ready":
            return "Bridge operacional para simulações seguras."
        if status == "blocked":
            return "Última simulação foi bloqueada por segurança."
        if status == "warning":
            return "Bridge disponível com atenção operacional."
        return "Protheus Bridge indisponível."

    @staticmethod
    def _bridge_next_action(
        *,
        status: str,
        real_send_enabled: bool,
        erp_allow_real_send: bool,
    ) -> str:
        if real_send_enabled or erp_allow_real_send:
            return "Revise o cockpit técnico: envio real deve permanecer desativado neste fluxo read-only."
        if status == "blocked":
            return "Bloqueio de segurança detectado. Revise o cockpit técnico antes de prosseguir com novas simulações."
        if status == "ready":
            return "Simulação segura disponível no cockpit técnico."
        return "Verifique se o serviço da bridge está rodando em modo memory ou full."

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

            if item.required and item.status not in READY_CHECKLIST_ITEM_STATUSES:
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

    def _overview_blockers(
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

            if item.required and item.status == "pending":
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

            if item.required and item.status not in READY_CHECKLIST_ITEM_STATUSES and item.status != "waived":
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
        *,
        case: PreAdmissionCaseModel,
        user_names: dict[UUID, str],
    ) -> list[AdmissionDocumentSummarySchema]:
        documents: list[AdmissionDocumentSummarySchema] = []
        for item in case.checklist_items:
            latest_active = self._latest_active_document(item)
            for document in item.documents:
                if document.status == "replaced" or document.deleted_at is not None:
                    continue
                documents.append(
                    AdmissionDocumentSummarySchema(
                        id=document.id,
                        checklist_item_id=item.id,
                        checklist_title=item.title,
                        required=item.required,
                        filename=document.original_filename,
                        document_type=item.item_type,
                        mime_type=document.mime_type,
                        size_bytes=document.size_bytes,
                        status=document.status,
                        uploaded_at=document.uploaded_at,
                        reviewed_at=document.reviewed_at,
                        reviewed_by_name=(
                            user_names.get(document.reviewed_by) if document.reviewed_by else None
                        ),
                        review_notes=document.review_notes,
                        rejection_reason_public=document.rejection_reason_public,
                        approved_at=document.reviewed_at if document.status == "approved" else None,
                        is_current_for_item=latest_active is not None and latest_active.id == document.id,
                    )
                )
        return sorted(
            documents,
            key=lambda document: (
                document.is_current_for_item,
                document.uploaded_at,
                str(document.id),
            ),
            reverse=True,
        )

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

    async def _sync_case_status_after_checklist_change(
        self,
        *,
        case: PreAdmissionCaseModel,
        actor_id: UUID | None,
        reason: str,
    ) -> None:
        target_status = derive_case_status_from_checklist(
            current_status=case.status,
            checklist_items=case.checklist_items,
        )
        if target_status == case.status:
            return
        old_status, new_status = transition_status(
            case,
            entity=PRE_ADMISSION_CASE_ENTITY,
            to_status=target_status,
        )
        now = datetime.now(UTC)
        case.updated_at = now
        case.closed_at = now if new_status in TERMINAL_CASE_STATUSES else None
        await self._repository.flush()
        await self._event(
            case_id=case.id,
            event_type="status_changed",
            actor_id=actor_id,
            payload={
                **transition_payload(old_status=old_status, new_status=new_status),
                "reason": reason,
            },
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
    def _case_status_label(status: str) -> str:
        labels = {
            "draft": "Rascunho",
            "offer_preparing": "Preparando oferta",
            "offer_sent": "Oferta enviada",
            "offer_accepted": "Oferta aceita",
            "offer_declined": "Oferta recusada",
            "documents_pending": "Documentos pendentes",
            "documents_received": "Documentos recebidos",
            "ready_for_admission": "Pronto para admissão",
            "admitted": "Admitido",
            "dismissed": "Desligado",
            "cancelled": "Cancelado",
            "in_progress": "Em andamento",
        }
        return labels.get(status, "Em andamento")

    @staticmethod
    def _integration_status(
        *,
        case: PreAdmissionCaseModel,
        blockers: list[AdmissionBlockerSchema],
    ) -> AdmissionIntegrationStatusSchema:
        if case.status == "admitted":
            return AdmissionIntegrationStatusSchema(
                state="completed",
                label="Exportado",
                ready_for_export=True,
            )
        if case.status == "dismissed":
            return AdmissionIntegrationStatusSchema(
                state="completed",
                label="Desligado",
                ready_for_export=False,
            )
        if any(blocker.type in {"integration_error", "erp_error"} for blocker in blockers):
            return AdmissionIntegrationStatusSchema(
                state="error",
                label="Erro na exportação",
                ready_for_export=False,
            )
        ready_for_export = not blockers
        return AdmissionIntegrationStatusSchema(
            state="ready" if ready_for_export else "pending",
            label="Pronto para exportação" if ready_for_export else "Pendente",
            ready_for_export=ready_for_export,
        )

    @staticmethod
    def _recent_event(
        event: PreAdmissionEventModel,
        *,
        user_names: dict[UUID, str],
    ) -> AdmissionRecentEventSchema:
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
            actor_name=user_names.get(event.actor_id) if event.actor_id else None,
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
