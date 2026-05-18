from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAIEvaluationModel,
    BehavioralAssessmentAnswerModel,
    BehavioralAssessmentAssignmentModel,
)
from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
)
from src.infrastructure.database.models.job_model import JobModel


class SQLAlchemyBehavioralAssignmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_active_template(self, template_id: UUID) -> BehavioralAssessmentTemplateModel | None:
        return await self._session.scalar(
            sa.select(BehavioralAssessmentTemplateModel).where(
                BehavioralAssessmentTemplateModel.id == template_id,
                BehavioralAssessmentTemplateModel.status == "active",
            )
        )

    async def find_assignment(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        template_id: UUID,
    ) -> BehavioralAssessmentAssignmentModel | None:
        return await self._session.scalar(
            sa.select(BehavioralAssessmentAssignmentModel).where(
                BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
                BehavioralAssessmentAssignmentModel.job_id == job_id,
                BehavioralAssessmentAssignmentModel.template_id == template_id,
            )
        )

    async def create_assignment(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        template_id: UUID,
        expires_at: datetime | None = None,
    ) -> BehavioralAssessmentAssignmentModel:
        assignment = BehavioralAssessmentAssignmentModel(
            candidate_id=candidate_id,
            job_id=job_id,
            template_id=template_id,
            expires_at=expires_at,
        )
        self._session.add(assignment)
        await self._session.flush()
        return assignment

    async def get_assignment_for_candidate(
        self,
        *,
        assignment_id: UUID,
        candidate_id: UUID,
    ) -> BehavioralAssessmentAssignmentModel | None:
        return await self._session.scalar(
            sa.select(BehavioralAssessmentAssignmentModel).where(
                BehavioralAssessmentAssignmentModel.id == assignment_id,
                BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
            )
        )

    async def get_assignment(self, assignment_id: UUID) -> BehavioralAssessmentAssignmentModel | None:
        return await self._session.get(BehavioralAssessmentAssignmentModel, assignment_id)

    async def list_assignments_for_candidate(self, candidate_id: UUID) -> list[dict[str, Any]]:
        result = await self._session.execute(
            self._summary_stmt().where(BehavioralAssessmentAssignmentModel.candidate_id == candidate_id)
        )
        return [dict(row) for row in result.mappings().all()]

    async def list_assignments_for_candidate_job(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
    ) -> list[dict[str, Any]]:
        result = await self._session.execute(
            self._summary_stmt().where(
                BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
                BehavioralAssessmentAssignmentModel.job_id == job_id,
            )
        )
        return [dict(row) for row in result.mappings().all()]

    async def get_summary_for_job_candidate(
        self,
        *,
        job_id: UUID,
        candidate_id: UUID,
    ) -> dict[str, Any] | None:
        result = await self._session.execute(
            self._summary_stmt()
            .where(
                BehavioralAssessmentAssignmentModel.job_id == job_id,
                BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
            )
            .limit(1)
        )
        row = result.mappings().first()
        return dict(row) if row is not None else None

    async def get_template_structure(self, template_id: UUID) -> list[BehavioralTemplateCompetencyModel]:
        result = await self._session.execute(
            sa.select(BehavioralTemplateCompetencyModel)
            .where(BehavioralTemplateCompetencyModel.template_id == template_id)
            .order_by(BehavioralTemplateCompetencyModel.display_order, BehavioralTemplateCompetencyModel.created_at)
        )
        return list(result.scalars().all())

    async def get_questions_for_template(self, template_id: UUID) -> list[BehavioralTemplateQuestionModel]:
        result = await self._session.execute(
            sa.select(BehavioralTemplateQuestionModel)
            .join(BehavioralTemplateCompetencyModel, BehavioralTemplateCompetencyModel.id == BehavioralTemplateQuestionModel.competency_id)
            .where(BehavioralTemplateCompetencyModel.template_id == template_id)
            .order_by(
                BehavioralTemplateCompetencyModel.display_order,
                BehavioralTemplateQuestionModel.display_order,
                BehavioralTemplateQuestionModel.created_at,
            )
        )
        return list(result.scalars().all())

    async def list_answers(self, assignment_id: UUID) -> list[BehavioralAssessmentAnswerModel]:
        result = await self._session.execute(
            sa.select(BehavioralAssessmentAnswerModel).where(
                BehavioralAssessmentAnswerModel.assignment_id == assignment_id
            )
        )
        return list(result.scalars().all())

    async def upsert_answer(
        self,
        *,
        assignment_id: UUID,
        question_id: UUID,
        answer_text: str | None,
        answer_value: Any,
        selected_options_json: list[str] | None,
        updated_at: datetime,
    ) -> BehavioralAssessmentAnswerModel:
        answer = await self._session.scalar(
            sa.select(BehavioralAssessmentAnswerModel).where(
                BehavioralAssessmentAnswerModel.assignment_id == assignment_id,
                BehavioralAssessmentAnswerModel.question_id == question_id,
            )
        )
        if answer is None:
            answer = BehavioralAssessmentAnswerModel(
                assignment_id=assignment_id,
                question_id=question_id,
                answer_text=answer_text,
                answer_value=answer_value,
                selected_options_json=selected_options_json,
                updated_at=updated_at,
            )
            self._session.add(answer)
        else:
            answer.answer_text = answer_text
            answer.answer_value = answer_value
            answer.selected_options_json = selected_options_json
            answer.updated_at = updated_at
        await self._session.flush()
        return answer

    async def update_assignment(self, assignment: BehavioralAssessmentAssignmentModel) -> None:
        await self._session.flush()

    async def get_assignment_by_job_candidate(
        self,
        *,
        job_id: UUID,
        candidate_id: UUID,
        template_id: UUID | None = None,
    ) -> BehavioralAssessmentAssignmentModel | None:
        """Get latest assignment for candidate in job, optionally constrained by template."""
        stmt = (
            sa.select(BehavioralAssessmentAssignmentModel)
            .where(
                BehavioralAssessmentAssignmentModel.job_id == job_id,
                BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
            )
            .order_by(
                BehavioralAssessmentAssignmentModel.assigned_at.desc(),
                BehavioralAssessmentAssignmentModel.created_at.desc(),
            )
            .limit(1)
        )
        if template_id is not None:
            stmt = stmt.where(BehavioralAssessmentAssignmentModel.template_id == template_id)
        return await self._session.scalar(stmt)

    @staticmethod
    def _summary_stmt() -> sa.Select:
        question_count_subq = (
            sa.select(
                BehavioralAssessmentAssignmentModel.id.label("assignment_id"),
                sa.func.count(BehavioralTemplateQuestionModel.id).label("question_count"),
            )
            .join(
                BehavioralAssessmentTemplateModel,
                BehavioralAssessmentTemplateModel.id == BehavioralAssessmentAssignmentModel.template_id,
            )
            .join(
                BehavioralTemplateCompetencyModel,
                BehavioralTemplateCompetencyModel.template_id == BehavioralAssessmentTemplateModel.id,
            )
            .join(
                BehavioralTemplateQuestionModel,
                BehavioralTemplateQuestionModel.competency_id == BehavioralTemplateCompetencyModel.id,
            )
            .group_by(BehavioralAssessmentAssignmentModel.id)
            .subquery()
        )
        answer_count_subq = (
            sa.select(
                BehavioralAssessmentAnswerModel.assignment_id,
                sa.func.count(BehavioralAssessmentAnswerModel.id).label("answered_count"),
            )
            .group_by(BehavioralAssessmentAnswerModel.assignment_id)
            .subquery()
        )
        return (
            sa.select(
                BehavioralAssessmentAssignmentModel.id,
                BehavioralAssessmentAssignmentModel.candidate_id,
                BehavioralAssessmentAssignmentModel.job_id,
                JobModel.title.label("job_title"),
                BehavioralAssessmentAssignmentModel.template_id,
                BehavioralAssessmentTemplateModel.name.label("template_name"),
                BehavioralAssessmentAssignmentModel.status,
                BehavioralAssessmentAssignmentModel.assigned_at,
                BehavioralAssessmentAssignmentModel.started_at,
                BehavioralAssessmentAssignmentModel.submitted_at,
                BehavioralAssessmentAssignmentModel.expires_at,
                BehavioralAssessmentAIEvaluationModel.status.label("ai_evaluation_status"),
                sa.func.coalesce(answer_count_subq.c.answered_count, 0).label("answered_count"),
                sa.func.coalesce(question_count_subq.c.question_count, 0).label("question_count"),
            )
            .join(JobModel, JobModel.id == BehavioralAssessmentAssignmentModel.job_id)
            .join(
                BehavioralAssessmentTemplateModel,
                BehavioralAssessmentTemplateModel.id == BehavioralAssessmentAssignmentModel.template_id,
            )
            .outerjoin(question_count_subq, question_count_subq.c.assignment_id == BehavioralAssessmentAssignmentModel.id)
            .outerjoin(answer_count_subq, answer_count_subq.c.assignment_id == BehavioralAssessmentAssignmentModel.id)
            .outerjoin(
                BehavioralAssessmentAIEvaluationModel,
                BehavioralAssessmentAIEvaluationModel.assignment_id == BehavioralAssessmentAssignmentModel.id,
            )
            .order_by(BehavioralAssessmentAssignmentModel.assigned_at.desc())
        )
