"""Candidate Assistant Intent Parser — OP-7A.

A thin AI layer that INTERPRETS a leigo (lay) candidate's free-text message into
a strict, structured intent object. It exists so the deterministic Conversation
Engine can understand phrasings like "quero trabalhar de caixa a noite" or
"qualquer posto em goiania" without forcing the candidate to click exact quick
replies.

Hard boundaries (enforced here and by the caller):
- The AI ONLY interprets intent and extracts hint fields. It never decides the
  next state, never approves/rejects a candidate, never creates a pipeline,
  never mutates a CandidateApplication, never invents a vacancy, and never
  promises hiring. The state machine remains the sole authority.
- The AI receives ONLY: the current state, a sanitized (PII-masked) message, the
  list of valid intents for the state, and the state's quick-reply labels. It
  NEVER receives ``context_json`` or any raw CPF/phone/email.
- The contract is strict: unknown JSON keys, invalid JSON, an unknown intent, or
  a confidence below the configured threshold all collapse to ``None`` so the
  caller falls back to the deterministic flow.
- Logs never contain the raw message or any PII — only the sanitized text and
  structural metadata.
"""
from __future__ import annotations

import asyncio
import json
from collections.abc import Sequence

import structlog
from pydantic import BaseModel, ConfigDict, ValidationError, field_validator

from src.application.ports.ai_service import AIAnalysisRequest, AIService
from src.application.services.admin_assistant_service import sanitise_assistant_text
from src.core.settings import settings
from src.infrastructure.ai.factory import AIServiceFactory
from src.infrastructure.ai.response_parser import extract_json

logger = structlog.get_logger(__name__)

# Every intent the parser may ever emit. The caller maps only the subset that is
# meaningful for the current state; anything else degrades to deterministic
# fallback.
ALLOWED_INTENTS: frozenset[str] = frozenset(
    {
        "choose_location",
        "choose_unit",
        "choose_any_unit",
        "choose_function",
        "choose_shift",
        "skip_resume",
        "upload_resume",
        "accept_lgpd",
        "reject_lgpd",
        "confirm_application",
        "cancel",
        "review",
        "talk_to_hr",
        "help",
        "unclear",
    }
)

_MAX_MESSAGE_CHARS = 500
_MAX_HINT_CHARS = 120
_QUEUE_NAME = "candidate_assistant_intent"
_MAX_OUTPUT_TOKENS = 256

_SYSTEM_PROMPT = (
    "Você é um interpretador de intenção para um assistente de vagas de emprego. "
    "Sua ÚNICA função é classificar a mensagem do candidato e extrair campos úteis. "
    "Você NÃO decide a próxima etapa, NÃO aprova nem reprova candidatos, NÃO "
    "promete contratação, NÃO inventa vagas e NÃO infere dados pessoais. "
    "Responda SOMENTE com um objeto JSON válido, sem texto extra, seguindo "
    "exatamente este formato e sem campos adicionais:\n"
    "{\n"
    '  "intent": "<um dos intents permitidos>",\n'
    '  "confidence": 0.0,\n'
    '  "location_hint": null,\n'
    '  "unit_hint": null,\n'
    '  "desired_function": null,\n'
    '  "desired_shift": null,\n'
    '  "resume_choice": null,\n'
    '  "lgpd_consent": null,\n'
    '  "confirmation": null,\n'
    '  "should_handoff": false,\n'
    '  "safe_user_message": null\n'
    "}\n"
    "confidence é um número de 0.0 a 1.0. Use o intent 'unclear' com confidence "
    "baixo quando não tiver certeza. desired_shift deve ser um de: manha, tarde, "
    "noite, qualquer. Nunca inclua CPF, telefone ou e-mail em nenhum campo."
)


