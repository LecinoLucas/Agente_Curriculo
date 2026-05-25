from __future__ import annotations

from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAIEvaluationModel,
    BehavioralAssessmentAssignmentModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.interview_scorecard_model import (
    InterviewScorecardItemModel,
    InterviewScorecardModel,
)


class SQLAlchemyInterviewScorecardRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_active_pipeline_id(self, *, candidate_id: UUID, job_id: UUID) -> UUID | None:
        return await self._session.scalar(
            sa.select(CandidateJobPipelineModel.candidate_job_pipeline_id).where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
        )

    async def get_interview(self, interview_id: UUID) -> InterviewScheduleModel | None:
        return await self._session.get(InterviewScheduleModel, interview_id)

    async def mark_interview_completed_if_waiting_feedback(self, interview_id: UUID) -> None:
        interview = await self._session.get(InterviewScheduleModel, interview_id)
        if interview is None:
            return
        if interview.status == "awaiting_feedback":
            interview.status = "completed"
            self._session.add(interview)

    async def find_for_candidate_job(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        pipeline_id: UUID | None,
        interview_id: UUID | None = None,
        evaluator_id: UUID | None = None,
    ) -> InterviewScorecardModel | None:
        if pipeline_id is None:
            return None
        conditions = [
            InterviewScorecardModel.candidate_id == candidate_id,
            InterviewScorecardModel.job_id == job_id,
            InterviewScorecardModel.pipeline_id == pipeline_id,
        ]
        if interview_id is None:
            conditions.append(InterviewScorecardModel.interview_id.is_(None))
        else:
            conditions.append(InterviewScorecardModel.interview_id == interview_id)
        if evaluator_id is not None:
            conditions.append(InterviewScorecardModel.evaluator_id == evaluator_id)

        return await self._session.scalar(
            sa.select(InterviewScorecardModel)
            .options(selectinload(InterviewScorecardModel.items))
            .where(*conditions)
            .order_by(InterviewScorecardModel.created_at.desc())
            .limit(1)
        )

    async def get(self, scorecard_id: UUID) -> InterviewScorecardModel | None:
        return await self._session.scalar(
            sa.select(InterviewScorecardModel)
            .options(selectinload(InterviewScorecardModel.items))
            .where(InterviewScorecardModel.id == scorecard_id)
        )

    async def create(self, scorecard: InterviewScorecardModel) -> InterviewScorecardModel:
        self._session.add(scorecard)
        await self._session.flush()
        await self._session.refresh(scorecard, ["items"])
        return scorecard

    async def replace_items(
        self,
        scorecard: InterviewScorecardModel,
        items: list[InterviewScorecardItemModel],
    ) -> None:
        scorecard.items.clear()
        await self._session.flush()
        for item in items:
            item.scorecard_id = scorecard.id
            scorecard.items.append(item)
        await self._session.flush()
        await self._session.refresh(scorecard, ["items"])

    async def flush(self) -> None:
        await self._session.flush()

    async def list_suggested_behavioral_questions(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        pipeline_id: UUID | None,
    ) -> list[str]:
        if pipeline_id is None:
            return []
        result = await self._session.execute(
            sa.select(BehavioralAssessmentAIEvaluationModel.suggested_interview_questions_json)
            .join(
                BehavioralAssessmentAssignmentModel,
                BehavioralAssessmentAssignmentModel.id == BehavioralAssessmentAIEvaluationModel.assignment_id,
            )
            .where(
                BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
                BehavioralAssessmentAssignmentModel.job_id == job_id,
                BehavioralAssessmentAssignmentModel.pipeline_id == pipeline_id,
                BehavioralAssessmentAIEvaluationModel.status == "completed",
            )
            .order_by(BehavioralAssessmentAIEvaluationModel.completed_at.desc().nullslast())
            .limit(1)
        )
        questions = result.scalar_one_or_none()
        if not isinstance(questions, list):
            return []
        return [str(question).strip() for question in questions if str(question).strip()]
