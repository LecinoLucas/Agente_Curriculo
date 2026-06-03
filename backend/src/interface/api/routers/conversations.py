from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.conversation_service import ConversationService
from src.infrastructure.repositories.sqlalchemy_candidate_application_repository import (
    SQLAlchemyCandidateApplicationRepository,
)
from src.infrastructure.repositories.sqlalchemy_conversation_repository import (
    SQLAlchemyConversationRepository,
)
from src.infrastructure.repositories.sqlalchemy_resume_repository import (
    SQLAlchemyResumeRepository,
)
from src.interface.api.dependencies import get_db
from src.interface.api.rate_limiting import rate_limit_conversation_messages
from src.interface.api.schemas.conversation_schemas import (
    ConversationCreateRequest,
    ConversationMessageCreateRequest,
    ConversationMessageResponse,
    ConversationSessionResponse,
    ConversationTurnResponse,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _service(db: AsyncSession) -> ConversationService:
    return ConversationService(
        SQLAlchemyConversationRepository(db),
        db,
        SQLAlchemyCandidateApplicationRepository(db),
        SQLAlchemyResumeRepository(db),
    )


@router.post("", response_model=ConversationTurnResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> ConversationTurnResponse:
    turn = await _service(db).create_session(body)
    await db.commit()
    return turn


@router.get("/{session_id}", response_model=ConversationSessionResponse)
async def get_conversation(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ConversationSessionResponse:
    return await _service(db).get_session(session_id)


@router.post("/{session_id}/messages", response_model=ConversationTurnResponse)
async def create_conversation_message(
    session_id: UUID,
    body: ConversationMessageCreateRequest,
    _rl: None = Depends(rate_limit_conversation_messages),
    db: AsyncSession = Depends(get_db),
) -> ConversationTurnResponse:
    turn = await _service(db).receive_message(session_id, body)
    await db.commit()
    return turn


@router.get("/{session_id}/messages", response_model=list[ConversationMessageResponse])
async def list_conversation_messages(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> list[ConversationMessageResponse]:
    return await _service(db).list_messages(session_id)
