"""Controlled routing for free-text candidate bot messages."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

from src.application.services.candidate_assistant_intent_service import CandidateIntent
from src.application.services.conversation_state_machine import (
    ConversationPrompt,
    prompt_for,
)

RouteAction = Literal["handoff", "tool", "guided_flow", "safe_response"]

_GREETING_PATTERN = re.compile(
    r"\b(oi|olá|ola|bom dia|boa tarde|boa noite|e aí|ei)\b",
    re.IGNORECASE,
)
_TALK_TO_HR_PATTERN = re.compile(
    r"\b(falar com (o )?rh|quero falar com (o )?rh|humano|atendente|recrutador|recrutadora)\b",
    re.IGNORECASE,
)
_SEE_JOBS_PATTERN = re.compile(
    r"\b(tem vaga|tem vagas|ver vaga|ver vagas|vagas|vaga|oportunidade|oportunidades)\b",
    re.IGNORECASE,
)
_APPLY_TO_JOB_PATTERN = re.compile(
    (
        r"\b(quero me candidatar|quero candidatar|me candidatar|candidatar|"
        r"quero essa vaga|quero aplicar)\b"
    ),
    re.IGNORECASE,
)
_UNITS_PATTERN = re.compile(
    r"\b(unidade|unidades|posto|postos|filial|filiais|endere[cç]o|local)\b",
    re.IGNORECASE,
)
_STATUS_PATTERN = re.compile(
    r"\b(status|acompanhar|minha candidatura|meu processo|andamento|etapa)\b",
    re.IGNORECASE,
)
_UPLOAD_RESUME_PATTERN = re.compile(
    r"\b(curr[ií]culo|curriculo|cv|anexar curr[ií]culo|enviar curr[ií]culo)\b",
    re.IGNORECASE,
)
_PROVIDE_DATA_PATTERN = re.compile(
    r"\b(meu nome [ée]|me chamo|meu email|meu e-mail|meu telefone|meu whatsapp)\b",
    re.IGNORECASE,
)
_CONFIRM_PATTERN = re.compile(
    r"\b(confirmo|confirmar|pode seguir|sim pode|quero seguir|ok pode)\b",
    re.IGNORECASE,
)
_CANCEL_PATTERN = re.compile(
    r"\b(cancelar|cancela|parar|desistir|não quero mais|nao quero mais)\b",
    re.IGNORECASE,
)
_QUESTION_PATTERN = re.compile(
    r"\?|^qual\b|^quais\b|^como\b|^onde\b|^quando\b|^benef[ií]cio|^benef[ií]cios|^requisito|^requisitos",
    re.IGNORECASE,
)
_SENSITIVE_TOPIC_PATTERN = re.compile(
    r"\b(gr[aá]vida|gravidez|sa[uú]de|religi[aã]o|pol[ií]tica|ra[cç]a|cor|"
    r"orienta[cç][aã]o sexual|fam[ií]lia|filho|filhos|dados banc[aá]rios)\b",
    re.IGNORECASE,
)
_RISKY_PATTERN = re.compile(
    r"\b(ignore as regras|documento interno|crit[eé]rio interno|mostre documento interno|"
    r"pipeline|aprova direto|me aprova|reprova|rejeita)\b",
    re.IGNORECASE,
)

_UNKNOWN_QUICK_REPLIES: tuple[tuple[str, str], ...] = (
    ("ver_vagas", "Ver vagas"),
    ("quero_me_candidatar", "Quero me candidatar"),
    ("acompanhar_candidatura", "Acompanhar candidatura"),
    ("falar_com_rh", "Falar com RH"),
)
_SAFE_HELP_MESSAGE = (
    "Posso te ajudar com vagas públicas, dúvidas gerais do processo, "
    "acompanhamento da sua candidatura ou atendimento com o RH."
)
_SENSITIVE_TOPIC_MESSAGE = (
    "Esse tipo de informação sensível não deve ser usado para avaliar sua candidatura por aqui. "
    "Se você quiser, posso seguir com informações públicas ou encaminhar seu atendimento para o RH."
)
_DATA_COLLECTION_MESSAGE = (
    "Posso seguir com informações públicas e iniciar o fluxo guiado de candidatura. "
    "Qualquer dado só deve ser confirmado antes de um registro futuro."
)
_UPLOAD_RESUME_MESSAGE = (
    "Posso iniciar sua candidatura guiada e, no momento certo, seguir para o envio do currículo."
)


@dataclass(frozen=True)
class CandidateAgentRouteDecision:
    intent: str
    action: RouteAction
    prompt: ConversationPrompt | None = None
    safe_message: str | None = None
    quick_replies: tuple[tuple[str, str], ...] = ()
    tool_name: str | None = None
    tool_args: dict[str, str | int] = field(default_factory=dict)


class CandidateAgentRouter:
    """Routes free-text candidate bot messages into controlled actions."""

    def route(
        self,
        *,
        message: str,
        context: dict[str, object] | None = None,
        ai_intent: CandidateIntent | None = None,
    ) -> CandidateAgentRouteDecision:
        ctx = context or {}
        text = (message or "").strip()
        intent = self._classify_intent(text, ctx, ai_intent)

        if intent == "talk_to_hr":
            return CandidateAgentRouteDecision(intent=intent, action="handoff")
        if intent == "see_jobs":
            return CandidateAgentRouteDecision(
                intent=intent,
                action="tool",
                tool_name="search_public_jobs",
                tool_args={"query": self._job_query(text) or "", "limit": 5},
            )
        if intent == "choose_unit":
            job_id = self._text(ctx.get("job_id"))
            if job_id is not None:
                return CandidateAgentRouteDecision(
                    intent=intent,
                    action="tool",
                    tool_name="get_public_job_units",
                    tool_args={"job_id": job_id},
                )
            return CandidateAgentRouteDecision(
                intent=intent,
                action="safe_response",
                safe_message=(
                    "Posso te mostrar as vagas publicadas primeiro e, depois, "
                    "as unidades públicas da vaga que você escolher."
                ),
                quick_replies=(
                    ("ver_vagas", "Ver vagas"),
                    ("falar_com_rh", "Falar com RH"),
                ),
            )
        if intent == "ask_question":
            return CandidateAgentRouteDecision(
                intent=intent,
                action="tool",
                tool_name="answer_candidate_knowledge",
                tool_args={"query": text, "limit": 3},
            )
        if intent == "check_status":
            return CandidateAgentRouteDecision(
                intent=intent,
                action="tool",
                tool_name="get_my_application_status",
            )
        if intent in {"apply_to_job", "upload_resume"}:
            prompt = prompt_for("CHOOSE_LOCATION")
            intro = _UPLOAD_RESUME_MESSAGE if intent == "upload_resume" else None
            if intro:
                prompt = ConversationPrompt(
                    state=prompt.state,
                    content=f"{intro} {prompt.content}",
                    quick_replies=prompt.quick_replies,
                )
            return CandidateAgentRouteDecision(
                intent=intent,
                action="guided_flow",
                prompt=prompt,
            )
        if intent == "greeting":
            return CandidateAgentRouteDecision(
                intent=intent,
                action="safe_response",
                safe_message=(
                    "Olá! Posso te ajudar a ver vagas públicas, tirar dúvidas "
                    "sobre o processo, acompanhar sua candidatura ou falar com o RH."
                ),
                quick_replies=_UNKNOWN_QUICK_REPLIES,
            )
        if intent == "provide_candidate_data":
            return CandidateAgentRouteDecision(
                intent=intent,
                action="safe_response",
                safe_message=_DATA_COLLECTION_MESSAGE,
                quick_replies=(
                    ("quero_me_candidatar", "Quero me candidatar"),
                    ("falar_com_rh", "Falar com RH"),
                ),
            )
        if intent == "confirm":
            return CandidateAgentRouteDecision(
                intent=intent,
                action="safe_response",
                safe_message=(
                    "Posso te ajudar a iniciar a candidatura guiada, consultar vagas públicas "
                    "ou encaminhar seu atendimento para o RH."
                ),
                quick_replies=_UNKNOWN_QUICK_REPLIES,
            )
        if intent == "cancel":
            return CandidateAgentRouteDecision(
                intent=intent,
                action="safe_response",
                safe_message=(
                    "Sem problema. Se quiser, posso voltar a mostrar vagas públicas, "
                    "acompanhar sua candidatura ou chamar o RH."
                ),
                quick_replies=_UNKNOWN_QUICK_REPLIES,
            )

        safe_message = self._safe_message_for_unknown(text, ai_intent)
        return CandidateAgentRouteDecision(
            intent="unknown",
            action="safe_response",
            safe_message=safe_message,
            quick_replies=_UNKNOWN_QUICK_REPLIES,
        )

    def _classify_intent(
        self,
        message: str,
        context: dict[str, object],
        ai_intent: CandidateIntent | None,
    ) -> str:
        lowered = message.casefold()
        if ai_intent is not None and (ai_intent.should_handoff or ai_intent.intent == "talk_to_hr"):
            return "talk_to_hr"
        if _SENSITIVE_TOPIC_PATTERN.search(message):
            return "unknown"
        if _RISKY_PATTERN.search(message):
            return "unknown"
        if _TALK_TO_HR_PATTERN.search(message):
            return "talk_to_hr"
        if _STATUS_PATTERN.search(message):
            return "check_status"
        if self._text(context.get("job_id")) and _UNITS_PATTERN.search(message):
            return "choose_unit"
        if _APPLY_TO_JOB_PATTERN.search(message):
            return "apply_to_job"
        if _UPLOAD_RESUME_PATTERN.search(message):
            return "upload_resume"
        if _SEE_JOBS_PATTERN.search(message):
            return "see_jobs"
        if _PROVIDE_DATA_PATTERN.search(message):
            return "provide_candidate_data"
        if _CONFIRM_PATTERN.search(message):
            return "confirm"
        if _CANCEL_PATTERN.search(message):
            return "cancel"
        if _GREETING_PATTERN.search(message) and len(lowered.split()) <= 6:
            return "greeting"
        if _QUESTION_PATTERN.search(message):
            return "ask_question"
        return "unknown"

    def _safe_message_for_unknown(
        self,
        message: str,
        ai_intent: CandidateIntent | None,
    ) -> str:
        if _SENSITIVE_TOPIC_PATTERN.search(message):
            return _SENSITIVE_TOPIC_MESSAGE
        if ai_intent is not None and ai_intent.safe_user_message:
            return ai_intent.safe_user_message
        if _RISKY_PATTERN.search(message):
            return (
                "Posso te ajudar apenas com informações públicas e seguras. "
                "Não posso expor regras internas nem executar ações proibidas. "
                "Se quiser, posso seguir com informações públicas ou encaminhar você para o RH."
            )
        return _SAFE_HELP_MESSAGE

    @staticmethod
    def _job_query(message: str) -> str | None:
        cleaned = re.sub(
            r"\b(quero|ver|buscar|procurar|me|candidatar|trabalhar|tem|vaga|vagas|"
            r"oportunidade|oportunidades|para|uma|um|em|no|na|de|do|da)\b",
            " ",
            message,
            flags=re.IGNORECASE,
        )
        compact = re.sub(r"\s+", " ", cleaned).strip(" .,-")
        return compact or None

    @staticmethod
    def _text(value: object) -> str | None:
        if not isinstance(value, str):
            return None
        cleaned = value.strip()
        return cleaned or None
