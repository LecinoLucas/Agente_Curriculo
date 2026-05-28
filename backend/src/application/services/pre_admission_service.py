from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID
from uuid import uuid4

from src.application.services.pre_admission_checklist_template_service import (
    PreAdmissionChecklistTemplateService,
)
from src.application.services.pre_admission_state_machine import (
    PRE_ADMISSION_CASE_ENTITY,
    PRE_ADMISSION_CHECKLIST_ITEM_ENTITY,
    PRE_ADMISSION_DOCUMENT_ENTITY,
    TERMINAL_CASE_STATUSES,
    derive_case_status_from_checklist,
    transition_payload,
    transition_status,
)
from src.application.services.upload_validation_service import (
    MIME_EXTENSIONS,
    UploadValidationError,
    UploadValidationPolicy,
    ValidatedUpload,
    document_upload_policy,
    sanitize_upload_filename,
    validate_upload,
)
from src.core.settings import settings
from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionChecklistTemplateModel,
    PreAdmissionChecklistTemplateItemModel,
    PreAdmissionDocumentModel,
    PreAdmissionEventModel,
)
from src.infrastructure.repositories.sqlalchemy_pre_admission_repository import SQLAlchemyPreAdmissionRepository
from src.infrastructure.storage.pre_admission_documents import (
    build_pre_admission_storage_key,
    resolve_pre_admission_document_path,
    write_pre_admission_document,
)
from src.interface.api.schemas.pre_admission_schemas import (
    CandidatePortalPreAdmissionCaseResponse,
    CandidatePortalPreAdmissionChecklistItemResponse,
    CandidatePortalPreAdmissionDocumentUploadResponse,
    CandidatePortalPreAdmissionEnvelopeResponse,
    CandidatePortalPreAdmissionSummary,
    CandidatePortalPreAdmissionUploadedDocumentResponse,
    PreAdmissionCaseResponse,
    PreAdmissionChecklistItemCreateRequest,
    PreAdmissionChecklistItemResponse,
    PreAdmissionDocumentResponse,
    PreAdmissionDocumentsResponse,
    PreAdmissionChecklistItemUpdateRequest,
    PreAdmissionCreateRequest,
    PreAdmissionEnvelopeResponse,
    PreAdmissionEventResponse,
    PreAdmissionEventsResponse,
    PreAdmissionUpdateRequest,
)


_CANDIDATE_ITEM_DESCRIPTIONS: dict[str, str] = {
    "cpf": "Envie uma cópia legível do CPF (frente).",
    "rg": "Envie uma cópia legível do RG (frente e verso, se houver).",
    "comprovante_endereco": "Comprovante de endereço dos últimos 90 dias.",
    "carteira_trabalho": "Páginas da carteira de trabalho com foto e dados pessoais.",
    "pis": "Envie o documento com o número do PIS/PASEP.",
    "titulo_eleitor": "Frente e verso do título de eleitor.",
    "certificado_reservista": "Certificado militar/reservista, se aplicável.",
    "exame_admissional": "Atestado de saúde ocupacional do exame admissional.",
    "dados_bancarios": "Comprovante da conta para depósito do salário.",
    "other": "Documento solicitado pelo RH para a admissão.",
}

_CANDIDATE_DOCUMENT_STATUS_LABELS: dict[str, str] = {
    "pending": "Pendente",
    "submitted": "Enviado",
    "in_review": "Documentos em análise",
    "approved": "Documentos aprovados",
    "rejected": "Correções solicitadas",
    "waived": "Dispensado",
}

_CANDIDATE_PROCESS_STATUS_LABELS: dict[str, str] = {
    "waiting_documents": "Aguardando documentos",
    "in_review": "Documentos em análise",
    "corrections_requested": "Correções solicitadas",
    "documents_approved": "Documentos aprovados",
    "completed": "Pré-admissão concluída",
    "closed": "Pré-admissão encerrada",
}


def _candidate_item_description(item_type: str, fallback: str | None = None) -> str | None:
    description = _CANDIDATE_ITEM_DESCRIPTIONS.get(item_type)
    if description:
        return description
    return fallback

