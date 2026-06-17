from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from src.interface.api.schemas.common import APISchemaModel, ORMAPISchemaModel

ConversationChannel = Literal["web", "whatsapp"]
ConversationState = Literal[
    "IDENTIFY",
    "VERIFY_OTP",
    "GUIDED_PORTAL_CHAT",
    "CHOOSE_LOCATION",
    "CHOOSE_UNIT_OR_ANY",
    "CHOOSE_FUNCTION",
    "CHOOSE_SHIFT",
    "SHOW_JOBS",
    "COLLECT_RESUME",
    "AWAITING_RESUME_UPLOAD",
    "COLLECT_LEAD_NAME",
    "COLLECT_LEAD_WHATSAPP",
    "COLLECT_LGPD_CONSENT",
    "CONFIRM_APPLICATION",
    "DONE",
]
ConversationStatus = Literal["active", "completed", "abandoned", "cancelled"]
ConversationMessageRole = Literal["candidate", "assistant", "system"]
ConversationMessageDirection = Literal["inbound", "outbound", "system"]
ConversationMessageType = Literal["text", "quick_reply", "system"]
ConversationMessageCreateType = Literal["text", "quick_reply", "system", "event"]


class ConversationCreateRequest(APISchemaModel):
    channel: ConversationChannel = "web"
    candidate_id: UUID | None = None


class ConversationMessageCreateRequest(APISchemaModel):
    content: str = Field(..., min_length=1, max_length=4000)
    message_type: ConversationMessageCreateType = "text"


class ConversationQuickReplyResponse(APISchemaModel):
    value: str
    label: str


class ConversationSessionResponse(ORMAPISchemaModel):
    id: UUID
    session_id: UUID
    channel: str
    current_state: str
    status: str
    context: dict
    assistant_message: str
    quick_replies: list[ConversationQuickReplyResponse]
    last_message_at: datetime
    created_at: datetime
    updated_at: datetime


class ConversationMessageResponse(ORMAPISchemaModel):
    id: UUID
    session_id: UUID
    role: ConversationMessageRole
    direction: ConversationMessageDirection
    content: str
    message_type: str
    interpreted_intent: str | None = None
    metadata: dict | None = None
    created_at: datetime


class ConversationTurnResponse(APISchemaModel):
    session_id: UUID
    current_state: str
    assistant_message: str
    quick_replies: list[ConversationQuickReplyResponse]
    session: ConversationSessionResponse
    message: ConversationMessageResponse
    options: list[ConversationQuickReplyResponse]
    handoff_required: bool = False


class CandidateBotMessageRequest(APISchemaModel):
    session_id: UUID | None = None
    message: str = Field(..., min_length=1, max_length=1000)
    job_id: UUID | None = None
    operational_unit_id: UUID | None = None


class CandidateBotSessionResponse(APISchemaModel):
    session: ConversationSessionResponse
    messages: list[ConversationMessageResponse]
    handoff_required: bool = False
