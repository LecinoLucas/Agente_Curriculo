"""Service for internal collaboration between recruiter and manager."""
import logging
from uuid import UUID

from sqlalchemy import and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.collaboration_comments_model import CollaborationCommentModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel

logger = logging.getLogger(__name__)


class CollaborationService:
    """Manage internal collaboration comments between recruiter and manager."""

    def __init__(self, session: AsyncSession, user: User):
        self.session = session
        self.user = user
        self.is_admin = user.role == UserRole.ADMIN
        self.is_recruiter = user.role == UserRole.RECRUITER
        self.is_manager = user.role == UserRole.MANAGER

    async def list_collaboration(self, candidate_id: UUID, job_id: UUID) -> list[dict]:
        """
        List collaboration comments for candidate+job.

        Recruiter/Admin: see all comments.
        Manager: see only if they are evaluator for this candidate in this job.
        """
        # Verify access
        if not await self._verify_access(candidate_id, job_id):
            return []

        import sqlalchemy as sa
        query = sa.select(
            CollaborationCommentModel.id,
            CollaborationCommentModel.author_id,
            CollaborationCommentModel.author_role,
            CollaborationCommentModel.comment_type,
            CollaborationCommentModel.recommendation,
            CollaborationCommentModel.message,
            CollaborationCommentModel.created_at,
        ).where(
            and_(
                CollaborationCommentModel.candidate_id == candidate_id,
                CollaborationCommentModel.job_id == job_id,
            )
        ).order_by(desc(CollaborationCommentModel.created_at))

        result = await self.session.execute(query)
        rows = result.fetchall()

        return [
            {
                "id": str(row.id),
                "author_id": str(row.author_id) if row.author_id else None,
                "author_role": row.author_role,
                "comment_type": row.comment_type,
                "recommendation": row.recommendation,
                "message": row.message,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]

    async def create_comment(
        self,
        candidate_id: UUID,
        job_id: UUID,
        comment_type: str,
        message: str,
        recommendation: str | None = None,
    ) -> dict | None:
        """Create internal collaboration comment."""
        if not await self._verify_access(candidate_id, job_id):
            logger.warning(f"Acesso negado para criar comentário: {self.user.id} não tem acesso a {candidate_id}#{job_id}")
            return None

        from datetime import datetime, timezone
        comment = CollaborationCommentModel(
            id=__import__("uuid").uuid4(),
            candidate_id=candidate_id,
            job_id=job_id,
            author_id=self.user.id,
            author_role=self.user.role.value,
            comment_type=comment_type,
            recommendation=recommendation,
            message=message,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.session.add(comment)
        await self.session.flush()

        return {
            "id": str(comment.id),
            "author_id": str(comment.author_id),
            "author_role": comment.author_role,
            "comment_type": comment.comment_type,
            "recommendation": comment.recommendation,
            "message": comment.message,
            "created_at": comment.created_at.isoformat(),
        }

    async def _verify_access(self, candidate_id: UUID, job_id: UUID) -> bool:
        """Verify user can access collaboration for this candidate+job."""
        if self.is_admin or self.is_recruiter:
            return True

        # Manager: only if evaluator for this candidate in this job
        if self.is_manager:
            import sqlalchemy as sa
            count = await self.session.scalar(
                sa.select(sa.func.count(InterviewScorecardModel.id)).where(
                    and_(
                        InterviewScorecardModel.job_id == job_id,
                        InterviewScorecardModel.candidate_id == candidate_id,
                        InterviewScorecardModel.evaluator_id == self.user.id,
                    )
                )
            )
            return (count or 0) > 0

        return False
