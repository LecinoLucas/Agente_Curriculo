"""Service for internal collaboration between recruiter and manager."""
import logging
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy import and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole, UserStatus
from src.infrastructure.database.models.collaboration_comments_model import CollaborationCommentModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.database.models.user_model import UserModel

logger = logging.getLogger(__name__)


class CollaborationValidationError(ValueError):
    """Raised when collaboration payload is invalid."""


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
        Manager: see only if they are evaluator for this candidate in this job
        or have a directed review_request for the same candidate+job.
        """
        # Verify access
        if not await self._verify_access(candidate_id, job_id):
            return []

        query = sa.select(
            CollaborationCommentModel.id,
            CollaborationCommentModel.author_id,
            CollaborationCommentModel.author_role,
            CollaborationCommentModel.comment_type,
            CollaborationCommentModel.recommendation,
            CollaborationCommentModel.message,
            CollaborationCommentModel.target_manager_id,
            CollaborationCommentModel.priority,
            CollaborationCommentModel.created_at,
        ).where(
            and_(
                CollaborationCommentModel.candidate_id == candidate_id,
                CollaborationCommentModel.job_id == job_id,
            )
        ).order_by(desc(CollaborationCommentModel.created_at))

        if self.is_manager and not self.is_admin:
            query = query.where(
                sa.or_(
                    CollaborationCommentModel.comment_type != "review_request",
                    CollaborationCommentModel.target_manager_id.is_(None),
                    CollaborationCommentModel.target_manager_id == self.user.id,
                )
            )

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
                "target_manager_id": str(row.target_manager_id) if row.target_manager_id else None,
                "priority": row.priority,
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
        target_manager_id: UUID | None = None,
        priority: str | None = None,
    ) -> dict | None:
        """Create internal collaboration comment."""
        if not await self._verify_access(candidate_id, job_id):
            logger.warning(f"Acesso negado para criar comentário: {self.user.id} não tem acesso a {candidate_id}#{job_id}")
            return None

        if comment_type == "review_request":
            target_manager_id = await self._validate_review_request_target(target_manager_id)

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
            target_manager_id=target_manager_id,
            priority=priority,
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
            "target_manager_id": str(comment.target_manager_id) if comment.target_manager_id else None,
            "priority": comment.priority,
            "created_at": comment.created_at.isoformat(),
        }

    async def _verify_access(self, candidate_id: UUID, job_id: UUID) -> bool:
        """Verify user can access collaboration for this candidate+job."""
        if self.is_admin or self.is_recruiter:
            return True

        # Manager: evaluator for this candidate/job OR explicitly targeted
        # by a review request for the same candidate/job.
        if self.is_manager:
            count = await self.session.scalar(
                sa.select(sa.func.count(InterviewScorecardModel.id)).where(
                    and_(
                        InterviewScorecardModel.job_id == job_id,
                        InterviewScorecardModel.candidate_id == candidate_id,
                        InterviewScorecardModel.evaluator_id == self.user.id,
                    )
                )
            )
            if (count or 0) > 0:
                return True

            directed_review_count = await self.session.scalar(
                sa.select(sa.func.count(CollaborationCommentModel.id)).where(
                    and_(
                        CollaborationCommentModel.job_id == job_id,
                        CollaborationCommentModel.candidate_id == candidate_id,
                        CollaborationCommentModel.comment_type == "review_request",
                        CollaborationCommentModel.target_manager_id == self.user.id,
                    )
                )
            )
            return (directed_review_count or 0) > 0

        return False

    async def _validate_review_request_target(
        self,
        target_manager_id: UUID | None,
    ) -> UUID | None:
        """Validate directed manager selection for review requests."""
        active_manager_count = await self.session.scalar(
            sa.select(sa.func.count(UserModel.id)).where(
                UserModel.role == UserRole.MANAGER.value,
                UserModel.status == UserStatus.ACTIVE.value,
                UserModel.deleted_at.is_(None),
            )
        )

        if (active_manager_count or 0) > 0 and target_manager_id is None:
            raise CollaborationValidationError(
                "Selecione o gestor responsável pela revisão."
            )

        if target_manager_id is None:
            return None

        target_manager = await self.session.scalar(
            sa.select(UserModel).where(
                UserModel.id == target_manager_id,
                UserModel.deleted_at.is_(None),
            )
        )
        if target_manager is None:
            raise CollaborationValidationError("Gestor responsável não encontrado.")

        if target_manager.role != UserRole.MANAGER.value:
            raise CollaborationValidationError(
                "O destinatário informado não é um gestor."
            )

        if target_manager.status != UserStatus.ACTIVE.value:
            raise CollaborationValidationError(
                "O gestor responsável precisa estar ativo."
            )

        return target_manager_id
