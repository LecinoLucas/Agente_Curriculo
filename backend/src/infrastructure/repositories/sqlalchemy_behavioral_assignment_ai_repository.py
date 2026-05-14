"""Repository for behavioral assessment AI evaluations."""

import logging
from datetime import UTC, datetime
from typing import Optional
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models import (
    BehavioralAssessmentAIEvaluationModel,
)

logger = logging.getLogger(__name__)


class SQLAlchemyBehavioralAssignmentAIRepository:
    """Repository for AI evaluation operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_evaluation(
        self,
        assignment_id: UUID,
        candidate_id: UUID,
        job_id: UUID,
        template_id: UUID,
        model: str = "claude-3-5-sonnet-20241022",
    ) -> BehavioralAssessmentAIEvaluationModel:
        """Create new evaluation record."""
        evaluation = BehavioralAssessmentAIEvaluationModel(
            assignment_id=assignment_id,
            candidate_id=candidate_id,
            job_id=job_id,
            template_id=template_id,
            status="pending",
            provider="anthropic",
            model=model,
            prompt_version=1,
        )
        self.session.add(evaluation)
        await self.session.flush()
        return evaluation

    async def get_evaluation(
        self,
        assignment_id: UUID,
    ) -> Optional[BehavioralAssessmentAIEvaluationModel]:
        """Fetch evaluation by assignment ID."""
        stmt = sa.select(BehavioralAssessmentAIEvaluationModel).where(
            BehavioralAssessmentAIEvaluationModel.assignment_id == assignment_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_or_create_evaluation(
        self,
        assignment_id: UUID,
        candidate_id: UUID,
        job_id: UUID,
        template_id: UUID,
        model: str = "claude-3-5-sonnet-20241022",
    ) -> BehavioralAssessmentAIEvaluationModel:
        """Get existing or create new evaluation."""
        existing = await self.get_evaluation(assignment_id)
        if existing:
            return existing

        return await self.create_evaluation(
            assignment_id=assignment_id,
            candidate_id=candidate_id,
            job_id=job_id,
            template_id=template_id,
            model=model,
        )

    async def update_status(
        self,
        evaluation_id: UUID,
        status: str,
    ) -> None:
        """Update evaluation status."""
        stmt = (
            sa.update(BehavioralAssessmentAIEvaluationModel)
            .where(BehavioralAssessmentAIEvaluationModel.id == evaluation_id)
            .values(status=status, updated_at=datetime.now(UTC))
        )
        await self.session.execute(stmt)
        await self.session.commit()
