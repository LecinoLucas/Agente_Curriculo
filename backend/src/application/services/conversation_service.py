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
    CandidateApplicationModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.conversation_model import (
    ConversationMessageModel,
    ConversationSessionModel,
)
from src.infrastructure.database.models.operational_master_model import (
    LocationGroupModel,
    OperationalUnitModel,
)
from src.infrastructure.repositories.sqlalchemy_candidate_application_repository import (
    SQLAlchemyCandidateApplicationRepository,
)
from src.infrastructure.repositories.sqlalchemy_conversation_repository import (
    SQLAlchemyConversationRepository,
)
from src.interface.api.schemas.conversation_schemas import (
    ConversationCreateRequest,
    ConversationMessageCreateRequest,
    ConversationMessageResponse,
    ConversationQuickReplyResponse,
    ConversationSessionResponse,
    ConversationTurnResponse,
)

# Context keys that signal the candidate has started providing real intake data.
# The CandidateApplication is only created once at least one is present, so a bare
# IDENTIFY step (no candidate data yet) never produces an application.
_APPLICATION_TRIGGER_KEYS = (
    "location_hint",
    "preference",
    "desired_function",
    "desired_shift",
)

# IDENTIFY transition copy. Success and not-found are intentionally near-identical
# so an attacker cannot tell from the reply whether a CPF/WhatsApp exists.
_IDENTIFY_SUCCESS_MESSAGE = (
    "Certo, vamos continuar. Agora me diga em qual cidade ou localidade "
    "você quer trabalhar."
)
_IDENTIFY_NOT_FOUND_MESSAGE = (
    "Tudo bem, vamos continuar. Agora me diga em qual cidade ou localidade "
    "você quer trabalhar."
)
_IDENTIFY_INVALID_MESSAGE = (
    "Não consegui entender. Digite seu CPF ou WhatsApp com DDD para continuar."
)


@dataclass(frozen=True)
class _ApplicationSync:
    """A CandidateApplication projection derived from the conversation context."""

    preferred_location_group_id: UUID | None
    preferred_unit_id: UUID | None
    accepts_any_unit_in_location: bool
    desired_job_area: str | None
    desired_shift: str | None
    status: str


