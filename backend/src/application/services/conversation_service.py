import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.admin_assistant_failure_service import AssistantFailureRecorder
from src.application.services.admin_assistant_service import sanitise_assistant_text
from src.application.services.assistant_content_provider import AssistantContentProvider
from src.application.services.conversation_otp_service import ConversationOtpService
from src.application.services.conversation_state_machine import (
    ConversationPrompt,
    first_prompt,
    next_state,
    prompt_for,
)
from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.database.models.assistant_failure_model import AssistantFailureModel
from src.infrastructure.database.models.candidate_application_model import (
    APPLICATION_ACTIVE_STATUSES,
    CandidateApplicationModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.conversation_model import (
    ConversationMessageModel,
    ConversationSessionModel,
)
from src.infrastructure.database.models.job_model import JobModel
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
from src.infrastructure.security.cpf_identity import derive_cpf_identity
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
_FAILURE_ATTEMPT_LIMIT = 3
_APPLICATION_TRIGGER_KEYS = (
    "location_hint",
    "preference",
    "desired_function",
    "desired_shift",
)

# IDENTIFY transition copy. Success and not-found are intentionally identical so
# an attacker cannot tell from the reply whether a CPF/WhatsApp exists.
_IDENTIFY_SUCCESS_PREFIX = "Certo. "
_IDENTIFY_INVALID_MESSAGE = (
    "Não consegui entender. Digite seu CPF ou WhatsApp com DDD para continuar."
)
_RESUME_SESSION_MESSAGE = (
    "Encontrei uma conversa em andamento. Vamos continuar de onde você parou."
)
_RESUME_APPLICATION_SUBMITTED_MESSAGE = (
    "Sua candidatura já foi enviada para análise do RH. Se precisar atualizar "
    "alguma informação, o RH entrará em contato."
)
_RESUME_APPLICATION_LINKED_MESSAGE = "Sua candidatura já está em análise pelo RH."
_INVALID_LOCATION_MESSAGE = (
    "Não encontrei essa localidade. Digite o nome da cidade ou localidade novamente."
)
_INVALID_UNIT_MESSAGE = (
    "Não consegui identificar esse posto. Você pode escolher qualquer posto da localidade "
    "ou digitar o nome do posto novamente."
)
_INVALID_FUNCTION_MESSAGE = "Não consegui entender a função desejada. Digite o nome da função."
_INVALID_SHIFT_MESSAGE = "Não consegui entender o turno. Escolha uma das opções disponíveis."
_COLLECT_LEAD_NAME_MESSAGE = "Para continuar sua candidatura, me diga seu nome completo."
_COLLECT_LEAD_WHATSAPP_MESSAGE = (
    "Agora me informe seu WhatsApp com DDD para o RH poder falar com você."
)
_COLLECT_LGPD_MESSAGE = (
    "Você autoriza o uso dos seus dados para participar do processo seletivo?"
)
_LGPD_REJECTED_MESSAGE = (
    "Tudo bem. Sem essa autorização, não consigo continuar sua candidatura por aqui."
)
_INVALID_NAME_MESSAGE = "Por favor, informe seu nome completo (nome e sobrenome)."
_INVALID_WHATSAPP_MESSAGE = (
    "Não consegui identificar o número. "
    "Digite seu WhatsApp com DDD (10 ou 11 dígitos)."
)
_SAFE_RESUME_CONTEXT_KEYS = frozenset(
    {
        "location_hint",
        "preference",
        "desired_function",
        "desired_shift",
        "show_jobs_ack",
        "resume_choice",
    }
)
# States that are unsafe to resume into: the conversation restarts from CHOOSE_LOCATION.
# Lead-collection states are always unsafe (partially-collected data must not be resumed).
_UNSAFE_RESUME_STATES = {
    "IDENTIFY",
    "VERIFY_OTP",
    "COLLECT_LEAD_NAME",
    "COLLECT_LEAD_WHATSAPP",
    "COLLECT_LGPD_CONSENT",
    "DONE",
}


@dataclass(frozen=True)
class _ApplicationSync:
    """A CandidateApplication projection derived from the conversation context."""

    preferred_location_group_id: UUID | None
    preferred_unit_id: UUID | None
    accepts_any_unit_in_location: bool
    desired_job_area: str | None
    desired_shift: str | None
    status: str


@dataclass(frozen=True)
class _ApplicationResumeDecision:
    state: str
    content: str
    quick_replies: tuple[tuple[str, str], ...] = ()


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
        self._otp_service = ConversationOtpService(session)
        self._failure_recorder = AssistantFailureRecorder(session)
        self._content_provider = AssistantContentProvider(session)

    async def _prompt_for(
        self,
        state: str,
        context: dict[str, Any] | None = None,
    ) -> ConversationPrompt:
        """Thin async wrapper: tries DB content then falls back to hardcoded."""
        return await self._content_provider.prompt_for_state(state, context or {})

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
        prompt = await self._prompt_for(
            conversation.current_state,
            conversation.context_json or {},
        )
        return self._session_response(conversation, prompt)

    async def receive_message(
        self,
        session_id: UUID,
        body: ConversationMessageCreateRequest,
    ) -> ConversationTurnResponse:
        conversation = await self._get_session(session_id)
        if conversation.status != "active":
            raise ValidationException("Sessão de conversa não está ativa.")

        content = body.content.strip()
        candidate_message = await self._add_candidate_message(
            conversation,
            content=content,
            message_type=body.message_type,
        )

        context = dict(conversation.context_json or {})

        if conversation.current_state == "IDENTIFY":
            # Lead-mode identification step. Resolves (or not) a candidate_id
            # silently, stores only safe markers, and advances without OTP.
            prompt = await self._handle_identify(
                conversation,
                context,
                content,
                candidate_message,
            )
        elif conversation.current_state == "VERIFY_OTP":
            # OTP verification step. Confirms identity before advancing.
            prompt = await self._handle_verify_otp(
                conversation,
                context,
                content,
                candidate_message,
            )
        elif conversation.current_state == "COLLECT_LEAD_NAME":
            prompt = self._handle_collect_lead_name(conversation, context, content)
        elif conversation.current_state == "COLLECT_LEAD_WHATSAPP":
            prompt = self._handle_collect_lead_whatsapp(conversation, context, content)
        elif conversation.current_state == "COLLECT_LGPD_CONSENT":
            prompt = self._handle_collect_lgpd_consent(conversation, context, content)
        else:
            invalid_prompt = await self._invalid_prompt_if_needed(
                conversation,
                context,
                content,
                candidate_message,
            )
            if invalid_prompt is not None:
                prompt = invalid_prompt
            elif conversation.current_state == "CONFIRM_APPLICATION":
                prompt = await self._handle_confirm_application(
                    conversation,
                    context,
                    content,
                )
            elif conversation.current_state == "COLLECT_RESUME" and self._is_unresolved_lead(
                conversation, context
            ):
                # Unresolved lead: collect name/WhatsApp/consent before confirming.
                self._merge_context(
                    context,
                    self._state_update("COLLECT_RESUME", content),
                )
                conversation.current_state = "COLLECT_LEAD_NAME"
                prompt = prompt_for("COLLECT_LEAD_NAME", context)  # lead state: hardcoded
            else:
                self._merge_context(
                    context,
                    self._state_update(conversation.current_state, content),
                )
                conversation.current_state = next_state(conversation.current_state)
                prompt = await self._prompt_for(conversation.current_state, context)

        conversation.context_json = context
        if conversation.current_state == "DONE" and conversation.status == "active":
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
    # whether the identifier exists. OTP is delayed until a later committing step.
    # ------------------------------------------------------------------
    async def _handle_identify(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        content: str,
        candidate_message: ConversationMessageModel,
    ) -> ConversationPrompt:
        # Identity already known (e.g. candidate_id passed at session creation):
        # the IDENTIFY question is moot, advance on any non-empty input.
        if conversation.candidate_id is not None:
            context.setdefault("identifier_type", "preset")
            conversation.current_state = "CHOOSE_LOCATION"
            return await self._identify_success_prompt(context)

        classification = self._classify_identifier(content)
        if classification is None:
            # Invalid/confusing input → stay in IDENTIFY and re-ask simply.
            await self._record_failure(
                conversation,
                candidate_message,
                state="IDENTIFY",
                raw_message=content,
                reason="invalid_identity_input",
                classification="identity",
                attempts_count=await self._next_attempt_count(conversation.id, "IDENTIFY"),
            )
            base = prompt_for("IDENTIFY")
            return ConversationPrompt(
                state="IDENTIFY",
                content=_IDENTIFY_INVALID_MESSAGE,
                quick_replies=base.quick_replies,
            )

        identifier_type, normalized, last4 = classification
        # Resolve silently. The public response below is identical whether a
        # candidate was found or not (anti-enumeration).
        candidate_id = await self._resolve_candidate_id(identifier_type, normalized)

        # Store only non-sensitive markers. Never the raw CPF/phone.
        context["identifier_type"] = identifier_type
        context["identity_verified"] = False
        context["lead_mode"] = True
        if identifier_type == "cpf":
            context["cpf_last4"] = last4
            context.pop("whatsapp_last4", None)
        if identifier_type == "whatsapp":
            context["whatsapp_last4"] = last4
            context.pop("cpf_last4", None)
        if candidate_id is None:
            context["identifier_unresolved"] = True
            context.pop("pending_candidate_id", None)
            context.pop("possible_candidate_id", None)
            context.pop("pending_application_id", None)
            context.pop("pending_application_status", None)
            context.pop("resumed_application_id", None)
            context.pop("application_in_progress", None)
            # For WhatsApp leads: store normalized digits as an internal key so
            # we can issue OTP and create the Candidate later without re-asking.
            # This key is stripped from public API responses (_public_context).
            if identifier_type == "whatsapp":
                context["lead_whatsapp"] = normalized
        else:
            context.pop("identifier_unresolved", None)
            context["pending_candidate_id"] = str(candidate_id)
            context["possible_candidate_id"] = str(candidate_id)
            resume_prompt = await self._resume_prompt_if_available(
                conversation,
                context,
                candidate_id,
            )
            if resume_prompt is not None:
                return resume_prompt

        conversation.current_state = "CHOOSE_LOCATION"
        return await self._identify_success_prompt(context)

    async def _identify_success_prompt(self, context: dict[str, Any]) -> ConversationPrompt:
        prompt = await self._prompt_for("CHOOSE_LOCATION", context)
        return ConversationPrompt(
            state="CHOOSE_LOCATION",
            content=f"{_IDENTIFY_SUCCESS_PREFIX}{prompt.content}",
            quick_replies=prompt.quick_replies,
        )

    async def _resume_prompt_if_available(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        candidate_id: UUID,
    ) -> ConversationPrompt | None:
        resume_session = await self._find_resume_session(candidate_id, conversation.id)
        if resume_session is not None:
            self._merge_context(context, self._safe_resume_context(resume_session.context_json))
            context["resumed_from_session_id"] = str(resume_session.id)
            if resume_session.application_id is not None:
                context["pending_application_id"] = str(resume_session.application_id)
            state = self._safe_resume_state(resume_session.current_state)
            conversation.current_state = state
            base = await self._prompt_for(state, context)
            return ConversationPrompt(
                state=state,  # type: ignore[arg-type]
                content=_RESUME_SESSION_MESSAGE,
                quick_replies=base.quick_replies,
            )

        application = await self._find_active_application(candidate_id)
        if application is not None:
            context["pending_application_id"] = str(application.id)
            context["pending_application_status"] = application.status
            context["resumed_application_id"] = str(application.id)
            context["application_in_progress"] = True
            decision = await self._resume_decision_for_application(application, context)
            conversation.current_state = decision.state
            return ConversationPrompt(
                state=decision.state,  # type: ignore[arg-type]
                content=decision.content,
                quick_replies=decision.quick_replies,
            )

        return None

    async def _resume_decision_for_application(
        self,
        application: CandidateApplicationModel,
        context: dict[str, Any],
    ) -> _ApplicationResumeDecision:
        if application.status == "submitted":
            return _ApplicationResumeDecision(
                state="DONE",
                content=_RESUME_APPLICATION_SUBMITTED_MESSAGE,
            )

        if application.status == "linked_to_pipeline":
            await self._find_active_pipeline_for_application(application.id)
            return _ApplicationResumeDecision(
                state="DONE",
                content=_RESUME_APPLICATION_LINKED_MESSAGE,
            )

        await self._hydrate_context_from_application(application, context)
        state = await self._next_application_resume_state(application)
        prompt = await self._prompt_for(state, context)
        return _ApplicationResumeDecision(
            state=state,
            content=self._resume_application_content(prompt.content),
            quick_replies=prompt.quick_replies,
        )

    async def _find_active_pipeline_for_application(
        self,
        application_id: UUID,
    ) -> CandidateJobPipelineModel | None:
        return await self._session.scalar(
            sa.select(CandidateJobPipelineModel)
            .where(
                CandidateJobPipelineModel.application_id == application_id,
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
            .limit(1)
        )

    async def _hydrate_context_from_application(
        self,
        application: CandidateApplicationModel,
        context: dict[str, Any],
    ) -> None:
        location_id = await self._application_resume_location_id(application)
        if location_id is not None and not context.get("location_hint"):
            location_name = await self._location_name(location_id)
            if location_name:
                context["location_hint"] = location_name

        if application.accepts_any_unit_in_location:
            context.setdefault("preference", "any_in_location")
        elif application.preferred_unit_id is not None and not context.get("preference"):
            unit_name = await self._unit_name(application.preferred_unit_id)
            if unit_name:
                context["preference"] = unit_name

        if application.desired_job_area:
            context.setdefault("desired_function", application.desired_job_area)
        if application.desired_shift:
            context.setdefault("desired_shift", application.desired_shift)

    async def _next_application_resume_state(
        self,
        application: CandidateApplicationModel,
    ) -> str:
        has_job_context = application.job_id is not None
        has_location = await self._application_resume_location_id(application) is not None
        has_unit_preference = (
            application.accepts_any_unit_in_location
            or application.preferred_unit_id is not None
            or has_job_context
        )

        if not has_location and not has_job_context:
            return "CHOOSE_LOCATION"
        if not has_unit_preference:
            return "CHOOSE_UNIT_OR_ANY"
        if not self._clean_text(application.desired_job_area):
            return "CHOOSE_FUNCTION"
        if not self._clean_text(application.desired_shift):
            return "CHOOSE_SHIFT"
        return "CONFIRM_APPLICATION"

    async def _application_resume_location_id(
        self,
        application: CandidateApplicationModel,
    ) -> UUID | None:
        if application.preferred_location_group_id is not None:
            return application.preferred_location_group_id
        if application.preferred_unit_id is not None:
            return await self._session.scalar(
                sa.select(OperationalUnitModel.location_group_id).where(
                    OperationalUnitModel.id == application.preferred_unit_id,
                    OperationalUnitModel.is_active.is_(True),
                )
            )
        if application.job_id is None:
            return None
        return await self._session.scalar(
            sa.select(JobModel.location_group_id).where(
                JobModel.id == application.job_id,
                JobModel.deleted_at.is_(None),
            )
        )

    async def _location_name(self, location_id: UUID) -> str | None:
        return await self._session.scalar(
            sa.select(LocationGroupModel.name).where(
                LocationGroupModel.id == location_id,
                LocationGroupModel.is_active.is_(True),
            )
        )

    async def _unit_name(self, unit_id: UUID) -> str | None:
        return await self._session.scalar(
            sa.select(OperationalUnitModel.name).where(
                OperationalUnitModel.id == unit_id,
                OperationalUnitModel.is_active.is_(True),
            )
        )

    @staticmethod
    def _resume_application_content(prompt_content: str) -> str:
        return f"Você já tem uma candidatura em andamento. {prompt_content}"

    async def _find_resume_session(
        self,
        candidate_id: UUID,
        current_session_id: UUID,
    ) -> ConversationSessionModel | None:
        return await self._session.scalar(
            sa.select(ConversationSessionModel)
            .where(
                ConversationSessionModel.candidate_id == candidate_id,
                ConversationSessionModel.id != current_session_id,
                ConversationSessionModel.status == "active",
                ConversationSessionModel.deleted_at.is_(None),
            )
            .order_by(
                ConversationSessionModel.last_message_at.desc(),
                ConversationSessionModel.updated_at.desc(),
            )
            .limit(1)
        )

    async def _find_active_application(
        self,
        candidate_id: UUID,
    ) -> CandidateApplicationModel | None:
        return await self._session.scalar(
            sa.select(CandidateApplicationModel)
            .where(
                CandidateApplicationModel.candidate_id == candidate_id,
                CandidateApplicationModel.status.in_(APPLICATION_ACTIVE_STATUSES),
                CandidateApplicationModel.deleted_at.is_(None),
            )
            .order_by(
                CandidateApplicationModel.updated_at.desc(),
                CandidateApplicationModel.created_at.desc(),
            )
            .limit(1)
        )

    @staticmethod
    def _safe_resume_context(context: dict | None) -> dict[str, Any]:
        if not isinstance(context, dict):
            return {}
        return {
            key: value
            for key, value in context.items()
            if key in _SAFE_RESUME_CONTEXT_KEYS and value is not None
        }

    @staticmethod
    def _safe_resume_state(state: str) -> str:
        if state in _UNSAFE_RESUME_STATES:
            return "CHOOSE_LOCATION"
        return state

    async def _handle_confirm_application(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        content: str,
    ) -> ConversationPrompt:
        confirmation = self._normalize(content)
        if confirmation != "confirm":
            self._merge_context(context, self._state_update("CONFIRM_APPLICATION", content))
            conversation.current_state = next_state("CONFIRM_APPLICATION")
            return await self._prompt_for(conversation.current_state, context)

        if conversation.candidate_id is not None or context.get("identity_verified") is True:
            context["confirmation"] = "confirm"
            conversation.current_state = "DONE"
            return await self._prompt_for("DONE", context)

        pending_candidate_id = self._uuid_from_context(context.get("pending_candidate_id"))
        context["pending_confirmation"] = "confirm"
        context["otp_purpose"] = "confirm_application"
        await self._otp_service.issue_otp(
            session_id=conversation.id,
            candidate_id=pending_candidate_id,
            identifier_type=str(context.get("identifier_type") or "cpf"),
        )
        conversation.current_state = "VERIFY_OTP"
        return ConversationPrompt(
            state="VERIFY_OTP",
            content=(
                "Para confirmar suas informações, enviamos um código de verificação. "
                "Digite o código de 6 dígitos para continuar."
            ),
        )

    async def _handle_verify_otp(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        content: str,
        candidate_message: ConversationMessageModel,
    ) -> ConversationPrompt:
        """Verify the candidate-supplied OTP code and advance or stay."""
        result = await self._otp_service.verify_otp(
            session_id=conversation.id,
            code=content,
        )

        if result.outcome == "ok":
            if result.candidate_id is not None:
                conversation.candidate_id = result.candidate_id
            context["identity_verified"] = True
            context.pop("identifier_unresolved", None)
            if context.get("otp_purpose") == "confirm_application":
                context["confirmation"] = str(context.pop("pending_confirmation", "confirm"))
                context.pop("otp_purpose", None)
            context.pop("pending_candidate_id", None)
            context.pop("possible_candidate_id", None)
            context.pop("resumed_from_session_id", None)
            # Lead registration: create Candidate + Application after verified OTP.
            if (
                conversation.candidate_id is None
                and context.get("lead_mode")
                and context.get("lgpd_consent")
                and context.get("lead_name")
            ):
                await self._create_lead_candidate_and_application(conversation, context)
            conversation.current_state = "DONE"
            return await self._prompt_for("DONE", context)

        if result.outcome in ("expired", "no_otp", "already_consumed"):
            await self._record_failure(
                conversation,
                candidate_message,
                state="VERIFY_OTP",
                raw_message="[otp omitido]",
                sanitized_message="[otp omitido]",
                reason=f"otp_{result.outcome}",
                classification="identity",
                attempts_count=result.attempts_remaining,
            )
            # Issue a fresh OTP so the candidate can try again without restarting.
            candidate_id = conversation.candidate_id or self._uuid_from_context(
                context.get("pending_candidate_id")
            )
            identifier_type = context.get("identifier_type", "cpf")
            await self._otp_service.issue_otp(
                session_id=conversation.id,
                candidate_id=candidate_id,
                identifier_type=str(identifier_type),
            )
            return ConversationPrompt(
                state="VERIFY_OTP",
                content=(
                    "O código expirou. Enviamos um novo código. "
                    "Digite o código de 6 dígitos para continuar."
                ),
            )

        if result.outcome == "locked":
            await self._record_failure(
                conversation,
                candidate_message,
                state="VERIFY_OTP",
                raw_message="[otp omitido]",
                sanitized_message="[otp omitido]",
                reason="otp_attempt_limit",
                classification="identity",
                attempts_count=0,
            )
            # Too many attempts: go back to IDENTIFY so the candidate can try a
            # different identifier. This is not a permanent block.
            conversation.current_state = "IDENTIFY"
            context.pop("identifier_type", None)
            context.pop("cpf_last4", None)
            context.pop("whatsapp_last4", None)
            context.pop("identifier_unresolved", None)
            context.pop("pending_candidate_id", None)
            context.pop("possible_candidate_id", None)
            context.pop("pending_application_id", None)
            context.pop("pending_application_status", None)
            context.pop("resumed_from_session_id", None)
            context.pop("resumed_application_id", None)
            context.pop("application_in_progress", None)
            context.pop("pending_confirmation", None)
            context.pop("otp_purpose", None)
            base = prompt_for("IDENTIFY")
            return ConversationPrompt(
                state="IDENTIFY",
                content=(
                    "Muitas tentativas incorretas. Por favor, informe seu CPF ou "
                    "WhatsApp novamente para receber um novo código."
                ),
                quick_replies=base.quick_replies,
            )

        # wrong_code — stay in VERIFY_OTP, inform the candidate how many tries remain.
        remaining = result.attempts_remaining
        await self._record_failure(
            conversation,
            candidate_message,
            state="VERIFY_OTP",
            raw_message="[otp omitido]",
            sanitized_message="[otp omitido]",
            reason="otp_wrong_code",
            classification="identity",
            attempts_count=remaining,
        )
        plural = "tentativa" if remaining == 1 else "tentativas"
        return ConversationPrompt(
            state="VERIFY_OTP",
            content=(
                f"Código incorreto. Você ainda tem {remaining} {plural}. "
                "Digite o código de 6 dígitos para continuar."
            ),
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
        identity = derive_cpf_identity(digits)
        if identity is None:
            return None
        candidate_id = await self._session.scalar(
            sa.select(CandidateModel.id).where(
                CandidateModel.cpf_hash == identity.cpf_hash,
                CandidateModel.deleted_at.is_(None),
            )
        )
        if candidate_id is not None:
            return candidate_id
        return await self._session.scalar(
            sa.select(CandidateModel.id).where(
                self._normalized_digits_expr(CandidateModel.cpf) == identity.digits,
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
    def _normalized_digits_expr(column: sa.ColumnElement[str | None]) -> sa.ColumnElement[str]:
        expr = sa.func.coalesce(column, "")
        for token in (".", "-", "/", "(", ")", " ", "+"):
            expr = sa.func.replace(expr, token, "")
        return expr

    @staticmethod
    def _uuid_from_context(value: Any) -> UUID | None:
        if isinstance(value, UUID):
            return value
        if not isinstance(value, str):
            return None
        try:
            return UUID(value)
        except ValueError:
            return None

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

    @staticmethod
    def _is_continue_intent(content: str) -> bool:
        normalized = ConversationService._normalize(content)
        return normalized in {"vamos", "sim", "continuar", "ok"}

    # ------------------------------------------------------------------
    # Lead-registration helpers (OP-6F.5)
    #
    # These states only activate for sessions where no existing Candidate was
    # found (identifier_unresolved=True). They collect minimal data, verify via
    # OTP, then create a Candidate + CandidateApplication. No pipeline is created.
    # ------------------------------------------------------------------

    @staticmethod
    def _is_unresolved_lead(
        conversation: ConversationSessionModel,
        context: dict[str, Any],
    ) -> bool:
        return (
            conversation.candidate_id is None
            and bool(context.get("lead_mode"))
            and bool(context.get("identifier_unresolved"))
        )

    @staticmethod
    def _is_valid_lead_name(name: str) -> bool:
        stripped = name.strip()
        if len(stripped) < 3:
            return False
        alpha_count = sum(1 for c in stripped if c.isalpha())
        # Must have at least 3 letters; at minimum a first + last initial/name.
        if alpha_count < 3:
            return False
        words = stripped.split()
        return len(words) >= 2

    @staticmethod
    def _normalize_phone_digits(content: str) -> str | None:
        digits = re.sub(r"\D", "", content)
        # Drop Brazilian country code prefix.
        if len(digits) > 11 and digits.startswith("55"):
            digits = digits[2:]
        if 10 <= len(digits) <= 11:
            return digits
        return None

    def _handle_collect_lead_name(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        content: str,
    ) -> ConversationPrompt:
        if not self._is_valid_lead_name(content):
            return ConversationPrompt(
                state="COLLECT_LEAD_NAME",
                content=_INVALID_NAME_MESSAGE,
            )
        context["lead_name"] = content.strip()
        identifier_type = context.get("identifier_type")
        if identifier_type == "whatsapp" and context.get("lead_whatsapp"):
            # WhatsApp already captured at IDENTIFY — skip COLLECT_LEAD_WHATSAPP.
            conversation.current_state = "COLLECT_LGPD_CONSENT"
            return prompt_for("COLLECT_LGPD_CONSENT", context)
        conversation.current_state = "COLLECT_LEAD_WHATSAPP"
        return prompt_for("COLLECT_LEAD_WHATSAPP", context)

    def _handle_collect_lead_whatsapp(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        content: str,
    ) -> ConversationPrompt:
        digits = self._normalize_phone_digits(content)
        if digits is None:
            return ConversationPrompt(
                state="COLLECT_LEAD_WHATSAPP",
                content=_INVALID_WHATSAPP_MESSAGE,
            )
        # Internal key — stripped from public context.
        context["lead_whatsapp"] = digits
        conversation.current_state = "COLLECT_LGPD_CONSENT"
        return prompt_for("COLLECT_LGPD_CONSENT", context)

    def _handle_collect_lgpd_consent(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        content: str,
    ) -> ConversationPrompt:
        normalized = content.strip().casefold()
        if normalized in {"aceito", "sim", "yes", "accept", "ok", "concordo"}:
            context["lgpd_consent"] = True
            conversation.current_state = "CONFIRM_APPLICATION"
            return prompt_for("CONFIRM_APPLICATION", context)
        if normalized in {"nao_aceito", "não aceito", "nao", "não", "no", "recuso"}:
            context["lgpd_consent"] = False
            context.pop("lead_name", None)
            context.pop("lead_whatsapp", None)
            conversation.current_state = "DONE"
            conversation.status = "cancelled"
            return ConversationPrompt(state="DONE", content=_LGPD_REJECTED_MESSAGE)
        # Ambiguous — re-ask with quick replies.
        return prompt_for("COLLECT_LGPD_CONSENT", context)

    async def _create_lead_candidate_and_application(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
    ) -> None:
        """Create a minimal Candidate (and CandidateApplication) for an OTP-verified lead.

        Checks for an existing Candidate by phone before creating to prevent
        duplicates. No pipeline is created. The `lead_name` and `lead_whatsapp`
        keys are removed from context after use.
        """
        lead_name: str = str(context.get("lead_name") or "").strip() or "Lead"
        lead_whatsapp: str | None = context.get("lead_whatsapp")

        # Duplicate prevention: link existing Candidate if phone already exists.
        if lead_whatsapp:
            existing = await self._session.scalar(
                sa.select(CandidateModel).where(
                    CandidateModel.phone == lead_whatsapp,
                    CandidateModel.deleted_at.is_(None),
                )
            )
            if existing is not None:
                conversation.candidate_id = existing.id
                context.pop("lead_name", None)
                context.pop("lead_whatsapp", None)
                await self._sync_application(conversation)
                return

        now = datetime.now(UTC)
        candidate = CandidateModel(
            full_name=lead_name,
            phone=lead_whatsapp,
            application_source="bot",
            lgpd_consent_at=now,
            lgpd_consent_version="v1.0",
        )
        self._session.add(candidate)
        await self._session.flush()

        conversation.candidate_id = candidate.id
        context.pop("lead_name", None)
        context.pop("lead_whatsapp", None)
        await self._sync_application(conversation)

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
        await self._promote_pending_application(conversation, context)
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
        if not self._is_resumed_application(conversation, context):
            application.status = fields.status
        application.preferred_location_group_id = fields.preferred_location_group_id
        application.preferred_unit_id = fields.preferred_unit_id
        application.accepts_any_unit_in_location = fields.accepts_any_unit_in_location
        application.desired_job_area = fields.desired_job_area
        application.desired_shift = fields.desired_shift
        application.updated_at = datetime.now(UTC)
        await self._application_repository.update_application(application)

    async def _promote_pending_application(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
    ) -> None:
        if conversation.application_id is not None or conversation.candidate_id is None:
            return

        application_id = self._uuid_from_context(context.get("pending_application_id"))
        if application_id is None:
            return

        application = await self._application_repository.get_application(application_id)
        if (
            application is None
            or application.candidate_id != conversation.candidate_id
            or application.status not in APPLICATION_ACTIVE_STATUSES
        ):
            return

        conversation.application_id = application.id
        context["resumed_application_id"] = str(application.id)

    @staticmethod
    def _is_resumed_application(
        conversation: ConversationSessionModel,
        context: dict[str, Any],
    ) -> bool:
        return context.get("resumed_application_id") == str(conversation.application_id)

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

    async def _invalid_prompt_if_needed(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        content: str,
        candidate_message: ConversationMessageModel,
    ) -> ConversationPrompt | None:
        state = conversation.current_state
        if state == "CHOOSE_LOCATION":
            if self._is_continue_intent(content):
                return await self._prompt_for("CHOOSE_LOCATION", context)
            has_locations = await self._has_active_locations()
            location = await self._resolve_location_group(content)
            if has_locations and location is None:
                await self._record_failure(
                    conversation,
                    candidate_message,
                    state=state,
                    raw_message=content,
                    reason="location_not_found",
                    classification="location",
                    attempts_count=await self._next_attempt_count(conversation.id, state),
                )
                return ConversationPrompt(
                    state="CHOOSE_LOCATION",
                    content=_INVALID_LOCATION_MESSAGE,
                )
        elif state == "CHOOSE_UNIT_OR_ANY":
            preference = self._unit_preference(content)
            if preference in {"any_in_location", "choose_unit"}:
                return None
            location = await self._resolve_location_group(context.get("location_hint"))
            if await self._has_active_units(location.id if location else None):
                unit = await self._resolve_unit(content, location.id if location else None)
                if unit is None:
                    await self._record_failure(
                        conversation,
                        candidate_message,
                        state=state,
                        raw_message=content,
                        reason="unit_not_found",
                        classification="unit",
                        attempts_count=await self._next_attempt_count(conversation.id, state),
                    )
                    unit_base = await self._prompt_for("CHOOSE_UNIT_OR_ANY", context)
                    return ConversationPrompt(
                        state="CHOOSE_UNIT_OR_ANY",
                        content=_INVALID_UNIT_MESSAGE,
                        quick_replies=unit_base.quick_replies,
                    )
        elif state == "CHOOSE_FUNCTION":
            if not self._looks_like_business_text(content):
                await self._record_failure(
                    conversation,
                    candidate_message,
                    state=state,
                    raw_message=content,
                    reason="function_not_understood",
                    classification=self._classification_for_text(content, "function"),
                    attempts_count=await self._next_attempt_count(conversation.id, state),
                )
                return ConversationPrompt(
                    state="CHOOSE_FUNCTION",
                    content=_INVALID_FUNCTION_MESSAGE,
                )
        elif state == "CHOOSE_SHIFT" and self._shift_value(content) is None:
            await self._record_failure(
                conversation,
                candidate_message,
                state=state,
                raw_message=content,
                reason="shift_not_understood",
                classification=self._classification_for_text(content, "shift"),
                attempts_count=await self._next_attempt_count(conversation.id, state),
            )
            shift_base = await self._prompt_for("CHOOSE_SHIFT")
            return ConversationPrompt(
                state="CHOOSE_SHIFT",
                content=_INVALID_SHIFT_MESSAGE,
                quick_replies=shift_base.quick_replies,
            )
        return None

    async def _has_active_locations(self) -> bool:
        return bool(
            await self._session.scalar(
                sa.select(sa.exists().where(LocationGroupModel.is_active.is_(True)))
            )
        )

    async def _has_active_units(self, location_group_id: UUID | None) -> bool:
        predicate = OperationalUnitModel.is_active.is_(True)
        if location_group_id is not None:
            predicate = predicate & (OperationalUnitModel.location_group_id == location_group_id)
        return bool(await self._session.scalar(sa.select(sa.exists().where(predicate))))

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
            return {"desired_shift": ConversationService._shift_value(content) or content}
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

    @staticmethod
    def _shift_value(content: str) -> str | None:
        normalized = content.strip().casefold()
        values = {
            "morning": "morning",
            "manha": "morning",
            "manhã": "morning",
            "afternoon": "afternoon",
            "tarde": "afternoon",
            "night": "night",
            "noite": "night",
            "any": "any",
            "qualquer": "any",
            "qualquer turno": "any",
        }
        return values.get(normalized)

    @staticmethod
    def _looks_like_business_text(content: str) -> bool:
        stripped = content.strip()
        if len(stripped) < 3:
            return False
        letters = sum(1 for char in stripped if char.isalpha())
        return letters >= 3

    @staticmethod
    def _classification_for_text(content: str, fallback: str) -> str:
        normalized = content.strip().casefold()
        if any(token in normalized for token in ("humano", "rh", "atendente", "pessoa")):
            return "talk_to_hr"
        if len(normalized) > 120 or normalized.count("http") > 0:
            return "spam"
        return fallback

    async def _next_attempt_count(self, session_id: UUID, state: str) -> int:
        current = await self._session.scalar(
            sa.select(sa.func.count()).where(
                AssistantFailureModel.session_id == session_id,
                AssistantFailureModel.state == state,
            )
        )
        return int(current or 0) + 1

    async def _record_failure(
        self,
        conversation: ConversationSessionModel,
        candidate_message: ConversationMessageModel,
        *,
        state: str,
        raw_message: str,
        reason: str,
        classification: str,
        attempts_count: int | None = None,
        sanitized_message: str | None = None,
    ) -> None:
        stored_reason = reason
        if (
            attempts_count is not None
            and attempts_count >= _FAILURE_ATTEMPT_LIMIT
            and not reason.startswith("otp_")
        ):
            stored_reason = f"{reason}_attempt_limit"

        await self._failure_recorder.record_failure(
            session_id=conversation.id,
            message_id=candidate_message.id,
            candidate_id=conversation.candidate_id,
            application_id=conversation.application_id,
            state=state,
            raw_message=raw_message,
            sanitized_message=sanitized_message or sanitise_assistant_text(raw_message),
            reason=stored_reason,
            classification=classification,
            attempts_count=attempts_count,
        )

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
            context=self._public_context(conversation.context_json or {}),
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
            content=ConversationService._public_message_content(message),
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

    @staticmethod
    def _public_context(context: dict[str, Any]) -> dict[str, Any]:
        internal_keys = {
            "pending_candidate_id",
            "possible_candidate_id",
            "identifier_unresolved",
            "pending_confirmation",
            "otp_purpose",
            "pending_application_id",
            "pending_application_status",
            "resumed_from_session_id",
            "resumed_application_id",
            # Lead-registration: PII stored temporarily; never exposed via API.
            "lead_name",
            "lead_whatsapp",
        }
        return {key: value for key, value in context.items() if key not in internal_keys}

    @staticmethod
    def _public_message_content(message: ConversationMessageModel) -> str:
        if message.role != "candidate":
            return message.content
        content = message.content.strip()
        digits = re.sub(r"\D", "", content)
        if re.fullmatch(r"\d{6}", digits):
            return "[código omitido]"
        if len(digits) in {10, 11}:
            final = digits[-3:]
            if ConversationService._is_valid_cpf(digits):
                return f"CPF informado com final {final}"
            return f"WhatsApp informado com final {final}"
        return message.content
