"""Service for managing candidate data quality status and marking invalid candidates."""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.domain.services.data_quality_classifier import DataQualityClassifier
from src.domain.enums.data_quality_status import DataQualityStatus

logger = logging.getLogger(__name__)


class DataQualityService:
    """Service for candidate data quality management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def classify_and_mark_candidate(
        self,
        candidate_id: UUID,
    ) -> tuple[DataQualityStatus, str]:
        """Classify and mark a single candidate based on resume data.

        Returns:
            Tuple of (status, reason)
        """
        candidate_uuid = _as_uuid(candidate_id)
        # Fetch candidate and resumes
        stmt = select(CandidateModel).where(CandidateModel.id == candidate_uuid)
        result = await self.db.execute(stmt)
        candidate = result.scalar_one_or_none()

        if not candidate:
            raise ValueError(f"Candidate {candidate_id} not found")

        # Get resumes for candidate
        resume_stmt = select(ResumeModel).where(
            ResumeModel.candidate_id == candidate_uuid
        )
        resume_result = await self.db.execute(resume_stmt)
        resumes = resume_result.scalars().all()

        has_resume = len(resumes) > 0
        resume_text = None
        resume_parsed_ok = None

        if has_resume:
            # Get most recent resume version with content
            for resume in resumes:
                # Load versions (they're lazy loaded)
                if resume.versions:
                    versions_sorted = sorted(
                        resume.versions,
                        key=lambda v: v.version_number,
                        reverse=True
                    )
                    for version in versions_sorted:
                        # Check extraction status
                        if version.extraction_status == "completed" and version.extracted_text:
                            resume_text = version.extracted_text
                            resume_parsed_ok = True
                            break
                        elif version.extraction_status == "failed":
                            resume_parsed_ok = False

                    if resume_parsed_ok is not None:
                        break

            # If no extracted content found, mark as parsing failed
            if resume_text is None and resume_parsed_ok is None:
                resume_parsed_ok = False

        # Classify
        classification = DataQualityClassifier.classify(
            candidate_id=str(candidate_id),
            has_resume=has_resume,
            resume_text=resume_text,
            resume_parsed_successfully=resume_parsed_ok,
        )

        # Update candidate
        await self.mark_candidate(
            candidate_id=candidate_uuid,
            status=classification.status,
            reason=classification.reason,
        )

        logger.info(
            f"Classified candidate {candidate_id}: {classification.status.value}",
            extra={"candidate_id": str(candidate_id), "status": classification.status.value}
        )

        return classification.status, classification.reason

    async def mark_candidate(
        self,
        candidate_id: UUID,
        status: DataQualityStatus,
        reason: str,
        marked_by: Optional[UUID] = None,
    ) -> None:
        """Mark candidate with data quality status.

        Args:
            candidate_id: Candidate UUID
            status: DataQualityStatus enum
            reason: Explanation of status
            marked_by: UUID of admin who manually marked (if manual)
        """
        candidate_uuid = _as_uuid(candidate_id)
        stmt = (
            update(CandidateModel)
            .where(CandidateModel.id == candidate_uuid)
            .values(
                data_quality_status=status.value,
                data_quality_reason=reason,
                data_quality_marked_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
        )
        await self.db.execute(stmt)
        await self.db.commit()

    async def mark_invalid(
        self,
        candidate_id: UUID,
        reason: str,
        marked_by: UUID,
    ) -> None:
        """Manually mark candidate as invalid with audit trail.

        Args:
            candidate_id: Candidate UUID
            reason: Explanation for marking as invalid
            marked_by: UUID of admin marking
        """
        if not reason or len(reason.strip()) < 10:
            raise ValueError("Reason must be at least 10 characters")

        reason_with_audit = f"[Manual by {marked_by}] {reason}"
        await self.mark_candidate(
            candidate_id=_as_uuid(candidate_id),
            status=DataQualityStatus.INVALID_MANUAL,
            reason=reason_with_audit,
        )

        logger.warning(
            f"Candidate {candidate_id} manually marked as invalid",
            extra={
                "candidate_id": str(candidate_id),
                "marked_by": str(marked_by),
                "reason": reason,
            }
        )

    async def unmark_invalid(
        self,
        candidate_id: UUID,
        marked_by: UUID,
    ) -> None:
        """Revert manual invalid marking and re-classify candidate.

        Args:
            candidate_id: Candidate UUID
            marked_by: UUID of admin reverting
        """
        # Re-classify based on actual data
        status, reason = await self.classify_and_mark_candidate(candidate_id)

        logger.info(
            f"Candidate {candidate_id} manually unmarked, re-classified as {status.value}",
            extra={"candidate_id": str(candidate_id), "marked_by": str(marked_by)}
        )

    async def reclassify_all_candidates(self) -> dict[str, int]:
        """Batch reclassify all candidates based on resume data.

        Returns:
            Dictionary with counts of each status
        """
        stmt = select(CandidateModel.id)
        result = await self.db.execute(stmt)
        candidate_ids = result.scalars().all()

        counts = {status.value: 0 for status in DataQualityStatus}
        failed = 0

        for candidate_id in candidate_ids:
            try:
                status, _ = await self.classify_and_mark_candidate(candidate_id)
                counts[status.value] += 1
            except Exception as e:
                logger.error(
                    f"Failed to classify candidate {candidate_id}: {str(e)}",
                    extra={"candidate_id": str(candidate_id)}
                )
                failed += 1

        counts["failed"] = failed
        return counts

    async def get_candidates_by_quality(
        self,
        status: DataQualityStatus,
        limit: int = 100,
        offset: int = 0,
    ) -> list[CandidateModel]:
        """Fetch candidates with specific data quality status.

        Args:
            status: DataQualityStatus to filter by
            limit: Maximum results
            offset: Pagination offset

        Returns:
            List of candidates
        """
        stmt = (
            select(CandidateModel)
            .where(CandidateModel.data_quality_status == status.value)
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def exclude_invalid_from_ranking(
        self,
        candidate_ids: list[UUID],
    ) -> list[UUID]:
        """Filter out invalid candidates from a list.

        Args:
            candidate_ids: List of candidate UUIDs

        Returns:
            Filtered list with only valid candidates
        """
        invalid_statuses = [
            DataQualityStatus.NO_RESUME.value,
            DataQualityStatus.EMPTY_RESUME.value,
            DataQualityStatus.PARSING_FAILED.value,
            DataQualityStatus.INVALID_MANUAL.value,
        ]

        candidate_uuid_ids = [_as_uuid(candidate_id) for candidate_id in candidate_ids]

        stmt = (
            select(CandidateModel.id)
            .where(
                and_(
                    CandidateModel.id.in_(candidate_uuid_ids),
                    ~CandidateModel.data_quality_status.in_(invalid_statuses)
                )
            )
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()


def _as_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))