class ConversationService:
    def __init__(
        self,
        repository: SQLAlchemyConversationRepository,
        session: AsyncSession,
        application_repository: SQLAlchemyCandidateApplicationRepository,
    ):
        self._repository = repository
        self._session = session
        self._application_repository = application_repository

    async def create_session(self, body: ConversationCreateRequest) -> ConversationTurnResponse:
        now = datetime.now(UTC)
        if body.candidate_id is not None:
            await self._ensure_candidate_exists(body.candidate_id)
        prompt = first_prompt()
        conversation = ConversationSessionModel(
            candidate_id=body.candidate_id,
            channel=body.channel,
            current_state=prompt.state,
            status="active",
            context_json={},
            last_message_at=now,
            created_at=now,
            updated_at=now,
        )
        conversation = await self._repository.create_session(conversation)
        message = await self._add_assistant_message(conversation, prompt)
        return self._turn_response(conversation, message, prompt)

    async def get_session(self, session_id: UUID) -> ConversationSessionResponse:
        conversation = await self._get_session(session_id)
        return self._session_response(conversation)

    async def receive_message(
        self,
        session_id: UUID,
        body: ConversationMessageCreateRequest,
    ) -> ConversationTurnResponse:
        conversation = await self._get_session(session_id)
        if conversation.status != "active":
            raise ValidationException("Sessão de conversa não está ativa.")

        content = body.content.strip()
        await self._add_candidate_message(
            conversation,
            content=content,
            message_type=body.message_type,
        )

        context = dict(conversation.context_json or {})

        if conversation.current_state == "IDENTIFY":
            # Secure identification step. Resolves (or not) a candidate_id and only
            # advances when a minimally valid identifier is provided. Stays in
            # IDENTIFY on invalid input so the chat never gets stuck.
            prompt = await self._handle_identify(conversation, context, content)
        else:
            self._merge_context(context, self._state_update(conversation.current_state, content))
            conversation.current_state = next_state(conversation.current_state)
            prompt = prompt_for(conversation.current_state, context)

        conversation.context_json = context
        if conversation.current_state == "DONE":
            conversation.status = "completed"
        conversation.updated_at = datetime.now(UTC)

        # Project the collected context onto a CandidateApplication. This never
        # creates a pipeline and never runs before a secure candidate is known.
        await self._sync_application(conversation)

        message = await self._add_assistant_message(conversation, prompt)
        await self._repository.update_session(conversation)
        return self._turn_response(conversation, message, prompt)

    async def list_messages(self, session_id: UUID) -> list[ConversationMessageResponse]:
        await self._get_session(session_id)
        messages = await self._repository.list_messages(session_id)
        return [self._message_response(message) for message in messages]

    async def _get_session(self, session_id: UUID) -> ConversationSessionModel:
        conversation = await self._repository.get_session(session_id)
        if conversation is None:
            raise NotFoundException("Sessão de conversa não encontrada.")
        return conversation

    async def _ensure_candidate_exists(self, candidate_id: UUID) -> None:
        candidate = await self._session.scalar(
            sa.select(CandidateModel).where(
                CandidateModel.id == candidate_id,
                CandidateModel.deleted_at.is_(None),
            )
        )
        if candidate is None:
            raise NotFoundException("Candidato não encontrado.")

    # ------------------------------------------------------------------
    # Secure candidate identification (IDENTIFY state)
    #
    # Resolves a candidate_id from a CPF or WhatsApp without ever storing the raw
    # CPF/phone, without authenticating the candidate, and without revealing
    # whether the identifier exists (success and not-found replies are alike).
    # ------------------------------------------------------------------
    async def _handle_identify(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        content: str,
    ) -> ConversationPrompt:
        # Identity already known (e.g. candidate_id passed at session creation):
        # the IDENTIFY question is moot, advance on any non-empty input.
        if conversation.candidate_id is not None:
            context.setdefault("identifier_type", "preset")
            conversation.current_state = "CHOOSE_LOCATION"
            return ConversationPrompt(
                state="CHOOSE_LOCATION",
                content=_IDENTIFY_SUCCESS_MESSAGE,
            )

        classification = self._classify_identifier(content)
        if classification is None:
            # Invalid/confusing input → stay in IDENTIFY and re-ask simply.
            base = prompt_for("IDENTIFY")
            return ConversationPrompt(
                state="IDENTIFY",
                content=_IDENTIFY_INVALID_MESSAGE,
                quick_replies=base.quick_replies,
            )

        identifier_type, normalized, last4 = classification
        candidate_id = await self._resolve_candidate_id(identifier_type, normalized)

        # Only non-sensitive markers ever reach context_json. Never the raw CPF.
        context["identifier_type"] = identifier_type
        if identifier_type == "cpf":
            context["cpf_last4"] = last4

        conversation.current_state = "CHOOSE_LOCATION"
        if candidate_id is not None:
            conversation.candidate_id = candidate_id
            context.pop("identifier_unresolved", None)
            return ConversationPrompt(
                state="CHOOSE_LOCATION",
                content=_IDENTIFY_SUCCESS_MESSAGE,
            )
        context["identifier_unresolved"] = True
        return ConversationPrompt(
            state="CHOOSE_LOCATION",
            content=_IDENTIFY_NOT_FOUND_MESSAGE,
        )

    def _classify_identifier(self, content: str) -> tuple[str, str, str] | None:
        """Return (identifier_type, normalized_value, last4) or None when invalid.

        identifier_type is "cpf" or "whatsapp". The normalized value is digits only;
        for WhatsApp a Brazilian country code (55) prefix is dropped. CPF is detected
        by punctuation or by a valid mod-11 check digit, so we never have to probe
        the database to guess the type.
        """
        digits = re.sub(r"\D", "", content)
        if not digits:
            return None

        phone_digits = digits
        if len(phone_digits) > 11 and phone_digits.startswith("55"):
            phone_digits = phone_digits[2:]

        looks_like_cpf = bool(re.fullmatch(r"\s*\d{3}\.\d{3}\.\d{3}-\d{2}\s*", content))
        looks_like_phone = content.strip().startswith("+") or "(" in content

        if (looks_like_cpf or self._is_valid_cpf(digits)) and not looks_like_phone:
            return "cpf", digits, digits[-4:]
        if 10 <= len(phone_digits) <= 11:
            return "whatsapp", phone_digits, phone_digits[-4:]
        return None

    async def _resolve_candidate_id(self, identifier_type: str, normalized: str) -> UUID | None:
        if identifier_type == "cpf":
            return await self._resolve_candidate_id_by_cpf(normalized)
        return await self._resolve_candidate_id_by_phone(normalized)

    async def _resolve_candidate_id_by_cpf(self, digits: str) -> UUID | None:
        # Primary lookup is by cpf_hash (never compares the raw CPF). Existing rows
        # may only have the plaintext `cpf` column populated, so a normalized-digits
        # equality is kept as a compatibility fallback.
        cpf_hash = self._hash_cpf(digits)
        candidate_id = await self._session.scalar(
            sa.select(CandidateModel.id).where(
                CandidateModel.cpf_hash == cpf_hash,
                CandidateModel.deleted_at.is_(None),
            )
        )
        if candidate_id is not None:
            return candidate_id
        return await self._session.scalar(
            sa.select(CandidateModel.id).where(
                CandidateModel.cpf == digits,
                CandidateModel.deleted_at.is_(None),
            )
        )

    async def _resolve_candidate_id_by_phone(self, phone_digits: str) -> UUID | None:
        return await self._session.scalar(
            sa.select(CandidateModel.id).where(
                CandidateModel.phone == phone_digits,
                CandidateModel.deleted_at.is_(None),
            )
        )

    @staticmethod
    def _hash_cpf(digits: str) -> str:
        return sha256(digits.encode("utf-8")).hexdigest()

    @staticmethod
    def _is_valid_cpf(digits: str) -> bool:
        if len(digits) != 11 or digits == digits[0] * 11:
            return False

        def check_digit(slice_: str, factor: int) -> int:
            total = sum(
                int(d) * f for d, f in zip(slice_, range(factor, 1, -1), strict=False)
            )
            remainder = (total * 10) % 11
            return 0 if remainder == 10 else remainder

        return (
            check_digit(digits[:9], 10) == int(digits[9])
            and check_digit(digits[:10], 11) == int(digits[10])
        )

    # ------------------------------------------------------------------
    # CandidateApplication integration
    #
    # The conversation owns no pipeline logic. It only projects the collected
    # context onto a single CandidateApplication, idempotently linked through
    # conversation_sessions.application_id. CPF is never stored here.
    # ------------------------------------------------------------------
    async def _sync_application(self, conversation: ConversationSessionModel) -> None:
        # No secure candidate yet → defer (IDENTIFY does not create applications).
        if conversation.candidate_id is None:
            return

        context = conversation.context_json or {}
        already_linked = conversation.application_id is not None
        if not already_linked and not self._should_have_application(context):
            return

        fields = await self._derive_application_sync(conversation)

        if not already_linked:
            application = CandidateApplicationModel(
                candidate_id=conversation.candidate_id,
                job_id=None,  # the chat never selects a job → no pipeline coupling
                source=self._application_source(conversation.channel),
                status=fields.status,
                preferred_location_group_id=fields.preferred_location_group_id,
                preferred_unit_id=fields.preferred_unit_id,
                accepts_any_unit_in_location=fields.accepts_any_unit_in_location,
                desired_job_area=fields.desired_job_area,
                desired_shift=fields.desired_shift,
            )
            application = await self._application_repository.create_application(application)
            conversation.application_id = application.id
            return

        application = await self._application_repository.get_application(
            conversation.application_id
        )
        if application is None:
            # Linked application was removed — relink lazily on the next turn.
            conversation.application_id = None
            return
        application.status = fields.status
        application.preferred_location_group_id = fields.preferred_location_group_id
        application.preferred_unit_id = fields.preferred_unit_id
        application.accepts_any_unit_in_location = fields.accepts_any_unit_in_location
        application.desired_job_area = fields.desired_job_area
        application.desired_shift = fields.desired_shift
        application.updated_at = datetime.now(UTC)
        await self._application_repository.update_application(application)

    async def _derive_application_sync(
        self,
        conversation: ConversationSessionModel,
    ) -> _ApplicationSync:
        context = conversation.context_json or {}

        location = await self._resolve_location_group(context.get("location_hint"))
        preferred_location_group_id = location.id if location is not None else None

        preference = context.get("preference")
        accepts_any = False
        preferred_unit_id: UUID | None = None
        if preference == "any_in_location":
            accepts_any = preferred_location_group_id is not None
        elif isinstance(preference, str) and preference not in {"", "choose_unit"}:
            unit = await self._resolve_unit(preference, preferred_location_group_id)
            if unit is not None:
                preferred_unit_id = unit.id
                if preferred_location_group_id is None:
                    preferred_location_group_id = unit.location_group_id

        # Enforce the DB invariant: "any unit" means a location and no specific unit.
        if accepts_any:
            preferred_unit_id = None

        status = "submitted" if context.get("confirmation") == "confirm" else "started"

        return _ApplicationSync(
            preferred_location_group_id=preferred_location_group_id,
            preferred_unit_id=preferred_unit_id,
            accepts_any_unit_in_location=accepts_any,
            desired_job_area=self._clean_text(context.get("desired_function")),
            desired_shift=self._clean_text(context.get("desired_shift")),
            status=status,
        )

    async def _resolve_location_group(self, hint: Any) -> LocationGroupModel | None:
        normalized = self._normalize(hint)
        if normalized is None:
            return None
        return await self._session.scalar(
            sa.select(LocationGroupModel).where(
                LocationGroupModel.normalized_name == normalized,
                LocationGroupModel.is_active.is_(True),
            )
        )

    async def _resolve_unit(
        self,
        hint: Any,
        location_group_id: UUID | None,
    ) -> OperationalUnitModel | None:
        normalized = self._normalize(hint)
        if normalized is None:
            return None
        stmt = sa.select(OperationalUnitModel).where(
            OperationalUnitModel.normalized_name == normalized,
            OperationalUnitModel.is_active.is_(True),
        )
        if location_group_id is not None:
            stmt = stmt.where(OperationalUnitModel.location_group_id == location_group_id)
        return await self._session.scalar(stmt)

    @staticmethod
    def _should_have_application(context: dict[str, Any]) -> bool:
        return any(context.get(key) for key in _APPLICATION_TRIGGER_KEYS)

    @staticmethod
    def _application_source(channel: str) -> str:
        # Conversation-engine intakes are marked as bot-sourced (or whatsapp), which
        # keeps them distinguishable from the plain web form ("web_portal").
        return "whatsapp" if channel == "whatsapp" else "bot"

    @staticmethod
    def _normalize(value: Any) -> str | None:
        if not isinstance(value, str):
            return None
        normalized = value.strip().casefold()
        return normalized or None

    @staticmethod
    def _clean_text(value: Any) -> str | None:
        if not isinstance(value, str):
            return None
        cleaned = value.strip()
        return cleaned or None

    @staticmethod
    def _state_update(current_state: str, content: str) -> dict[str, Any]:
        # IDENTIFY is handled by _handle_identify (secure identification) and never
        # routes through here, so the raw identifier is never stored in context.
        if current_state == "CHOOSE_LOCATION":
            return {"location_hint": content}
        if current_state == "CHOOSE_UNIT_OR_ANY":
            return {"preference": ConversationService._unit_preference(content)}
        if current_state == "CHOOSE_FUNCTION":
            return {"desired_function": content}
        if current_state == "CHOOSE_SHIFT":
            return {"desired_shift": content}
        if current_state == "SHOW_JOBS":
            return {"show_jobs_ack": content}
        if current_state == "COLLECT_RESUME":
            return {"resume_choice": content}
        if current_state == "CONFIRM_APPLICATION":
            return {"confirmation": content}
        return {}

    @staticmethod
    def _unit_preference(content: str) -> str:
        normalized = content.strip().casefold()
        if normalized in {"any_in_location", "qualquer", "qualquer posto", "any"}:
            return "any_in_location"
        if normalized in {"choose_unit", "escolher", "escolher posto", "specific"}:
            return "choose_unit"
        return content

    async def _add_candidate_message(
        self,
        conversation: ConversationSessionModel,
        *,
        content: str,
        message_type: str,
    ) -> ConversationMessageModel:
        message = ConversationMessageModel(
            session_id=conversation.id,
            role="candidate",
            content=content,
            message_type=message_type,
            interpreted_intent=None,
            metadata_json=None,
        )
        conversation.last_message_at = datetime.now(UTC)
        return await self._repository.add_message(message)

    async def _add_assistant_message(
        self,
        conversation: ConversationSessionModel,
        prompt: ConversationPrompt,
    ) -> ConversationMessageModel:
        message = ConversationMessageModel(
            session_id=conversation.id,
            role="assistant",
            content=prompt.content,
            message_type="quick_reply" if prompt.quick_replies else "text",
            interpreted_intent=None,
            metadata_json={
                "state": prompt.state,
                "quick_replies": self._quick_replies_dicts(prompt),
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
        quick_replies = self._quick_replies(prompt)
        return ConversationTurnResponse(
            session_id=conversation.id,
            current_state=conversation.current_state,
            assistant_message=message.content,
            quick_replies=quick_replies,
            session=self._session_response(conversation, prompt),
            message=self._message_response(message),
            options=quick_replies,
        )

    def _session_response(
        self,
        conversation: ConversationSessionModel,
        prompt: ConversationPrompt | None = None,
    ) -> ConversationSessionResponse:
        current_prompt = prompt or prompt_for(
            conversation.current_state,
            conversation.context_json or {},
        )
        return ConversationSessionResponse(
            id=conversation.id,
            session_id=conversation.id,
            channel=conversation.channel,
            current_state=conversation.current_state,
            status=conversation.status,
            context=conversation.context_json or {},
            assistant_message=current_prompt.content,
            quick_replies=self._quick_replies(current_prompt),
            last_message_at=conversation.last_message_at,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
        )

    @staticmethod
    def _message_response(message: ConversationMessageModel) -> ConversationMessageResponse:
        return ConversationMessageResponse(
            id=message.id,
            session_id=message.session_id,
            role=message.role,
            direction=ConversationService._direction_for_role(message.role),
            content=message.content,
            message_type=message.message_type,
            interpreted_intent=message.interpreted_intent,
            metadata=message.metadata_json,
            created_at=message.created_at,
        )

    @staticmethod
    def _quick_replies(prompt: ConversationPrompt) -> list[ConversationQuickReplyResponse]:
        return [
            ConversationQuickReplyResponse(value=value, label=label)
            for value, label in prompt.quick_replies
        ]

    @staticmethod
    def _quick_replies_dicts(prompt: ConversationPrompt) -> list[dict[str, str]]:
        return [
            {"value": value, "label": label}
            for value, label in prompt.quick_replies
        ]

    @staticmethod
    def _direction_for_role(role: str) -> str:
        if role == "candidate":
            return "inbound"
        if role == "assistant":
            return "outbound"
        return "system"

    @staticmethod
    def _merge_context(target: dict[str, Any], updates: dict[str, Any]) -> None:
        for key, value in updates.items():
            target[key] = value