DOCUMENT_UPLOAD_BLOCKED_CASE_STATUSES = {"admitted", "dismissed", "cancelled", "offer_declined"}
CANDIDATE_DOWNLOAD_BLOCKED_CASE_STATUSES = {"cancelled", "offer_declined"}
MAX_PRE_ADMISSION_DOCUMENT_BYTES = settings.max_upload_size_bytes
PRE_ADMISSION_CREATE_ALLOWED_PIPELINE_STAGES = {"hired", "pre_admission", "protheus"}
DEFAULT_PRE_ADMISSION_ACCEPTED_FILE_TYPES = sorted(document_upload_policy().allowed_mime_types)
DEFAULT_PRE_ADMISSION_MAX_FILE_SIZE_MB = max(1, MAX_PRE_ADMISSION_DOCUMENT_BYTES // (1024 * 1024))
KNOWN_PRE_ADMISSION_DOCUMENT_KEYS = set(_CANDIDATE_ITEM_DESCRIPTIONS.keys())


class PreAdmissionService:
    def __init__(self, repository: SQLAlchemyPreAdmissionRepository) -> None:
        self._repository = repository

    async def get(self, *, candidate_id: UUID, job_id: UUID) -> PreAdmissionEnvelopeResponse:
        case = await self._repository.get_active_case(candidate_id=candidate_id, job_id=job_id)
        latest_decision = await self._repository.get_latest_decision(candidate_id=candidate_id, job_id=job_id)
        active_pipeline = await self._repository.get_active_pipeline_for_job_candidate(
            candidate_id=candidate_id,
            job_id=job_id,
        )
        hire_decision = latest_decision if latest_decision and latest_decision.decision_outcome == "hire" else None
        return PreAdmissionEnvelopeResponse(
            case=self._case_response(case) if case else None,
            hiring_decision_outcome=latest_decision.decision_outcome if latest_decision else None,
            can_create=(
                case is None
                and hire_decision is not None
                and self._pipeline_allows_case_creation(active_pipeline)
            ),
        )

    async def create(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        actor_id: UUID | None,
        body: PreAdmissionCreateRequest,
    ) -> PreAdmissionCaseResponse:
        decision = await self._repository.get_hire_decision(candidate_id=candidate_id, job_id=job_id)
        if decision is None:
            raise ValidationException("Pré-admissão disponível apenas após decisão humana submitted de contratação.")

        active_pipeline = await self._repository.get_active_pipeline_for_job_candidate(
            candidate_id=candidate_id,
            job_id=job_id,
        )
        if not self._pipeline_allows_case_creation(active_pipeline):
            raise ValidationException(
                "Pré-admissão só pode ser iniciada quando a pipeline estiver em etapa compatível de contratação."
            )

        existing_for_decision = await self._repository.get_case_by_decision(decision_id=decision.id)
        if existing_for_decision is not None:
            return self._case_response(existing_for_decision)

        active_case = await self._repository.get_active_case(candidate_id=candidate_id, job_id=job_id)
        if active_case is not None:
            return self._case_response(active_case)

        template = await PreAdmissionChecklistTemplateService(self._repository).resolve_template_for_case(
            template_id=body.checklist_template_id
        )
        now = datetime.now(UTC)
        case = PreAdmissionCaseModel(
            candidate_id=candidate_id,
            job_id=job_id,
            hiring_decision_id=decision.id,
            checklist_template_id=template.id,
            checklist_template_name=template.name,
            status="draft",
            salary_offer=body.salary_offer,
            start_date=body.start_date,
            work_model=body.work_model,
            notes=body.notes,
            created_by=actor_id,
            created_at=now,
            updated_at=now,
        )
        await self._repository.add_case(case)
        await self._create_case_checklist_snapshot(case=case, template=template, created_at=now)
        await self._event(
            case_id=case.id,
            event_type="case_created",
            actor_id=actor_id,
            payload={
                "hiring_decision_id": str(decision.id),
                "checklist_template_id": str(template.id),
                "checklist_template_name": template.name,
                "checklist_items_count": len(case.checklist_items),
                "status": case.status,
                "salary_offer": self._json_value(case.salary_offer),
                "start_date": self._json_value(case.start_date),
                "work_model": case.work_model,
            },
        )
        return self._case_response(case)

    async def update(
        self,
        *,
        case_id: UUID,
        actor_id: UUID | None,
        body: PreAdmissionUpdateRequest,
    ) -> PreAdmissionCaseResponse:
        case = await self._required_case(case_id)
        if self._case_has_mutation_request(case=case, body=body):
            raise ValidationException("Caso de pré-admissão encerrado não pode ser alterado.")
        before_status = case.status
        changes: dict[str, dict[str, object | None]] = {}

        for field in ("status", "salary_offer", "start_date", "work_model", "notes"):
            if field not in body.model_fields_set:
                continue
            next_value = getattr(body, field)
            current_value = getattr(case, field)
            if current_value != next_value:
                if field == "status":
                    if next_value == "dismissed":
                        raise ValidationException(
                            "Use a ação específica de desligamento para encerrar um admitido."
                        )
                    old_status, new_status = transition_status(
                        case,
                        entity=PRE_ADMISSION_CASE_ENTITY,
                        to_status=next_value,
                    )
                    changes[field] = {
                        **transition_payload(old_status=old_status, new_status=new_status),
                    }
                    continue
                changes[field] = {"from": self._json_value(current_value), "to": self._json_value(next_value)}
                setattr(case, field, next_value)

        if not changes:
            return self._case_response(case)

        now = datetime.now(UTC)
        case.updated_at = now
        if "status" in changes and case.status == "dismissed":
            case.dismissed_at = now
            if case.closed_at is None:
                case.closed_at = now
        elif "status" in changes and case.status in TERMINAL_CASE_STATUSES:
            case.closed_at = now
        elif "status" in changes and before_status in TERMINAL_CASE_STATUSES and case.status not in TERMINAL_CASE_STATUSES:
            case.closed_at = None

        await self._repository.flush()
        if "status" in changes:
            await self._event(
                case_id=case.id,
                event_type="status_changed",
                actor_id=actor_id,
                payload={**changes["status"]},
            )
        await self._event(case_id=case.id, event_type="case_updated", actor_id=actor_id, payload={"changes": changes})
        return self._case_response(case)

    async def add_checklist_item(
        self,
        *,
        case_id: UUID,
        actor_id: UUID | None,
        body: PreAdmissionChecklistItemCreateRequest,
    ) -> PreAdmissionChecklistItemResponse:
        case = await self._required_case(case_id)
        now = datetime.now(UTC)
        document_key = body.document_key or body.item_type
        item = PreAdmissionChecklistItemModel(
            case_id=case_id,
            document_key=document_key,
            item_type=self._case_item_type_from_document_key(body.item_type or document_key),
            title=body.title,
            status=body.status,
            required=body.required,
            notes=body.notes,
            candidate_description=body.candidate_description,
            accepted_file_types=self._clean_accepted_file_types(body.accepted_file_types),
            max_file_size_mb=self._clean_max_file_size_mb(body.max_file_size_mb),
            display_order=body.display_order if body.display_order is not None else self._next_case_item_display_order(case),
            created_at=now,
            updated_at=now,
        )
        await self._repository.add_checklist_item(item)
        await self._event(
            case_id=case_id,
            event_type="checklist_item_created",
            actor_id=actor_id,
            payload={
                "item_id": str(item.id),
                "document_key": item.document_key,
                "item_type": item.item_type,
                "title": item.title,
                "status": item.status,
                "required": item.required,
            },
        )
        return self._item_response(item)

    async def update_checklist_item(
        self,
        *,
        case_id: UUID,
        item_id: UUID,
        actor_id: UUID | None,
        body: PreAdmissionChecklistItemUpdateRequest,
    ) -> PreAdmissionChecklistItemResponse:
        case = await self._required_case(case_id)
        item = await self._repository.get_checklist_item(case_id=case_id, item_id=item_id)
        if item is None:
            raise NotFoundException("Item de checklist não encontrado.")

        changes: dict[str, dict[str, object | None]] = {}
        original_item_type = item.item_type
        for field in ("title", "status", "required", "notes", "candidate_description", "display_order"):
            if field not in body.model_fields_set:
                continue
            next_value = getattr(body, field)
            current_value = getattr(item, field)
            if current_value != next_value:
                if field == "status":
                    old_status, new_status = transition_status(
                        item,
                        entity=PRE_ADMISSION_CHECKLIST_ITEM_ENTITY,
                        to_status=next_value,
                    )
                    changes[field] = {
                        **transition_payload(old_status=old_status, new_status=new_status),
                    }
                    continue
                changes[field] = {"from": self._json_value(current_value), "to": self._json_value(next_value)}
                setattr(item, field, next_value)

        if "item_type" in body.model_fields_set and body.item_type is not None:
            next_item_type = self._case_item_type_from_document_key(body.item_type)
            if item.item_type != next_item_type:
                changes["item_type"] = {
                    "from": self._json_value(item.item_type),
                    "to": self._json_value(next_item_type),
                }
                item.item_type = next_item_type

        if "document_key" in body.model_fields_set:
            next_document_key = body.document_key
            if next_document_key is not None and item.document_key != next_document_key:
                changes["document_key"] = {
                    "from": self._json_value(item.document_key),
                    "to": self._json_value(next_document_key),
                }
                item.document_key = next_document_key
                if "item_type" not in body.model_fields_set:
                    item.item_type = self._case_item_type_from_document_key(next_document_key)
                    changes["item_type"] = {
                        "from": self._json_value(original_item_type),
                        "to": self._json_value(item.item_type),
                    }
        elif "item_type" in body.model_fields_set and body.item_type is not None and item.document_key != body.item_type:
            changes["document_key"] = {
                "from": self._json_value(item.document_key),
                "to": self._json_value(body.item_type),
            }
            item.document_key = body.item_type

        if "accepted_file_types" in body.model_fields_set:
            next_types = self._clean_accepted_file_types(body.accepted_file_types)
            if item.accepted_file_types != next_types:
                changes["accepted_file_types"] = {
                    "from": self._json_value(item.accepted_file_types),
                    "to": self._json_value(next_types),
                }
                item.accepted_file_types = next_types

        if "max_file_size_mb" in body.model_fields_set:
            next_size = self._clean_max_file_size_mb(body.max_file_size_mb)
            if item.max_file_size_mb != next_size:
                changes["max_file_size_mb"] = {
                    "from": self._json_value(item.max_file_size_mb),
                    "to": self._json_value(next_size),
                }
                item.max_file_size_mb = next_size

        if not changes:
            return self._item_response(item)

        item.updated_at = datetime.now(UTC)
        await self._repository.flush()
        await self._sync_case_status_after_checklist_change(
            case=case,
            actor_id=actor_id,
            reason="checklist_item_updated",
        )
        await self._event(
            case_id=case_id,
            event_type="checklist_item_updated",
            actor_id=actor_id,
            payload={"item_id": str(item.id), "changes": changes},
        )
        return self._item_response(item)

    async def events(self, *, case_id: UUID) -> PreAdmissionEventsResponse:
        await self._required_case(case_id)
        events = await self._repository.list_events(case_id=case_id)
        return PreAdmissionEventsResponse(events=[self._event_response(event) for event in events])

    async def candidate_portal_get(
        self,
        *,
        candidate_id: UUID,
        case_id: UUID | None = None,
    ) -> CandidatePortalPreAdmissionEnvelopeResponse:
        if case_id is not None:
            case = await self._repository.get_candidate_case(candidate_id=candidate_id, case_id=case_id)
            if case is None:
                raise NotFoundException("Pré-admissão não encontrada.")
            case_response = self._candidate_case_response(case)
            return CandidatePortalPreAdmissionEnvelopeResponse(
                case=case_response,
                summary=case_response.summary,
            )

        case = await self._repository.get_candidate_pre_admission_case(candidate_id=candidate_id)
        if case is None:
            return CandidatePortalPreAdmissionEnvelopeResponse(
                case=None,
                summary=CandidatePortalPreAdmissionSummary(has_pre_admission_case=False),
            )
        case_response = self._candidate_case_response(case)
        return CandidatePortalPreAdmissionEnvelopeResponse(
            case=case_response,
            summary=case_response.summary,
        )

    async def candidate_portal_summary(
        self,
        *,
        candidate_id: UUID,
    ) -> CandidatePortalPreAdmissionSummary:
        case = await self._repository.get_candidate_pre_admission_case(candidate_id=candidate_id)
        if case is None:
            return CandidatePortalPreAdmissionSummary(has_pre_admission_case=False)
        return self._build_summary(case)

    async def candidate_upload_document(
        self,
        *,
        candidate_id: UUID,
        case_id: UUID,
        item_id: UUID,
        file_name: str,
        content_type: str | None,
        content: bytes,
    ) -> CandidatePortalPreAdmissionDocumentUploadResponse:
        case = await self._repository.get_candidate_case(candidate_id=candidate_id, case_id=case_id)
        if case is None:
            raise NotFoundException("Pré-admissão não encontrada.")
        if case.status in DOCUMENT_UPLOAD_BLOCKED_CASE_STATUSES:
            raise ValidationException("Este processo de pré-admissão não aceita novos documentos.")

        item = await self._repository.get_checklist_item(case_id=case_id, item_id=item_id)
        if item is None:
            raise NotFoundException("Item de checklist não encontrado.")

        validated_file = self._validate_document_upload(
            file_name=file_name,
            content_type=content_type,
            content=content,
            policy=self._upload_policy_for_item(item),
        )
        file_name = validated_file.file_name
        content = validated_file.content
        previous_document = await self._repository.active_document_for_item(case_id=case_id, item_id=item_id)
        if previous_document is not None and previous_document.status in {"uploaded", "approved"}:
            raise ValidationException("Este documento já foi enviado e ainda não pode ser substituído.")

        now = datetime.now(UTC)
        if previous_document is not None and previous_document.status == "rejected":
            transition_status(
                previous_document,
                entity=PRE_ADMISSION_DOCUMENT_ENTITY,
                to_status="replaced",
            )
            previous_document.updated_at = now

        document_id = uuid4()
        storage_key, stored_filename = build_pre_admission_storage_key(
            candidate_id=candidate_id,
            case_id=case_id,
            item_id=item_id,
            document_id=document_id,
            extension=validated_file.extension,
        )
        document = PreAdmissionDocumentModel(
            id=document_id,
            case_id=case_id,
            checklist_item_id=item_id,
            candidate_id=candidate_id,
            original_filename=file_name,
            stored_filename=stored_filename,
            storage_key=storage_key,
            mime_type=validated_file.mime_type,
            size_bytes=len(content),
            status="uploaded",
            uploaded_at=now,
            created_at=now,
            updated_at=now,
        )

        transition_status(item, entity=PRE_ADMISSION_CHECKLIST_ITEM_ENTITY, to_status="received")
        item.updated_at = now
        await self._repository.add_document(document)
        await self._repository.flush()
        await self._sync_case_status_after_checklist_change(
            case=case,
            actor_id=None,
            reason="document_uploaded",
        )
        write_pre_admission_document(storage_key, content)
        await self._event(
            case_id=case_id,
            event_type="document_uploaded",
            actor_id=None,
            payload={
                "document_id": str(document.id),
                "checklist_item_id": str(item.id),
                "original_filename": document.original_filename,
                "mime_type": document.mime_type,
                "size_bytes": document.size_bytes,
                "replaced_document_id": str(previous_document.id) if previous_document else None,
            },
        )
        return self._candidate_document_upload_response(document)

    async def list_documents(self, *, case_id: UUID) -> PreAdmissionDocumentsResponse:
        await self._required_case(case_id)
        documents = await self._repository.list_documents(case_id=case_id)
        return PreAdmissionDocumentsResponse(documents=[self._document_response(document) for document in documents])

    async def approve_document(
        self,
        *,
        document_id: UUID,
        actor_id: UUID | None,
    ) -> PreAdmissionDocumentResponse:
        document = await self._required_document(document_id)
        case = await self._required_case(document.case_id)
        item = await self._repository.get_checklist_item(case_id=document.case_id, item_id=document.checklist_item_id)
        if item is None:
            raise NotFoundException("Item de checklist não encontrado.")
        now = datetime.now(UTC)
        transition_status(document, entity=PRE_ADMISSION_DOCUMENT_ENTITY, to_status="approved")
        document.reviewed_at = now
        document.reviewed_by = actor_id
        document.review_notes = None
        document.updated_at = now
        transition_status(item, entity=PRE_ADMISSION_CHECKLIST_ITEM_ENTITY, to_status="approved")
        item.updated_at = now
        await self._repository.flush()
        await self._sync_case_status_after_checklist_change(
            case=case,
            actor_id=actor_id,
            reason="document_approved",
        )
        await self._event(
            case_id=document.case_id,
            event_type="document_approved",
            actor_id=actor_id,
            payload={"document_id": str(document.id), "checklist_item_id": str(item.id)},
        )
        return self._document_response(document)

    REJECTION_REASON_PUBLIC_MAX_LENGTH = 1000
    REVIEW_NOTES_MAX_LENGTH = 2000

    async def reject_document(
        self,
        *,
        document_id: UUID,
        actor_id: UUID | None,
        rejection_reason_public: str | None = None,
        review_notes: str | None = None,
    ) -> PreAdmissionDocumentResponse:
        public_reason = self._clean_rejection_text(
            rejection_reason_public,
            max_length=self.REJECTION_REASON_PUBLIC_MAX_LENGTH,
            field_label="motivo público da rejeição",
        )
        internal_notes = self._clean_rejection_text(
            review_notes,
            max_length=self.REVIEW_NOTES_MAX_LENGTH,
            field_label="nota interna de rejeição",
        )
        if not public_reason and not internal_notes:
            raise ValidationException(
                "Informe um motivo público para o candidato ou uma nota interna da rejeição."
            )

        document = await self._required_document(document_id)
        case = await self._required_case(document.case_id)
        item = await self._repository.get_checklist_item(case_id=document.case_id, item_id=document.checklist_item_id)
        if item is None:
            raise NotFoundException("Item de checklist não encontrado.")
        now = datetime.now(UTC)
        transition_status(document, entity=PRE_ADMISSION_DOCUMENT_ENTITY, to_status="rejected")
        document.reviewed_at = now
        document.reviewed_by = actor_id
        document.review_notes = internal_notes
        document.rejection_reason_public = public_reason
        document.updated_at = now
        transition_status(item, entity=PRE_ADMISSION_CHECKLIST_ITEM_ENTITY, to_status="rejected")
        item.updated_at = now
        await self._repository.flush()
        await self._sync_case_status_after_checklist_change(
            case=case,
            actor_id=actor_id,
            reason="document_rejected",
        )
        await self._event(
            case_id=document.case_id,
            event_type="document_rejected",
            actor_id=actor_id,
            payload={
                "document_id": str(document.id),
                "checklist_item_id": str(item.id),
                "has_public_reason": public_reason is not None,
                "has_internal_note": internal_notes is not None,
            },
        )
        return self._document_response(document)

    @staticmethod
    def _clean_rejection_text(
        value: str | None,
        *,
        max_length: int,
        field_label: str,
    ) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        if len(cleaned) > max_length:
            raise ValidationException(
                f"O campo {field_label} excede o limite de {max_length} caracteres."
            )
        return cleaned

    async def document_download(
        self,
        *,
        document_id: UUID,
        actor_type: str,
        actor_id: UUID | None = None,
        candidate_id: UUID | None = None,
        actor_role: str | None = None,
    ) -> tuple[PreAdmissionDocumentModel, Path]:
        if actor_type not in {"candidate", "staff"}:
            raise ValidationException("Tipo de ator inválido.")
        if candidate_id is None:
            document = await self._required_document(document_id)
        else:
            document = await self._repository.get_candidate_document(candidate_id=candidate_id, document_id=document_id)
            if document is None:
                raise NotFoundException("Documento não encontrado.")
            case = await self._repository.get_case(document.case_id)
            if case is None or case.status in CANDIDATE_DOWNLOAD_BLOCKED_CASE_STATUSES:
                raise NotFoundException("Documento não encontrado.")
        try:
            path = resolve_pre_admission_document_path(document.storage_key)
        except (FileNotFoundError, ValueError) as exc:
            raise NotFoundException("Arquivo não encontrado.") from exc
        if not path.exists():
            raise NotFoundException("Arquivo não encontrado.")
        payload = {
            "document_id": str(document.id),
            "checklist_item_id": str(document.checklist_item_id),
            "actor_type": actor_type,
            "mime_type": document.mime_type,
            "size_bytes": document.size_bytes,
        }
        if actor_role is not None:
            payload["actor_role"] = actor_role
        await self._event(
            case_id=document.case_id,
            event_type="document_downloaded",
            actor_id=actor_id,
            payload=payload,
        )
        return document, path

    async def _required_case(self, case_id: UUID) -> PreAdmissionCaseModel:
        case = await self._repository.get_case(case_id)
        if case is None:
            raise NotFoundException("Caso de pré-admissão não encontrado.")
        return case

    async def _create_case_checklist_snapshot(
        self,
        *,
        case: PreAdmissionCaseModel,
        template: PreAdmissionChecklistTemplateModel,
        created_at: datetime,
    ) -> None:
        template_items = sorted(
            [item for item in template.items if item.is_active],
            key=lambda item: (item.display_order, item.created_at, item.id),
        )
        snapshot_items: list[PreAdmissionChecklistItemModel] = []
        for template_item in template_items:
            snapshot_items.append(
                PreAdmissionChecklistItemModel(
                    case_id=case.id,
                    template_item_id=template_item.id,
                    document_key=template_item.document_key,
                    item_type=self._case_item_type_from_document_key(template_item.document_key),
                    title=template_item.title,
                    status="pending",
                    required=template_item.is_required,
                    candidate_description=template_item.candidate_description,
                    accepted_file_types=list(
                        template_item.accepted_file_types or DEFAULT_PRE_ADMISSION_ACCEPTED_FILE_TYPES
                    ),
                    max_file_size_mb=template_item.max_file_size_mb or DEFAULT_PRE_ADMISSION_MAX_FILE_SIZE_MB,
                    display_order=template_item.display_order,
                    created_at=created_at,
                    updated_at=created_at,
                )
            )

        for item in snapshot_items:
            await self._repository.add_checklist_item(item)
        case.checklist_items = snapshot_items

    @staticmethod
    def _case_item_type_from_document_key(document_key: str | None) -> str:
        cleaned = (document_key or "").strip()
        if cleaned in KNOWN_PRE_ADMISSION_DOCUMENT_KEYS:
            return cleaned
        return "other"

    @staticmethod
    def _clean_accepted_file_types(value: list[str] | None) -> list[str]:
        allowed_policy = document_upload_policy().allowed_mime_types
        if value is None:
            return list(DEFAULT_PRE_ADMISSION_ACCEPTED_FILE_TYPES)

        normalized: list[str] = []
        for item in value:
            cleaned = (item or "").strip().lower()
            if not cleaned:
                continue
            if cleaned not in MIME_EXTENSIONS or cleaned not in allowed_policy:
                raise ValidationException("Tipo de arquivo não suportado para checklist.")
            normalized.append(cleaned)

        deduplicated = sorted(set(normalized))
        if not deduplicated:
            raise ValidationException("Informe ao menos um tipo de arquivo aceito.")
        return deduplicated

    @staticmethod
    def _clean_max_file_size_mb(value: int | None) -> int:
        if value is None:
            return DEFAULT_PRE_ADMISSION_MAX_FILE_SIZE_MB
        if value < 1 or value > DEFAULT_PRE_ADMISSION_MAX_FILE_SIZE_MB:
            raise ValidationException(
                f"Tamanho máximo do arquivo deve ficar entre 1MB e {DEFAULT_PRE_ADMISSION_MAX_FILE_SIZE_MB}MB."
            )
        return value

    @staticmethod
    def _upload_policy_for_item(item: PreAdmissionChecklistItemModel) -> UploadValidationPolicy:
        allowed_mime_types = set(item.accepted_file_types or DEFAULT_PRE_ADMISSION_ACCEPTED_FILE_TYPES)
        return UploadValidationPolicy(
            allowed_mime_types=allowed_mime_types,
            max_size_bytes=max(1, item.max_file_size_mb) * 1024 * 1024,
        )

    @staticmethod
    def _next_case_item_display_order(case: PreAdmissionCaseModel) -> int:
        if not case.checklist_items:
            return 0
        return max(item.display_order for item in case.checklist_items) + 1

    @staticmethod
    def _pipeline_allows_case_creation(pipeline: CandidateJobPipelineModel | None) -> bool:
        return pipeline is not None and pipeline.pipeline_stage in PRE_ADMISSION_CREATE_ALLOWED_PIPELINE_STAGES

    @staticmethod
    def _case_has_mutation_request(
        *,
        case: PreAdmissionCaseModel,
        body: PreAdmissionUpdateRequest,
    ) -> bool:
        if case.status not in TERMINAL_CASE_STATUSES:
            return False
        for field in ("status", "salary_offer", "start_date", "work_model", "notes"):
            if field in body.model_fields_set and getattr(case, field) != getattr(body, field):
                return True
        return False

    async def _required_document(self, document_id: UUID) -> PreAdmissionDocumentModel:
        document = await self._repository.get_document(document_id)
        if document is None:
            raise NotFoundException("Documento não encontrado.")
        return document

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
        case.closed_at = now if case.status in TERMINAL_CASE_STATUSES else None
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
    def _json_value(value: object) -> object:
        if isinstance(value, Decimal):
            return str(value)
        if hasattr(value, "isoformat"):
            return value.isoformat()  # type: ignore[no-any-return]
        return value

    @staticmethod
    def _validate_document_upload(
        *,
        file_name: str,
        content_type: str | None,
        content: bytes,
        policy: UploadValidationPolicy,
    ) -> ValidatedUpload:
        try:
            return validate_upload(
                file_name=file_name,
                content_type=content_type,
                content=content,
                policy=policy,
            )
        except UploadValidationError as exc:
            raise ValidationException(str(exc)) from exc

    @staticmethod
    def _submitted_extension(file_name: str) -> str:
        safe_name = file_name.replace("\\", "/").rsplit("/", maxsplit=1)[-1]
        return Path(safe_name).suffix.lower()

    @staticmethod
    def _sanitize_original_filename(file_name: str, extension: str) -> str:
        try:
            return sanitize_upload_filename(file_name)
        except UploadValidationError:
            return f"documento{extension}"

    @classmethod
    def _case_response(cls, case: PreAdmissionCaseModel) -> PreAdmissionCaseResponse:
        ordered_items = sorted(case.checklist_items, key=lambda item: (item.display_order, item.created_at, item.id))
        return PreAdmissionCaseResponse(
            id=case.id,
            candidate_id=case.candidate_id,
            job_id=case.job_id,
            hiring_decision_id=case.hiring_decision_id,
            checklist_template_id=case.checklist_template_id,
            checklist_template_name=case.checklist_template_name,
            status=case.status,  # type: ignore[arg-type]
            salary_offer=case.salary_offer,
            start_date=case.start_date,
            work_model=case.work_model,
            notes=case.notes,
            created_by=case.created_by,
            ready_for_export=case.ready_for_export,
            ready_for_export_at=case.ready_for_export_at,
            ready_for_export_by=case.ready_for_export_by,
            created_at=case.created_at,
            updated_at=case.updated_at,
            closed_at=case.closed_at,
            dismissed_at=case.dismissed_at,
            dismissal_reason=case.dismissal_reason,
            checklist_items=[cls._item_response(item) for item in ordered_items],
        )

    @staticmethod
    def _item_response(item: PreAdmissionChecklistItemModel) -> PreAdmissionChecklistItemResponse:
        return PreAdmissionChecklistItemResponse(
            id=item.id,
            case_id=item.case_id,
            template_item_id=item.template_item_id,
            document_key=item.document_key,
            item_type=item.item_type,  # type: ignore[arg-type]
            title=item.title,
            status=item.status,  # type: ignore[arg-type]
            required=item.required,
            notes=item.notes,
            candidate_description=item.candidate_description,
            accepted_file_types=list(item.accepted_file_types or []),
            max_file_size_mb=item.max_file_size_mb,
            display_order=item.display_order,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    @staticmethod
    def _event_response(event: PreAdmissionEventModel) -> PreAdmissionEventResponse:
        return PreAdmissionEventResponse(
            id=event.id,
            case_id=event.case_id,
            event_type=event.event_type,
            actor_id=event.actor_id,
            payload_json=event.payload_json,
            created_at=event.created_at,
        )

    @classmethod
    def _candidate_case_response(cls, case: PreAdmissionCaseModel) -> CandidatePortalPreAdmissionCaseResponse:
        items = sorted(case.checklist_items, key=lambda item: (not item.required, item.display_order, item.created_at))
        item_responses = [cls._candidate_item_response(item) for item in items]
        summary = cls._build_summary(case)
        return CandidatePortalPreAdmissionCaseResponse(
            id=case.id,
            status=case.status,  # type: ignore[arg-type]
            status_public_label=summary.status_public_label or _CANDIDATE_PROCESS_STATUS_LABELS["waiting_documents"],
            salary_offer=case.salary_offer,
            start_date=case.start_date,
            work_model=case.work_model,
            checklist_items=item_responses,
            summary=summary,
        )

    @classmethod
    def _candidate_item_response(
        cls,
        item: PreAdmissionChecklistItemModel,
    ) -> CandidatePortalPreAdmissionChecklistItemResponse:
        active_documents = [doc for doc in item.documents if doc.status != "replaced"]
        active_documents.sort(key=lambda doc: doc.uploaded_at, reverse=True)
        latest = active_documents[0] if active_documents else None

        uploaded_document = None
        rejection_reason_public: str | None = None
        if latest is not None:
            uploaded_document = CandidatePortalPreAdmissionUploadedDocumentResponse(
                id=latest.id,
                original_filename=latest.original_filename,
                mime_type=latest.mime_type,
                size_bytes=latest.size_bytes,
                status=latest.status,  # type: ignore[arg-type]
                status_public_label=cls._candidate_item_status_label(item),
                uploaded_at=latest.uploaded_at,
            )
            if latest.status == "rejected":
                rejection_reason_public = latest.rejection_reason_public

        allowed_types = list(item.accepted_file_types or DEFAULT_PRE_ADMISSION_ACCEPTED_FILE_TYPES)
        max_file_size_mb = item.max_file_size_mb or DEFAULT_PRE_ADMISSION_MAX_FILE_SIZE_MB

        return CandidatePortalPreAdmissionChecklistItemResponse(
            item_id=item.id,
            title=item.title,
            description=_candidate_item_description(item.document_key or item.item_type, item.candidate_description),
            required=item.required,
            status=item.status,  # type: ignore[arg-type]
            status_public_label=cls._candidate_item_status_label(item),
            rejection_reason_public=rejection_reason_public,
            uploaded_document=uploaded_document,
            allowed_file_types=allowed_types,
            max_file_size_mb=max_file_size_mb,
        )

    @classmethod
    def _build_summary(cls, case: PreAdmissionCaseModel) -> CandidatePortalPreAdmissionSummary:
        items = list(case.checklist_items)
        total = len(items)
        approved = sum(1 for item in items if cls._candidate_item_display_status(item) in {"approved", "waived"})
        submitted = sum(
            1
            for item in items
            if cls._candidate_item_display_status(item) in {"submitted", "in_review", "approved", "waived"}
        )
        pending = sum(1 for item in items if cls._candidate_item_display_status(item) not in {"approved", "waived"})
        next_pending: str | None = None
        required_first = sorted(items, key=lambda item: (not item.required, item.display_order, item.created_at))
        for item in required_first:
            if cls._candidate_item_display_status(item) == "pending":
                next_pending = item.title
                break
        return CandidatePortalPreAdmissionSummary(
            has_pre_admission_case=True,
            pre_admission_status=case.status,  # type: ignore[arg-type]
            status_public_label=cls._candidate_process_status_label(case),
            documents_total=total,
            documents_pending=max(pending, 0),
            documents_submitted=submitted,
            documents_approved=approved,
            next_pending_document=next_pending,
        )

    @classmethod
    def _candidate_document_upload_response(
        cls,
        document: PreAdmissionDocumentModel,
    ) -> CandidatePortalPreAdmissionDocumentUploadResponse:
        return CandidatePortalPreAdmissionDocumentUploadResponse(
            id=document.id,
            original_filename=document.original_filename,
            mime_type=document.mime_type,
            size_bytes=document.size_bytes,
            status=document.status,  # type: ignore[arg-type]
            status_public_label=_CANDIDATE_DOCUMENT_STATUS_LABELS["in_review"],
            uploaded_at=document.uploaded_at,
        )

    @staticmethod
    def _candidate_item_display_status(item: PreAdmissionChecklistItemModel) -> str:
        active_documents = [doc for doc in item.documents if doc.status != "replaced"]
        active_documents.sort(key=lambda doc: doc.uploaded_at, reverse=True)
        latest = active_documents[0] if active_documents else None
        if item.status == "approved":
            return "approved"
        if item.status == "rejected":
            return "rejected"
        if item.status == "waived":
            return "waived"
        if latest is not None:
            if latest.status == "approved":
                return "approved"
            if latest.status == "rejected":
                return "rejected"
            if latest.status == "uploaded":
                return "in_review"
        if item.status == "received":
            return "submitted"
        return "pending"

    @classmethod
    def _candidate_item_status_label(cls, item: PreAdmissionChecklistItemModel) -> str:
        return _CANDIDATE_DOCUMENT_STATUS_LABELS[cls._candidate_item_display_status(item)]

    @classmethod
    def _candidate_process_status_label(cls, case: PreAdmissionCaseModel) -> str:
        if case.status == "admitted":
            return _CANDIDATE_PROCESS_STATUS_LABELS["completed"]
        if case.status == "dismissed":
            return _CANDIDATE_PROCESS_STATUS_LABELS["closed"]
        if case.status in {"offer_declined", "cancelled"}:
            return _CANDIDATE_PROCESS_STATUS_LABELS["closed"]

        items = list(case.checklist_items)
        if not items:
            return _CANDIDATE_PROCESS_STATUS_LABELS["waiting_documents"]

        buckets = [cls._candidate_item_display_status(item) for item in items]
        if "rejected" in buckets:
            return _CANDIDATE_PROCESS_STATUS_LABELS["corrections_requested"]
        if all(bucket in {"approved", "waived"} for bucket in buckets):
            return _CANDIDATE_PROCESS_STATUS_LABELS["documents_approved"]
        if any(bucket in {"submitted", "in_review"} for bucket in buckets):
            return _CANDIDATE_PROCESS_STATUS_LABELS["in_review"]
        return _CANDIDATE_PROCESS_STATUS_LABELS["waiting_documents"]

    @staticmethod
    def _document_response(document: PreAdmissionDocumentModel) -> PreAdmissionDocumentResponse:
        return PreAdmissionDocumentResponse(
            id=document.id,
            case_id=document.case_id,
            checklist_item_id=document.checklist_item_id,
            candidate_id=document.candidate_id,
            original_filename=document.original_filename,
            mime_type=document.mime_type,
            size_bytes=document.size_bytes,
            status=document.status,  # type: ignore[arg-type]
            uploaded_at=document.uploaded_at,
            reviewed_at=document.reviewed_at,
            reviewed_by=document.reviewed_by,
            review_notes=document.review_notes,
            rejection_reason_public=document.rejection_reason_public,
            created_at=document.created_at,
            updated_at=document.updated_at,
        )
