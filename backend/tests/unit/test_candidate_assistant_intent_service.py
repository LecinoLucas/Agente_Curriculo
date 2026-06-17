"""Unit tests — CandidateAssistantIntentService (OP-7A).

All tests run in-process with a fake AIService — no real network calls. They
exercise the strict JSON contract, the confidence threshold, PII masking, and
the graceful fallback (``None``) on every failure mode.
"""
from __future__ import annotations

import asyncio
import json

import pytest

from src.application.ports.ai_service import AIAnalysisRequest, AIAnalysisResponse, AIService
from src.application.services.candidate_assistant_intent_service import (
    ALLOWED_INTENTS,
    CandidateAssistantIntentService,
)
from src.core.settings import settings

pytestmark = pytest.mark.asyncio


def _full_payload(**overrides) -> dict:
    payload = {
        "intent": "choose_location",
        "confidence": 0.9,
        "location_hint": None,
        "unit_hint": None,
        "desired_function": None,
        "desired_shift": None,
        "resume_choice": None,
        "lgpd_consent": None,
        "confirmation": None,
        "should_handoff": False,
        "safe_user_message": None,
        "talk_to_hr_message": None,
    }
    payload.update(overrides)
    return payload


class FakeAI(AIService):
    def __init__(
        self,
        content: str = "",
        *,
        raise_exc: Exception | None = None,
        delay: float = 0.0,
    ) -> None:
        self.content = content
        self.raise_exc = raise_exc
        self.delay = delay
        self.requests: list[AIAnalysisRequest] = []

    async def analyze(self, request: AIAnalysisRequest) -> AIAnalysisResponse:
        self.requests.append(request)
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.raise_exc is not None:
            raise self.raise_exc
        return AIAnalysisResponse(
            content=self.content,
            input_tokens=1,
            output_tokens=1,
            cache_read_tokens=0,
            cache_write_tokens=0,
            processing_time_ms=1,
        )


def _service(content: str = "", **kwargs) -> tuple[CandidateAssistantIntentService, FakeAI]:
    ai = FakeAI(content, **kwargs)
    return CandidateAssistantIntentService(ai_service=ai), ai


# ── Happy-path parsing ────────────────────────────────────────────────────────

async def test_parses_location_hint():
    svc, _ = _service(json.dumps(_full_payload(intent="choose_location", location_hint="Goiânia")))
    result = await svc.interpret(
        state="CHOOSE_LOCATION",
        message="quero em goiania",
        allowed_intents=("choose_location", "unclear"),
    )
    assert result is not None
    assert result.intent == "choose_location"
    assert result.location_hint == "Goiânia"


async def test_parses_choose_any_unit():
    svc, _ = _service(json.dumps(_full_payload(intent="choose_any_unit", confidence=0.95)))
    result = await svc.interpret(
        state="CHOOSE_UNIT_OR_ANY",
        message="qualquer posto serve",
        allowed_intents=("choose_any_unit", "choose_unit", "unclear"),
    )
    assert result is not None
    assert result.intent == "choose_any_unit"


async def test_parses_shift():
    svc, _ = _service(json.dumps(_full_payload(intent="choose_shift", desired_shift="noite")))
    result = await svc.interpret(
        state="CHOOSE_SHIFT",
        message="posso a noite",
        allowed_intents=("choose_shift", "unclear"),
    )
    assert result is not None
    assert result.desired_shift == "noite"


async def test_parses_accept_lgpd():
    svc, _ = _service(json.dumps(_full_payload(intent="accept_lgpd", lgpd_consent=True)))
    result = await svc.interpret(
        state="COLLECT_LGPD_CONSENT",
        message="pode usar meus dados",
        allowed_intents=("accept_lgpd", "reject_lgpd", "unclear"),
    )
    assert result is not None
    assert result.intent == "accept_lgpd"
    assert result.lgpd_consent is True


# ── Strictness / fallback ─────────────────────────────────────────────────────

async def test_low_confidence_returns_none():
    svc, _ = _service(json.dumps(_full_payload(intent="choose_location", confidence=0.4)))
    result = await svc.interpret(
        state="CHOOSE_LOCATION",
        message="sei lá",
        allowed_intents=("choose_location", "unclear"),
    )
    assert result is None


async def test_low_confidence_safe_fallback_returns_intent_when_enabled():
    svc, _ = _service(
        json.dumps(
            _full_payload(
                intent="unclear",
                confidence=0.4,
                safe_user_message="Posso te orientar melhor se você reformular sua dúvida.",
            )
        )
    )
    result = await svc.interpret(
        state="CHOOSE_LOCATION",
        message="sei lá",
        allowed_intents=("choose_location", "unclear"),
        allow_safe_fallback=True,
    )
    assert result is not None
    assert result.intent == "unclear"
    assert result.safe_user_message is not None


