from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.conversation_service import ConversationService
from src.infrastructure.repositories.sqlalchemy_conversation_repository import (
    SQLAlchemyConversationRepository,
)
from src.interface.api.dependencies import get_db
from src.interface.api.schemas.conversation_schemas import (
    ConversationCreateRequest,
    ConversationMessageCreateRequest,
    ConversationMessageResponse,
    ConversationSessionResponse,
    ConversationTurnResponse,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _service(db: AsyncSession) -> ConversationService:
    return ConversationService(db, SQLAlchemyConversationRepository(db))


@router.post("", response_model=ConversationTurnResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> ConversationTurnResponse:
    turn = await _service(db).create_session(body)
    await db.commit()
    return turn


@router.get("/{conversation_id}", response_model=ConversationSessionResponse)
async def get_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ConversationSessionResponse:
    return await _service(db).get_session(conversation_id)


@router.post("/{conversation_id}/messages", response_model=ConversationTurnResponse)
async def create_conversation_message(
    conversation_id: UUID,
    body: ConversationMessageCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> ConversationTurnResponse:
    turn = await _service(db).receive_message(conversation_id, body)
    await db.commit()
    return turn


@router.get("/{conversation_id}/messages", response_model=list[ConversationMessageResponse])
async def list_conversation_messages(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> list[ConversationMessageResponse]:
    return await _service(db).list_messages(conversation_id)
