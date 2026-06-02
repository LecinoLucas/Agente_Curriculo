from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from src.interface.api.schemas.common import APISchemaModel, ORMAPISchemaModel

ConversationChannel = Literal["web", "whatsapp"]
ConversationState = Literal[
    "START",
    "IDENTIFY",
    "RESUME_OR_NEW",
    "CHOOSE_LOCATION",
    "CHOOSE_UNIT_OR_ANY",
    "CHOOSE_FUNCTION",
    "CHOOSE_SHIFT",
    "SHOW_JOBS",
    "COLLECT_BASIC_DATA",
    "COLLECT_RESUME",
    "CONFIRM_APPLICATION",
    "SUBMITTED",
    "FOLLOW_UP",
]
ConversationStatus = Literal["active", "completed", "abandoned", "expired"]
ConversationMessageDirection = Literal["inbound", "outbound", "system"]
ConversationMessageType = Literal["text", "quick_reply", "system"]


class ConversationCreateRequest(APISchemaModel):
    channel: ConversationChannel = "web"
    candidate_id: UUID | None = None
    application_id: UUID | None = None


class ConversationMessageCreateRequest(APISchemaModel):
    content: str = Field(..., min_length=1, max_length=4000)
    message_type: ConversationMessageType = "text"


class ConversationOptionResponse(APISchemaModel):
    value: str
    label: str


class ConversationSessionResponse(ORMAPISchemaModel):
    id: UUID
    channel: str
    current_state: str
    status: str
    context: dict
    last_message_at: datetime
    created_at: datetime
    updated_at: datetime


class ConversationMessageResponse(ORMAPISchemaModel):
    id: UUID
    session_id: UUID
    direction: str
    content: str
    message_type: str
    interpreted_intent: str | None = None
    metadata: dict | None = None
    created_at: datetime


class ConversationTurnResponse(APISchemaModel):
    session: ConversationSessionResponse
    message: ConversationMessageResponse
    options: list[ConversationOptionResponse]
