from __future__ import annotations

from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAIEvaluationModel,
    BehavioralAssessmentAssignmentModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.user_model import UserModel


class SQLAlchemyHiringDecisionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_job(self, job_id: UUID) -> JobModel | None:
        return await self._session.get(JobModel, job_id)

    async def get_active_pipeline(self, *, candidate_id: UUID, job_id: UUID) -> dict | None:
        result = await self._session.execute(
            sa.select(CandidateJobPipelineModel.candidate_job_pipeline_id).where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
        )
        row = result.mappings().one_or_none()
        return dict(row) if row is not None else None

    async def get_current(self, *, candidate_id: UUID, job_id: UUID) -> CandidateJobHiringDecisionModel | None:
        pipeline = await self.get_active_pipeline(candidate_id=candidate_id, job_id=job_id)
        pipeline_id = pipeline["candidate_job_pipeline_id"] if pipeline is not None else None
        if pipeline_id is None:
            return None
        return await self._session.scalar(
            sa.select(CandidateJobHiringDecisionModel)
            .where(
                CandidateJobHiringDecisionModel.candidate_id == candidate_id,
                CandidateJobHiringDecisionModel.job_id == job_id,
                CandidateJobHiringDecisionModel.pipeline_id == pipeline_id,
                CandidateJobHiringDecisionModel.decision_status != "superseded",
            )
            .order_by(CandidateJobHiringDecisionModel.created_at.desc(), CandidateJobHiringDecisionModel.id.desc())
            .limit(1)
        )

    async def get(self, decision_id: UUID) -> CandidateJobHiringDecisionModel | None:
        return await self._session.get(CandidateJobHiringDecisionModel, decision_id)

    async def list_history(self, *, candidate_id: UUID, job_id: UUID) -> list[CandidateJobHiringDecisionModel]:
        result = await self._session.execute(
            sa.select(CandidateJobHiringDecisionModel)
            .where(
                CandidateJobHiringDecisionModel.candidate_id == candidate_id,
                CandidateJobHiringDecisionModel.job_id == job_id,
            )
            .order_by(CandidateJobHiringDecisionModel.created_at.desc(), CandidateJobHiringDecisionModel.id.desc())
        )
        return list(result.scalars().all())

    async def latest_submitted_scorecard(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        pipeline_id: UUID | None,
    ) -> InterviewScorecardModel | None:
        if pipeline_id is None:
            return None
        return await self._session.scalar(
            sa.select(InterviewScorecardModel)
            .where(
                InterviewScorecardModel.candidate_id == candidate_id,
                InterviewScorecardModel.job_id == job_id,
                InterviewScorecardModel.pipeline_id == pipeline_id,
                InterviewScorecardModel.status == "submitted",
            )
            .order_by(InterviewScorecardModel.submitted_at.desc().nullslast(), InterviewScorecardModel.created_at.desc())
            .limit(1)
        )

    async def latest_behavioral_assignment(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        template_id: UUID,
        pipeline_id: UUID | None,
    ) -> BehavioralAssessmentAssignmentModel | None:
        if pipeline_id is None:
            return None
        return await self._session.scalar(
            sa.select(BehavioralAssessmentAssignmentModel)
            .where(
                BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
                BehavioralAssessmentAssignmentModel.job_id == job_id,
                BehavioralAssessmentAssignmentModel.template_id == template_id,
                BehavioralAssessmentAssignmentModel.pipeline_id == pipeline_id,
            )
            .order_by(
                BehavioralAssessmentAssignmentModel.created_at.desc(),
                BehavioralAssessmentAssignmentModel.id.desc(),
            )
            .limit(1)
        )

    async def ai_evaluation_for_assignment(
        self,
        assignment_id: UUID,
    ) -> BehavioralAssessmentAIEvaluationModel | None:
        return await self._session.scalar(
            sa.select(BehavioralAssessmentAIEvaluationModel)
            .where(BehavioralAssessmentAIEvaluationModel.assignment_id == assignment_id)
            .order_by(
                BehavioralAssessmentAIEvaluationModel.completed_at.desc().nullslast(),
                BehavioralAssessmentAIEvaluationModel.created_at.desc(),
            )
            .limit(1)
        )

    async def latest_completed_interview(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        pipeline_id: UUID | None,
    ) -> InterviewScheduleModel | None:
        if pipeline_id is None:
            return None
        return await self._session.scalar(
            sa.select(InterviewScheduleModel)
            .where(
                InterviewScheduleModel.candidate_id == candidate_id,
                InterviewScheduleModel.job_id == job_id,
                InterviewScheduleModel.pipeline_id == pipeline_id,
                InterviewScheduleModel.status.in_(["completed", "awaiting_feedback"]),
            )
            .order_by(InterviewScheduleModel.scheduled_start.desc().nullslast(), InterviewScheduleModel.created_at.desc())
            .limit(1)
        )

    async def has_manager_feedback(self, *, candidate_id: UUID, job_id: UUID, pipeline_id: UUID | None) -> bool:
        if pipeline_id is None:
            return False
        scorecard_count = await self._session.scalar(
            sa.select(sa.func.count())
            .select_from(InterviewScorecardModel)
            .join(UserModel, UserModel.id == InterviewScorecardModel.evaluator_id)
            .where(
                InterviewScorecardModel.candidate_id == candidate_id,
                InterviewScorecardModel.job_id == job_id,
                InterviewScorecardModel.pipeline_id == pipeline_id,
                InterviewScorecardModel.status == "submitted",
                UserModel.role == "manager",
            )
        )
        return (scorecard_count or 0) > 0

    async def add(self, decision: CandidateJobHiringDecisionModel) -> CandidateJobHiringDecisionModel:
        self._session.add(decision)
        await self._session.flush()
        return decision

    async def flush(self) -> None:
        await self._session.flush()
