from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.exceptions import ConflictException, NotFoundException, ValidationException
from src.infrastructure.database.models.candidate_application_model import (
    APPLICATION_ACTIVE_STATUSES,
    CandidateApplicationModel,
    CandidateLocationPreferenceModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.operational_master_model import (
    LocationGroupModel,
    OperationalUnitModel,
)
from src.infrastructure.repositories.sqlalchemy_candidate_application_repository import (
    SQLAlchemyCandidateApplicationRepository,
)
from src.interface.api.schemas.candidate_application_schemas import (
    CandidateApplicationCreateRequest,
    CandidateApplicationUpdateRequest,
    CandidateLocationPreferenceCreateRequest,
)


class CandidateApplicationService:
    def __init__(
        self,
        session: AsyncSession,
        repository: SQLAlchemyCandidateApplicationRepository,
    ):
        self._session = session
        self._repository = repository

    async def create_application(
        self,
        body: CandidateApplicationCreateRequest,
    ) -> CandidateApplicationModel:
        await self._ensure_candidate_exists(body.candidate_id)
        if body.job_id is not None:
            await self._ensure_job_exists(body.job_id)
        await self._validate_location_selection(
            preferred_location_group_id=body.preferred_location_group_id,
            preferred_unit_id=body.preferred_unit_id,
            accepts_any_unit_in_location=body.accepts_any_unit_in_location,
        )
        await self._ensure_no_duplicate_active_application(
            candidate_id=body.candidate_id,
            job_id=body.job_id,
            status=body.status,
        )

        application = CandidateApplicationModel(
            candidate_id=body.candidate_id,
            job_id=body.job_id,
            source=body.source,
            status=body.status,
            preferred_location_group_id=body.preferred_location_group_id,
            preferred_unit_id=body.preferred_unit_id,
            accepts_any_unit_in_location=body.accepts_any_unit_in_location,
            desired_job_area=self._clean_optional_text(body.desired_job_area),
            desired_shift=self._clean_optional_text(body.desired_shift),
            lgpd_consent_at=body.lgpd_consent_at,
            lgpd_consent_version=self._clean_optional_text(body.lgpd_consent_version),
        )
        return await self._repository.create_application(application)

    async def get_application(self, application_id: UUID) -> CandidateApplicationModel:
        application = await self._repository.get_application(application_id)
        if application is None:
            raise NotFoundException("Candidatura não encontrada.")
        return application

    async def list_applications(
        self,
        *,
        page: int,
        page_size: int,
        candidate_id: UUID | None = None,
        job_id: UUID | None = None,
        status: str | None = None,
        source: str | None = None,
    ):
        return await self._repository.list_applications(
            page=page,
            page_size=page_size,
            candidate_id=candidate_id,
            job_id=job_id,
            status=status,
            source=source,
        )

    async def update_application(
        self,
        application_id: UUID,
        body: CandidateApplicationUpdateRequest,
    ) -> CandidateApplicationModel:
        application = await self.get_application(application_id)
        changes = body.model_dump(exclude_unset=True)

        merged_location_id = changes.get(
            "preferred_location_group_id",
            application.preferred_location_group_id,
        )
        merged_unit_id = changes.get("preferred_unit_id", application.preferred_unit_id)
        merged_accepts_any = changes.get(
            "accepts_any_unit_in_location",
            application.accepts_any_unit_in_location,
        )
        await self._validate_location_selection(
            preferred_location_group_id=merged_location_id,
            preferred_unit_id=merged_unit_id,
            accepts_any_unit_in_location=merged_accepts_any,
        )

        merged_status = changes.get("status", application.status)
        await self._ensure_no_duplicate_active_application(
            candidate_id=application.candidate_id,
            job_id=application.job_id,
            status=merged_status,
            exclude_application_id=application.id,
        )

        for field, value in changes.items():
            if field in {"desired_job_area", "desired_shift", "lgpd_consent_version"}:
                value = self._clean_optional_text(value)
            setattr(application, field, value)
        application.updated_at = datetime.now(UTC)
        return await self._repository.update_application(application)

    async def create_location_preference(
        self,
        body: CandidateLocationPreferenceCreateRequest,
    ) -> CandidateLocationPreferenceModel:
        await self._ensure_candidate_exists(body.candidate_id)
        await self._validate_required_location_preference(
            location_group_id=body.location_group_id,
            operational_unit_id=body.operational_unit_id,
        )

        preference = CandidateLocationPreferenceModel(
            candidate_id=body.candidate_id,
            location_group_id=body.location_group_id,
            operational_unit_id=body.operational_unit_id,
            desired_shift=self._clean_optional_text(body.desired_shift),
            priority=body.priority,
        )
        return await self._repository.create_location_preference(preference)

    async def list_location_preferences(
        self,
        *,
        page: int,
        page_size: int,
        candidate_id: UUID | None = None,
    ):
        return await self._repository.list_location_preferences(
            page=page,
            page_size=page_size,
            candidate_id=candidate_id,
        )

    async def _ensure_candidate_exists(self, candidate_id: UUID) -> None:
        candidate = await self._session.scalar(
            sa.select(CandidateModel).where(
                CandidateModel.id == candidate_id,
                CandidateModel.deleted_at.is_(None),
            )
        )
        if candidate is None:
            raise NotFoundException("Candidato não encontrado.")

    async def _ensure_job_exists(self, job_id: UUID) -> None:
        job = await self._session.scalar(
            sa.select(JobModel).where(
                JobModel.id == job_id,
                JobModel.deleted_at.is_(None),
            )
        )
        if job is None:
            raise NotFoundException("Vaga não encontrada.")

    async def _validate_location_selection(
        self,
        *,
        preferred_location_group_id: UUID | None,
        preferred_unit_id: UUID | None,
        accepts_any_unit_in_location: bool,
    ) -> None:
        if accepts_any_unit_in_location:
            if preferred_location_group_id is None:
                raise ValidationException(
                    "accepts_any_unit_in_location exige localidade preferida."
                )
            if preferred_unit_id is not None:
                raise ValidationException(
                    "accepts_any_unit_in_location exige unidade preferida nula."
                )

        if preferred_location_group_id is not None:
            await self._ensure_active_location_group(preferred_location_group_id)

        if preferred_unit_id is not None:
            unit = await self._ensure_active_unit(preferred_unit_id)
            if (
                preferred_location_group_id is not None
                and unit.location_group_id != preferred_location_group_id
            ):
                raise ValidationException(
                    "Unidade preferida não pertence à localidade informada."
                )

    async def _validate_required_location_preference(
        self,
        *,
        location_group_id: UUID,
        operational_unit_id: UUID | None,
    ) -> None:
        await self._ensure_active_location_group(location_group_id)
        if operational_unit_id is not None:
            unit = await self._ensure_active_unit(operational_unit_id)
            if unit.location_group_id != location_group_id:
                raise ValidationException(
                    "Unidade preferida não pertence à localidade informada."
                )

    async def _ensure_active_location_group(self, location_group_id: UUID) -> None:
        location = await self._session.scalar(
            sa.select(LocationGroupModel).where(
                LocationGroupModel.id == location_group_id,
                LocationGroupModel.is_active.is_(True),
            )
        )
        if location is None:
            raise NotFoundException("Localidade preferida não encontrada ou inativa.")

    async def _ensure_active_unit(self, unit_id: UUID) -> OperationalUnitModel:
        unit = await self._session.scalar(
            sa.select(OperationalUnitModel).where(
                OperationalUnitModel.id == unit_id,
                OperationalUnitModel.is_active.is_(True),
            )
        )
        if unit is None:
            raise NotFoundException("Unidade preferida não encontrada ou inativa.")
        return unit

    async def _ensure_no_duplicate_active_application(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID | None,
        status: str,
        exclude_application_id: UUID | None = None,
    ) -> None:
        if job_id is None or status not in APPLICATION_ACTIVE_STATUSES:
            return
        existing = await self._repository.find_active_application(
            candidate_id=candidate_id,
            job_id=job_id,
            exclude_application_id=exclude_application_id,
        )
        if existing is not None:
            raise ConflictException("Já existe candidatura ativa para este candidato e vaga.")

    @staticmethod
    def _clean_optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None
