from collections.abc import Sequence
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.conversation_model import (
    ConversationMessageModel,
    ConversationSessionModel,
)


class SQLAlchemyConversationRepository:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def create_session(
        self,
        session: ConversationSessionModel,
    ) -> ConversationSessionModel:
        self._session.add(session)
        await self._session.flush()
        return session

    async def get_session(self, session_id: UUID) -> ConversationSessionModel | None:
        return await self._session.scalar(
            sa.select(ConversationSessionModel).where(
                ConversationSessionModel.id == session_id,
                ConversationSessionModel.deleted_at.is_(None),
            )
        )

    async def update_session(
        self,
        session: ConversationSessionModel,
    ) -> ConversationSessionModel:
        await self._session.flush()
        return session

    async def add_message(
        self,
        message: ConversationMessageModel,
    ) -> ConversationMessageModel:
        self._session.add(message)
        await self._session.flush()
        return message

    async def list_messages(
        self,
        session_id: UUID,
    ) -> Sequence[ConversationMessageModel]:
        result = await self._session.execute(
            sa.select(ConversationMessageModel)
            .where(ConversationMessageModel.session_id == session_id)
            .order_by(ConversationMessageModel.created_at.asc(), ConversationMessageModel.id.asc())
        )
        return result.scalars().all()
