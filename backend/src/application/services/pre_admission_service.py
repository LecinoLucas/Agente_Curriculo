from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID
from uuid import uuid4

from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionDocumentModel,
    PreAdmissionEventModel,
)
from src.infrastructure.repositories.sqlalchemy_pre_admission_repository import SQLAlchemyPreAdmissionRepository
from src.infrastructure.storage.pre_admission_documents import (
    resolve_pre_admission_document_path,
    write_pre_admission_document,
)
from src.interface.api.schemas.pre_admission_schemas import (
    CandidatePortalPreAdmissionCaseResponse,
    CandidatePortalPreAdmissionEnvelopeResponse,
    PreAdmissionCaseResponse,
    PreAdmissionChecklistItemCreateRequest,
    PreAdmissionChecklistItemResponse,
    PreAdmissionChecklistItemWithDocumentsResponse,
    PreAdmissionDocumentResponse,
    PreAdmissionDocumentsResponse,
    PreAdmissionChecklistItemUpdateRequest,
    PreAdmissionCreateRequest,
    PreAdmissionEnvelopeResponse,
    PreAdmissionEventResponse,
    PreAdmissionEventsResponse,
    PreAdmissionUpdateRequest,
)


TERMINAL_CASE_STATUSES = {"admitted", "cancelled", "offer_declined"}
DOCUMENT_UPLOAD_BLOCKED_CASE_STATUSES = {"admitted", "cancelled", "offer_declined"}
MAX_PRE_ADMISSION_DOCUMENT_BYTES = 10 * 1024 * 1024
ALLOWED_DOCUMENT_MIME_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
}


