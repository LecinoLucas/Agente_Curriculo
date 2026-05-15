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
from src.infrastructure.database.models.collaboration_comments_model import CollaborationCommentModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.user_model import UserModel

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

    async def list_review_requests(self, user_id: UUID) -> list[dict]:
        """
        List review requests (comment_type='review_request') visible to the logged-in user.

        MANAGER sees:
          - Requests where target_manager_id == user_id, OR
          - Requests where target_manager_id IS NULL AND there is a scorecard evaluator_id == user_id for that candidate+job
        ADMIN sees all.

        Status "answered" if any manager_feedback comment exists for same candidate+job.
        """
        req = sa.alias(CollaborationCommentModel, name="req")
        fb = sa.alias(CollaborationCommentModel, name="fb")
        scorecard_sub = sa.alias(InterviewScorecardModel, name="sc")
        interview_sub = sa.alias(InterviewScheduleModel, name="iv")
        target_manager = UserModel.__table__.alias("target_manager")

        has_feedback_sub = (
            sa.select(sa.literal(1))
            .select_from(fb)
            .where(
                sa.and_(
                    fb.c.candidate_id == req.c.candidate_id,
                    fb.c.job_id == req.c.job_id,
                    fb.c.comment_type == "manager_feedback",
                )
            )
            .correlate(req)
            .exists()
        )

        latest_interview_sq = (
            sa.select(interview_sub.c.status)
            .where(
                sa.and_(
                    interview_sub.c.candidate_id == req.c.candidate_id,
                    interview_sub.c.job_id == req.c.job_id,
                )
            )
            .correlate(req)
            .order_by(interview_sub.c.scheduled_start.desc().nullslast())
            .limit(1)
            .scalar_subquery()
        )

        latest_scorecard_sq = (
            sa.select(scorecard_sub.c.status)
            .where(
                sa.and_(
                    scorecard_sub.c.candidate_id == req.c.candidate_id,
                    scorecard_sub.c.job_id == req.c.job_id,
                )
            )
            .correlate(req)
            .order_by(scorecard_sub.c.created_at.desc().nullslast())
            .limit(1)
            .scalar_subquery()
        )

        pipeline_stage_sq = (
            sa.select(CandidateJobPipelineModel.pipeline_stage)
            .where(
                sa.and_(
                    CandidateJobPipelineModel.candidate_id == req.c.candidate_id,
                    CandidateJobPipelineModel.job_id == req.c.job_id,
                    CandidateJobPipelineModel.pipeline_status == "active",
                )
            )
            .correlate(req)
            .limit(1)
            .scalar_subquery()
        )

        query = (
            sa.select(
                req.c.id.label("request_id"),
                req.c.candidate_id,
                CandidateModel.full_name.label("candidate_name"),
                req.c.job_id,
                JobModel.title.label("job_title"),
                req.c.author_id.label("requested_by"),
                req.c.created_at.label("requested_at"),
                req.c.message.label("latest_message"),
                req.c.priority,
                req.c.target_manager_id,
                target_manager.c.full_name.label("target_manager_name"),
                sa.case(
                    (req.c.target_manager_id == user_id, True),
                    else_=False,
                ).label("is_directed_to_me"),
                has_feedback_sub.label("answered"),
                pipeline_stage_sq.label("pipeline_stage"),
                latest_interview_sq.label("interview_status"),
                latest_scorecard_sq.label("scorecard_status"),
            )
            .select_from(req)
            .join(CandidateModel, CandidateModel.id == req.c.candidate_id)
            .join(JobModel, JobModel.id == req.c.job_id)
            .outerjoin(target_manager, target_manager.c.id == req.c.target_manager_id)
            .where(req.c.comment_type == "review_request")
            .order_by(req.c.created_at.desc())
        )

        if not self.is_admin:
            manager_jobs_sq = (
                sa.select(InterviewScorecardModel.job_id, InterviewScorecardModel.candidate_id)
                .where(InterviewScorecardModel.evaluator_id == user_id)
                .subquery()
            )
            query = query.where(
                sa.or_(
                    req.c.target_manager_id == user_id,
                    sa.and_(
                        req.c.target_manager_id.is_(None),
                        sa.exists(
                            sa.select(sa.literal(1))
                            .select_from(manager_jobs_sq)
                            .where(
                                sa.and_(
                                    manager_jobs_sq.c.job_id == req.c.job_id,
                                    manager_jobs_sq.c.candidate_id == req.c.candidate_id,
                                )
                            )
                        ),
                    ),
                )
            )

        result = await self.session.execute(query)
        rows = result.fetchall()

        return [
            {
                "request_id": str(row.request_id),
                "candidate_id": str(row.candidate_id),
                "candidate_name": row.candidate_name,
                "job_id": str(row.job_id),
                "job_title": row.job_title,
                "requested_by": str(row.requested_by) if row.requested_by else None,
                "requested_at": row.requested_at.isoformat() if row.requested_at else None,
                "latest_message": row.latest_message,
                "status": "answered" if row.answered else "pending",
                "priority": row.priority,
                "target_manager_id": (
                    str(row.target_manager_id) if row.target_manager_id else None
                ),
                "target_manager_name": row.target_manager_name,
                "is_directed_to_me": bool(row.is_directed_to_me),
                "pipeline_stage": row.pipeline_stage,
                "interview_status": row.interview_status,
                "scorecard_status": row.scorecard_status,
            }
            for row in rows
        ]

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
