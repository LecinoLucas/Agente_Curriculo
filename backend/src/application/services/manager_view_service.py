"""Manager view service — read-only view of assigned jobs and candidates.

Safe data retrieval without exposing:
- Documents, ERP payloads, AI logs, technical breakdown
- Score calculation details, ranking algorithms
- Other managers' data

For ADMIN: bypasses evaluator scope check, sees all jobs/candidates.
For MANAGER: restricted to jobs where they are evaluator.
"""

import logging
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.database.models.job_model import JobModel

logger = logging.getLogger(__name__)


class ManagerViewService:
    """Read-only service for manager view of assigned jobs and candidates."""

    def __init__(self, session: AsyncSession, user: User):
        self.session = session
        self.user = user
        self.is_admin = user.role == UserRole.ADMIN

    async def list_manager_jobs(self, user_id: UUID) -> list[dict]:
        """
        List jobs where user is an evaluator (MANAGER role).
        For ADMIN: returns all jobs.

        Returns: [{ id, title, candidate_count, assigned_count }]
        """
        if self.is_admin:
            # ADMIN sees all jobs with their respective counts
            query = sa.select(
                JobModel.id,
                JobModel.title,
                sa.func.count(sa.distinct(CandidateJobPipelineModel.candidate_id)).label("candidate_count"),
                sa.func.count(sa.distinct(InterviewScorecardModel.id)).label("assigned_count"),
            ).select_from(
                JobModel
            ).outerjoin(
                CandidateJobPipelineModel,
                sa.and_(
                    CandidateJobPipelineModel.job_id == JobModel.id,
                    CandidateJobPipelineModel.pipeline_status == "active",
                )
            ).outerjoin(
                InterviewScorecardModel,
                InterviewScorecardModel.job_id == JobModel.id,
            ).group_by(
                JobModel.id,
                JobModel.title,
            )
        else:
            # MANAGER sees only jobs where they are evaluator
            query = sa.select(
                JobModel.id,
                JobModel.title,
                sa.func.count(sa.distinct(CandidateJobPipelineModel.candidate_id)).label("candidate_count"),
                sa.func.count(sa.distinct(InterviewScorecardModel.id)).label("assigned_count"),
            ).select_from(
                InterviewScorecardModel
            ).join(
                JobModel, InterviewScorecardModel.job_id == JobModel.id
            ).outerjoin(
                CandidateJobPipelineModel,
                sa.and_(
                    CandidateJobPipelineModel.job_id == JobModel.id,
                    CandidateJobPipelineModel.pipeline_status == "active",
                )
            ).where(
                InterviewScorecardModel.evaluator_id == user_id
            ).group_by(
                JobModel.id,
                JobModel.title,
            )

        result = await self.session.execute(query)
        rows = result.fetchall()

        return [
            {
                "id": str(row.id),
                "title": row.title,
                "candidate_count": row.candidate_count or 0,
                "assigned_count": row.assigned_count or 0,
            }
            for row in rows
        ]

    async def list_job_candidates(self, user_id: UUID, job_id: UUID) -> list[dict]:
        """
        List candidates in a job where user is evaluator.

        Validates: user is evaluator for this job, then returns safe candidate summary.
        Returns: [{ id, name, email, pipeline_stage, scorecard_status }]
        """
        # Verify manager has access to this job
        can_access = await self._verify_manager_job_access(user_id, job_id)
        if not can_access:
            return []

        query = sa.select(
            CandidateModel.id,
            CandidateModel.full_name,
            CandidateModel.email,
            CandidateJobPipelineModel.pipeline_stage,
            sa.func.max(InterviewScorecardModel.status).label("scorecard_status"),
        ).select_from(
            CandidateJobPipelineModel
        ).join(
            CandidateModel, CandidateJobPipelineModel.candidate_id == CandidateModel.id
        ).outerjoin(
            InterviewScorecardModel,
            sa.and_(
                InterviewScorecardModel.candidate_id == CandidateJobPipelineModel.candidate_id,
                InterviewScorecardModel.job_id == job_id,
                InterviewScorecardModel.evaluator_id == user_id,
            )
        ).where(
            sa.and_(
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.pipeline_status == "active",
            )
        ).group_by(
            CandidateModel.id,
            CandidateModel.full_name,
            CandidateModel.email,
            CandidateJobPipelineModel.pipeline_stage,
        ).order_by(
            CandidateModel.full_name
        )

        result = await self.session.execute(query)
        rows = result.fetchall()

        return [
            {
                "id": str(row.id),
                "name": row.full_name,
                "email": row.email,
                "pipeline_stage": row.pipeline_stage,
                "scorecard_status": row.scorecard_status,
            }
            for row in rows
        ]

    async def get_candidate_summary(
        self, user_id: UUID, job_id: UUID, candidate_id: UUID
    ) -> dict | None:
        """
        Get safe summary of candidate for a job.

        Safe fields:
        - Candidate: id, name, email
        - Pipeline: stage
        - Scorecard: status, recommendation (no items, no technical notes)

        Omitted fields:
        - Documents, ERP payload, resumeaianalysis breakdown
        - Raw AI logs, prompts, technical_details
        - Ranking algorithms, score component breakdown
        - Match percentage (not available in schema)
        - Other evaluators' data
        """
        # Verify access
        can_access = await self._verify_manager_candidate_access(user_id, job_id, candidate_id)
        if not can_access:
            return None

        # Get candidate
        candidate = await self.session.scalar(
            sa.select(CandidateModel).where(CandidateModel.id == candidate_id)
        )
        if not candidate:
            return None

        # Get pipeline stage
        pipeline = await self.session.scalar(
            sa.select(CandidateJobPipelineModel).where(
                sa.and_(
                    CandidateJobPipelineModel.candidate_id == candidate_id,
                    CandidateJobPipelineModel.job_id == job_id,
                    CandidateJobPipelineModel.pipeline_status == "active",
                )
            )
        )

        # Get scorecard for this evaluator
        scorecard = await self.session.scalar(
            sa.select(InterviewScorecardModel).where(
                sa.and_(
                    InterviewScorecardModel.candidate_id == candidate_id,
                    InterviewScorecardModel.job_id == job_id,
                    InterviewScorecardModel.evaluator_id == user_id,
                )
            )
        )

        # Build safe response
        result = {
            "id": str(candidate_id),
            "name": candidate.full_name,
            "email": candidate.email,
            "pipeline_stage": pipeline.pipeline_stage if pipeline else None,
            "scorecard": None,
        }

        if scorecard:
            result["scorecard"] = {
                "status": scorecard.status,
                "recommendation": scorecard.final_recommendation,
                "submitted_at": scorecard.submitted_at.isoformat() if scorecard.submitted_at else None,
            }

        return result

    async def _verify_manager_job_access(self, user_id: UUID, job_id: UUID) -> bool:
        """Check if manager is evaluator for this job. ADMIN always has access."""
        if self.is_admin:
            return True
        count = await self.session.scalar(
            sa.select(sa.func.count(InterviewScorecardModel.id)).where(
                sa.and_(
                    InterviewScorecardModel.job_id == job_id,
                    InterviewScorecardModel.evaluator_id == user_id,
                )
            )
        )
        return (count or 0) > 0

    async def _verify_manager_candidate_access(
        self, user_id: UUID, job_id: UUID, candidate_id: UUID
    ) -> bool:
        """Check if manager is evaluator for this candidate in this job. ADMIN always has access."""
        if self.is_admin:
            return True
        count = await self.session.scalar(
            sa.select(sa.func.count(InterviewScorecardModel.id)).where(
                sa.and_(
                    InterviewScorecardModel.job_id == job_id,
                    InterviewScorecardModel.candidate_id == candidate_id,
                    InterviewScorecardModel.evaluator_id == user_id,
                )
            )
        )
        return (count or 0) > 0