class CandidateIntent(BaseModel):
    """Strict projection of the AI's JSON response.

    ``extra="forbid"`` makes any unexpected key a validation error, which the
    service turns into a deterministic fallback.
    """

    model_config = ConfigDict(extra="forbid")

    intent: str
    confidence: float = 0.0
    location_hint: str | None = None
    unit_hint: str | None = None
    desired_function: str | None = None
    desired_shift: str | None = None
    resume_choice: str | None = None
    lgpd_consent: bool | None = None
    confirmation: str | None = None
    should_handoff: bool = False
    safe_user_message: str | None = None

    @field_validator("intent")
    @classmethod
    def _validate_intent(cls, value: str) -> str:
        normalized = (value or "").strip().lower()
        if normalized not in ALLOWED_INTENTS:
            raise ValueError(f"unknown intent: {value!r}")
        return normalized

    @field_validator(
        "location_hint",
        "unit_hint",
        "desired_function",
        "desired_shift",
        "confirmation",
        "safe_user_message",
        mode="before",
    )
    @classmethod
    def _trim_hint(cls, value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        return text[:_MAX_HINT_CHARS]


class CandidateAssistantIntentService:
    """Interprets a single candidate message into a :class:`CandidateIntent`.

    Returns ``None`` (deterministic fallback) on ANY problem: disabled feature,
    provider error, timeout, rate limit, invalid/extra-key JSON, unknown intent,
    or sub-threshold confidence.
    """

    def __init__(self, ai_service: AIService | None = None) -> None:
        self._ai_service = ai_service

    async def interpret(
        self,
        *,
        state: str,
        message: str,
        allowed_intents: Sequence[str] = (),
        quick_replies: Sequence[tuple[str, str]] = (),
        min_confidence: float | None = None,
    ) -> CandidateIntent | None:
        sanitized = self._sanitize_message(message)
        if not sanitized:
            return None

        threshold = (
            min_confidence
            if min_confidence is not None
            else float(settings.ASSISTANT_INTENT_AI_MIN_CONFIDENCE)
        )

        try:
            raw = await self._call_ai(
                state=state,
                sanitized=sanitized,
                allowed_intents=allowed_intents,
                quick_replies=quick_replies,
            )
        except TimeoutError:
            logger.warning("assistant_intent.timeout", state=state)
            return None
        except Exception as exc:  # provider/rate-limit/network — always fall back
            logger.warning(
                "assistant_intent.provider_error",
                state=state,
                error_type=type(exc).__name__,
            )
            return None

        intent = self._parse(raw, state=state)
        if intent is None:
            return None

        if intent.confidence < threshold:
            logger.info(
                "assistant_intent.low_confidence",
                state=state,
                intent=intent.intent,
                confidence=round(intent.confidence, 3),
            )
            return None

        if allowed_intents and intent.intent not in set(allowed_intents):
            # Intent is valid globally but not meaningful for this state.
            logger.info(
                "assistant_intent.out_of_scope",
                state=state,
                intent=intent.intent,
            )
            return None

        logger.info(
            "assistant_intent.resolved",
            state=state,
            intent=intent.intent,
            confidence=round(intent.confidence, 3),
            should_handoff=intent.should_handoff,
        )
        return intent

    async def _call_ai(
        self,
        *,
        state: str,
        sanitized: str,
        allowed_intents: Sequence[str],
        quick_replies: Sequence[tuple[str, str]],
    ) -> str:
        ai = self._ai_service or AIServiceFactory.create(
            settings.AI_PROVIDER, settings.AI_MODEL_ID
        )
        request = AIAnalysisRequest(
            resume_text="",
            prompt_template=self._user_prompt(
                state=state,
                sanitized=sanitized,
                allowed_intents=allowed_intents,
                quick_replies=quick_replies,
            ),
            system_prompt=_SYSTEM_PROMPT,
            max_tokens=_MAX_OUTPUT_TOKENS,
            temperature=0.0,
            queue_name=_QUEUE_NAME,
        )
        timeout = max(1.0, float(settings.ASSISTANT_INTENT_AI_TIMEOUT_SECONDS))
        response = await asyncio.wait_for(ai.analyze(request), timeout=timeout)
        return response.content

    def _parse(self, raw: str, *, state: str) -> CandidateIntent | None:
        try:
            data = extract_json(raw)
        except Exception:
            logger.warning("assistant_intent.invalid_json", state=state)
            return None

        try:
            return CandidateIntent.model_validate(data)
        except ValidationError as exc:
            logger.warning(
                "assistant_intent.schema_rejected",
                state=state,
                error_count=len(exc.errors()),
            )
            return None

    @staticmethod
    def _sanitize_message(message: str) -> str:
        if not message:
            return ""
        # Mask any CPF/phone the candidate may have typed before it reaches the AI.
        masked = sanitise_assistant_text(message.strip())
        return masked[:_MAX_MESSAGE_CHARS].strip()

    @staticmethod
    def _user_prompt(
        *,
        state: str,
        sanitized: str,
        allowed_intents: Sequence[str],
        quick_replies: Sequence[tuple[str, str]],
    ) -> str:
        intents = ", ".join(allowed_intents) if allowed_intents else ", ".join(
            sorted(ALLOWED_INTENTS)
        )
        labels = (
            "; ".join(label for _value, label in quick_replies)
            if quick_replies
            else "(nenhuma)"
        )
        payload = {
            "estado_atual": state,
            "mensagem": sanitized,
            "intents_validos": intents,
            "opcoes_rapidas": labels,
        }
        return (
            "Classifique a mensagem do candidato no contexto abaixo e responda "
            "apenas com o JSON do contrato.\n"
            f"{json.dumps(payload, ensure_ascii=False)}"
        )
