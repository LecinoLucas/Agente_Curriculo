import re
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.conversation_state_machine import (
    ConversationPrompt,
    first_prompt,
    next_state,
    prompt_for,
)
from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.database.models.candidate_application_model import (
    APPLICATION_ACTIVE_STATUSES,
    CandidateApplicationModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.conversation_model import (
    ConversationMessageModel,
    ConversationSessionModel,
)
from src.infrastructure.repositories.sqlalchemy_conversation_repository import (
    SQLAlchemyConversationRepository,
)
from src.interface.api.schemas.conversation_schemas import (
    ConversationCreateRequest,
    ConversationMessageCreateRequest,
    ConversationMessageResponse,
    ConversationOptionResponse,
    ConversationSessionResponse,
    ConversationTurnResponse,
)

SENSITIVE_DIGIT_SEQUENCE = re.compile(r"\d[\d\s().+-]{8,}\d")


@dataclass(frozen=True)
class InterpretedMessage:
    sanitized_content: str
    intent: str
    context_updates: dict[str, Any]


class ConversationService:
    def __init__(self, session: AsyncSession, repository: SQLAlchemyConversationRepository):
        self._session = session
        self._repository = repository

    async def create_session(self, body: ConversationCreateRequest) -> ConversationTurnResponse:
        now = datetime.now(UTC)
        initial_prompt = first_prompt()
        conversation = ConversationSessionModel(
            candidate_id=body.candidate_id,
            application_id=body.application_id,
            channel=body.channel,
            current_state=initial_prompt.state,
            status="active",
            context_json={
                "answers": {},
                "identity": {},
                "application_lookup": {
                    "active_application_found": body.application_id is not None,
                },
            },
            last_message_at=now,
            created_at=now,
            updated_at=now,
        )
        conversation = await self._repository.create_session(conversation)
        outbound = await self._add_outbound_message(conversation, initial_prompt)
        return self._turn_response(conversation, outbound, initial_prompt)

    async def get_session(self, session_id: UUID) -> ConversationSessionResponse:
        conversation = await self._get_session(session_id)
        return self._session_response(conversation)

    async def receive_message(
        self,
        session_id: UUID,
        body: ConversationMessageCreateRequest,
    ) -> ConversationTurnResponse:
        conversation = await self._get_session(session_id)
        if conversation.status not in {"active", "completed"}:
            raise ValidationException("Sessão de conversa não está ativa.")

        interpreted = await self._interpret_message(conversation, body.content)
        await self._add_inbound_message(
            conversation,
            content=interpreted.sanitized_content,
            message_type=body.message_type,
            interpreted_intent=interpreted.intent,
        )

        context = dict(conversation.context_json or {})
        self._merge_context(context, interpreted.context_updates)
        conversation.context_json = context
        candidate_id = interpreted.context_updates.get("candidate_id")
        application_id = interpreted.context_updates.get("application_id")
        if isinstance(candidate_id, UUID):
            conversation.candidate_id = candidate_id
        if isinstance(application_id, UUID):
            conversation.application_id = application_id
        conversation.current_state = next_state(conversation.current_state, interpreted.intent)
        if conversation.current_state == "SUBMITTED":
            conversation.status = "completed"
        conversation.updated_at = datetime.now(UTC)

        prompt = prompt_for(conversation.current_state)
        outbound = await self._add_outbound_message(conversation, prompt)
        await self._repository.update_session(conversation)
        return self._turn_response(conversation, outbound, prompt)

    async def list_messages(self, session_id: UUID) -> list[ConversationMessageResponse]:
        await self._get_session(session_id)
        messages = await self._repository.list_messages(session_id)
        return [self._message_response(message) for message in messages]

    async def _get_session(self, session_id: UUID) -> ConversationSessionModel:
        conversation = await self._repository.get_session(session_id)
        if conversation is None:
            raise NotFoundException("Sessão de conversa não encontrada.")
        return conversation

    async def _interpret_message(
        self,
        conversation: ConversationSessionModel,
        raw_content: str,
    ) -> InterpretedMessage:
        cleaned = raw_content.strip()
        sanitized = self._sanitize_message_content(cleaned)
        normalized = cleaned.casefold()
        digits = self._digits(cleaned)

        if conversation.current_state == "IDENTIFY":
            return await self._interpret_identity_message(sanitized, digits)
        if conversation.current_state == "RESUME_OR_NEW":
            intent = (
                "new"
                if any(term in normalized for term in ("nova", "novo", "new"))
                else "continue"
            )
            return InterpretedMessage(sanitized, intent, {"flow_choice": intent})
        if conversation.current_state == "CHOOSE_LOCATION":
            return InterpretedMessage(
                sanitized,
                "location_selected",
                {"answers": {"location": sanitized}},
            )
        if conversation.current_state == "CHOOSE_UNIT_OR_ANY":
            intent = "any_unit" if self._is_any_choice(normalized) else "specific_unit"
            return InterpretedMessage(
                sanitized,
                intent,
                {"answers": {"unit_preference": intent}},
            )
        if conversation.current_state == "CHOOSE_FUNCTION":
            return InterpretedMessage(
                sanitized,
                "function_selected",
                {"answers": {"function": sanitized}},
            )
        if conversation.current_state == "CHOOSE_SHIFT":
            return InterpretedMessage(
                sanitized,
                "shift_selected",
                {"answers": {"shift": sanitized}},
            )
        if conversation.current_state == "SHOW_JOBS":
            return InterpretedMessage(sanitized, "continue", {})
        if conversation.current_state == "COLLECT_BASIC_DATA":
            return InterpretedMessage(
                sanitized,
                "basic_data_collected",
                {"answers": {"basic_data": sanitized}},
            )
        if conversation.current_state == "COLLECT_RESUME":
            intent = "skip_resume" if self._is_skip_choice(normalized) else "resume_provided"
            return InterpretedMessage(sanitized, intent, {"answers": {"resume_step": intent}})
        if conversation.current_state == "CONFIRM_APPLICATION":
            intent = "review" if self._is_review_choice(normalized) else "confirm"
            return InterpretedMessage(sanitized, intent, {"answers": {"confirmation": intent}})
        return InterpretedMessage(sanitized, "continue", {})

    async def _interpret_identity_message(
        self,
        sanitized_content: str,
        digits: str,
    ) -> InterpretedMessage:
        identity: dict[str, Any] = {"provided": bool(digits)}
        candidate: CandidateModel | None = None
        application: CandidateApplicationModel | None = None

        if len(digits) >= 10:
            identity["phone_hash"] = self._hash_value(digits)
            candidate = await self._find_candidate_by_phone(digits)
        if len(digits) == 11:
            cpf_hash = self._hash_value(digits)
            identity["cpf_hash"] = cpf_hash
            identity["cpf_last4"] = digits[-4:]
            candidate = await self._find_candidate_by_cpf(digits, cpf_hash) or candidate

        if candidate is not None:
            application = await self._find_active_application(candidate.id)
            identity["candidate_found"] = True
        else:
            identity["candidate_found"] = False

        context_updates: dict[str, Any] = {
            "identity": identity,
            "application_lookup": {
                "active_application_found": application is not None,
            },
        }
        if candidate is not None:
            context_updates["candidate_id"] = candidate.id
        if application is not None:
            context_updates["application_id"] = application.id

        return InterpretedMessage(sanitized_content, "identity_provided", context_updates)

    async def _find_candidate_by_cpf(
        self,
        cpf_digits: str,
        cpf_hash: str,
    ) -> CandidateModel | None:
        normalized_cpf = self._normalized_digits_expression(CandidateModel.cpf)
        return await self._session.scalar(
            sa.select(CandidateModel).where(
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
                sa.or_(
                    CandidateModel.cpf_hash == cpf_hash,
                    normalized_cpf == cpf_digits,
                ),
            )
        )

    async def _find_candidate_by_phone(self, phone_digits: str) -> CandidateModel | None:
        normalized_phone = self._normalized_digits_expression(CandidateModel.phone)
        return await self._session.scalar(
            sa.select(CandidateModel).where(
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
                normalized_phone == phone_digits,
            )
        )

    async def _find_active_application(
        self,
        candidate_id: UUID,
    ) -> CandidateApplicationModel | None:
        return await self._session.scalar(
            sa.select(CandidateApplicationModel)
            .where(
                CandidateApplicationModel.candidate_id == candidate_id,
                CandidateApplicationModel.deleted_at.is_(None),
                CandidateApplicationModel.status.in_(APPLICATION_ACTIVE_STATUSES),
            )
            .order_by(CandidateApplicationModel.updated_at.desc())
        )

    async def _add_inbound_message(
        self,
        conversation: ConversationSessionModel,
        *,
        content: str,
        message_type: str,
        interpreted_intent: str,
    ) -> ConversationMessageModel:
        message = ConversationMessageModel(
            session_id=conversation.id,
            direction="inbound",
            content=content,
            message_type=message_type,
            interpreted_intent=interpreted_intent,
            metadata_json=None,
        )
        conversation.last_message_at = datetime.now(UTC)
        return await self._repository.add_message(message)

    async def _add_outbound_message(
        self,
        conversation: ConversationSessionModel,
        prompt: ConversationPrompt,
    ) -> ConversationMessageModel:
        message = ConversationMessageModel(
            session_id=conversation.id,
            direction="outbound",
            content=prompt.content,
            message_type="quick_reply" if prompt.options else "text",
            interpreted_intent=None,
            metadata_json={
                "state": prompt.state,
                "options": [
                    {"value": value, "label": label}
                    for value, label in prompt.options
                ],
            },
        )
        conversation.last_message_at = datetime.now(UTC)
        return await self._repository.add_message(message)

    def _turn_response(
        self,
        conversation: ConversationSessionModel,
        message: ConversationMessageModel,
        prompt: ConversationPrompt,
    ) -> ConversationTurnResponse:
        return ConversationTurnResponse(
            session=self._session_response(conversation),
            message=self._message_response(message),
            options=[
                ConversationOptionResponse(value=value, label=label)
                for value, label in prompt.options
            ],
        )

    def _session_response(
        self,
        conversation: ConversationSessionModel,
    ) -> ConversationSessionResponse:
        return ConversationSessionResponse(
            id=conversation.id,
            channel=conversation.channel,
            current_state=conversation.current_state,
            status=conversation.status,
            context=self._public_context(conversation.context_json or {}),
            last_message_at=conversation.last_message_at,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
        )

    @staticmethod
    def _message_response(message: ConversationMessageModel) -> ConversationMessageResponse:
        return ConversationMessageResponse(
            id=message.id,
            session_id=message.session_id,
            direction=message.direction,
            content=message.content,
            message_type=message.message_type,
            interpreted_intent=message.interpreted_intent,
            metadata=message.metadata_json,
            created_at=message.created_at,
        )

    @staticmethod
    def _merge_context(target: dict[str, Any], updates: dict[str, Any]) -> None:
        for key, value in updates.items():
            if key == "candidate_id":
                target["candidate_id"] = str(value)
                continue
            if key == "application_id":
                target["application_id"] = str(value)
                continue
            if isinstance(value, dict) and isinstance(target.get(key), dict):
                ConversationService._merge_context(target[key], value)
            else:
                target[key] = value

    @staticmethod
    def _public_context(context: dict[str, Any]) -> dict[str, Any]:
        identity = context.get("identity")
        application_lookup = context.get("application_lookup")
        return {
            "identified": bool(isinstance(identity, dict) and identity.get("provided")),
            "candidate_found": bool(
                isinstance(identity, dict) and identity.get("candidate_found")
            ),
            "active_application_found": bool(
                isinstance(application_lookup, dict)
                and application_lookup.get("active_application_found")
            ),
            "answers": context.get("answers", {}),
        }

    @staticmethod
    def _sanitize_message_content(content: str) -> str:
        return SENSITIVE_DIGIT_SEQUENCE.sub("[identificacao protegida]", content)

    @staticmethod
    def _digits(value: str) -> str:
        return re.sub(r"\D", "", value)

    @staticmethod
    def _hash_value(value: str) -> str:
        return sha256(value.encode("utf-8")).hexdigest()

    @staticmethod
    def _is_any_choice(value: str) -> bool:
        return any(term in value for term in ("qualquer", "indiferente", "tanto faz", "any"))

    @staticmethod
    def _is_skip_choice(value: str) -> bool:
        return any(term in value for term in ("sem", "pular", "depois", "skip"))

    @staticmethod
    def _is_review_choice(value: str) -> bool:
        return any(term in value for term in ("revis", "alter", "corrig"))

    @staticmethod
    def _normalized_digits_expression(
        column: sa.ColumnElement[str | None],
    ) -> sa.ColumnElement[str]:
        expression = sa.func.coalesce(column, "")
        for char in (" ", ".", "-", "(", ")", "+"):
            expression = sa.func.replace(expression, char, "")
        return expression
