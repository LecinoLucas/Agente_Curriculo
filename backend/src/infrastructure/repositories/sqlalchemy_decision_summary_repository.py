from __future__ import annotations

from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAIEvaluationModel,
    BehavioralAssessmentAnswerModel,
    BehavioralAssessmentAssignmentModel,
)
from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel, ScoreModelVersionModel
from src.infrastructure.database.models.user_model import UserModel


class SQLAlchemyDecisionSummaryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_job(self, job_id: UUID) -> JobModel | None:
        return await self._session.scalar(
            sa.select(JobModel).where(JobModel.id == job_id, JobModel.deleted_at.is_(None))
        )

    async def get_active_pipeline(self, *, candidate_id: UUID, job_id: UUID) -> dict | None:
        result = await self._session.execute(
            sa.select(
                CandidateJobPipelineModel.candidate_job_pipeline_id,
                CandidateJobPipelineModel.current_analysis_id,
            ).where(
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

    async def get_latest_analysis(self, *, candidate_id: UUID, job_id: UUID) -> AnalysisModel | None:
        return await self._session.scalar(
            sa.select(AnalysisModel)
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                ResumeModel.candidate_id == candidate_id,
                ResumeModel.deleted_at.is_(None),
                AnalysisModel.job_id == job_id,
                AnalysisModel.status != "discarded",
            )
            .order_by(AnalysisModel.created_at.desc(), AnalysisModel.id.desc())
            .limit(1)
        )

    async def get_active_score_for_analysis(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        analysis_id: UUID,
    ) -> CandidateJobScoreModel | None:
        active_version = (
            sa.select(ScoreModelVersionModel.id)
            .where(ScoreModelVersionModel.is_active.is_(True))
            .limit(1)
            .scalar_subquery()
        )
        return await self._session.scalar(
            sa.select(CandidateJobScoreModel)
            .where(
                CandidateJobScoreModel.candidate_id == candidate_id,
                CandidateJobScoreModel.job_id == job_id,
                CandidateJobScoreModel.source_analysis_id == analysis_id,
                CandidateJobScoreModel.version_id == active_version,
                CandidateJobScoreModel.freshness_status == "fresh",
                CandidateJobScoreModel.final_score.is_not(None),
            )
            .order_by(CandidateJobScoreModel.computed_at.desc(), CandidateJobScoreModel.id.desc())
            .limit(1)
        )

    async def has_stale_score(self, *, candidate_id: UUID, job_id: UUID) -> bool:
        active_version = (
            sa.select(ScoreModelVersionModel.id)
            .where(ScoreModelVersionModel.is_active.is_(True))
            .limit(1)
            .scalar_subquery()
        )
        return bool(
            await self._session.scalar(
                sa.select(sa.literal(True))
                .where(
                    CandidateJobScoreModel.candidate_id == candidate_id,
                    CandidateJobScoreModel.job_id == job_id,
                    CandidateJobScoreModel.version_id == active_version,
                    CandidateJobScoreModel.freshness_status == "stale",
                )
                .limit(1)
            )
        )

    async def get_latest_assignment(
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

    async def count_template_questions(self, template_id: UUID) -> int:
        return int(
            await self._session.scalar(
                sa.select(sa.func.count(BehavioralTemplateQuestionModel.id))
                .join(
                    BehavioralTemplateCompetencyModel,
                    BehavioralTemplateCompetencyModel.id == BehavioralTemplateQuestionModel.competency_id,
                )
                .where(BehavioralTemplateCompetencyModel.template_id == template_id)
            )
            or 0
        )

    async def count_assignment_answers(self, assignment_id: UUID) -> int:
        return int(
            await self._session.scalar(
                sa.select(sa.func.count(BehavioralAssessmentAnswerModel.id)).where(
                    BehavioralAssessmentAnswerModel.assignment_id == assignment_id
                )
            )
            or 0
        )

    async def get_ai_evaluation(self, assignment_id: UUID) -> BehavioralAssessmentAIEvaluationModel | None:
        return await self._session.scalar(
            sa.select(BehavioralAssessmentAIEvaluationModel)
            .where(BehavioralAssessmentAIEvaluationModel.assignment_id == assignment_id)
            .order_by(
                BehavioralAssessmentAIEvaluationModel.completed_at.desc().nullslast(),
                BehavioralAssessmentAIEvaluationModel.created_at.desc(),
            )
            .limit(1)
        )

    async def get_latest_scorecard(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        pipeline_id: UUID | None,
    ) -> InterviewScorecardModel | None:
        if pipeline_id is None:
            return None
        status_rank = sa.case((InterviewScorecardModel.status == "submitted", 0), else_=1)
        return await self._session.scalar(
            sa.select(InterviewScorecardModel)
            .options(selectinload(InterviewScorecardModel.items))
            .where(
                InterviewScorecardModel.candidate_id == candidate_id,
                InterviewScorecardModel.job_id == job_id,
                InterviewScorecardModel.pipeline_id == pipeline_id,
            )
            .order_by(
                status_rank,
                InterviewScorecardModel.submitted_at.desc().nullslast(),
                InterviewScorecardModel.created_at.desc(),
            )
            .limit(1)
        )

    async def get_latest_interview(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        pipeline_id: UUID | None,
    ) -> InterviewScheduleModel | None:
        if pipeline_id is None:
            return None
        status_rank = sa.case(
            (InterviewScheduleModel.status == "awaiting_feedback", 0),
            (InterviewScheduleModel.status.in_(("scheduled", "rescheduled")), 1),
            (InterviewScheduleModel.status == "completed", 2),
            else_=3,
        )
        return await self._session.scalar(
            sa.select(InterviewScheduleModel)
            .where(
                InterviewScheduleModel.candidate_id == candidate_id,
                InterviewScheduleModel.job_id == job_id,
                InterviewScheduleModel.pipeline_id == pipeline_id,
            )
            .order_by(
                status_rank,
                InterviewScheduleModel.scheduled_start.desc(),
                InterviewScheduleModel.created_at.desc(),
            )
            .limit(1)
        )

    async def has_manager_feedback(self, *, candidate_id: UUID, job_id: UUID, pipeline_id: UUID | None) -> bool:
        if pipeline_id is None:
            return False
        has_scorecard = sa.exists(
            sa.select(InterviewScorecardModel.id)
            .join(UserModel, UserModel.id == InterviewScorecardModel.evaluator_id)
            .where(
                InterviewScorecardModel.candidate_id == candidate_id,
                InterviewScorecardModel.job_id == job_id,
                InterviewScorecardModel.pipeline_id == pipeline_id,
                InterviewScorecardModel.status == "submitted",
                UserModel.role == "manager",
            )
        )
        return bool(
            await self._session.scalar(sa.select(has_scorecard))
        )
