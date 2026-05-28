"""Repository for admission export packages."""

from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.pre_admission_state_machine import (
    ADMISSION_PACKAGE_ENTITY,
    transition_status,
)
from src.infrastructure.database.models import AdmissionExportPackageModel


class SQLAlchemyAdmissionPackageRepository:
    """Repository for admission export package operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_case_id(self, case_id: UUID) -> AdmissionExportPackageModel | None:
        """Get package by case ID."""
        stmt = sa.select(AdmissionExportPackageModel).where(
            AdmissionExportPackageModel.case_id == case_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id(self, package_id: UUID) -> AdmissionExportPackageModel | None:
        """Get package by ID."""
        return await self.session.get(AdmissionExportPackageModel, package_id)

    async def create(
        self,
        case_id: UUID,
        candidate_id: UUID,
        job_id: UUID,
        payload: dict,
        validation_errors: list | None = None,
        created_by: UUID | None = None,
    ) -> AdmissionExportPackageModel:
        """Create admission package."""
        package = AdmissionExportPackageModel(
            case_id=case_id,
            candidate_id=candidate_id,
            job_id=job_id,
            status="draft",
            payload_json=payload,
            validation_errors_json=validation_errors,
            created_by=created_by,
        )
        self.session.add(package)
        await self.session.flush()
        return package

    async def update_status(
        self,
        package_id: UUID,
        new_status: str,
        approved_by: UUID | None = None,
        exported_by: UUID | None = None,
    ) -> AdmissionExportPackageModel:
        """Update package status."""
        package = await self.get_by_id(package_id)
        if not package:
            raise ValueError(f"Package {package_id} not found")

        transition_status(package, entity=ADMISSION_PACKAGE_ENTITY, to_status=new_status)
        if approved_by and new_status == "approved_for_export":
            package.approved_by = approved_by
            from datetime import UTC, datetime
            package.approved_at = datetime.now(UTC)
        if exported_by and new_status == "exported":
            package.exported_by = exported_by
            from datetime import UTC, datetime
            package.exported_at = datetime.now(UTC)

        from datetime import UTC, datetime
        package.updated_at = datetime.now(UTC)
        await self.session.flush()
        return package

    async def mark_exported(
        self,
        package_id: UUID,
        exported_by: UUID | None = None,
    ) -> AdmissionExportPackageModel:
        """Mark package as exported."""
        return await self.update_status(
            package_id,
            "exported",
            exported_by=exported_by,
        )