class PreAdmissionService:
    def __init__(self, repository: SQLAlchemyPreAdmissionRepository) -> None:
        self._repository = repository

    async def get(self, *, candidate_id: UUID, job_id: UUID) -> PreAdmissionEnvelopeResponse:
        case = await self._repository.get_active_case(candidate_id=candidate_id, job_id=job_id)
        latest_decision = await self._repository.get_latest_decision(candidate_id=candidate_id, job_id=job_id)
        hire_decision = latest_decision if latest_decision and latest_decision.decision_outcome == "hire" else None
        return PreAdmissionEnvelopeResponse(
            case=self._case_response(case) if case else None,
            hiring_decision_outcome=latest_decision.decision_outcome if latest_decision else None,
            can_create=case is None and hire_decision is not None,
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

        existing_for_decision = await self._repository.get_case_by_decision(decision_id=decision.id)
        if existing_for_decision is not None:
            return self._case_response(existing_for_decision)

        active_case = await self._repository.get_active_case(candidate_id=candidate_id, job_id=job_id)
        if active_case is not None:
            return self._case_response(active_case)

        now = datetime.now(UTC)
        case = PreAdmissionCaseModel(
            candidate_id=candidate_id,
            job_id=job_id,
            hiring_decision_id=decision.id,
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
        await self._event(
            case_id=case.id,
            event_type="case_created",
            actor_id=actor_id,
            payload={
                "hiring_decision_id": str(decision.id),
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
        before_status = case.status
        changes: dict[str, dict[str, object | None]] = {}

        for field in ("status", "salary_offer", "start_date", "work_model", "notes"):
            if field not in body.model_fields_set:
                continue
            next_value = getattr(body, field)
            current_value = getattr(case, field)
            if current_value != next_value:
                changes[field] = {"from": self._json_value(current_value), "to": self._json_value(next_value)}
                setattr(case, field, next_value)

        if not changes:
            return self._case_response(case)

        now = datetime.now(UTC)
        case.updated_at = now
        if "status" in changes and case.status in TERMINAL_CASE_STATUSES:
            case.closed_at = now
        elif "status" in changes and before_status in TERMINAL_CASE_STATUSES and case.status not in TERMINAL_CASE_STATUSES:
            case.closed_at = None

        await self._repository.flush()
        if "status" in changes:
            await self._event(
                case_id=case.id,
                event_type="status_changed",
                actor_id=actor_id,
                payload=changes["status"],
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
        await self._required_case(case_id)
        now = datetime.now(UTC)
        item = PreAdmissionChecklistItemModel(
            case_id=case_id,
            item_type=body.item_type,
            title=body.title,
            status=body.status,
            required=body.required,
            notes=body.notes,
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
        await self._required_case(case_id)
        item = await self._repository.get_checklist_item(case_id=case_id, item_id=item_id)
        if item is None:
            raise NotFoundException("Item de checklist não encontrado.")

        changes: dict[str, dict[str, object | None]] = {}
        for field in ("item_type", "title", "status", "required", "notes"):
            if field not in body.model_fields_set:
                continue
            next_value = getattr(body, field)
            current_value = getattr(item, field)
            if current_value != next_value:
                changes[field] = {"from": self._json_value(current_value), "to": self._json_value(next_value)}
                setattr(item, field, next_value)

        if not changes:
            return self._item_response(item)

        item.updated_at = datetime.now(UTC)
        await self._repository.flush()
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
            return CandidatePortalPreAdmissionEnvelopeResponse(case=self._candidate_case_response(case))

        case = await self._repository.get_candidate_pre_admission_case(candidate_id=candidate_id)
        return CandidatePortalPreAdmissionEnvelopeResponse(
            case=self._candidate_case_response(case) if case else None,
        )

    async def candidate_upload_document(
        self,
        *,
        candidate_id: UUID,
        case_id: UUID,
        item_id: UUID,
        file_name: str,
        content_type: str | None,
        content: bytes,
    ) -> PreAdmissionDocumentResponse:
        case = await self._repository.get_candidate_case(candidate_id=candidate_id, case_id=case_id)
        if case is None:
            raise NotFoundException("Pré-admissão não encontrada.")
        if case.status in DOCUMENT_UPLOAD_BLOCKED_CASE_STATUSES:
            raise ValidationException("Este processo de pré-admissão não aceita novos documentos.")

        item = await self._repository.get_checklist_item(case_id=case_id, item_id=item_id)
        if item is None:
            raise NotFoundException("Item de checklist não encontrado.")

        mime_type, extension = self._validate_document_upload(
            file_name=file_name,
            content_type=content_type,
            content=content,
        )
        previous_document = await self._repository.active_document_for_item(case_id=case_id, item_id=item_id)
        if previous_document is not None and previous_document.status in {"uploaded", "approved"}:
            raise ValidationException("Este documento já foi enviado e ainda não pode ser substituído.")

        now = datetime.now(UTC)
        if previous_document is not None and previous_document.status == "rejected":
            previous_document.status = "replaced"
            previous_document.updated_at = now

        document_id = uuid4()
        stored_filename = f"{document_id}{extension}"
        storage_key = f"{candidate_id}/{case_id}/{item_id}/{stored_filename}"
        document = PreAdmissionDocumentModel(
            id=document_id,
            case_id=case_id,
            checklist_item_id=item_id,
            candidate_id=candidate_id,
            original_filename=Path(file_name).name or f"documento{extension}",
            stored_filename=stored_filename,
            storage_key=storage_key,
            mime_type=mime_type,
            size_bytes=len(content),
            status="uploaded",
            uploaded_at=now,
            created_at=now,
            updated_at=now,
        )

        item.status = "received"
        item.updated_at = now
        await self._repository.add_document(document)
        await self._repository.flush()
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
        return self._document_response(document)

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
        item = await self._repository.get_checklist_item(case_id=document.case_id, item_id=document.checklist_item_id)
        if item is None:
            raise NotFoundException("Item de checklist não encontrado.")
        now = datetime.now(UTC)
        document.status = "approved"
        document.reviewed_at = now
        document.reviewed_by = actor_id
        document.review_notes = None
        document.updated_at = now
        item.status = "approved"
        item.updated_at = now
        await self._repository.flush()
        await self._event(
            case_id=document.case_id,
            event_type="document_approved",
            actor_id=actor_id,
            payload={"document_id": str(document.id), "checklist_item_id": str(item.id)},
        )
        return self._document_response(document)

    async def reject_document(
        self,
        *,
        document_id: UUID,
        actor_id: UUID | None,
        review_notes: str,
    ) -> PreAdmissionDocumentResponse:
        cleaned_notes = review_notes.strip()
        if not cleaned_notes:
            raise ValidationException("Informe o motivo da rejeição.")
        document = await self._required_document(document_id)
        item = await self._repository.get_checklist_item(case_id=document.case_id, item_id=document.checklist_item_id)
        if item is None:
            raise NotFoundException("Item de checklist não encontrado.")
        now = datetime.now(UTC)
        document.status = "rejected"
        document.reviewed_at = now
        document.reviewed_by = actor_id
        document.review_notes = cleaned_notes
        document.updated_at = now
        item.status = "rejected"
        item.updated_at = now
        await self._repository.flush()
        await self._event(
            case_id=document.case_id,
            event_type="document_rejected",
            actor_id=actor_id,
            payload={
                "document_id": str(document.id),
                "checklist_item_id": str(item.id),
                "review_notes": cleaned_notes,
            },
        )
        return self._document_response(document)

    async def document_download(self, *, document_id: UUID, candidate_id: UUID | None = None) -> tuple[PreAdmissionDocumentModel, Path]:
        if candidate_id is None:
            document = await self._required_document(document_id)
        else:
            document = await self._repository.get_candidate_document(candidate_id=candidate_id, document_id=document_id)
            if document is None:
                raise NotFoundException("Documento não encontrado.")
        path = resolve_pre_admission_document_path(document.storage_key)
        if not path.exists():
            raise NotFoundException("Arquivo não encontrado.")
        return document, path

    async def _required_case(self, case_id: UUID) -> PreAdmissionCaseModel:
        case = await self._repository.get_case(case_id)
        if case is None:
            raise NotFoundException("Caso de pré-admissão não encontrado.")
        return case

    async def _required_document(self, document_id: UUID) -> PreAdmissionDocumentModel:
        document = await self._repository.get_document(document_id)
        if document is None:
            raise NotFoundException("Documento não encontrado.")
        return document

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
    def _validate_document_upload(*, file_name: str, content_type: str | None, content: bytes) -> tuple[str, str]:
        if not content:
            raise ValidationException("Arquivo vazio.")
        if len(content) > MAX_PRE_ADMISSION_DOCUMENT_BYTES:
            raise ValidationException("Arquivo muito grande (máx 10MB).")

        normalized_content_type = (content_type or "").split(";")[0].strip().lower()
        lower_name = file_name.lower()
        if lower_name.endswith(".pdf") and normalized_content_type in {"", "application/octet-stream"}:
            normalized_content_type = "application/pdf"
        if lower_name.endswith((".jpg", ".jpeg")) and normalized_content_type in {"", "application/octet-stream"}:
            normalized_content_type = "image/jpeg"
        if lower_name.endswith(".png") and normalized_content_type in {"", "application/octet-stream"}:
            normalized_content_type = "image/png"

        extension = ALLOWED_DOCUMENT_MIME_TYPES.get(normalized_content_type)
        if extension is None:
            raise ValidationException("Tipo de arquivo não permitido. Envie PDF, JPG ou PNG.")
        if extension == ".pdf" and not lower_name.endswith(".pdf"):
            raise ValidationException("Nome do arquivo PDF deve terminar com .pdf.")
        if extension == ".jpg" and not lower_name.endswith((".jpg", ".jpeg")):
            raise ValidationException("Nome do arquivo JPG deve terminar com .jpg ou .jpeg.")
        if extension == ".png" and not lower_name.endswith(".png"):
            raise ValidationException("Nome do arquivo PNG deve terminar com .png.")

        if normalized_content_type == "application/pdf" and not content.startswith(b"%PDF"):
            raise ValidationException("Conteúdo enviado não parece ser um PDF válido.")
        if normalized_content_type == "image/png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValidationException("Conteúdo enviado não parece ser um PNG válido.")
        if normalized_content_type == "image/jpeg" and not content.startswith(b"\xff\xd8\xff"):
            raise ValidationException("Conteúdo enviado não parece ser um JPG válido.")

        return normalized_content_type, extension

    @classmethod
    def _case_response(cls, case: PreAdmissionCaseModel) -> PreAdmissionCaseResponse:
        return PreAdmissionCaseResponse(
            id=case.id,
            candidate_id=case.candidate_id,
            job_id=case.job_id,
            hiring_decision_id=case.hiring_decision_id,
            status=case.status,  # type: ignore[arg-type]
            salary_offer=case.salary_offer,
            start_date=case.start_date,
            work_model=case.work_model,
            notes=case.notes,
            created_by=case.created_by,
            created_at=case.created_at,
            updated_at=case.updated_at,
            closed_at=case.closed_at,
            checklist_items=[cls._item_response(item) for item in case.checklist_items],
        )

    @staticmethod
    def _item_response(item: PreAdmissionChecklistItemModel) -> PreAdmissionChecklistItemResponse:
        return PreAdmissionChecklistItemResponse(
            id=item.id,
            case_id=item.case_id,
            item_type=item.item_type,  # type: ignore[arg-type]
            title=item.title,
            status=item.status,  # type: ignore[arg-type]
            required=item.required,
            notes=item.notes,
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
        return CandidatePortalPreAdmissionCaseResponse(
            id=case.id,
            status=case.status,  # type: ignore[arg-type]
            salary_offer=case.salary_offer,
            start_date=case.start_date,
            work_model=case.work_model,
            checklist_items=[cls._item_with_documents_response(item) for item in case.checklist_items],
        )

    @classmethod
    def _item_with_documents_response(
        cls,
        item: PreAdmissionChecklistItemModel,
    ) -> PreAdmissionChecklistItemWithDocumentsResponse:
        return PreAdmissionChecklistItemWithDocumentsResponse(
            **cls._item_response(item).model_dump(),
            documents=[cls._document_response(document) for document in item.documents if document.status != "replaced"],
        )

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
            created_at=document.created_at,
            updated_at=document.updated_at,
        )
