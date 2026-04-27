from __future__ import annotations

from uuid import NAMESPACE_URL
from uuid import UUID
from uuid import uuid5

import structlog

from sqlalchemy.exc import IntegrityError

from app.modules.admission.models.admission_models import Admission, CandidateDocument
from app.modules.admission.repositories.admission_repository import AdmissionRepository
from src.interface.workers.document_ai_dispatcher import enqueue_document_ai
from src.observability.context import get_correlation_id
from src.observability.domain_events import (
    DomainEvent,
    DomainEventType,
    publish_domain_event,
)

logger = structlog.get_logger(__name__)


class AdmissionService:
    def __init__(self, repository: AdmissionRepository) -> None:
        self._repository = repository

    async def create_admission_from_pipeline(self, candidate_id: UUID, job_id: UUID) -> Admission:
        existing_admission = await self._repository.find_by_candidate_and_job(candidate_id, job_id)
        if existing_admission is not None:
            return existing_admission

        pipeline_entry = await self._repository.find_hired_pipeline_entry_for_update(candidate_id, job_id)
        if pipeline_entry is None:
            raise ValueError("candidate_not_hired")

        # Recheck after acquiring DB lock on the hired pipeline row to avoid duplicates in concurrent requests.
        existing_admission = await self._repository.find_by_candidate_and_job(candidate_id, job_id)
        if existing_admission is not None:
            return existing_admission

        try:
            async with self._repository.begin_nested():
                return await self._repository.create_admission(candidate_id, job_id)
        except IntegrityError:
            existing_admission = await self._repository.find_by_candidate_and_job(candidate_id, job_id)
            if existing_admission is not None:
                return existing_admission
            raise

    async def upload_document(
        self,
        admission_id: UUID,
        file_path: str,
        requirement_id: UUID,
    ) -> CandidateDocument:
        admission = await self._repository.get_admission_for_update(admission_id)
        if admission is None:
            raise ValueError("admission_not_found")

        requirement = await self._repository.get_requirement(requirement_id)
        if requirement is None:
            raise ValueError("requirement_not_found")

        existing_document = await self._repository.get_candidate_document_for_update(
            admission_id=admission_id,
            document_requirement_id=requirement_id,
        )

        if existing_document is not None:
            document = await self._repository.replace_candidate_document_file(
                existing_document,
                file_path=file_path,
            )
        else:
            try:
                async with self._repository.begin_nested():
                    document = await self._repository.create_candidate_document(
                        admission_id=admission_id,
                        document_requirement_id=requirement_id,
                        file_path=file_path,
                    )
            except IntegrityError:
                existing_document = await self._repository.get_candidate_document_for_update(
                    admission_id=admission_id,
                    document_requirement_id=requirement_id,
                )
                if existing_document is None:
                    raise
                document = await self._repository.replace_candidate_document_file(
                    existing_document,
                    file_path=file_path,
                )

        ai_analysis = await self._repository.create_document_ai_analysis(document_id=document.id)
        correlation_id = self._resolve_correlation_id(admission_id=admission_id, document_id=document.id)
        await publish_domain_event(
            DomainEvent(
                event_type=DomainEventType.DOCUMENT_UPLOADED,
                entity_id=document.id,
                payload={
                    "admission_id": str(admission_id),
                    "requirement_id": str(requirement_id),
                    "file_path": file_path,
                    "analysis_id": str(ai_analysis.id),
                    "correlation_id": correlation_id,
                },
            ),
            session=self._repository.session,
        )
        try:
            enqueue_document_ai(
                admission_id=admission_id,
                document_id=document.id,
                analysis_id=ai_analysis.id,
                correlation_id=correlation_id,
            )
        except Exception as exc:
            await self._repository.mark_document_ai_analysis_failed(
                analysis=ai_analysis,
                error_message=f"enqueue_failed:{exc}",
            )
            logger.exception(
                "document_ai.enqueue_failed",
                admission_id=str(admission_id),
                document_id=str(document.id),
                analysis_id=str(ai_analysis.id),
                correlation_id=correlation_id,
            )
        await self._recalculate_admission_status(admission_id)

        return document

    async def validate_document(self, doc_id: UUID, status: str) -> CandidateDocument:
        if status not in {"approved", "rejected"}:
            raise ValueError("invalid_document_status")

        document = await self._repository.get_candidate_document(doc_id)
        if document is None:
            raise ValueError("document_not_found")

        admission = await self._repository.get_admission_for_update(document.admission_id)
        if admission is None:
            raise ValueError("admission_not_found")

        document = await self._repository.update_candidate_document_status(document, status)
        await self._recalculate_admission_status(document.admission_id)

        return document

    async def get_admission_progress(self, admission_id: UUID) -> dict[str, int | float]:
        admission = await self._repository.get_admission(admission_id)
        if admission is None:
            raise ValueError("admission_not_found")

        metrics = await self._repository.calculate_admission_metrics(admission_id)

        total_required = metrics["required_total"]
        total_sent = metrics["required_sent"]
        total_approved = metrics["required_approved"]
        percentage = (total_approved / total_required * 100) if total_required > 0 else 0.0

        return {
            "total_required": total_required,
            "total_sent": total_sent,
            "total_approved": total_approved,
            "percentage": round(percentage, 2),
        }

    async def _recalculate_admission_status(self, admission_id: UUID) -> Admission:
        admission = await self._repository.get_admission_for_update(admission_id)
        if admission is None:
            raise ValueError("admission_not_found")

        previous_status = admission.status
        metrics = await self._repository.calculate_admission_metrics(admission_id)

        if metrics["required_rejected"] > 0:
            target_status = "rejected"
        elif metrics["required_total"] == 0:
            # Explicit edge-case rule: when there are no required documents, admission is auto-approved.
            target_status = "approved"
        elif metrics["required_total"] > 0 and metrics["required_approved"] == metrics["required_total"]:
            target_status = "approved"
        elif metrics["required_sent"] > 0:
            target_status = "in_progress"
        else:
            target_status = "pending"

        updated_admission = await self._repository.set_admission_status(admission, target_status)
        if previous_status != updated_admission.status:
            correlation_id = self._resolve_correlation_id(admission_id=updated_admission.id)
            await publish_domain_event(
                DomainEvent(
                    event_type=DomainEventType.ADMISSION_STATUS_CHANGED,
                    entity_id=updated_admission.id,
                    payload={
                        "admission_id": str(updated_admission.id),
                        "candidate_id": str(updated_admission.candidate_id),
                        "job_id": str(updated_admission.job_id),
                        "from_status": previous_status,
                        "to_status": updated_admission.status,
                        "metrics_snapshot": metrics,
                        "correlation_id": correlation_id,
                    },
                ),
                session=self._repository.session,
            )
            logger.info(
                "admission.status_changed",
                admission_id=str(updated_admission.id),
                candidate_id=str(updated_admission.candidate_id),
                from_status=previous_status,
                to_status=updated_admission.status,
                correlation_id=correlation_id,
            )
        # Explicit edge-case rule: when there are no required documents, admission is auto-approved.
        return updated_admission

    @staticmethod
    def _resolve_correlation_id(admission_id: UUID, document_id: UUID | None = None) -> str:
        current = get_correlation_id()
        if current:
            return current
        if document_id is not None:
            return str(uuid5(NAMESPACE_URL, f"admission:{admission_id}:document:{document_id}"))
        return str(uuid5(NAMESPACE_URL, f"admission:{admission_id}"))
