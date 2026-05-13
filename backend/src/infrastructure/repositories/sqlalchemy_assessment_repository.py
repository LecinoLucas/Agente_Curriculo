from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.assessment_model import (
    AssessmentOptionModel,
    AssessmentQuestionModel,
    AssessmentTemplateModel,
    CandidateAssessmentAnswerModel,
    CandidateAssessmentAssignmentModel,
    JobAssessmentModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)


class SQLAlchemyAssessmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_template(
        self,
        template: AssessmentTemplateModel,
        questions: list[tuple[AssessmentQuestionModel, list[AssessmentOptionModel]]],
    ) -> AssessmentTemplateModel:
        self._session.add(template)
        await self._session.flush()
        for question, options in questions:
            question.template_id = template.id
            self._session.add(question)
            await self._session.flush()
            for option in options:
                option.question_id = question.id
                self._session.add(option)
        await self._session.flush()
        return template

    async def duplicate_template(
        self,
        *,
        source_template_id: UUID,
        title: str,
        status: str,
    ) -> AssessmentTemplateModel | None:
        source = await self.get_template(source_template_id)
        if source is None:
            return None

        template = AssessmentTemplateModel(
            title=title,
            description=source["description"],
            type=source["type"],
            status=status,
            version=int(source["version"] or 1) + 1,
        )
        questions: list[tuple[AssessmentQuestionModel, list[AssessmentOptionModel]]] = []
        for question in source.get("questions", []):
            question_model = AssessmentQuestionModel(
                question_text=question["question_text"],
                question_type=question["question_type"],
                required=question["required"],
                order_index=question["order_index"],
                metadata_payload=question["metadata"],
            )
            options = [
                AssessmentOptionModel(
                    option_text=option["option_text"],
                    score_value=option["score_value"],
                    metadata_payload=option["metadata"],
                    order_index=option["order_index"],
                )
                for option in question.get("options", [])
            ]
            questions.append((question_model, options))
        return await self.create_template(template, questions)

    async def list_templates(
        self,
        *,
        type_filter: str | None = None,
        status_filter: str | None = None,
    ) -> list[dict]:
        question_count = sa.func.count(AssessmentQuestionModel.id)
        stmt = (
            sa.select(AssessmentTemplateModel, question_count.label("question_count"))
            .outerjoin(
                AssessmentQuestionModel,
                AssessmentQuestionModel.template_id == AssessmentTemplateModel.id,
            )
            .group_by(AssessmentTemplateModel.id)
            .order_by(AssessmentTemplateModel.updated_at.desc())
        )
        if type_filter is not None:
            stmt = stmt.where(AssessmentTemplateModel.type == type_filter)
        if status_filter is not None:
            stmt = stmt.where(AssessmentTemplateModel.status == status_filter)
        result = await self._session.execute(stmt)
        items: list[dict] = []
        for template, count in result.all():
            row = self._template_to_dict(template)
            row["question_count"] = int(count or 0)
            items.append(row)
        return items

    async def get_template(self, template_id: UUID) -> dict | None:
        row = await self._session.execute(
            sa.select(AssessmentTemplateModel).where(AssessmentTemplateModel.id == template_id)
        )
        template = row.scalar_one_or_none()
        if template is None:
            return None
        detail = self._template_to_dict(template)
        questions = await self.list_questions_with_options(template.id)
        detail["question_count"] = len(questions)
        detail["questions"] = questions
        return detail

    async def list_template_questions(self, template_id: UUID) -> list[dict]:
        return await self.list_questions_with_options(template_id)

    async def create_question(
        self,
        *,
        template_id: UUID,
        question: AssessmentQuestionModel,
        options: list[AssessmentOptionModel],
    ) -> dict:
        question.template_id = template_id
        self._session.add(question)
        await self._session.flush()
        for option in options:
            option.question_id = question.id
            self._session.add(option)
        await self._session.flush()
        return await self.get_question(question.id) or {}

    async def get_question(self, question_id: UUID) -> dict | None:
        row = await self._session.execute(
            sa.select(AssessmentQuestionModel).where(AssessmentQuestionModel.id == question_id)
        )
        question = row.scalar_one_or_none()
        if question is None:
            return None
        options = await self._session.execute(
            sa.select(AssessmentOptionModel)
            .where(AssessmentOptionModel.question_id == question_id)
            .order_by(AssessmentOptionModel.order_index.asc(), AssessmentOptionModel.id.asc())
        )
        return {
            "id": question.id,
            "template_id": question.template_id,
            "question_text": question.question_text,
            "question_type": question.question_type,
            "required": question.required,
            "order_index": question.order_index,
            "metadata": question.metadata_payload,
            "options": [
                {
                    "id": option.id,
                    "option_text": option.option_text,
                    "score_value": option.score_value,
                    "metadata": option.metadata_payload,
                    "order_index": option.order_index,
                }
                for option in options.scalars().all()
            ],
        }

    async def update_question(self, question_id: UUID, values: dict) -> dict | None:
        values["updated_at"] = datetime.now(UTC)
        await self._session.execute(
            sa.update(AssessmentQuestionModel)
            .where(AssessmentQuestionModel.id == question_id)
            .values(**values)
        )
        await self._session.flush()
        return await self.get_question(question_id)

    async def delete_question(self, question_id: UUID) -> bool:
        deleted = await self._session.execute(
            sa.delete(AssessmentQuestionModel)
            .where(AssessmentQuestionModel.id == question_id)
            .returning(AssessmentQuestionModel.id)
        )
        await self._session.flush()
        return deleted.scalar_one_or_none() is not None

    async def create_option(
        self,
        *,
        question_id: UUID,
        option: AssessmentOptionModel,
    ) -> dict:
        option.question_id = question_id
        self._session.add(option)
        await self._session.flush()
        row = await self._session.execute(
            sa.select(AssessmentOptionModel).where(AssessmentOptionModel.id == option.id)
        )
        db_option = row.scalar_one()
        return {
            "id": db_option.id,
            "question_id": db_option.question_id,
            "option_text": db_option.option_text,
            "score_value": db_option.score_value,
            "metadata": db_option.metadata_payload,
            "order_index": db_option.order_index,
        }

    async def update_option(self, option_id: UUID, values: dict) -> dict | None:
        await self._session.execute(
            sa.update(AssessmentOptionModel)
            .where(AssessmentOptionModel.id == option_id)
            .values(**values)
        )
        await self._session.flush()
        row = await self._session.execute(
            sa.select(AssessmentOptionModel).where(AssessmentOptionModel.id == option_id)
        )
        option = row.scalar_one_or_none()
        if option is None:
            return None
        return {
            "id": option.id,
            "question_id": option.question_id,
            "option_text": option.option_text,
            "score_value": option.score_value,
            "metadata": option.metadata_payload,
            "order_index": option.order_index,
        }

    async def delete_option(self, option_id: UUID) -> bool:
        deleted = await self._session.execute(
            sa.delete(AssessmentOptionModel)
            .where(AssessmentOptionModel.id == option_id)
            .returning(AssessmentOptionModel.id)
        )
        await self._session.flush()
        return deleted.scalar_one_or_none() is not None

    async def get_question_template_id(self, question_id: UUID) -> UUID | None:
        row = await self._session.execute(
            sa.select(AssessmentQuestionModel.template_id).where(AssessmentQuestionModel.id == question_id)
        )
        return row.scalar_one_or_none()

    async def get_option_template_id(self, option_id: UUID) -> UUID | None:
        row = await self._session.execute(
            sa.select(AssessmentQuestionModel.template_id)
            .join(AssessmentOptionModel, AssessmentOptionModel.question_id == AssessmentQuestionModel.id)
            .where(AssessmentOptionModel.id == option_id)
        )
        return row.scalar_one_or_none()

    async def count_template_usage(self, template_id: UUID) -> dict:
        job_links = await self._session.execute(
            sa.select(sa.func.count(JobAssessmentModel.id))
            .where(JobAssessmentModel.template_id == template_id)
        )
        assignments = await self._session.execute(
            sa.select(sa.func.count(CandidateAssessmentAssignmentModel.id))
            .where(CandidateAssessmentAssignmentModel.template_id == template_id)
        )
        return {
            "job_links": int(job_links.scalar_one() or 0),
            "assignments": int(assignments.scalar_one() or 0),
        }

    async def list_template_question_ids(self, template_id: UUID) -> list[UUID]:
        rows = await self._session.execute(
            sa.select(AssessmentQuestionModel.id).where(AssessmentQuestionModel.template_id == template_id)
        )
        return list(rows.scalars().all())

    async def template_exists(self, template_id: UUID) -> bool:
        result = await self._session.execute(
            sa.select(AssessmentTemplateModel.id).where(AssessmentTemplateModel.id == template_id)
        )
        return result.scalar_one_or_none() is not None

    async def update_template(self, template_id: UUID, values: dict) -> dict | None:
        values["updated_at"] = datetime.now(UTC)
        await self._session.execute(
            sa.update(AssessmentTemplateModel)
            .where(AssessmentTemplateModel.id == template_id)
            .values(**values)
        )
        await self._session.flush()
        row = await self._session.execute(
            sa.select(AssessmentTemplateModel).where(AssessmentTemplateModel.id == template_id)
        )
        template = row.scalar_one_or_none()
        return self._template_to_dict(template) if template is not None else None

    async def create_job_assessment(
        self,
        *,
        job_id: UUID,
        template_id: UUID,
        required: bool,
        trigger_stage: str,
        order_index: int,
    ) -> dict:
        item = JobAssessmentModel(
            job_id=job_id,
            template_id=template_id,
            required=required,
            trigger_stage=trigger_stage,
            order_index=order_index,
        )
        self._session.add(item)
        await self._session.flush()
        row = await self._session.execute(self._job_assessment_select().where(JobAssessmentModel.id == item.id))
        return dict(row.mappings().one())

    async def list_job_assessments(self, job_id: UUID) -> list[dict]:
        result = await self._session.execute(
            self._job_assessment_select()
            .where(JobAssessmentModel.job_id == job_id)
            .order_by(JobAssessmentModel.order_index.asc(), JobAssessmentModel.created_at.asc())
        )
        return [dict(row) for row in result.mappings().all()]

    async def list_active_candidates_for_job(self, job_id: UUID) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                CandidateJobPipelineModel.candidate_id.label("candidate_id"),
                CandidateJobPipelineModel.candidate_job_pipeline_id.label("pipeline_id"),
            ).where(
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
        )
        return [dict(row) for row in result.mappings().all()]

    async def update_job_assessment(
        self,
        *,
        job_id: UUID,
        job_assessment_id: UUID,
        values: dict,
    ) -> dict | None:
        await self._session.execute(
            sa.update(JobAssessmentModel)
            .where(
                JobAssessmentModel.id == job_assessment_id,
                JobAssessmentModel.job_id == job_id,
            )
            .values(**values)
        )
        await self._session.flush()
        row = await self._session.execute(
            self._job_assessment_select().where(
                JobAssessmentModel.id == job_assessment_id,
                JobAssessmentModel.job_id == job_id,
            )
        )
        item = row.mappings().first()
        return dict(item) if item is not None else None

    async def delete_job_assessment(self, *, job_id: UUID, job_assessment_id: UUID) -> bool:
        deleted = await self._session.execute(
            sa.delete(JobAssessmentModel)
            .where(
                JobAssessmentModel.id == job_assessment_id,
                JobAssessmentModel.job_id == job_id,
            )
            .returning(JobAssessmentModel.id)
        )
        await self._session.flush()
        return deleted.scalar_one_or_none() is not None

    async def create_assignments_for_job(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        pipeline_id: UUID | None,
    ) -> list[dict]:
        result = await self._session.execute(
            self._job_assessment_select()
            .where(
                JobAssessmentModel.job_id == job_id,
                AssessmentTemplateModel.status == "active",
            )
            .order_by(JobAssessmentModel.order_index.asc(), JobAssessmentModel.created_at.asc())
        )
        job_assessments = [dict(row) for row in result.mappings().all()]
        created: list[dict] = []
        for item in job_assessments:
            exists = await self._session.execute(
                sa.select(CandidateAssessmentAssignmentModel.id).where(
                    CandidateAssessmentAssignmentModel.candidate_id == candidate_id,
                    CandidateAssessmentAssignmentModel.job_id == job_id,
                    CandidateAssessmentAssignmentModel.pipeline_id == pipeline_id,
                    CandidateAssessmentAssignmentModel.template_id == item["template_id"],
                )
            )
            if exists.scalar_one_or_none() is not None:
                continue
            assignment = CandidateAssessmentAssignmentModel(
                candidate_id=candidate_id,
                job_id=job_id,
                pipeline_id=pipeline_id,
                template_id=item["template_id"],
                status="pending",
                metadata_payload={"required": item["required"]},
            )
            self._session.add(assignment)
            await self._session.flush()
            created.append(await self.get_assignment_summary(assignment.id) or {})
        return [item for item in created if item]

    async def list_candidate_assignments(
        self,
        candidate_id: UUID,
        *,
        pipeline_id: UUID | None = None,
        job_id: UUID | None = None,
    ) -> list[dict]:
        stmt = self._assignment_summary_select().where(
            CandidateAssessmentAssignmentModel.candidate_id == candidate_id,
        )
        if pipeline_id is not None:
            stmt = stmt.where(CandidateAssessmentAssignmentModel.pipeline_id == pipeline_id)
        elif job_id is not None:
            stmt = stmt.where(CandidateAssessmentAssignmentModel.job_id == job_id)
        result = await self._session.execute(
            stmt.order_by(
                AssessmentTemplateModel.type.asc(),
                CandidateAssessmentAssignmentModel.assigned_at.asc(),
            )
        )
        return [dict(row) for row in result.mappings().all()]

    async def get_assignment_summary(self, assignment_id: UUID) -> dict | None:
        result = await self._session.execute(
            self._assignment_summary_select().where(CandidateAssessmentAssignmentModel.id == assignment_id)
        )
        row = result.mappings().first()
        return dict(row) if row is not None else None

    async def get_assignment_for_candidate(self, assignment_id: UUID, candidate_id: UUID) -> dict | None:
        result = await self._session.execute(
            self._assignment_summary_select().where(
                CandidateAssessmentAssignmentModel.id == assignment_id,
                CandidateAssessmentAssignmentModel.candidate_id == candidate_id,
            )
        )
        row = result.mappings().first()
        return dict(row) if row is not None else None

    async def list_questions_with_options(self, template_id: UUID) -> list[dict]:
        questions = await self._session.execute(
            sa.select(AssessmentQuestionModel)
            .where(AssessmentQuestionModel.template_id == template_id)
            .order_by(AssessmentQuestionModel.order_index.asc(), AssessmentQuestionModel.created_at.asc())
        )
        items = []
        for question in questions.scalars().all():
            options_result = await self._session.execute(
                sa.select(AssessmentOptionModel)
                .where(AssessmentOptionModel.question_id == question.id)
                .order_by(AssessmentOptionModel.order_index.asc())
            )
            options = [
                {
                    "id": option.id,
                    "option_text": option.option_text,
                    "order_index": option.order_index,
                    "score_value": option.score_value,
                    "metadata": option.metadata_payload,
                }
                for option in options_result.scalars().all()
            ]
            items.append(
                {
                    "id": question.id,
                    "template_id": question.template_id,
                    "question_text": question.question_text,
                    "question_type": question.question_type,
                    "required": question.required,
                    "order_index": question.order_index,
                    "metadata": question.metadata_payload,
                    "options": options,
                }
            )
        return items

    async def mark_started(self, assignment_id: UUID) -> None:
        await self._session.execute(
            sa.update(CandidateAssessmentAssignmentModel)
            .where(
                CandidateAssessmentAssignmentModel.id == assignment_id,
                CandidateAssessmentAssignmentModel.status == "pending",
            )
            .values(status="in_progress", started_at=datetime.now(UTC))
        )
        await self._session.flush()

    async def has_answers(self, assignment_id: UUID) -> bool:
        result = await self._session.execute(
            sa.select(CandidateAssessmentAnswerModel.id)
            .where(CandidateAssessmentAnswerModel.assignment_id == assignment_id)
            .limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def save_answers_and_complete(
        self,
        *,
        assignment_id: UUID,
        answers: list[CandidateAssessmentAnswerModel],
        score: float | None,
        result_summary: str,
    ) -> dict:
        self._session.add_all(answers)
        await self._session.execute(
            sa.update(CandidateAssessmentAssignmentModel)
            .where(CandidateAssessmentAssignmentModel.id == assignment_id)
            .values(
                status="completed",
                completed_at=datetime.now(UTC),
                score=score,
                result_summary=result_summary,
            )
        )
        await self._session.flush()
        return await self.get_assignment_summary(assignment_id) or {}

    async def list_assignment_answers(self, assignment_id: UUID) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                CandidateAssessmentAnswerModel.id,
                CandidateAssessmentAnswerModel.assignment_id,
                CandidateAssessmentAnswerModel.question_id,
                AssessmentQuestionModel.question_text,
                AssessmentQuestionModel.question_type,
                CandidateAssessmentAnswerModel.option_id,
                AssessmentOptionModel.option_text,
                CandidateAssessmentAnswerModel.answer_text,
                CandidateAssessmentAnswerModel.answer_value,
                CandidateAssessmentAnswerModel.created_at,
            )
            .join(
                AssessmentQuestionModel,
                AssessmentQuestionModel.id == CandidateAssessmentAnswerModel.question_id,
            )
            .outerjoin(
                AssessmentOptionModel,
                AssessmentOptionModel.id == CandidateAssessmentAnswerModel.option_id,
            )
            .where(CandidateAssessmentAnswerModel.assignment_id == assignment_id)
            .order_by(CandidateAssessmentAnswerModel.created_at.asc(), CandidateAssessmentAnswerModel.id.asc())
        )
        return [dict(row) for row in result.mappings().all()]

    @staticmethod
    def _template_to_dict(template: AssessmentTemplateModel) -> dict:
        return {
            "id": template.id,
            "title": template.title,
            "description": template.description,
            "type": template.type,
            "status": template.status,
            "version": template.version,
            "created_at": template.created_at,
            "updated_at": template.updated_at,
        }

    @staticmethod
    def _job_assessment_select() -> sa.Select:
        return (
            sa.select(
                JobAssessmentModel.id,
                JobAssessmentModel.job_id,
                JobAssessmentModel.template_id,
                AssessmentTemplateModel.title,
                AssessmentTemplateModel.type,
                AssessmentTemplateModel.status.label("template_status"),
                AssessmentTemplateModel.version.label("template_version"),
                JobAssessmentModel.required,
                JobAssessmentModel.trigger_stage,
                JobAssessmentModel.order_index,
                JobAssessmentModel.created_at,
            )
            .join(AssessmentTemplateModel, AssessmentTemplateModel.id == JobAssessmentModel.template_id)
        )

    @staticmethod
    def _assignment_summary_select() -> sa.Select:
        return (
            sa.select(
                CandidateAssessmentAssignmentModel.id,
                CandidateAssessmentAssignmentModel.candidate_id,
                CandidateAssessmentAssignmentModel.job_id,
                CandidateAssessmentAssignmentModel.pipeline_id,
                CandidateAssessmentAssignmentModel.template_id,
                AssessmentTemplateModel.title,
                AssessmentTemplateModel.description,
                AssessmentTemplateModel.type,
                CandidateAssessmentAssignmentModel.status,
                CandidateAssessmentAssignmentModel.assigned_at,
                CandidateAssessmentAssignmentModel.started_at,
                CandidateAssessmentAssignmentModel.completed_at,
                CandidateAssessmentAssignmentModel.expires_at.label("due_at"),
                CandidateAssessmentAssignmentModel.result_summary,
                CandidateAssessmentAssignmentModel.score,
                CandidateAssessmentAssignmentModel.metadata_payload,
            )
            .join(AssessmentTemplateModel, AssessmentTemplateModel.id == CandidateAssessmentAssignmentModel.template_id)
        )
