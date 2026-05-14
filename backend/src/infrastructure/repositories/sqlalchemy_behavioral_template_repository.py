from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
)
from src.infrastructure.database.models.job_model import JobModel


class SQLAlchemyBehavioralTemplateRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_templates(self, status: str | None = None) -> list[dict[str, Any]]:
        """List templates with competency and question counts."""
        stmt = sa.select(
            BehavioralAssessmentTemplateModel.id,
            BehavioralAssessmentTemplateModel.name,
            BehavioralAssessmentTemplateModel.description,
            BehavioralAssessmentTemplateModel.status,
            BehavioralAssessmentTemplateModel.version,
            BehavioralAssessmentTemplateModel.created_at,
            BehavioralAssessmentTemplateModel.updated_at,
            BehavioralAssessmentTemplateModel.archived_at,
            sa.func.count(sa.distinct(BehavioralTemplateCompetencyModel.id)).label("competency_count"),
            sa.func.count(sa.distinct(BehavioralTemplateQuestionModel.id)).label("question_count"),
        ).outerjoin(
            BehavioralTemplateCompetencyModel,
            BehavioralAssessmentTemplateModel.id == BehavioralTemplateCompetencyModel.template_id,
        ).outerjoin(
            BehavioralTemplateQuestionModel,
            BehavioralTemplateCompetencyModel.id == BehavioralTemplateQuestionModel.competency_id,
        ).group_by(
            BehavioralAssessmentTemplateModel.id,
            BehavioralAssessmentTemplateModel.name,
            BehavioralAssessmentTemplateModel.description,
            BehavioralAssessmentTemplateModel.status,
            BehavioralAssessmentTemplateModel.version,
            BehavioralAssessmentTemplateModel.created_at,
            BehavioralAssessmentTemplateModel.updated_at,
            BehavioralAssessmentTemplateModel.archived_at,
        )

        if status:
            stmt = stmt.where(BehavioralAssessmentTemplateModel.status == status)

        stmt = stmt.order_by(BehavioralAssessmentTemplateModel.created_at.desc())

        result = await self._session.execute(stmt)
        rows = result.mappings().all()

        return [
            {
                "id": str(row["id"]),
                "name": row["name"],
                "description": row["description"],
                "status": row["status"],
                "version": row["version"],
                "competency_count": row["competency_count"] or 0,
                "question_count": row["question_count"] or 0,
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat(),
                "archived_at": row["archived_at"].isoformat() if row["archived_at"] else None,
            }
            for row in rows
        ]

    async def get_template(self, template_id: UUID) -> dict[str, Any] | None:
        """Get template with all competencies and questions."""
        # Get template
        template_result = await self._session.execute(
            sa.select(BehavioralAssessmentTemplateModel).where(BehavioralAssessmentTemplateModel.id == template_id)
        )
        template = template_result.scalar_one_or_none()

        if not template:
            return None

        # Get competencies with questions
        competencies_result = await self._session.execute(
            sa.select(BehavioralTemplateCompetencyModel)
            .where(BehavioralTemplateCompetencyModel.template_id == template_id)
            .order_by(BehavioralTemplateCompetencyModel.display_order)
        )
        competencies = competencies_result.scalars().all()

        competencies_data = []
        question_count = 0

        for comp in competencies:
            questions_result = await self._session.execute(
                sa.select(BehavioralTemplateQuestionModel)
                .where(BehavioralTemplateQuestionModel.competency_id == comp.id)
                .order_by(BehavioralTemplateQuestionModel.display_order)
            )
            questions = questions_result.scalars().all()
            question_count += len(questions)

            questions_data = [
                {
                    "id": str(q.id),
                    "competency_id": str(q.competency_id),
                    "question_text": q.question_text,
                    "answer_type": q.answer_type,
                    "is_required": q.is_required,
                    "weight": float(q.weight),
                    "display_order": q.display_order,
                    "options_json": q.options_json,
                }
                for q in questions
            ]

            competencies_data.append(
                {
                    "id": str(comp.id),
                    "template_id": str(comp.template_id),
                    "name": comp.name,
                    "description": comp.description,
                    "weight": float(comp.weight),
                    "display_order": comp.display_order,
                    "question_count": len(questions),
                    "questions": questions_data,
                }
            )

        return {
            "id": str(template.id),
            "name": template.name,
            "description": template.description,
            "status": template.status,
            "version": template.version,
            "competency_count": len(competencies),
            "question_count": question_count,
            "created_at": template.created_at.isoformat(),
            "updated_at": template.updated_at.isoformat(),
            "archived_at": template.archived_at.isoformat() if template.archived_at else None,
            "competencies": competencies_data,
        }

    async def create_template(self, name: str, description: str | None = None) -> dict[str, Any]:
        """Create a new template."""
        template = BehavioralAssessmentTemplateModel(name=name, description=description)
        self._session.add(template)
        await self._session.flush()

        return {
            "id": str(template.id),
            "name": template.name,
            "description": template.description,
            "status": template.status,
            "version": template.version,
            "competency_count": 0,
            "question_count": 0,
            "created_at": template.created_at.isoformat(),
            "updated_at": template.updated_at.isoformat(),
            "archived_at": template.archived_at.isoformat() if template.archived_at else None,
        }

    async def update_template(self, template_id: UUID, **fields: Any) -> None:
        """Update template fields."""
        await self._session.execute(
            sa.update(BehavioralAssessmentTemplateModel).where(BehavioralAssessmentTemplateModel.id == template_id).values(**fields)
        )
        await self._session.flush()

    async def set_template_status(self, template_id: UUID, status: str, archived_at: Any = None) -> None:
        """Set template status and optionally archived_at."""
        data = {"status": status}
        if archived_at is not None:
            data["archived_at"] = archived_at
        await self._session.execute(
            sa.update(BehavioralAssessmentTemplateModel).where(BehavioralAssessmentTemplateModel.id == template_id).values(**data)
        )
        await self._session.flush()

    async def create_competency(self, template_id: UUID, name: str, description: str | None = None, weight: float = 1.0, display_order: int = 0) -> dict[str, Any]:
        """Create a new competency."""
        competency = BehavioralTemplateCompetencyModel(
            template_id=template_id, name=name, description=description, weight=weight, display_order=display_order
        )
        self._session.add(competency)
        await self._session.flush()

        return {
            "id": str(competency.id),
            "template_id": str(competency.template_id),
            "name": competency.name,
            "description": competency.description,
            "weight": float(competency.weight),
            "display_order": competency.display_order,
            "question_count": 0,
        }

    async def update_competency(self, competency_id: UUID, **fields: Any) -> None:
        """Update competency fields."""
        await self._session.execute(
            sa.update(BehavioralTemplateCompetencyModel).where(BehavioralTemplateCompetencyModel.id == competency_id).values(**fields)
        )
        await self._session.flush()

    async def delete_competency(self, competency_id: UUID) -> None:
        """Delete a competency (questions deleted via CASCADE)."""
        await self._session.execute(
            sa.delete(BehavioralTemplateCompetencyModel).where(BehavioralTemplateCompetencyModel.id == competency_id)
        )
        await self._session.flush()

    async def create_question(
        self,
        competency_id: UUID,
        question_text: str,
        answer_type: str,
        is_required: bool = True,
        weight: float = 1.0,
        display_order: int = 0,
        options_json: list | None = None,
    ) -> dict[str, Any]:
        """Create a new question."""
        question = BehavioralTemplateQuestionModel(
            competency_id=competency_id,
            question_text=question_text,
            answer_type=answer_type,
            is_required=is_required,
            weight=weight,
            display_order=display_order,
            options_json=options_json,
        )
        self._session.add(question)
        await self._session.flush()

        return {
            "id": str(question.id),
            "competency_id": str(question.competency_id),
            "question_text": question.question_text,
            "answer_type": question.answer_type,
            "is_required": question.is_required,
            "weight": float(question.weight),
            "display_order": question.display_order,
            "options_json": question.options_json,
        }

    async def update_question(self, question_id: UUID, **fields: Any) -> None:
        """Update question fields."""
        await self._session.execute(
            sa.update(BehavioralTemplateQuestionModel).where(BehavioralTemplateQuestionModel.id == question_id).values(**fields)
        )
        await self._session.flush()

    async def delete_question(self, question_id: UUID) -> None:
        """Delete a question."""
        await self._session.execute(
            sa.delete(BehavioralTemplateQuestionModel).where(BehavioralTemplateQuestionModel.id == question_id)
        )
        await self._session.flush()

    async def get_template_stats(self, template_id: UUID) -> tuple[int, int]:
        """Get competency count and question count for a template."""
        competencies_result = await self._session.execute(
            sa.select(sa.func.count(BehavioralTemplateCompetencyModel.id)).where(
                BehavioralTemplateCompetencyModel.template_id == template_id
            )
        )
        competency_count = competencies_result.scalar() or 0

        questions_result = await self._session.execute(
            sa.select(sa.func.count(BehavioralTemplateQuestionModel.id)).join(
                BehavioralTemplateCompetencyModel,
                BehavioralTemplateQuestionModel.competency_id == BehavioralTemplateCompetencyModel.id,
            ).where(BehavioralTemplateCompetencyModel.template_id == template_id)
        )
        question_count = questions_result.scalar() or 0

        return (competency_count, question_count)

    async def link_to_job(self, job_id: UUID, template_id: UUID | None) -> None:
        """Link or unlink a template to/from a job."""
        await self._session.execute(
            sa.update(JobModel).where(JobModel.id == job_id).values(behavioral_template_id=template_id)
        )
        await self._session.flush()
