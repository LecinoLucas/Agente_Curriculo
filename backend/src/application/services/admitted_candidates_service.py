from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from src.application.services.audit_service import AuditService
from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.repositories.sqlalchemy_pre_admission_repository import (
    SQLAlchemyPreAdmissionRepository,
)
from src.interface.api.schemas.admission_schemas import (
    AdmittedCandidateResponse,
    AdmittedCandidatesPageResponse,
    AdmittedCandidatesSummaryResponse,
    AdmittedCandidatesStatusResponse,
)


class AdmittedCandidatesService:
    def __init__(
        self,
        repository: SQLAlchemyPreAdmissionRepository,
        *,
        audit_service: AuditService | None = None,
    ) -> None:
        self._repository = repository
        self._audit_service = audit_service

    async def list_admitted(
        self,
        *,
        page: int,
        page_size: int,
        search: str | None = None,
        status_filter: str = "all",
    ) -> AdmittedCandidatesPageResponse:
        page = max(1, page)
        page_size = max(1, page_size)
        offset = (page - 1) * page_size
        statuses = self._list_statuses(status_filter)

        rows, total = await self._repository.list_admitted_candidates(
            offset=offset,
            limit=page_size,
            search=search,
            statuses=statuses,
        )
        _, total_admitted = await self._repository.list_admitted_candidates(
            offset=0,
            limit=1,
            search=search,
            statuses=("admitted",),
        )
        admitted_this_month, latest_admitted_at = await self._repository.admitted_candidates_summary(
            month_start=self._month_start(),
            search=search,
        )

        return AdmittedCandidatesPageResponse(
            data=[self._row_to_response(row) for row in rows],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=max(1, math.ceil(total / page_size)) if total else 1,
            summary=AdmittedCandidatesSummaryResponse(
                total_admitted=total_admitted,
                admitted_this_month=admitted_this_month,
                latest_admitted_at=latest_admitted_at,
            ),
        )

    async def dismiss_case(
        self,
        *,
        admission_case_id: UUID,
        actor_user_id: UUID | None,
        reason: str,
    ) -> AdmittedCandidatesStatusResponse:
        case = await self._repository.get_case(admission_case_id)
        if case is None:
            raise NotFoundException("Caso de admissão não encontrado.")

        clean_reason = reason.strip()
        if not clean_reason:
            raise ValidationException("Informe o motivo do desligamento.")
        if len(clean_reason) > 1000:
            raise ValidationException("O motivo do desligamento excede o limite de 1000 caracteres.")
        if case.status == "dismissed":
            raise ValidationException("Este caso já foi marcado como desligado.")
        if case.status != "admitted":
            raise ValidationException("Somente casos admitidos podem ser marcados como desligados.")

        previous_status = case.status
        now = datetime.now(UTC)
        case.status = "dismissed"
        case.dismissed_at = now
        case.dismissal_reason = clean_reason
        case.updated_at = now
        await self._repository.flush()
        await self._repository.add_event(
            self._dismiss_event(
                case_id=case.id,
                actor_id=actor_user_id,
                previous_status=previous_status,
                new_status=case.status,
                dismissed_at=now,
            )
        )

        if self._audit_service is not None:
            pipeline = await self._repository.get_latest_pipeline_for_job_candidate(
                candidate_id=case.candidate_id,
                job_id=case.job_id,
            )
            await self._audit_service.log_event(
                action="admission.dismissed",
                resource_type="pre_admission_case",
                resource_id=case.id,
                user_id=actor_user_id,
                metadata={
                    "candidate_id": str(case.candidate_id),
                    "admission_case_id": str(case.id),
                    "job_id": str(case.job_id),
                    "pipeline_id": str(pipeline.candidate_job_pipeline_id) if pipeline is not None else None,
                    "previous_status": previous_status,
                    "new_status": case.status,
                },
                before_state={"status": previous_status},
                after_state={"status": case.status, "dismissed_at": now.isoformat()},
            )

        return AdmittedCandidatesStatusResponse(
            admission_case_id=case.id,
            admission_status=case.status,
            admitted_at=case.closed_at,
            dismissed_at=case.dismissed_at,
            dismissal_reason=case.dismissal_reason,
        )

    @staticmethod
    def _month_start() -> datetime:
        now = datetime.now(UTC)
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    @staticmethod
    def _list_statuses(status_filter: str) -> tuple[str, ...]:
        normalized = (status_filter or "all").strip().lower()
        if normalized == "all":
            return ("admitted", "dismissed")
        if normalized == "admitted":
            return ("admitted",)
        if normalized == "dismissed":
            return ("dismissed",)
        raise ValidationException("Filtro de status inválido.")

    @staticmethod
    def _dismiss_event(
        *,
        case_id: UUID,
        actor_id: UUID | None,
        previous_status: str,
        new_status: str,
        dismissed_at: datetime,
    ):
        from src.infrastructure.database.models.pre_admission_model import PreAdmissionEventModel

        return PreAdmissionEventModel(
            case_id=case_id,
            event_type="case_dismissed",
            actor_id=actor_id,
            payload_json={
                "old_status": previous_status,
                "new_status": new_status,
                "dismissed_at": dismissed_at.isoformat(),
            },
            created_at=dismissed_at,
        )

    @staticmethod
    def _row_to_response(row: dict[str, Any]) -> AdmittedCandidateResponse:
        admitted_at = row["admitted_at"] or row["updated_at"]
        return AdmittedCandidateResponse(
            candidate_id=row["candidate_id"],
            candidate_name=row["candidate_name"],
            candidate_email=row["candidate_email"],
            job_id=row["job_id"],
            job_title=row["job_title"],
            pipeline_id=row["pipeline_id"],
            admission_case_id=row["admission_case_id"],
            admission_status=row["admission_status"],
            admitted_at=admitted_at,
            dismissed_at=row.get("dismissed_at"),
            start_date=row["start_date"],
            work_model=row["work_model"],
        )
