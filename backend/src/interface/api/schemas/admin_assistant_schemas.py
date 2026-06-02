from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import ConfigDict

from src.interface.api.schemas.common import APISchemaModel

AssistantFailureStatus = Literal["open", "reviewed", "resolved", "ignored"]
AssistantFailureClassification = Literal[
    "location",
    "unit",
    "function",
    "shift",
    "identity",
    "spam",
    "talk_to_hr",
    "other",
]

AssistantSettingValue = dict[str, Any] | list[Any] | str | int | bool | None


class AdminAssistantStateItem(APISchemaModel):
    state: str
    label: str
    description: str
    is_sensitive: bool
    is_editable: bool
    order: int
    allowed_quick_reply_values: list[str]
    allowed_placeholders: list[str]


class AdminAssistantStateContentItem(APISchemaModel):
    state: str
    prompt_text: str
    helper_text: str | None = None
    fallback_text: str | None = None
    input_placeholder: str | None = None
    is_editable: bool
    is_active: bool
    version: int
    updated_at: datetime


class AdminAssistantQuickReplyItem(APISchemaModel):
    id: UUID
    state: str
    value: str
    label: str
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AdminAssistantSettingItem(APISchemaModel):
    key: str
    value_json: AssistantSettingValue
    is_sensitive: bool
    description: str | None = None
    updated_at: datetime


class AdminAssistantStateContentPatch(APISchemaModel):
    model_config = ConfigDict(extra="forbid")

    prompt_text: str | None = None
    helper_text: str | None = None
    fallback_text: str | None = None
    input_placeholder: str | None = None
    is_active: bool | None = None


class AdminAssistantQuickReplyPatch(APISchemaModel):
    model_config = ConfigDict(extra="forbid")

    label: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class AdminAssistantSettingPatch(APISchemaModel):
    model_config = ConfigDict(extra="forbid")

    value_json: AssistantSettingValue


class AdminSessionCandidateInfo(APISchemaModel):
    id: UUID | None = None
    display_name: str
    cpf_last4: str | None = None
    identity_verified: bool = False


class AdminSessionApplicationInfo(APISchemaModel):
    id: UUID
    status: str
    job_id: UUID | None = None


class AdminSessionPipelineInfo(APISchemaModel):
    id: UUID
    stage: str


class AdminContextSummary(APISchemaModel):
    identifier_type: str | None = None
    identity_verified: bool = False
    location_hint: str | None = None
    desired_function: str | None = None
    desired_shift: str | None = None


class AdminSessionListItem(APISchemaModel):
    session_id: UUID
    candidate: AdminSessionCandidateInfo
    channel: str
    current_state: str
    status: str
    last_message_at: datetime
    created_at: datetime
    application: AdminSessionApplicationInfo | None = None
    pipeline: AdminSessionPipelineInfo | None = None
    context_summary: AdminContextSummary


class AdminSessionDetail(APISchemaModel):
    session_id: UUID
    candidate: AdminSessionCandidateInfo
    channel: str
    current_state: str
    status: str
    last_message_at: datetime
    created_at: datetime
    application: AdminSessionApplicationInfo | None = None
    pipeline: AdminSessionPipelineInfo | None = None
    context_summary: AdminContextSummary


class AdminMessageItem(APISchemaModel):
    id: UUID
    role: str
    direction: str
    content: str
    message_type: str
    quick_replies: list[dict[str, str]]
    state_at_message: str | None = None
    created_at: datetime


class AdminAssistantFailureSessionInfo(APISchemaModel):
    id: UUID
    channel: str
    current_state: str
    status: str


class AdminAssistantFailureApplicationInfo(APISchemaModel):
    id: UUID
    status: str


class AdminAssistantFailureListItem(APISchemaModel):
    id: UUID
    session_id: UUID
    message_id: UUID | None = None
    candidate_id: UUID | None = None
    candidate_label: str
    application: AdminAssistantFailureApplicationInfo | None = None
    state: str
    sanitized_message: str
    reason: str
    status: AssistantFailureStatus
    classification: AssistantFailureClassification | None = None
    attempts_count: int | None = None
    created_at: datetime
    updated_at: datetime


class AdminAssistantFailureDetail(AdminAssistantFailureListItem):
    session: AdminAssistantFailureSessionInfo
    reviewed_by: UUID | None = None
    reviewed_at: datetime | None = None


class AdminAssistantFailurePatch(APISchemaModel):
    model_config = ConfigDict(extra="forbid")

    status: AssistantFailureStatus | None = None
    classification: AssistantFailureClassification | None = None
