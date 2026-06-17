import os
import re
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.tool_execution_context import ToolExecutionContext
from src.ai_orchestration.core.tool_runtime import ToolRuntime
from src.ai_orchestration.rag.candidate_safe_retriever import CandidateSafeRetriever
from src.ai_orchestration.rag.embedding_provider_factory import get_embedding_provider
from src.ai_orchestration.rag.postgres_vector_retriever import PostgresVectorRetriever
from src.ai_orchestration.rag.rag_answer_service import RagAnswerService
from src.ai_orchestration.tools.candidate_bot_registry import CANDIDATE_BOT_REGISTRY
from src.application.prompts.candidate_bot_prompts import (
    DEFAULT_CANDIDATE_BOT_GENERIC_FALLBACK_MESSAGE,
    DEFAULT_CANDIDATE_BOT_TALK_TO_HR_MESSAGE,
)
from src.application.services.admin_assistant_failure_service import AssistantFailureRecorder
from src.application.services.admin_assistant_service import sanitise_assistant_text
from src.application.services.assistant_content_provider import AssistantContentProvider
from src.application.services.candidate_agent_router import CandidateAgentRouter
from src.application.services.candidate_assistant_intent_service import (
    CandidateAssistantIntentService,
    CandidateIntent,
)
from src.application.services.candidate_portal_service import CandidatePortalService
from src.application.services.conversation_otp_service import ConversationOtpService
from src.application.services.conversation_state_machine import (
    ConversationPrompt,
    first_prompt,
    next_state,
    prompt_for,
)
from src.core.settings import settings
from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.database.models.assistant_failure_model import AssistantFailureModel
from src.infrastructure.database.models.assistant_settings_model import AssistantSettingModel
from src.infrastructure.database.models.candidate_application_model import (
    APPLICATION_ACTIVE_STATUSES,
    CandidateApplicationModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.conversation_handoff_model import (
    ConversationHandoffModel,
)
from src.infrastructure.database.models.conversation_model import (
    ConversationMessageModel,
    ConversationSessionModel,
)
from src.infrastructure.database.models.job_model import JobModel, JobUnitModel
from src.infrastructure.database.models.operational_master_model import (
    LocationGroupModel,
    OperationalUnitModel,
)
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.repositories.postgres_vector_store import PostgresVectorStore
from src.infrastructure.repositories.sqlalchemy_candidate_application_repository import (
    SQLAlchemyCandidateApplicationRepository,
)
from src.infrastructure.repositories.sqlalchemy_conversation_repository import (
    SQLAlchemyConversationRepository,
)
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.infrastructure.repositories.sqlalchemy_knowledge_document_repository import (
    SQLAlchemyKnowledgeDocumentRepository,
)
from src.infrastructure.repositories.sqlalchemy_resume_repository import (
    SQLAlchemyResumeRepository,
)
from src.infrastructure.security.cpf_identity import derive_cpf_identity
from src.infrastructure.storage.resume_files import write_resume_file
from src.interface.api.schemas.conversation_schemas import (
    CandidateBotSessionResponse,
    ConversationCreateRequest,
    ConversationMessageCreateRequest,
    ConversationMessageResponse,
    ConversationQuickReplyResponse,
    ConversationSessionResponse,
    ConversationTurnResponse,
)
from src.interface.workers.resume_extraction_dispatcher import enqueue_resume_extraction

_GUIDED_PORTAL_CHAT_STATE = "GUIDED_PORTAL_CHAT"
_GUIDED_PORTAL_CHAT_STORAGE_STATE = "DONE"
_CANDIDATE_BOT_PERMISSIONS = [
    "candidate_read_public_jobs",
    "candidate_read_public_knowledge",
    "candidate_read_application_status",
    "candidate_write_safe_application",
]
_CANDIDATE_BOT_HR_PATTERN = re.compile(
    r"\b(falar com (o )?rh|quero falar com (o )?rh|atendente humano|"
    r"pessoa do rh|recrutador|recrutadora|humano)\b",
    re.IGNORECASE,
)
_CANDIDATE_BOT_STATUS_PATTERN = re.compile(
    r"\b(acompanh|minha candidatura|minha vaga|status do processo|"
    r"como est[aá] minha candidatura|etapa do processo)\b",
    re.IGNORECASE,
)
_CANDIDATE_BOT_JOBS_PATTERN = re.compile(
    r"\b(vaga|vagas|oportunidade|oportunidades|me candidatar|candidatar|trabalhar)\b",
    re.IGNORECASE,
)
_CANDIDATE_BOT_UNITS_PATTERN = re.compile(
    r"\b(unidade|unidades|posto|postos|filial|filiais|endere[cç]o|enderecos|local)\b",
    re.IGNORECASE,
)
_CANDIDATE_BOT_DETAIL_PATTERN = re.compile(
    r"\b(detalhe|detalhes|benef[ií]cios|beneficios|requisitos|responsabilidades|"
    r"descri[cç][aã]o)\b",
    re.IGNORECASE,
)
_CANDIDATE_BOT_GENERIC_FALLBACK = DEFAULT_CANDIDATE_BOT_GENERIC_FALLBACK_MESSAGE
_CANDIDATE_APPLICATION_DRAFT_KEY = "candidate_application_draft"
_CANDIDATE_APPLICATION_ACTIVE_STATUSES = frozenset({"collecting", "awaiting_confirmation"})
_CANDIDATE_APPLICATION_CONFIRM_TOKENS = frozenset(
    {"confirmar", "sim confirmar", "confirmo", "confirmar candidatura", "confirmar_candidatura"}
)
_CANDIDATE_APPLICATION_CANCEL_TOKENS = frozenset(
    {"cancelar", "cancelar candidatura", "cancelar_candidatura", "desistir"}
)
_CANDIDATE_APPLICATION_EDIT_TOKENS = frozenset({"alterar dados", "alterar_dados", "revisar"})
_CANDIDATE_APPLICATION_EMAIL_PATTERN = re.compile(
    r"([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})",
    re.IGNORECASE,
)
_CANDIDATE_APPLICATION_PHONE_PATTERN = re.compile(r"(\+?55\s*)?(\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}")
_CANDIDATE_APPLICATION_NAME_PATTERN = re.compile(
    r"(?:meu nome [ée]|me chamo|sou)\s+([a-zà-ÿ][a-zà-ÿ\s'-]{2,})",
    re.IGNORECASE,
)
_CANDIDATE_APPLICATION_CONSENT_PATTERN = re.compile(
    r"\b("
    r"aceito|autorizo|concordo|pode usar meus dados|"
    r"sim, autorizo|sim autorizo|aceito o uso dos dados"
    r")\b",
    re.IGNORECASE,
)
_CANDIDATE_APPLICATION_SENSITIVE_PATTERN = re.compile(
    r"\b(gr[aá]vida|gravidez|sa[uú]de|religi[aã]o|pol[ií]tica|ra[cç]a|cor|"
    r"orienta[cç][aã]o sexual|fam[ií]lia|filho|filhos|banco|banc[aá]ri|cpf|rg|documento)\b",
    re.IGNORECASE,
)
_CANDIDATE_BOT_INITIAL_PROMPT = ConversationPrompt(
    state=_GUIDED_PORTAL_CHAT_STATE,
    content=(
        "Olá! Sou o assistente de recrutamento. Posso te ajudar a ver vagas, "
        "tirar dúvidas ou falar com o RH."
    ),
    quick_replies=(
        ("ver_vagas", "Ver vagas"),
        ("quero_me_candidatar", "Quero me candidatar"),
        ("acompanhar_candidatura", "Acompanhar candidatura"),
        ("falar_com_rh", "Falar com RH"),
    ),
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
_TALK_TO_HR_MESSAGE = DEFAULT_CANDIDATE_BOT_TALK_TO_HR_MESSAGE
_OUTPUT_DEADLINE_PATTERN = re.compile(
    r"\b(\d+\s*(h|hora|min|dia)s?|amanh[ãa]|hoje|prazo|retorno em)\b",
    re.IGNORECASE,
)
_OUTPUT_SENSITIVE_PATTERN = re.compile(
    r"\b(cpf|rg|pis|pasep|ctps|dados banc[aá]rios|conta banc[aá]ria|"
    r"n[úu]mero do cart[aã]o|senha|sal[aá]rio|remunera(?:ç|c)[aã]o|"
    r"endere[cç]o completo|nome da m[aã]e|nome do pai)\b",
    re.IGNORECASE,
)
_OUTPUT_APPROVAL_PATTERN = re.compile(
    r"\b(aprovad[oa]?|reprovad[oa]?|rejeitad[oa]?|contratad[oa]?|selecionad[oa]?)\b",
    re.IGNORECASE,
)
_OUTPUT_INTERNAL_PATTERN = re.compile(
    r"\b(interno|pipeline|triagem|rh\s+(deve|precisa|vai analisar|vai aprovar))\b",
    re.IGNORECASE,
)
_OUTPUT_UNSUPPORTED_ASSERTION_PATTERN = re.compile(
    r"\b(sal[aá]rio|remunera(?:ç|c)[aã]o|benef[ií]cios?)\b",
    re.IGNORECASE,
)
_RISKY_CANDIDATE_MESSAGE_PATTERN = re.compile(
    r"\b(ignore|admin|documentos internos|crit[eé]rio secreto|aprova direto|"
    r"rejeite|gr[aá]vida|problema de sa[uú]de|dados banc[aá]rios|sal[aá]rio interno)\b",
    re.IGNORECASE,
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
    "AWAITING_RESUME_UPLOAD",
}

# OP-7A — states where the AI intent parser may interpret a free-text message.
# IDENTIFY/VERIFY_OTP (security/anti-enumeration), the lead name/WhatsApp states
# (deterministic validation) and DONE are intentionally excluded: the AI must
# never run there. The mapping below pairs each AI-eligible state with the intents
# it accepts; anything else degrades to the deterministic flow.
_AI_INTENTS_BY_STATE: dict[str, tuple[str, ...]] = {
    "CHOOSE_LOCATION": ("choose_location", "talk_to_hr", "help", "unclear"),
    "CHOOSE_UNIT_OR_ANY": (
        "choose_any_unit",
        "choose_unit",
        "talk_to_hr",
        "help",
        "unclear",
    ),
    "CHOOSE_FUNCTION": ("choose_function", "talk_to_hr", "help", "unclear"),
    "CHOOSE_SHIFT": ("choose_shift", "talk_to_hr", "help", "unclear"),
    "COLLECT_RESUME": ("skip_resume", "upload_resume", "talk_to_hr", "help", "unclear"),
    "COLLECT_LGPD_CONSENT": ("accept_lgpd", "reject_lgpd", "talk_to_hr", "help", "unclear"),
    "CONFIRM_APPLICATION": (
        "confirm_application",
        "cancel",
        "review",
        "talk_to_hr",
        "help",
        "unclear",
    ),
}

# Quick-reply / button values and deterministically-recognized words. When the
# candidate's message is exactly one of these, it is a button click (or already
# unambiguous), so the AI parser is skipped to save tokens and latency.
_AI_CONTROL_TOKENS = frozenset(
    {
        "cpf",
        "whatsapp",
        "any_in_location",
        "choose_unit",
        "send_resume",
        "skip_resume",
        "confirm",
        "review",
        "aceito",
        "nao_aceito",
        "morning",
        "afternoon",
        "night",
        "any",
        "continue",
        "resume_uploaded",
        "qualquer",
        "escolher",
        "vamos",
        "sim",
        "ok",
        "manha",
        "manhã",
        "tarde",
        "noite",
    }
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


@dataclass(frozen=True)
class _ApplicationResumeDecision:
    state: str
    content: str
    quick_replies: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class _CandidateApplicationDraftExtraction:
    candidate_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    consent_given: bool | None = None
    contains_sensitive_data: bool = False


class ConversationService:
    def __init__(
        self,
        repository: SQLAlchemyConversationRepository,
        session: AsyncSession,
        application_repository: SQLAlchemyCandidateApplicationRepository,
        resume_repository: SQLAlchemyResumeRepository,
    ):
        self._repository = repository
        self._session = session
        self._application_repository = application_repository
        self._resume_repo = resume_repository
        self._otp_service = ConversationOtpService(session)
        self._failure_recorder = AssistantFailureRecorder(session)
        self._content_provider = AssistantContentProvider(session)
        self._intent_service = CandidateAssistantIntentService()
        self._candidate_agent_router = CandidateAgentRouter()

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
            raise ValidationException("Sessão de conversa não ativa.")

        content = body.content.strip()
        stored_message_type = "system" if body.message_type == "event" else body.message_type
        candidate_message = await self._add_candidate_message(
            conversation,
            content=content,
            message_type=stored_message_type,
        )

        context = dict(conversation.context_json or {})
        raw_content = content
        ai_intent: CandidateIntent | None = None

        # OP-7A — interpret free-text input with AI BEFORE the deterministic
        # dispatch. The parser only canonicalizes the message into a token the
        # state machine already understands; it never changes the state itself.
        if body.message_type != "event":
            content, ai_intent = await self._maybe_ai_canonicalize(
                conversation,
                context,
                content,
                candidate_message,
            )

        if content == "talk_to_hr" or (ai_intent is not None and ai_intent.should_handoff):
            prompt = await self._handle_talk_to_hr(
                conversation,
                context,
                candidate_message,
                intent=ai_intent,
            )
            conversation.context_json = context
            conversation.updated_at = datetime.now(UTC)
            message = await self._add_assistant_message(conversation, prompt)
            await self._repository.update_session(conversation)
            turn = self._turn_response(conversation, message, prompt)
            turn.handoff_required = True
            return turn

        if body.message_type != "event" and ai_intent is not None:
            safe_prompt = await self._maybe_safe_user_message_prompt(
                conversation,
                context,
                raw_content=raw_content,
                resolved_content=content,
                intent=ai_intent,
            )
            if safe_prompt is not None:
                conversation.context_json = context
                conversation.updated_at = datetime.now(UTC)
                message = await self._add_assistant_message(conversation, safe_prompt)
                await self._repository.update_session(conversation)
                return self._turn_response(conversation, message, safe_prompt)

        if body.message_type == "event" and content == "resume_uploaded":
            context["resume_uploaded"] = True
            self._merge_context(context, self._state_update(conversation.current_state, content))
            if self._is_unresolved_lead(conversation, context):
                conversation.current_state = "COLLECT_LEAD_NAME"
                prompt = prompt_for("COLLECT_LEAD_NAME", context)
            else:
                conversation.current_state = "CONFIRM_APPLICATION"
                prompt = await self._prompt_for(conversation.current_state, context)

        elif conversation.current_state == "IDENTIFY":
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
            elif conversation.current_state in {"COLLECT_RESUME", "AWAITING_RESUME_UPLOAD"}:
                resume_choice = self._normalize(content)
                if resume_choice == "send_resume":
                    conversation.current_state = "AWAITING_RESUME_UPLOAD"
                    prompt = prompt_for("AWAITING_RESUME_UPLOAD", context)
                elif resume_choice == "skip_resume":
                    self._merge_context(
                        context,
                        self._state_update(conversation.current_state, content),
                    )
                    if self._is_unresolved_lead(conversation, context):
                        conversation.current_state = "COLLECT_LEAD_NAME"
                        prompt = prompt_for("COLLECT_LEAD_NAME", context)
                    else:
                        conversation.current_state = "CONFIRM_APPLICATION"
                        prompt = await self._prompt_for(conversation.current_state, context)
                elif conversation.current_state == "COLLECT_RESUME":  # Fallback for old clients
                    if self._is_unresolved_lead(conversation, context):
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
                else:
                    prompt = prompt_for("AWAITING_RESUME_UPLOAD", context)
            else:
                self._merge_context(
                    context,
                    self._state_update(conversation.current_state, content),
                )
                conversation.current_state = next_state(conversation.current_state)
                prompt = await self._prompt_for(conversation.current_state, context)

        conversation.context_json = context
        if bool(context.get("candidate_portal_guided_chat")):
            self._remember_candidate_portal_prompt(context, prompt)
            if conversation.current_state == "DONE":
                context["candidate_portal_guided_application_active"] = False
        if (
            conversation.current_state == "DONE"
            and conversation.status == "active"
            and not bool(context.get("candidate_portal_guided_chat"))
        ):
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

    async def get_candidate_portal_bot_session(
        self,
        *,
        candidate_id: UUID,
        session_id: UUID,
    ) -> CandidateBotSessionResponse:
        conversation = await self._get_candidate_portal_bot_session_record(
            candidate_id=candidate_id,
            session_id=session_id,
        )
        messages = await self._repository.list_messages(conversation.id)
        return CandidateBotSessionResponse(
            session=self._session_response(conversation),
            messages=[self._message_response(message) for message in messages],
            handoff_required=bool((conversation.context_json or {}).get("handoff_requested")),
        )

    async def receive_candidate_portal_bot_message(
        self,
        *,
        candidate_id: UUID,
        session_id: UUID | None,
        message: str,
        job_id: UUID | None = None,
        operational_unit_id: UUID | None = None,
    ) -> ConversationTurnResponse:
        content = message.strip()
        if not content:
            raise ValidationException("Mensagem vazia não é permitida.")

        conversation = await self._resolve_candidate_portal_bot_session(
            candidate_id=candidate_id,
            session_id=session_id,
            job_id=job_id,
            operational_unit_id=operational_unit_id,
        )
        if conversation.status != "active":
            raise ValidationException("Sessão do assistente do candidato não está ativa.")

        context = dict(conversation.context_json or {})
        if job_id is not None:
            context["job_id"] = str(job_id)
        if operational_unit_id is not None:
            context["operational_unit_id"] = str(operational_unit_id)

        if self._candidate_portal_guided_flow_active(conversation):
            conversation.context_json = context
            conversation.updated_at = datetime.now(UTC)
            await self._repository.update_session(conversation)
            return await self.receive_message(
                conversation.id,
                ConversationMessageCreateRequest(content=content),
            )

        candidate_message = await self._add_candidate_message(
            conversation,
            content=content,
            message_type="text",
        )

        ai_intent = await self._maybe_candidate_bot_intent(content)
        route = self._candidate_agent_router.route(
            message=content,
            context=context,
            ai_intent=ai_intent,
        )
        candidate_message.interpreted_intent = route.intent

        if route.action == "handoff":
            prompt = await self._handle_talk_to_hr(
                conversation,
                context,
                candidate_message,
                intent=ai_intent,
            )
        elif self._should_route_to_candidate_application_draft(context, route):
            prompt = await self._handle_candidate_application_draft_turn(
                conversation=conversation,
                context=context,
                content=content,
                route=route,
            )
        elif route.action == "guided_flow":
            prompt = route.prompt or prompt_for("CHOOSE_LOCATION", context)
            conversation.current_state = prompt.state
            context["candidate_portal_guided_application_active"] = True
        elif route.action == "tool" and route.tool_name is not None:
            result = await self._execute_candidate_bot_tool(
                conversation=conversation,
                tool_name=route.tool_name,
                tool_args=dict(route.tool_args),
            )
            prompt = self._candidate_bot_prompt_from_tool_result(
                tool_name=route.tool_name,
                result=result,
                context=context,
            )
        else:
            safe_message = self._safe_user_message(route.safe_message)
            prompt = ConversationPrompt(
                state=_GUIDED_PORTAL_CHAT_STATE,
                content=safe_message or _CANDIDATE_BOT_GENERIC_FALLBACK,
                quick_replies=route.quick_replies or _CANDIDATE_BOT_INITIAL_PROMPT.quick_replies,
            )

        self._remember_candidate_portal_prompt(context, prompt)
        if route.action != "guided_flow":
            conversation.current_state = _GUIDED_PORTAL_CHAT_STORAGE_STATE
        conversation.context_json = context
        conversation.updated_at = datetime.now(UTC)
        assistant_message = await self._add_assistant_message(conversation, prompt)
        await self._repository.update_session(conversation)
        return self._turn_response(conversation, assistant_message, prompt)

    async def _get_session(self, session_id: UUID) -> ConversationSessionModel:
        conversation = await self._repository.get_session(session_id)
        if conversation is None:
            raise NotFoundException("Sessão de conversa não encontrada.")
        return conversation

    async def _resolve_candidate_portal_bot_session(
        self,
        *,
        candidate_id: UUID,
        session_id: UUID | None,
        job_id: UUID | None,
        operational_unit_id: UUID | None,
    ) -> ConversationSessionModel:
        if session_id is not None:
            return await self._get_candidate_portal_bot_session_record(
                candidate_id=candidate_id,
                session_id=session_id,
            )
        return await self._create_candidate_portal_bot_session(
            candidate_id=candidate_id,
            job_id=job_id,
            operational_unit_id=operational_unit_id,
        )

    async def _create_candidate_portal_bot_session(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID | None,
        operational_unit_id: UUID | None,
    ) -> ConversationSessionModel:
        now = datetime.now(UTC)
        context: dict[str, Any] = {
            "candidate_portal_guided_chat": True,
            "candidate_portal_last_assistant_message": _CANDIDATE_BOT_INITIAL_PROMPT.content,
            "candidate_portal_last_quick_replies": self._quick_replies_dicts(
                _CANDIDATE_BOT_INITIAL_PROMPT
            ),
        }
        if job_id is not None:
            context["job_id"] = str(job_id)
        if operational_unit_id is not None:
            context["operational_unit_id"] = str(operational_unit_id)

        conversation = ConversationSessionModel(
            candidate_id=candidate_id,
            channel="web",
            current_state=_GUIDED_PORTAL_CHAT_STORAGE_STATE,
            status="active",
            context_json=context,
            last_message_at=now,
            created_at=now,
            updated_at=now,
        )
        conversation = await self._repository.create_session(conversation)
        await self._add_assistant_message(conversation, _CANDIDATE_BOT_INITIAL_PROMPT)
        return conversation

    async def _get_candidate_portal_bot_session_record(
        self,
        *,
        candidate_id: UUID,
        session_id: UUID,
    ) -> ConversationSessionModel:
        conversation = await self._get_session(session_id)
        context = conversation.context_json or {}
        if (
            conversation.candidate_id != candidate_id
            or not bool(context.get("candidate_portal_guided_chat"))
        ):
            raise NotFoundException("Sessão do assistente do candidato não encontrada.")
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
            if identifier_type == "cpf":
                context["lead_cpf"] = normalized
            else:
                context["lead_cpf"] = normalized
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
        # OP-6F.6: the confirmation step no longer issues an OTP. A simple LGPD
        # consent (collected earlier for new leads) is the only gate before a
        # Candidate is created. Existing candidates resolved at IDENTIFY are linked
        # silently. No pipeline / login / token is ever created here.
        confirmation = self._normalize(content)
        if confirmation != "confirm":
            self._merge_context(context, self._state_update("CONFIRM_APPLICATION", content))
            conversation.current_state = next_state("CONFIRM_APPLICATION")
            return await self._prompt_for(conversation.current_state, context)

        context["confirmation"] = "confirm"

        # Identity already known (preset candidate or previously verified): finalize.
        if conversation.candidate_id is not None or context.get("identity_verified") is True:
            await self._commit_pending_resume(conversation, context)
            conversation.current_state = "DONE"
            return self._application_registered_prompt()

        # Existing candidate resolved silently at IDENTIFY: link without OTP. The
        # subsequent _sync_application reuses any pending/resumed application.
        pending_candidate_id = self._uuid_from_context(context.get("pending_candidate_id"))
        if pending_candidate_id is not None:
            conversation.candidate_id = pending_candidate_id
            await self._commit_pending_resume(conversation, context)
            context.pop("pending_candidate_id", None)
            context.pop("possible_candidate_id", None)
            conversation.current_state = "DONE"
            return self._application_registered_prompt()

        # New lead: only create a Candidate when LGPD consent and a name are present.
        if (
            context.get("lead_mode")
            and context.get("lgpd_consent")
            and context.get("lead_name")
        ):
            await self._create_lead_candidate_and_application(conversation, context)
            conversation.current_state = "DONE"
            return self._application_registered_prompt()

        # New lead without LGPD consent / required data: never create a Candidate.
        conversation.current_state = "DONE"
        return ConversationPrompt(state="DONE", content=_LGPD_REJECTED_MESSAGE)

    @staticmethod
    def _application_registered_prompt() -> ConversationPrompt:
        return ConversationPrompt(
            state="DONE",
            content="Pronto, sua candidatura foi registrada para análise do RH.",
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
    # OP-7A — AI intent interpretation
    #
    # A thin, optional layer: when enabled, it rewrites a free-text candidate
    # message into a deterministic token (e.g. "qualquer posto em goiania" →
    # "any_in_location") that the existing state-machine handlers already accept.
    # It never changes the state, creates pipelines, mutates applications, or
    # touches IDENTIFY/VERIFY_OTP. On any failure it returns the original content
    # unchanged so the deterministic flow always wins.
    # ------------------------------------------------------------------
    async def _maybe_ai_canonicalize(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        content: str,
        candidate_message: ConversationMessageModel,
    ) -> tuple[str, CandidateIntent | None]:
        if not settings.ASSISTANT_INTENT_AI_ENABLED:
            return content, None
        state = conversation.current_state
        allowed_intents = _AI_INTENTS_BY_STATE.get(state)
        if not allowed_intents:
            return content, None
        if self._is_ai_control_token(content):
            return content, None

        prompt = prompt_for(state, context)
        try:
            intent = await self._intent_service.interpret(
                state=state,
                message=content,
                allowed_intents=allowed_intents,
                quick_replies=prompt.quick_replies,
                allow_safe_fallback=True,
            )
        except Exception:
            # Defensive: the service already swallows provider errors, but never
            # let intent parsing break the conversation.
            return content, None

        if intent is None:
            return content, None

        # Observability only (no PII): record which intent the AI resolved.
        candidate_message.interpreted_intent = intent.intent

        token = self._intent_to_token(state, intent)
        if token is None:
            return content, intent
        return token, intent

    @staticmethod
    def _is_ai_control_token(content: str) -> bool:
        normalized = ConversationService._normalize(content)
        return normalized is not None and normalized in _AI_CONTROL_TOKENS

    @staticmethod
    def _intent_to_token(state: str, intent: CandidateIntent) -> str | None:
        """Map a validated intent to a deterministic token, or None to fall back.

        The token is fed back through the unchanged state-machine handlers, so any
        location/unit/function/shift value still passes the existing deterministic
        validation (unresolved values simply produce the normal invalid prompt).
        """
        name = intent.intent
        if state == "CHOOSE_LOCATION" and name == "choose_location":
            return ConversationService._clean_text(intent.location_hint)
        if state == "CHOOSE_UNIT_OR_ANY":
            if name == "choose_any_unit":
                return "any_in_location"
            if name == "choose_unit":
                return ConversationService._clean_text(intent.unit_hint)
        if state == "CHOOSE_FUNCTION" and name == "choose_function":
            return ConversationService._clean_text(intent.desired_function)
        if state == "CHOOSE_SHIFT" and name == "choose_shift":
            return ConversationService._shift_value(intent.desired_shift or "")
        if state == "COLLECT_RESUME":
            if name == "skip_resume":
                return "skip_resume"
            if name == "upload_resume":
                return "send_resume"
        if state == "COLLECT_LGPD_CONSENT":
            if name == "accept_lgpd":
                return "aceito"
            if name == "reject_lgpd":
                return "nao_aceito"
        if state == "CONFIRM_APPLICATION":
            if name == "confirm_application":
                return "confirm"
            if name == "review":
                return "review"
        if name == "talk_to_hr":
            return "talk_to_hr"
        return None

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

    async def _commit_pending_resume(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
    ) -> None:
        pending_resume_path = context.get("pending_resume_path")
        if not pending_resume_path or not conversation.candidate_id:
            return

        try:
            with open(pending_resume_path, "rb") as f:
                file_bytes = f.read()
        except FileNotFoundError:
            return

        file_name = context.get("pending_resume_filename", "resume.pdf")

        resume_id = uuid4()
        resume = await self._resume_repo.create_resume(
            ResumeModel(
                id=resume_id,
                candidate_id=conversation.candidate_id,
                title=f"Currículo via Chat - {datetime.now(UTC).isoformat()}",
                status="active",
                current_version=1,
                created_by=None,
            )
        )
        version_id = uuid4()
        s3_key = f"resumes/{conversation.candidate_id}/{resume_id}/v1_chat.pdf"
        version = await self._resume_repo.create_version(
            ResumeVersionModel(
                id=version_id,
                resume_id=resume.id,
                version_number=1,
                s3_bucket="resume-ai-dev-uploads",
                s3_key=s3_key,
                original_file_name=file_name,
                file_size_bytes=len(file_bytes),
                file_hash_sha256=sha256(file_bytes).hexdigest(),
                mime_type="application/octet-stream",  # This will be updated by the extraction
                extraction_status="pending",
                uploaded_by=None,
                uploaded_at=datetime.now(UTC),
            )
        )
        write_resume_file(version.s3_key, file_bytes)
        enqueue_resume_extraction(version.id)

        with suppress(OSError):
            os.remove(pending_resume_path)

        context.pop("pending_resume_path", None)
        context.pop("pending_resume_filename", None)
        conversation.context_json = context

    async def _create_lead_candidate_and_application(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
    ) -> None:
        """Create a minimal Candidate (and CandidateApplication) for an OTP-verified lead.

        Checks for an existing Candidate by phone before creating to prevent
        duplicates. No pipeline is created. The `lead_name`, `lead_whatsapp` and
        `lead_cpf` keys are removed from context after use.
        """
        lead_name: str = str(context.get("lead_name") or "").strip() or "Lead"
        lead_whatsapp: str | None = context.get("lead_whatsapp")
        lead_cpf: str | None = context.get("lead_cpf")

        # Duplicate prevention by CPF (highest priority identity).
        if lead_cpf:
            existing_id = await self._resolve_candidate_id_by_cpf(lead_cpf)
            if existing_id is not None:
                conversation.candidate_id = existing_id
                await self._commit_pending_resume(conversation, context)
                context.pop("lead_name", None)
                context.pop("lead_whatsapp", None)
                context.pop("lead_cpf", None)
                await self._sync_application(conversation)
                return

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
                await self._commit_pending_resume(conversation, context)
                context.pop("lead_name", None)
                context.pop("lead_whatsapp", None)
                context.pop("lead_cpf", None)
                await self._sync_application(conversation)
                return

        now = datetime.now(UTC)
        candidate = CandidateModel(
            full_name=lead_name,
            phone=lead_whatsapp,
            cpf=lead_cpf,
            application_source="bot",
            lgpd_consent_at=now,
            lgpd_consent_version="v1.0",
        )
        self._session.add(candidate)
        await self._session.flush()

        conversation.candidate_id = candidate.id
        await self._commit_pending_resume(conversation, context)
        context.pop("lead_name", None)
        context.pop("lead_whatsapp", None)
        context.pop("lead_cpf", None)
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
        lgpd_consent_at = datetime.now(UTC) if context.get("lgpd_consent") is True else None
        lgpd_consent_version = "v1.0" if context.get("lgpd_consent") is True else None

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
                lgpd_consent_at=lgpd_consent_at,
                lgpd_consent_version=lgpd_consent_version,
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
        if lgpd_consent_at is not None and application.lgpd_consent_at is None:
            application.lgpd_consent_at = lgpd_consent_at
            application.lgpd_consent_version = lgpd_consent_version
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
        if current_state == "COLLECT_RESUME" or current_state == "AWAITING_RESUME_UPLOAD":
            choice = ConversationService._normalize(content)
            if choice == "send_resume" or content == "resume_uploaded":
                return {"resume_choice": "send_resume"}
            if choice == "skip_resume":
                return {"resume_choice": "skip_resume"}
            return {"resume_choice": "skipped_fallback"}
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

    async def _handle_talk_to_hr(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        candidate_message: ConversationMessageModel,
        intent: CandidateIntent | None = None,
    ) -> ConversationPrompt:
        """Cria um registro de handoff rastreável e retorna mensagem ao candidato.

        Não promete prazo. Não muda o status da sessão (permanece ativa).
        Idempotente: não cria duplicata se já houver handoff pendente para a sessão.
        """
        existing = await self._session.scalar(
            sa.select(ConversationHandoffModel).where(
                ConversationHandoffModel.session_id == conversation.id,
                ConversationHandoffModel.status == "pending",
            )
        )
        if existing is None:
            handoff = ConversationHandoffModel(
                session_id=conversation.id,
                candidate_id=conversation.candidate_id,
                reason="candidate_requested",
                status="pending",
                metadata_json={
                    "state_at_request": conversation.current_state,
                    "message_id": str(candidate_message.id),
                },
            )
            self._session.add(handoff)
            await self._session.flush()

        context["handoff_requested"] = True
        candidate_message.interpreted_intent = "talk_to_hr"
        handoff_message = await self._resolve_talk_to_hr_message(intent)

        return ConversationPrompt(
            state=conversation.current_state,
            content=handoff_message,
            quick_replies=(),
        )

    async def _resolve_talk_to_hr_message(
        self,
        intent: CandidateIntent | None,
    ) -> str:
        candidate_message = self._safe_talk_to_hr_message(
            intent.talk_to_hr_message if intent is not None else None
        )
        if candidate_message is not None:
            return candidate_message

        try:
            configured = await self._session.get(AssistantSettingModel, "talk_to_hr_message")
        except Exception:
            configured = None
        configured_value = configured.value_json if configured is not None else None
        if isinstance(configured_value, str):
            safe_configured = self._safe_talk_to_hr_message(configured_value)
            if safe_configured is not None:
                return safe_configured
        return _TALK_TO_HR_MESSAGE

    async def _maybe_safe_user_message_prompt(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        *,
        raw_content: str,
        resolved_content: str,
        intent: CandidateIntent,
    ) -> ConversationPrompt | None:
        if resolved_content != raw_content:
            return None
        if intent.should_handoff or intent.intent == "talk_to_hr":
            return None

        safe_message = self._safe_user_message(intent.safe_user_message)
        if safe_message is None:
            return None

        min_confidence = float(settings.ASSISTANT_INTENT_AI_MIN_CONFIDENCE)
        should_use = (
            intent.intent == "unclear"
            or intent.confidence < min_confidence
            or self._message_looks_risky(raw_content)
        )
        if not should_use:
            return None

        base_prompt = await self._prompt_for(conversation.current_state, context)
        return ConversationPrompt(
            state=conversation.current_state,
            content=safe_message,
            quick_replies=base_prompt.quick_replies,
        )

    @staticmethod
    def _safe_talk_to_hr_message(message: str | None) -> str | None:
        cleaned = ConversationService._clean_text(message)
        if cleaned is None:
            return None
        if ConversationService._unsafe_candidate_output(cleaned, allow_generic_help=True):
            return None
        return cleaned

    @staticmethod
    def _safe_user_message(message: str | None) -> str | None:
        cleaned = ConversationService._clean_text(message)
        if cleaned is None:
            return None
        if ConversationService._unsafe_candidate_output(cleaned, allow_generic_help=False):
            return None
        return cleaned

    @staticmethod
    def _unsafe_candidate_output(message: str, *, allow_generic_help: bool) -> bool:
        lowered = message.lower()
        if _OUTPUT_DEADLINE_PATTERN.search(lowered):
            return True
        if _OUTPUT_SENSITIVE_PATTERN.search(lowered):
            return True
        if _OUTPUT_APPROVAL_PATTERN.search(lowered):
            return True
        if _OUTPUT_INTERNAL_PATTERN.search(lowered):
            return True
        if not allow_generic_help and _OUTPUT_UNSUPPORTED_ASSERTION_PATTERN.search(lowered):
            return True
        if "@" in lowered:
            return True
        return bool(re.search(r"\b\d{11}\b", lowered))

    @staticmethod
    def _message_looks_risky(message: str) -> bool:
        return bool(_RISKY_CANDIDATE_MESSAGE_PATTERN.search(message or ""))

    @staticmethod
    def _candidate_portal_guided_flow_active(
        conversation: ConversationSessionModel,
    ) -> bool:
        if not bool((conversation.context_json or {}).get("candidate_portal_guided_chat")):
            return False
        return conversation.current_state in {
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
        }

    @staticmethod
    def _should_route_to_candidate_application_draft(
        context: dict[str, Any],
        route,
    ) -> bool:
        if route.action == "application_draft":
            return True
        if route.action == "tool" and route.intent in {"see_jobs", "ask_question", "check_status"}:
            return False
        draft = context.get(_CANDIDATE_APPLICATION_DRAFT_KEY)
        if not isinstance(draft, dict):
            return False
        return str(draft.get("status") or "") in _CANDIDATE_APPLICATION_ACTIVE_STATUSES

    @staticmethod
    def _empty_candidate_application_draft() -> dict[str, Any]:
        return {
            "status": "collecting",
            "job_id": None,
            "job_title": None,
            "preferred_unit_id": None,
            "unit_name": None,
            "candidate_name": None,
            "contact_email": None,
            "contact_phone": None,
            "consent_given": False,
            "confirmation_requested_at": None,
            "submitted_application_id": None,
        }

    async def _candidate_application_draft(
        self,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        draft = context.get(_CANDIDATE_APPLICATION_DRAFT_KEY)
        if not isinstance(draft, dict):
            draft = self._empty_candidate_application_draft()
            context[_CANDIDATE_APPLICATION_DRAFT_KEY] = draft
        if draft.get("status") not in {
            "collecting",
            "awaiting_confirmation",
            "submitted",
            "cancelled",
        }:
            context[_CANDIDATE_APPLICATION_DRAFT_KEY] = self._empty_candidate_application_draft()
            draft = context[_CANDIDATE_APPLICATION_DRAFT_KEY]

        candidate = await self._session.scalar(
            sa.select(CandidateModel).where(
                CandidateModel.id == conversation.candidate_id,
                CandidateModel.deleted_at.is_(None),
            )
        )
        if candidate is not None:
            if not draft.get("candidate_name"):
                draft["candidate_name"] = self._clean_text(candidate.full_name)
            if not draft.get("contact_email"):
                draft["contact_email"] = self._clean_text(candidate.email)
            if not draft.get("contact_phone"):
                draft["contact_phone"] = self._clean_text(candidate.phone)
            if draft.get("consent_given") is not True and candidate.lgpd_consent_at is not None:
                draft["consent_given"] = True

        return draft

    async def _handle_candidate_application_draft_turn(
        self,
        *,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        content: str,
        route,
    ) -> ConversationPrompt:
        draft = await self._candidate_application_draft(conversation, context)
        normalized = self._normalize(content) or ""

        if draft.get("status") in {"cancelled", "submitted"} and route.intent == "apply_to_job":
            context[_CANDIDATE_APPLICATION_DRAFT_KEY] = self._empty_candidate_application_draft()
            draft = await self._candidate_application_draft(conversation, context)

        if normalized in _CANDIDATE_APPLICATION_CANCEL_TOKENS or route.intent == "cancel":
            draft["status"] = "cancelled"
            draft["confirmation_requested_at"] = None
            return ConversationPrompt(
                state=_GUIDED_PORTAL_CHAT_STATE,
                content="Certo, sua candidatura não foi enviada. Posso te ajudar com outra coisa?",
                quick_replies=_CANDIDATE_BOT_INITIAL_PROMPT.quick_replies,
            )

        if route.intent == "upload_resume":
            next_prompt = await self._candidate_application_prompt_for_next_step(
                conversation=conversation,
                context=context,
                draft=draft,
                intro=(
                    "Nesta fase eu ainda não vou pedir currículo. "
                    "Primeiro preciso confirmar os dados mínimos da sua candidatura."
                ),
            )
            return next_prompt

        if normalized in _CANDIDATE_APPLICATION_EDIT_TOKENS:
            draft["status"] = "collecting"
            draft["confirmation_requested_at"] = None
            return ConversationPrompt(
                state=_GUIDED_PORTAL_CHAT_STATE,
                content="Certo. O que você quer alterar: vaga, unidade, nome ou contato?",
                quick_replies=(
                    ("ver_vagas", "Escolher outra vaga"),
                    ("cancelar_candidatura", "Cancelar"),
                ),
            )

        if (
            route.intent == "apply_to_job"
            or normalized.startswith("job:")
            or draft.get("job_id") is None
        ):
            selection_prompt = await self._candidate_application_handle_job_selection(
                conversation=conversation,
                context=context,
                content=content,
                route=route,
                draft=draft,
            )
            if selection_prompt is not None:
                return selection_prompt

        if draft.get("job_id"):
            unit_prompt = await self._candidate_application_handle_unit_selection(
                conversation=conversation,
                context=context,
                content=content,
                draft=draft,
            )
            if unit_prompt is not None:
                return unit_prompt

        extraction = self._extract_candidate_application_data(content)
        if extraction.contains_sensitive_data:
            return ConversationPrompt(
                state=_GUIDED_PORTAL_CHAT_STATE,
                content=(
                    "Esse tipo de dado sensível não deve ser enviado por aqui. "
                    "Se precisar, posso encaminhar seu atendimento para o RH."
                ),
                quick_replies=(
                    ("falar_com_rh", "Falar com RH"),
                    ("cancelar_candidatura", "Cancelar"),
                ),
            )

        self._apply_candidate_application_extraction(draft, extraction)

        if (
            route.intent == "confirm" or normalized in _CANDIDATE_APPLICATION_CONFIRM_TOKENS
        ) and await self._candidate_application_draft_is_complete(draft):
            if draft.get("status") != "awaiting_confirmation":
                return self._candidate_application_confirmation_prompt(draft)
            return await self._submit_candidate_application_from_draft(
                conversation=conversation,
                draft=draft,
            )

        if await self._candidate_application_draft_is_complete(draft):
            return self._candidate_application_confirmation_prompt(draft)

        return await self._candidate_application_prompt_for_next_step(
            conversation=conversation,
            context=context,
            draft=draft,
        )

    async def _maybe_candidate_bot_intent(self, message: str) -> CandidateIntent | None:
        if not settings.ASSISTANT_INTENT_AI_ENABLED:
            return None
        try:
            return await self._intent_service.interpret(
                state=_GUIDED_PORTAL_CHAT_STATE,
                message=message,
                allowed_intents=("talk_to_hr", "help", "unclear"),
                quick_replies=_CANDIDATE_BOT_INITIAL_PROMPT.quick_replies,
                allow_safe_fallback=True,
            )
        except Exception:
            return None

    async def _execute_candidate_bot_tool(
        self,
        *,
        conversation: ConversationSessionModel,
        tool_name: str,
        tool_args: dict[str, Any],
        read_only: bool = True,
    ):
        runtime = ToolRuntime(CANDIDATE_BOT_REGISTRY, read_only=read_only)
        execution_context = ToolExecutionContext(
            agent_context=AgentContext(
                user_id=str(conversation.candidate_id),
                role="candidate",
                permissions=list(_CANDIDATE_BOT_PERMISSIONS),
                request_id=str(uuid4()),
                session_id=str(conversation.id),
                source="api",
                actor_type="candidate",
                channel="candidate_portal",
                audience="candidate",
            ),
            services=self._candidate_bot_services(),
            read_only=read_only,
        )
        return await runtime.execute(tool_name, tool_args, execution_context)

    def _candidate_bot_services(self) -> dict[str, Any]:
        embedding_provider = get_embedding_provider()
        candidate_retriever = CandidateSafeRetriever(
            PostgresVectorRetriever(
                vector_store=PostgresVectorStore(self._session),
                embedding_provider=embedding_provider,
                document_repository=SQLAlchemyKnowledgeDocumentRepository(self._session),
            )
        )
        return {
            "job_repository": SQLAlchemyJobRepository(self._session),
            "db_session": self._session,
            "candidate_retriever": candidate_retriever,
            "answer_service": RagAnswerService(usage_session=self._session),
            "candidate_portal_service": CandidatePortalService(self._session),
        }

    async def _candidate_application_handle_job_selection(
        self,
        *,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        content: str,
        route,
        draft: dict[str, Any],
    ) -> ConversationPrompt | None:
        selected_job_id = self._candidate_application_job_id_from_message(content)
        if selected_job_id is None and draft.get("job_id") is None:
            preset_job_id = self._uuid_from_context(context.get("job_id"))
            if route.intent == "apply_to_job" and preset_job_id is not None:
                selected_job_id = preset_job_id

        if selected_job_id is not None:
            detail_result = await self._execute_candidate_bot_tool(
                conversation=conversation,
                tool_name="get_public_job_detail",
                tool_args={"job_id": str(selected_job_id)},
            )
            if not detail_result.ok:
                return ConversationPrompt(
                    state=_GUIDED_PORTAL_CHAT_STATE,
                    content=(
                        "Não consegui localizar essa vaga publicada agora. "
                        "Escolha uma vaga disponível."
                    ),
                    quick_replies=(
                        ("ver_vagas", "Ver vagas"),
                        ("cancelar_candidatura", "Cancelar"),
                    ),
                )
            detail = detail_result.data if isinstance(detail_result.data, dict) else {}
            draft["job_id"] = detail.get("id")
            draft["job_title"] = self._clean_text(detail.get("title"))
            draft["preferred_unit_id"] = None
            draft["unit_name"] = None
            unit_prompt = await self._candidate_application_handle_unit_selection(
                conversation=conversation,
                context=context,
                content=content,
                draft=draft,
            )
            if unit_prompt is not None:
                return unit_prompt
            return await self._candidate_application_prompt_for_next_step(
                conversation=conversation,
                context=context,
                draft=draft,
            )

        if draft.get("job_id") is not None:
            return None

        if (
            route.intent != "apply_to_job"
            and not self._candidate_application_looks_like_job_query(content)
        ):
            return await self._candidate_application_prompt_for_next_step(
                conversation=conversation,
                context=context,
                draft=draft,
            )

        result = await self._execute_candidate_bot_tool(
            conversation=conversation,
            tool_name=route.tool_name or "search_public_jobs",
            tool_args=(
                dict(route.tool_args)
                if route.tool_args
                else {"query": content.strip(), "limit": 5}
            ),
        )
        return self._candidate_bot_prompt_from_tool_result(
            tool_name="search_public_jobs",
            result=result,
            context=context,
        )

    async def _candidate_application_handle_unit_selection(
        self,
        *,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        content: str,
        draft: dict[str, Any],
    ) -> ConversationPrompt | None:
        job_id = self._uuid_from_context(draft.get("job_id"))
        if job_id is None:
            return None

        units_result = await self._execute_candidate_bot_tool(
            conversation=conversation,
            tool_name="get_public_job_units",
            tool_args={"job_id": str(job_id)},
        )
        if not units_result.ok:
            return ConversationPrompt(
                state=_GUIDED_PORTAL_CHAT_STATE,
                content=(
                    "Não consegui consultar as unidades dessa vaga agora. "
                    "Tente escolher a vaga novamente."
                ),
                quick_replies=(
                    ("ver_vagas", "Ver vagas"),
                    ("cancelar_candidatura", "Cancelar"),
                ),
            )

        data = units_result.data if isinstance(units_result.data, dict) else {}
        units = data.get("job_units") if isinstance(data.get("job_units"), list) else []
        if len(units) == 1:
            if draft.get("preferred_unit_id"):
                return None
            unit = units[0]
            draft["preferred_unit_id"] = unit.get("id")
            draft["unit_name"] = self._candidate_application_unit_label(unit)
            next_prompt = await self._candidate_application_prompt_for_next_step(
                conversation=conversation,
                context=context,
                draft=draft,
            )
            return ConversationPrompt(
                state=_GUIDED_PORTAL_CHAT_STATE,
                content=(
                    f"Vou usar a unidade {draft['unit_name']} para essa vaga. "
                    f"{next_prompt.content}"
                ),
                quick_replies=next_prompt.quick_replies,
            )

        if len(units) >= 2 and not draft.get("preferred_unit_id"):
            selected_unit = self._candidate_application_match_unit(content, units)
            if selected_unit is not None:
                draft["preferred_unit_id"] = selected_unit.get("id")
                draft["unit_name"] = self._candidate_application_unit_label(selected_unit)
                return None
            return self._candidate_bot_prompt_from_tool_result(
                tool_name="get_public_job_units",
                result=units_result,
                context=context,
            )

        if draft.get("preferred_unit_id"):
            valid_unit = next(
                (unit for unit in units if unit.get("id") == draft.get("preferred_unit_id")),
                None,
            )
            if valid_unit is None:
                draft["preferred_unit_id"] = None
                draft["unit_name"] = None
                return ConversationPrompt(
                    state=_GUIDED_PORTAL_CHAT_STATE,
                    content=(
                        "Essa unidade não está vinculada à vaga selecionada. "
                        "Escolha uma das unidades disponíveis."
                    ),
                    quick_replies=tuple(
                        (
                            "unit:" + str(unit.get("id")),
                            self._candidate_application_unit_label(unit),
                        )
                        for unit in units[:3]
                        if isinstance(unit, dict) and unit.get("id")
                    ) + (("cancelar_candidatura", "Cancelar"),),
                )
        return None

    async def _candidate_application_prompt_for_next_step(
        self,
        *,
        conversation: ConversationSessionModel,
        context: dict[str, Any],
        draft: dict[str, Any],
        intro: str | None = None,
    ) -> ConversationPrompt:
        missing_field = await self._candidate_application_next_missing_field(draft)
        if missing_field == "job":
            content = "Qual vaga você deseja?"
            quick_replies = (("ver_vagas", "Ver vagas"), ("cancelar_candidatura", "Cancelar"))
        elif missing_field == "unit":
            content = "Qual unidade você deseja?"
            quick_replies = (("cancelar_candidatura", "Cancelar"),)
        elif missing_field == "candidate_name":
            content = "Para continuar, preciso do seu nome."
            quick_replies = (("cancelar_candidatura", "Cancelar"),)
        elif missing_field == "contact":
            content = "Para continuar, preciso do seu telefone ou e-mail."
            quick_replies = (("cancelar_candidatura", "Cancelar"),)
        else:
            content = "Você autoriza o uso dos seus dados para essa candidatura?"
            quick_replies = (
                ("aceito_uso_dos_dados", "Aceito o uso dos dados"),
                ("cancelar_candidatura", "Cancelar"),
            )
        if intro:
            content = f"{intro} {content}"
        return ConversationPrompt(
            state=_GUIDED_PORTAL_CHAT_STATE,
            content=content,
            quick_replies=quick_replies,
        )

    @staticmethod
    def _candidate_application_job_id_from_message(content: str) -> UUID | None:
        normalized = (content or "").strip().casefold()
        if not normalized.startswith("job:"):
            return None
        raw_id = content.split(":", 1)[1].strip()
        with suppress(ValueError):
            return UUID(raw_id)
        return None

    @staticmethod
    def _candidate_application_match_unit(
        content: str,
        units: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        normalized = ConversationService._normalize(content) or ""
        if normalized.startswith("unit:"):
            raw_id = content.split(":", 1)[1].strip()
            return next((unit for unit in units if str(unit.get("id")) == raw_id), None)
        for unit in units:
            label = ConversationService._normalize(
                ConversationService._candidate_application_unit_label(unit)
            )
            if label and normalized and (label in normalized or normalized in label):
                return unit
        return None

    @staticmethod
    def _candidate_application_looks_like_job_query(content: str) -> bool:
        if _CANDIDATE_APPLICATION_NAME_PATTERN.search(content or ""):
            return False
        if _CANDIDATE_APPLICATION_EMAIL_PATTERN.search(content or ""):
            return False
        if _CANDIDATE_APPLICATION_PHONE_PATTERN.search(content or ""):
            return False
        if _CANDIDATE_APPLICATION_CONSENT_PATTERN.search(content or ""):
            return False
        normalized = ConversationService._normalize(content) or ""
        return bool(normalized and len(normalized) >= 3)

    @staticmethod
    def _candidate_application_unit_label(unit: dict[str, Any]) -> str:
        label = ConversationService._clean_text(unit.get("public_name")) or "Unidade"
        city = ConversationService._clean_text(unit.get("city"))
        state = ConversationService._clean_text(unit.get("state"))
        suffix = "/".join(part for part in (city, state) if part)
        return f"{label} ({suffix})" if suffix else label

    @staticmethod
    def _extract_candidate_application_data(content: str) -> _CandidateApplicationDraftExtraction:
        if _CANDIDATE_APPLICATION_SENSITIVE_PATTERN.search(content or ""):
            return _CandidateApplicationDraftExtraction(contains_sensitive_data=True)

        name_match = _CANDIDATE_APPLICATION_NAME_PATTERN.search(content or "")
        email_match = _CANDIDATE_APPLICATION_EMAIL_PATTERN.search(content or "")
        phone_match = _CANDIDATE_APPLICATION_PHONE_PATTERN.search(content or "")
        normalized = ConversationService._normalize(content) or ""
        consent = normalized == "aceito_uso_dos_dados" or bool(
            _CANDIDATE_APPLICATION_CONSENT_PATTERN.search(content or "")
        )
        return _CandidateApplicationDraftExtraction(
            candidate_name=(
                ConversationService._clean_text(name_match.group(1)) if name_match else None
            ),
            contact_email=(
                ConversationService._clean_text(email_match.group(1)) if email_match else None
            ),
            contact_phone=(
                ConversationService._clean_text(phone_match.group(0)) if phone_match else None
            ),
            consent_given=True if consent else None,
        )

    @staticmethod
    def _apply_candidate_application_extraction(
        draft: dict[str, Any],
        extraction: _CandidateApplicationDraftExtraction,
    ) -> None:
        if extraction.candidate_name:
            draft["candidate_name"] = extraction.candidate_name
        if extraction.contact_email:
            draft["contact_email"] = extraction.contact_email
        if extraction.contact_phone:
            draft["contact_phone"] = extraction.contact_phone
        if extraction.consent_given is True:
            draft["consent_given"] = True

    async def _candidate_application_draft_is_complete(self, draft: dict[str, Any]) -> bool:
        missing_field = await self._candidate_application_next_missing_field(draft)
        return missing_field is None

    async def _candidate_application_next_missing_field(
        self,
        draft: dict[str, Any],
    ) -> str | None:
        if not draft.get("job_id"):
            return "job"

        active_units = await self._session.execute(
            sa.select(sa.func.count(JobUnitModel.id)).where(
                JobUnitModel.job_id == self._uuid_from_context(draft.get("job_id")),
                JobUnitModel.is_active.is_(True),
            )
        )
        unit_count = int(active_units.scalar_one() or 0)
        if unit_count >= 2 and not draft.get("preferred_unit_id"):
            return "unit"
        if not draft.get("candidate_name"):
            return "candidate_name"
        if not draft.get("contact_email") and not draft.get("contact_phone"):
            return "contact"
        if draft.get("consent_given") is not True:
            return "consent"
        return None

    def _candidate_application_confirmation_prompt(
        self,
        draft: dict[str, Any],
    ) -> ConversationPrompt:
        draft["status"] = "awaiting_confirmation"
        draft["confirmation_requested_at"] = datetime.now(UTC).isoformat()
        contact = draft.get("contact_phone") or draft.get("contact_email") or "-"
        unit_name = draft.get("unit_name") or "Não informada"
        return ConversationPrompt(
            state=_GUIDED_PORTAL_CHAT_STATE,
            content=(
                "Confira sua candidatura:\n"
                f"Vaga: {draft.get('job_title') or '-'}\n"
                f"Unidade: {unit_name}\n"
                f"Nome: {draft.get('candidate_name') or '-'}\n"
                f"Contato: {contact}\n\n"
                "Confirma que deseja enviar sua candidatura com essas informações?"
            ),
            quick_replies=(
                ("confirmar_candidatura", "Confirmar candidatura"),
                ("alterar_dados", "Alterar dados"),
                ("cancelar_candidatura", "Cancelar"),
            ),
        )

    async def _submit_candidate_application_from_draft(
        self,
        *,
        conversation: ConversationSessionModel,
        draft: dict[str, Any],
    ) -> ConversationPrompt:
        result = await self._execute_candidate_bot_tool(
            conversation=conversation,
            tool_name="create_candidate_application_from_bot",
            tool_args={
                "job_id": draft.get("job_id"),
                "preferred_unit_id": draft.get("preferred_unit_id"),
                "candidate_name": draft.get("candidate_name"),
                "contact_email": draft.get("contact_email"),
                "contact_phone": draft.get("contact_phone"),
                "consent_given": bool(draft.get("consent_given")),
                "explicit_confirmation": True,
                "confirmation_requested_at": draft.get("confirmation_requested_at"),
            },
            read_only=False,
        )
        if not result.ok:
            if result.error_code == "DUPLICATE_APPLICATION":
                return ConversationPrompt(
                    state=_GUIDED_PORTAL_CHAT_STATE,
                    content=(
                        "Já encontramos uma candidatura sua para essa vaga. "
                        "Se precisar de ajuda, posso encaminhar para o RH."
                    ),
                    quick_replies=(
                        ("falar_com_rh", "Falar com RH"),
                        ("ver_vagas", "Ver vagas"),
                    ),
                )
            if result.error_code == "INVALID_UNIT":
                draft["preferred_unit_id"] = None
                draft["unit_name"] = None
                return ConversationPrompt(
                    state=_GUIDED_PORTAL_CHAT_STATE,
                    content=(
                        "Essa unidade não está vinculada à vaga selecionada. "
                        "Escolha uma das unidades disponíveis."
                    ),
                    quick_replies=(("cancelar_candidatura", "Cancelar"),),
                )
            if result.error_code in {"MISSING_REQUIRED_DATA", "CONSENT_REQUIRED", "UNIT_REQUIRED"}:
                return await self._candidate_application_prompt_for_next_step(
                    conversation=conversation,
                    context={},
                    draft=draft,
                    intro="Para continuar, preciso completar os dados faltantes.",
                )
            return ConversationPrompt(
                state=_GUIDED_PORTAL_CHAT_STATE,
                content=(
                    "Não consegui enviar sua candidatura agora. "
                    "Tente novamente ou fale com o RH."
                ),
                quick_replies=(("falar_com_rh", "Falar com RH"),),
            )

        data = result.data if isinstance(result.data, dict) else {}
        draft["status"] = "submitted"
        draft["submitted_application_id"] = data.get("application_id")
        if data.get("preferred_unit_id"):
            draft["preferred_unit_id"] = data.get("preferred_unit_id")
        if data.get("unit_name"):
            draft["unit_name"] = data.get("unit_name")
        return ConversationPrompt(
            state=_GUIDED_PORTAL_CHAT_STATE,
            content=(
                "Sua candidatura foi enviada com sucesso. "
                "O RH poderá acompanhar suas informações pelo sistema."
            ),
            quick_replies=(
                ("acompanhar_candidatura", "Acompanhar candidatura"),
                ("falar_com_rh", "Falar com RH"),
            ),
        )

    def _candidate_bot_prompt_from_tool_result(
        self,
        *,
        tool_name: str,
        result,
        context: dict[str, Any] | None = None,
    ) -> ConversationPrompt:
        draft = context.get(_CANDIDATE_APPLICATION_DRAFT_KEY) if isinstance(context, dict) else None
        draft_active = isinstance(draft, dict) and str(draft.get("status") or "") in {
            "collecting",
            "awaiting_confirmation",
        }
        if not result.ok:
            return ConversationPrompt(
                state=_GUIDED_PORTAL_CHAT_STATE,
                content=self._candidate_bot_error_message(tool_name, result.error_code),
                quick_replies=_CANDIDATE_BOT_INITIAL_PROMPT.quick_replies,
            )

        data = result.data if isinstance(result.data, dict) else {}
        if tool_name == "get_my_application_status":
            return ConversationPrompt(
                state=_GUIDED_PORTAL_CHAT_STATE,
                content=self._candidate_bot_status_message(data),
                quick_replies=(
                    ("ver_vagas", "Ver vagas"),
                    ("falar_com_rh", "Falar com RH"),
                ),
            )
        if tool_name == "search_public_jobs":
            jobs = data.get("jobs") if isinstance(data.get("jobs"), list) else []
            quick_replies = (
                tuple(
                    (
                        "job:" + str(job.get("id")),
                        self._candidate_application_job_quick_reply_label(job),
                    )
                    for job in jobs[:3]
                    if isinstance(job, dict) and job.get("id")
                )
                + (
                    ("falar_com_rh", "Falar com RH"),
                    ("cancelar_candidatura", "Cancelar"),
                )
            ) if draft_active else (
                ("quero_me_candidatar", "Quero me candidatar"),
                ("acompanhar_candidatura", "Acompanhar candidatura"),
                ("falar_com_rh", "Falar com RH"),
            )
            return ConversationPrompt(
                state=_GUIDED_PORTAL_CHAT_STATE,
                content=self._candidate_bot_jobs_message(data, draft_active=draft_active),
                quick_replies=quick_replies,
            )
        if tool_name == "get_public_job_units":
            units = data.get("job_units") if isinstance(data.get("job_units"), list) else []
            quick_replies = (
                tuple(
                    ("unit:" + str(unit.get("id")), self._candidate_application_unit_label(unit))
                    for unit in units[:3]
                    if isinstance(unit, dict) and unit.get("id")
                )
                + (
                    ("cancelar_candidatura", "Cancelar"),
                )
            ) if draft_active else (
                ("ver_vagas", "Ver vagas"),
                ("falar_com_rh", "Falar com RH"),
            )
            return ConversationPrompt(
                state=_GUIDED_PORTAL_CHAT_STATE,
                content=self._candidate_bot_units_message(data, draft_active=draft_active),
                quick_replies=quick_replies,
            )
        if tool_name == "get_public_job_detail":
            return ConversationPrompt(
                state=_GUIDED_PORTAL_CHAT_STATE,
                content=self._candidate_bot_job_detail_message(data),
                quick_replies=(
                    ("ver_vagas", "Ver vagas"),
                    ("falar_com_rh", "Falar com RH"),
                ),
            )
        if tool_name == "answer_candidate_knowledge":
            return ConversationPrompt(
                state=_GUIDED_PORTAL_CHAT_STATE,
                content=self._candidate_bot_answer_message(data),
                quick_replies=(
                    ("ver_vagas", "Ver vagas"),
                    ("quero_me_candidatar", "Quero me candidatar"),
                    ("falar_com_rh", "Falar com RH"),
                ),
            )
        return ConversationPrompt(
            state=_GUIDED_PORTAL_CHAT_STATE,
            content=self._candidate_bot_knowledge_message(data),
            quick_replies=(
                ("ver_vagas", "Ver vagas"),
                ("acompanhar_candidatura", "Acompanhar candidatura"),
                ("falar_com_rh", "Falar com RH"),
            ),
        )

    @staticmethod
    def _candidate_bot_error_message(tool_name: str, error_code: str | None) -> str:
        if tool_name == "get_my_application_status" and error_code == "PROFILE_INCOMPLETE":
            return (
                "Consigo acompanhar sua candidatura, mas antes você precisa completar "
                "seu cadastro na sua área do candidato."
            )
        if (
            tool_name in {"get_public_job_detail", "get_public_job_units"}
            and error_code == "NOT_FOUND"
        ):
            return (
                "Não consegui localizar essa vaga publicada agora. "
                "Tente ver a lista de vagas novamente."
            )
        return _CANDIDATE_BOT_GENERIC_FALLBACK

    @staticmethod
    def _candidate_bot_status_message(data: dict[str, Any]) -> str:
        active_application = data.get("active_application") or {}
        job_title = ConversationService._clean_text(active_application.get("job_title"))
        public_status = ConversationService._clean_text(
            data.get("current_process_status_label") or data.get("status_public")
        )
        if job_title and public_status:
            return f"Sua candidatura em {job_title} está com o status: {public_status}."
        if public_status:
            return f"O status público da sua candidatura é: {public_status}."
        return "No momento não encontrei uma candidatura ativa para acompanhar por aqui."

    @staticmethod
    def _candidate_application_job_quick_reply_label(job: dict[str, Any]) -> str:
        title = ConversationService._clean_text(job.get("title")) or "Vaga"
        location = ConversationService._clean_text(job.get("location"))
        return f"{title} ({location})" if location else title

    @staticmethod
    def _candidate_bot_jobs_message(
        data: dict[str, Any],
        *,
        draft_active: bool = False,
    ) -> str:
        jobs = data.get("jobs")
        if not isinstance(jobs, list) or not jobs:
            return (
                "No momento não encontrei vagas com esse filtro. Se quiser, me diga "
                "a cidade ou a função que você procura."
            )
        lines = []
        for job in jobs[:3]:
            if not isinstance(job, dict):
                continue
            title = ConversationService._clean_text(job.get("title")) or "Vaga"
            location = ConversationService._clean_text(job.get("location")) or "local a confirmar"
            lines.append(f"- {title} — {location}")
        summary = "\n".join(lines)
        if draft_active:
            return "Encontrei estas vagas públicas. Qual vaga você deseja?\n" + summary
        return (
            "Encontrei estas vagas públicas para você:\n"
            f"{summary}\n"
            "Se quiser, posso continuar te ajudando com dúvidas gerais ou encaminhar você ao RH."
        )

    @staticmethod
    def _candidate_bot_units_message(
        data: dict[str, Any],
        *,
        draft_active: bool = False,
    ) -> str:
        units = data.get("job_units")
        if not isinstance(units, list) or not units:
            return "Esta vaga não tem unidades públicas detalhadas no momento."
        lines = []
        for unit in units[:3]:
            if not isinstance(unit, dict):
                continue
            label = ConversationService._clean_text(unit.get("public_name")) or "Unidade"
            city = ConversationService._clean_text(unit.get("city"))
            state = ConversationService._clean_text(unit.get("state"))
            location = "/".join(part for part in (city, state) if part)
            lines.append(f"- {label}{f' — {location}' if location else ''}")
        prefix = "Estas são as unidades públicas dessa vaga. Qual unidade você deseja?\n"
        if not draft_active:
            prefix = "Estas são as unidades públicas dessa vaga:\n"
        return prefix + "\n".join(lines)

    @staticmethod
    def _candidate_bot_job_detail_message(data: dict[str, Any]) -> str:
        title = ConversationService._clean_text(data.get("title")) or "Vaga"
        description = ConversationService._candidate_bot_excerpt(data.get("description"))
        requirements = ConversationService._candidate_bot_excerpt(data.get("requirements"))
        parts = [f"Sobre a vaga {title}:"]
        if description:
            parts.append(description)
        if requirements:
            parts.append(f"Requisitos principais: {requirements}")
        return " ".join(parts)

    @staticmethod
    def _candidate_bot_answer_message(data: dict[str, Any]) -> str:
        answer = ConversationService._candidate_bot_excerpt(data.get("answer"))
        if answer:
            return answer
        return ConversationService._candidate_bot_knowledge_message(data)

    @staticmethod
    def _candidate_bot_knowledge_message(data: dict[str, Any]) -> str:
        chunks = data.get("chunks")
        if not isinstance(chunks, list) or not chunks:
            return (
                "Não encontrei uma resposta pública confiável para isso agora. "
                "Se quiser, posso buscar vagas ou encaminhar seu atendimento para o RH."
            )
        top_chunk = chunks[0] if isinstance(chunks[0], dict) else {}
        source_title = ConversationService._clean_text(top_chunk.get("source_title"))
        excerpt = ConversationService._candidate_bot_excerpt(top_chunk.get("content"))
        if source_title and excerpt:
            return f"Encontrei isto na base pública ({source_title}): {excerpt}"
        if excerpt:
            return excerpt
        return _CANDIDATE_BOT_GENERIC_FALLBACK

    @staticmethod
    def _candidate_bot_excerpt(value: Any, *, limit: int = 240) -> str | None:
        cleaned = ConversationService._clean_text(value)
        if cleaned is None:
            return None
        compact = re.sub(r"\s+", " ", cleaned)
        if len(compact) <= limit:
            return compact
        return compact[: limit - 1].rstrip() + "…"

    @staticmethod
    def _remember_candidate_portal_prompt(
        context: dict[str, Any],
        prompt: ConversationPrompt,
    ) -> None:
        context["candidate_portal_last_assistant_message"] = prompt.content
        context["candidate_portal_last_quick_replies"] = ConversationService._quick_replies_dicts(
            prompt
        )

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
        context = conversation.context_json or {}
        return ConversationTurnResponse(
            session_id=conversation.id,
            current_state=self._public_state(conversation),
            assistant_message=message.content,
            quick_replies=quick_replies,
            session=self._session_response(conversation, prompt),
            message=self._message_response(message),
            options=quick_replies,
            handoff_required=bool(context.get("handoff_requested")),
        )

    def _session_response(
        self,
        conversation: ConversationSessionModel,
        prompt: ConversationPrompt | None = None,
    ) -> ConversationSessionResponse:
        current_prompt = prompt or self._session_prompt(conversation)
        return ConversationSessionResponse(
            id=conversation.id,
            session_id=conversation.id,
            channel=conversation.channel,
            current_state=self._public_state(conversation),
            status=conversation.status,
            context=self._public_context(conversation.context_json or {}),
            assistant_message=current_prompt.content,
            quick_replies=self._quick_replies(current_prompt),
            last_message_at=conversation.last_message_at,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
        )

    @staticmethod
    def _public_state(conversation: ConversationSessionModel) -> str:
        context = conversation.context_json or {}
        if bool(context.get("candidate_portal_guided_chat")):
            return _GUIDED_PORTAL_CHAT_STATE
        return conversation.current_state

    @staticmethod
    def _session_prompt(conversation: ConversationSessionModel) -> ConversationPrompt:
        context = conversation.context_json or {}
        if bool(context.get("candidate_portal_guided_chat")):
            last_message = ConversationService._clean_text(
                context.get("candidate_portal_last_assistant_message")
            ) or _CANDIDATE_BOT_INITIAL_PROMPT.content
            quick_reply_rows = context.get("candidate_portal_last_quick_replies")
            quick_replies: tuple[tuple[str, str], ...] | None = None
            if isinstance(quick_reply_rows, list):
                quick_replies = tuple(
                    (str(item.get("value")), str(item.get("label")))
                    for item in quick_reply_rows
                    if isinstance(item, dict)
                    and isinstance(item.get("value"), str)
                    and isinstance(item.get("label"), str)
                )
            if quick_replies is None:
                quick_replies = _CANDIDATE_BOT_INITIAL_PROMPT.quick_replies
            return ConversationPrompt(
                state=_GUIDED_PORTAL_CHAT_STATE,
                content=last_message,
                quick_replies=quick_replies,
            )
        return prompt_for(conversation.current_state, context)

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
            "lead_cpf",
            "pending_resume_path",
            "pending_resume_filename",
            "candidate_portal_last_assistant_message",
            "candidate_portal_last_quick_replies",
            "candidate_portal_guided_application_active",
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
