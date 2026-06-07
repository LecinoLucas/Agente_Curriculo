from __future__ import annotations

from pathlib import Path
from datetime import UTC, datetime, timedelta
from uuid import UUID

import structlog
from fastapi import APIRouter, Cookie, Depends, File, HTTPException, UploadFile, status
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.upload_validation_service import (
    UploadValidationError,
    resume_upload_policy,
    validate_upload,
)
from src.core.settings import settings
from src.infrastructure.database.models.conversation_model import ConversationSessionModel
from src.interface.api.dependencies import get_db

# NOTE: the prefix is "/conversations" (NOT "/api/v1/conversations"). main.py
# already mounts this router under the global _PREFIX="/api/v1", so the final
# path is /api/v1/conversations/{session_id}/resume. Including "/api/v1" here
# would double the prefix and 404 the documented endpoint.
router = APIRouter(prefix="/conversations", tags=["Conversations"])
logger = structlog.get_logger(__name__)

TEMP_RESUME_DIR = Path(__file__).resolve().parents[4] / "private_uploads" / "temp_resumes"
CONVERSATION_SESSION_COOKIE_NAME = "conversation_session_token"
CONVERSATION_SESSION_TOKEN_TTL_HOURS = 24
CONVERSATION_SESSION_TOKEN_TYPE = "conversation_session"


def create_conversation_session_token(session_id: UUID) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(session_id),
        "session_id": str(session_id),
        "iat": now,
        "exp": now + timedelta(hours=CONVERSATION_SESSION_TOKEN_TTL_HOURS),
        "type": CONVERSATION_SESSION_TOKEN_TYPE,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def validate_conversation_session_token(token: str | None, session_id: UUID) -> None:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Conversation session authorization required",
        )

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired conversation session token",
        ) from exc

    if payload.get("type") != CONVERSATION_SESSION_TOKEN_TYPE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired conversation session token",
        )

    token_session_id = payload.get("session_id") or payload.get("sub")
    if token_session_id != str(session_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conversation session token does not match the requested session",
        )


class ConversationUploadService:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def upload_pending_resume(
        self,
        session_id: UUID,
        file: UploadFile,
    ) -> ConversationSessionModel:
        session = await self._db.get(ConversationSessionModel, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Conversation session not found")

        if session.status != "active":
            raise HTTPException(status_code=400, detail="Conversation session is not active")

        content = await file.read()

        try:
            validated_file = validate_upload(
                file_name=file.filename or "resume",
                content_type=file.content_type,
                content=content,
                policy=resume_upload_policy(),
            )
        except UploadValidationError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        TEMP_RESUME_DIR.mkdir(parents=True, exist_ok=True)
        temp_file_path = TEMP_RESUME_DIR / f"{session.id}{validated_file.extension}"

        with open(temp_file_path, "wb") as f:
            f.write(validated_file.content)

        context = dict(session.context_json) if session.context_json else {}
        context["pending_resume_path"] = str(temp_file_path)
        context["pending_resume_filename"] = validated_file.file_name
        session.context_json = context

        await self._db.commit()
        await self._db.refresh(session)

        logger.info(
            "conversation.pending_resume_uploaded",
            session_id=session.id,
        )

        return session


@router.post("/{session_id}/resume", status_code=200)
async def upload_conversation_resume(
    session_id: UUID,
    file: UploadFile = File(...),
    conversation_session_token: str | None = Cookie(
        default=None,
        alias=CONVERSATION_SESSION_COOKIE_NAME,
    ),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """
    Upload a resume for a conversation session.
    The resume is stored temporarily and processed later in the conversation flow.
    """
    validate_conversation_session_token(conversation_session_token, session_id)
    service = ConversationUploadService(db)
    await service.upload_pending_resume(session_id, file)
    return {"message": "Resume uploaded successfully. Please continue the conversation."}