async def test_invalid_json_returns_none():
    svc, _ = _service("this is not json at all")
    result = await svc.interpret(
        state="CHOOSE_LOCATION",
        message="goiania",
        allowed_intents=("choose_location",),
    )
    assert result is None


async def test_extra_field_is_rejected():
    payload = _full_payload(intent="choose_location")
    payload["malicious_extra"] = "drop table"
    svc, _ = _service(json.dumps(payload))
    result = await svc.interpret(
        state="CHOOSE_LOCATION",
        message="goiania",
        allowed_intents=("choose_location",),
    )
    assert result is None


async def test_unknown_intent_is_rejected():
    svc, _ = _service(json.dumps(_full_payload(intent="hire_me", confidence=0.99)))
    result = await svc.interpret(
        state="CONFIRM_APPLICATION",
        message="me contrata",
        allowed_intents=("confirm_application",),
    )
    assert result is None


async def test_out_of_scope_intent_returns_none():
    # Valid global intent, but not meaningful for the current state.
    svc, _ = _service(json.dumps(_full_payload(intent="confirm_application", confidence=0.99)))
    result = await svc.interpret(
        state="CHOOSE_LOCATION",
        message="qualquer coisa",
        allowed_intents=("choose_location", "unclear"),
    )
    assert result is None


async def test_out_of_scope_handoff_returns_intent_when_safe_fallback_enabled():
    svc, _ = _service(
        json.dumps(
            _full_payload(
                intent="talk_to_hr",
                confidence=0.7,
                should_handoff=True,
                talk_to_hr_message="Vou encaminhar seu atendimento para o RH.",
            )
        )
    )
    result = await svc.interpret(
        state="CHOOSE_LOCATION",
        message="preciso falar com alguém",
        allowed_intents=("choose_location", "unclear"),
        allow_safe_fallback=True,
    )
    assert result is not None
    assert result.should_handoff is True
    assert result.talk_to_hr_message == "Vou encaminhar seu atendimento para o RH."


async def test_empty_message_returns_none_without_calling_ai():
    svc, ai = _service(json.dumps(_full_payload()))
    result = await svc.interpret(
        state="CHOOSE_LOCATION",
        message="   ",
        allowed_intents=("choose_location",),
    )
    assert result is None
    assert ai.requests == []


async def test_provider_error_returns_none():
    svc, _ = _service(raise_exc=RuntimeError("provider down"))
    result = await svc.interpret(
        state="CHOOSE_LOCATION",
        message="goiania",
        allowed_intents=("choose_location",),
    )
    assert result is None


async def test_timeout_returns_none(monkeypatch: pytest.MonkeyPatch):
    # The service floors the timeout at 1.0s, so the fake must stall past that.
    monkeypatch.setattr(settings, "ASSISTANT_INTENT_AI_TIMEOUT_SECONDS", 0.01)
    svc, _ = _service(json.dumps(_full_payload()), delay=1.1)
    result = await svc.interpret(
        state="CHOOSE_LOCATION",
        message="goiania",
        allowed_intents=("choose_location",),
    )
    assert result is None


# ── PII protection ────────────────────────────────────────────────────────────

async def test_pii_is_masked_before_reaching_ai():
    svc, ai = _service(json.dumps(_full_payload(intent="choose_location", location_hint="Goiânia")))
    await svc.interpret(
        state="CHOOSE_LOCATION",
        message="meu numero é 11987654321 e quero goiania",
        allowed_intents=("choose_location",),
    )
    assert len(ai.requests) == 1
    sent_prompt = ai.requests[0].prompt_template
    assert "11987654321" not in sent_prompt
    assert "[número omitido]" in sent_prompt


async def test_context_json_never_sent_to_ai():
    svc, ai = _service(json.dumps(_full_payload(intent="choose_location", location_hint="X")))
    await svc.interpret(
        state="CHOOSE_LOCATION",
        message="goiania",
        allowed_intents=("choose_location",),
    )
    sent_prompt = ai.requests[0].prompt_template
    # Only the four whitelisted fields are ever serialized into the prompt.
    payload = json.loads(sent_prompt.split("\n", 1)[1])
    assert set(payload.keys()) == {
        "estado_atual",
        "mensagem",
        "intents_validos",
        "opcoes_rapidas",
    }


def test_allowed_intents_catalogue_is_closed():
    # Guards against accidentally widening the contract.
    assert "confirm_application" in ALLOWED_INTENTS
    assert "hire" not in ALLOWED_INTENTS
    assert "approve" not in ALLOWED_INTENTS
