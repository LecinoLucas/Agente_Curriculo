"""Service for admission export packages — consolidates data for ERP integration."""

import json
import logging
from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.application.services.pre_admission_state_machine import (
    ADMISSION_PACKAGE_ENTITY,
    transition_payload,
    transition_status,
)
from src.domain.exceptions import ValidationException
from src.infrastructure.database.models import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionEventModel,
    CandidateModel,
    JobModel,
    CandidateJobHiringDecisionModel,
    PreAdmissionDocumentModel,
    AdmissionExportPackageModel,
)
from src.infrastructure.repositories.sqlalchemy_admission_package_repository import (
    SQLAlchemyAdmissionPackageRepository,
)

logger = logging.getLogger(__name__)


class AdmissionPackageService:
    """Service for creating and managing admission export packages."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repository = SQLAlchemyAdmissionPackageRepository(session)

    async def create_package(
        self,
        case_id: UUID,
        user_id: UUID | None = None,
    ) -> AdmissionExportPackageModel:
        """Create admission export package from pre-admission case.

        Validates:
        - Case exists and status is ready_for_admission
        - All required checklist items are approved or waived
        - Generates snapshot payload
        - Stores validation errors if any

        Returns: AdmissionExportPackageModel with status=draft
        Raises: ValidationException if validation fails
        """
        # Fetch case
        case = await self._fetch_case(case_id)

        if case.status != "ready_for_admission":
            raise ValidationException(
                f"Cannot create package: case status is '{case.status}', must be 'ready_for_admission'"
            )

        # Check for existing package (allow only one per case)
        existing = await self.repository.get_by_case_id(case_id)
        if existing and existing.status not in ["cancelled", "exported"]:
            raise ValidationException(
                f"Package already exists for this case with status '{existing.status}'"
            )

        # Fetch related data
        candidate = await self._fetch_candidate_snapshot(case.candidate_id)
        job = await self._fetch_job_snapshot(case.job_id)

        # Validate checklist
        checklist_items = await self._fetch_checklist_items(case_id)
        validation_errors = self._validate_checklist(checklist_items)

        # Fetch decision
        decision = await self._fetch_latest_hiring_decision(case.job_id, case.candidate_id)

        # Build payload snapshot
        payload = await self._build_payload(
            candidate=candidate,
            job=job,
            case=case,
            checklist_items=checklist_items,
            decision=decision,
        )

        # Create package
        package = await self.repository.create(
            case_id=case_id,
            candidate_id=case.candidate_id,
            job_id=case.job_id,
            payload=payload,
            validation_errors=validation_errors if validation_errors else None,
            created_by=user_id,
        )

        # Transition to ready_for_review if no errors, else stay draft
        old_status = package.status
        if not validation_errors:
            transition_status(package, entity=ADMISSION_PACKAGE_ENTITY, to_status="ready_for_review")

        await self.session.flush()

        # Register event
        await self._register_event(
            case_id=package.case_id,
            event_type="package_created",
            actor_id=user_id,
            payload={
                "package_id": str(package.id),
                "status": package.status,
                **transition_payload(old_status=old_status, new_status=package.status),
            },
        )

        logger.info(
            f"Created admission package {package.id} for case {case_id}, status={package.status}"
        )

        return package

    async def approve_package(
        self,
        package_id: UUID,
        user_id: UUID | None = None,
    ) -> AdmissionExportPackageModel:
        """Approve package for export.

        Only packages with status='ready_for_review' can be approved.
        """
        package = await self.repository.get_by_id(package_id)
        if not package:
            raise ValidationException(f"Package {package_id} not found")

        if package.status != "ready_for_review":
            raise ValidationException(
                f"Cannot approve package with status '{package.status}', must be 'ready_for_review'"
            )

        if package.validation_errors_json:
            raise ValidationException(
                f"Cannot approve package with {len(package.validation_errors_json)} validation errors"
            )

        previous_status = package.status
        result = await self.repository.update_status(
            package_id,
            "approved_for_export",
            approved_by=user_id,
        )

        # Register event
        await self._register_event(
            case_id=result.case_id,
            event_type="package_approved",
            actor_id=user_id,
            payload={
                "package_id": str(result.id),
                "status": result.status,
                **transition_payload(old_status=previous_status, new_status=result.status),
            },
        )

        return result

    async def cancel_package(
        self,
        package_id: UUID,
        reason: str | None = None,
    ) -> AdmissionExportPackageModel:
        """Cancel package.

        Can be cancelled from any state except 'exported'.
        """
        package = await self.repository.get_by_id(package_id)
        if not package:
            raise ValidationException(f"Package {package_id} not found")

        previous_status = package.status
        result = await self.repository.update_status(package_id, "cancelled")
        result.cancelled_at = datetime.now(UTC)
        await self.session.flush()

        # Register event
        await self._register_event(
            case_id=result.case_id,
            event_type="package_cancelled",
            actor_id=None,
            payload={
                "package_id": str(result.id),
                "status": result.status,
                "reason": reason,
                **transition_payload(old_status=previous_status, new_status=result.status),
            },
        )

        logger.info(f"Cancelled admission package {package_id}, reason: {reason}")

        return result

    async def get_export_payload(
        self,
        package_id: UUID,
    ) -> AdmissionExportPackageModel:
        """Get package payload for download without changing business state."""
        package = await self.repository.get_by_id(package_id)
        if not package:
            raise ValidationException(f"Package {package_id} not found")

        if package.status in {"approved_for_export", "exported"}:
            return package

        raise ValidationException(
            f"Cannot export package with status '{package.status}', must be 'approved_for_export' or 'exported'"
        )

    async def export_package(
        self,
        package_id: UUID,
        user_id: UUID | None = None,
    ) -> AdmissionExportPackageModel:
        """Mark package as exported.

        Only packages with status='approved_for_export' can be exported.
        """
        package = await self.repository.get_by_id(package_id)
        if not package:
            raise ValidationException(f"Package {package_id} not found")

        if package.status != "approved_for_export":
            raise ValidationException(
                f"Cannot export package with status '{package.status}', must be 'approved_for_export'"
            )

        previous_status = package.status
        result = await self.repository.mark_exported(package_id, exported_by=user_id)

        # Register event
        await self._register_event(
            case_id=result.case_id,
            event_type="package_exported",
            actor_id=user_id,
            payload={
                "package_id": str(result.id),
                "status": result.status,
                **transition_payload(old_status=previous_status, new_status=result.status),
            },
        )

        return result

    # Private methods

    async def _fetch_case(self, case_id: UUID) -> PreAdmissionCaseModel:
        """Fetch pre-admission case."""
        case = await self.session.get(PreAdmissionCaseModel, case_id)
        if not case:
            raise ValidationException(f"Pre-admission case {case_id} not found")
        return case

    async def _fetch_checklist_items(
        self,
        case_id: UUID,
    ) -> list[PreAdmissionChecklistItemModel]:
        """Fetch all checklist items for case (eager load documents)."""
        stmt = sa.select(PreAdmissionChecklistItemModel).options(
            selectinload(PreAdmissionChecklistItemModel.documents)
        ).where(
            PreAdmissionChecklistItemModel.case_id == case_id
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def _fetch_latest_hiring_decision(
        self,
        job_id: UUID,
        candidate_id: UUID,
    ) -> dict | None:
        """Fetch latest hiring decision for candidate-job."""
        stmt = (
            sa.select(
                CandidateJobHiringDecisionModel.id,
                CandidateJobHiringDecisionModel.decision_outcome,
                CandidateJobHiringDecisionModel.reason_code,
                CandidateJobHiringDecisionModel.submitted_at,
            )
            .where(
                (CandidateJobHiringDecisionModel.job_id == job_id)
                & (CandidateJobHiringDecisionModel.candidate_id == candidate_id)
            )
            .order_by(CandidateJobHiringDecisionModel.submitted_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        row = result.mappings().one_or_none()
        return dict(row) if row is not None else None

    async def _fetch_candidate_snapshot(self, candidate_id: UUID) -> dict | None:
        stmt = sa.select(
            CandidateModel.id,
            CandidateModel.full_name,
            CandidateModel.email,
            CandidateModel.phone,
            CandidateModel.cpf,
        ).where(CandidateModel.id == candidate_id)
        result = await self.session.execute(stmt)
        row = result.mappings().one_or_none()
        return dict(row) if row is not None else None

    async def _fetch_job_snapshot(self, job_id: UUID) -> dict | None:
        stmt = sa.select(
            JobModel.id,
            JobModel.title,
            JobModel.location,
        ).where(JobModel.id == job_id)
        result = await self.session.execute(stmt)
        row = result.mappings().one_or_none()
        return dict(row) if row is not None else None

    def _validate_checklist(
        self,
        checklist_items: list[PreAdmissionChecklistItemModel],
    ) -> list[dict] | None:
        """Validate checklist items.

        Required items must be either approved or waived.
        Returns list of validation errors or None if valid.
        """
        errors = []
        for item in checklist_items:
            if item.required and item.status not in ["approved", "waived"]:
                errors.append(
                    {
                        "field": f"checklist_item_{item.id}",
                        "message": f"{item.title} ({item.status}) — must be approved or waived",
                    }
                )
                continue

            if item.status == "approved" and self._get_current_approved_document_for_item(item) is None:
                errors.append(
                    {
                        "field": f"checklist_item_{item.id}_document",
                        "message": (
                            f"{item.title} — approved item must have a current approved document"
                        ),
                    }
                )
        return errors if errors else None

    async def _register_event(
        self,
        case_id: UUID,
        event_type: str,
        actor_id: UUID | None,
        payload: dict,
    ) -> None:
        """Register event in pre_admission_events table."""
        event = PreAdmissionEventModel(
            case_id=case_id,
            event_type=event_type,
            actor_id=actor_id,
            payload_json=payload,
            created_at=datetime.now(UTC),
        )
        self.session.add(event)
        await self.session.flush()

    async def _build_payload(
        self,
        candidate: dict | None,
        job: dict | None,
        case: PreAdmissionCaseModel,
        checklist_items: list[PreAdmissionChecklistItemModel],
        decision: dict | None,
    ) -> dict:
        """Build complete payload snapshot.

        Snapshot is independent of live data — if data is deleted, package still has it.
        """
        # Build documents section
        documents = []
        for item in checklist_items:
            doc = self._get_current_approved_document_for_item(item)
            if doc is None:
                continue

            documents.append(
                {
                    "checklist_item_id": str(item.id),
                    "title": item.title,
                    "item_status": item.status,
                    "status": doc.status,
                    "document_id": str(doc.id),
                    "original_filename": doc.original_filename,
                    "mime_type": doc.mime_type,
                    "size_bytes": doc.size_bytes,
                    "uploaded_at": doc.uploaded_at.isoformat(),
                    "reviewed_at": doc.reviewed_at.isoformat() if doc.reviewed_at else None,
                }
            )

        # Build payload
        payload = {
            "candidate": {
                "id": str(candidate["id"]) if candidate else None,
                "full_name": candidate["full_name"] if candidate else None,
                "email": candidate["email"] if candidate else None,
                "phone": candidate["phone"] if candidate else None,
                "cpf": candidate["cpf"] if candidate else None,
            },
            "job": {
                "id": str(job["id"]) if job else None,
                "title": job["title"] if job else None,
                "company": None,
                "department": None,  # Not tracked in job model
                "location": job["location"] if job else None,
            },
            "pre_admission": {
                "case_id": str(case.id),
                "status": case.status,
                "start_date": case.start_date.isoformat() if case.start_date else None,
                "salary_offer": float(case.salary_offer) if case.salary_offer else None,
                "work_model": case.work_model,
            },
            "documents": documents,
            "decision": {
                "hiring_decision_id": str(decision["id"]) if decision else None,
                "decision_outcome": decision["decision_outcome"] if decision else None,
                "reason_code": decision["reason_code"] if decision else None,
                "submitted_at": decision["submitted_at"].isoformat()
                if decision and decision["submitted_at"]
                else None,
            },
        }

        return payload

    @staticmethod
    def _get_current_approved_document_for_item(
        item: PreAdmissionChecklistItemModel,
    ) -> PreAdmissionDocumentModel | None:
        current_document = AdmissionPackageService._get_current_document_for_item(item)
        if current_document is None:
            return None
        if current_document.status != "approved":
            return None
        return current_document

    @staticmethod
    def _get_current_document_for_item(
        item: PreAdmissionChecklistItemModel,
    ) -> PreAdmissionDocumentModel | None:
        eligible_documents = [
            document
            for document in item.documents
            if document.case_id == item.case_id
            and document.checklist_item_id == item.id
            and document.deleted_at is None
            and document.status != "replaced"
        ]
        if not eligible_documents:
            return None
        return max(
            eligible_documents,
            key=lambda document: (
                document.uploaded_at.isoformat() if document.uploaded_at else "",
                document.created_at.isoformat() if document.created_at else "",
                str(document.id),
            ),
        )
