"""OP-7A — AI intent parser ↔ Conversation Engine integration.

Drives the public conversation endpoints with the AI intent parser enabled and a
fake AI provider (no network). Proves that the AI only *interprets* free text
into deterministic tokens, that the state machine stays the authority, and that
all safety boundaries hold: no pipeline, no direct application mutation by the
AI, no AI in IDENTIFY, PII never leaks, and deterministic fallback always wins.
"""
from __future__ import annotations

import json
from collections.abc import Callable
from uuid import UUID

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.ports.ai_service import AIAnalysisRequest, AIAnalysisResponse, AIService
from src.core.settings import settings
from src.infrastructure.database.models.candidate_application_model import (
    CandidateApplicationModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.conversation_model import ConversationSessionModel
from src.infrastructure.database.models.operational_master_model import LocationGroupModel

pytestmark = pytest.mark.asyncio

# A valid CPF that is not seeded in the DB → drives lead mode at IDENTIFY.
_LEAD_CPF = "52998224725"


def _intent_json(intent: str, *, confidence: float = 0.9, **fields) -> str:
    payload = {
        "intent": intent,
        "confidence": confidence,
        "location_hint": None,
        "unit_hint": None,
        "desired_function": None,
        "desired_shift": None,
        "resume_choice": None,
        "lgpd_consent": None,
        "confirmation": None,
        "should_handoff": False,
        "safe_user_message": None,
    }
    payload.update(fields)
    return json.dumps(payload)


def _default_router(state: str, _message: str) -> str:
    mapping = {
        "CHOOSE_LOCATION": _intent_json("choose_location", location_hint="Peritoró"),
        "CHOOSE_UNIT_OR_ANY": _intent_json("choose_any_unit"),
        "CHOOSE_FUNCTION": _intent_json("choose_function", desired_function="Frentista"),
        "CHOOSE_SHIFT": _intent_json("choose_shift", desired_shift="noite"),
        "COLLECT_RESUME": _intent_json("skip_resume", resume_choice="skip_resume"),
        "COLLECT_LGPD_CONSENT": _intent_json("accept_lgpd", lgpd_consent=True),
        "CONFIRM_APPLICATION": _intent_json("confirm_application"),
    }
    return mapping.get(state, _intent_json("unclear", confidence=0.2))


class SpyAI(AIService):
    """Fake provider that derives its answer from the (state, message) prompt."""

    def __init__(self, responder: Callable[[str, str], str]) -> None:
        self._responder = responder
        self.calls: list[tuple[str, str]] = []

    async def analyze(self, request: AIAnalysisRequest) -> AIAnalysisResponse:
        payload = json.loads(request.prompt_template.split("\n", 1)[1])
        state = payload["estado_atual"]
        message = payload["mensagem"]
        self.calls.append((state, message))
        return AIAnalysisResponse(
            content=self._responder(state, message),
            input_tokens=1,
            output_tokens=1,
            cache_read_tokens=0,
            cache_write_tokens=0,
            processing_time_ms=1,
        )


def _install_ai(
    monkeypatch: pytest.MonkeyPatch,
    responder: Callable[[str, str], str] = _default_router,
    *,
    enabled: bool = True,
) -> SpyAI:
    spy = SpyAI(responder)
    monkeypatch.setattr(settings, "ASSISTANT_INTENT_AI_ENABLED", enabled)
    monkeypatch.setattr(
        "src.application.services.candidate_assistant_intent_service.AIServiceFactory.create",
        lambda provider, model_id: spy,
    )
    return spy


# ── Fixtures / helpers ────────────────────────────────────────────────────────

async def _location(db_session: AsyncSession, name: str = "Peritoró") -> LocationGroupModel:
    location = LocationGroupModel(
        name=name,
        normalized_name=name.casefold(),
        state="MA",
        city=name,
        type="city",
    )
    db_session.add(location)
    await db_session.commit()
    await db_session.refresh(location)
    return location


async def _candidate(db_session: AsyncSession) -> CandidateModel:
    candidate = CandidateModel(full_name="Pessoa Candidata")
    db_session.add(candidate)
    await db_session.commit()
    await db_session.refresh(candidate)
    return candidate


async def _start(client: AsyncClient, candidate_id: UUID | None = None) -> str:
    body: dict = {"channel": "web"}
    if candidate_id is not None:
        body["candidate_id"] = str(candidate_id)
    response = await client.post("/api/v1/conversations", json=body)
    assert response.status_code == 201
    return response.json()["session_id"]


async def _send(client: AsyncClient, session_id: str, content: str) -> dict:
    response = await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": content},
    )
    assert response.status_code == 200
    return response.json()


async def _applications(db_session: AsyncSession) -> list[CandidateApplicationModel]:
    result = await db_session.execute(sa.select(CandidateApplicationModel))
    return list(result.scalars().all())


# ── Mapping: free text → deterministic token ──────────────────────────────────

async def test_ai_maps_free_text_location(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    location = await _location(db_session)
    candidate = await _candidate(db_session)
    spy = _install_ai(monkeypatch)
    session_id = await _start(client, candidate.id)

    await _send(client, session_id, "cpf")  # preset candidate → CHOOSE_LOCATION
    turn = await _send(client, session_id, "queria trabalhar lá em peritoro")
    assert turn["current_state"] == "CHOOSE_UNIT_OR_ANY"

    apps = await _applications(db_session)
    assert len(apps) == 1
    assert apps[0].preferred_location_group_id == location.id
    assert ("CHOOSE_LOCATION", "queria trabalhar lá em peritoro") in spy.calls


async def test_ai_maps_any_unit_preference(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    location = await _location(db_session)
    candidate = await _candidate(db_session)
    _install_ai(monkeypatch)
    session_id = await _start(client, candidate.id)

    await _send(client, session_id, "cpf")
    await _send(client, session_id, "peritoro mesmo")
    turn = await _send(client, session_id, "qualquer um tá bom pra mim")
    assert turn["current_state"] == "CHOOSE_FUNCTION"

    apps = await _applications(db_session)
    assert apps[0].accepts_any_unit_in_location is True
    assert apps[0].preferred_location_group_id == location.id


async def test_ai_maps_shift_to_canonical_value(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    await _location(db_session)
    candidate = await _candidate(db_session)
    _install_ai(monkeypatch)
    session_id = await _start(client, candidate.id)

    await _send(client, session_id, "cpf")
    await _send(client, session_id, "peritoro")
    await _send(client, session_id, "qualquer posto")
    await _send(client, session_id, "queria de operador de caixa")
    turn = await _send(client, session_id, "consigo trabalhar de madrugada")
    assert turn["current_state"] == "SHOW_JOBS"

    apps = await _applications(db_session)
    assert apps[0].desired_shift == "night"
    assert apps[0].desired_job_area == "Frentista"


async def test_ai_skip_resume_advances_to_lead_name(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    await _location(db_session)
    _install_ai(monkeypatch)
    session_id = await _start(client)

    await _send(client, session_id, _LEAD_CPF)
    await _send(client, session_id, "peritoro")
    await _send(client, session_id, "qualquer posto")
    await _send(client, session_id, "frentista")
    await _send(client, session_id, "de noite")
    await _send(client, session_id, "continue")  # SHOW_JOBS (control token, no AI)
    turn = await _send(client, session_id, "não tenho currículo agora")
    assert turn["current_state"] == "COLLECT_LEAD_NAME"


async def test_ai_full_lead_flow_accepts_lgpd_and_confirms(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    await _location(db_session)
    _install_ai(monkeypatch)
    session_id = await _start(client)

    await _send(client, session_id, _LEAD_CPF)
    await _send(client, session_id, "peritoro")
    await _send(client, session_id, "qualquer posto")
    await _send(client, session_id, "frentista")
    await _send(client, session_id, "de noite")
    await _send(client, session_id, "continue")
    await _send(client, session_id, "não tenho currículo")
    # Lead name + WhatsApp stay deterministic (no AI).
    await _send(client, session_id, "Maria da Silva")
    await _send(client, session_id, "11987654321")
    # LGPD + confirmation interpreted by AI.
    await _send(client, session_id, "pode usar meus dados sim")
    confirm = await _send(client, session_id, "pode mandar pro RH")
    assert confirm["current_state"] == "DONE"
    assert "registrada" in confirm["assistant_message"].lower()

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session.candidate_id is not None
    candidate = await db_session.get(CandidateModel, session.candidate_id)
    assert candidate.full_name == "Maria da Silva"
    assert candidate.lgpd_consent_at is not None


async def test_ai_reject_lgpd_does_not_create_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    await _location(db_session)

    def responder(state: str, message: str) -> str:
        if state == "COLLECT_LGPD_CONSENT":
            return _intent_json("reject_lgpd", lgpd_consent=False)
        return _default_router(state, message)

    _install_ai(monkeypatch, responder)
    session_id = await _start(client)

    await _send(client, session_id, _LEAD_CPF)
    await _send(client, session_id, "peritoro")
    await _send(client, session_id, "qualquer posto")
    await _send(client, session_id, "frentista")
    await _send(client, session_id, "de noite")
    await _send(client, session_id, "continue")
    await _send(client, session_id, "não tenho currículo")
    await _send(client, session_id, "Maria da Silva")
    await _send(client, session_id, "11987654321")
    turn = await _send(client, session_id, "não autorizo de jeito nenhum")
    assert turn["current_state"] == "DONE"

    candidates = (await db_session.execute(sa.select(CandidateModel))).scalars().all()
    assert list(candidates) == []


# ── Safety boundaries ─────────────────────────────────────────────────────────

async def test_ai_does_not_run_in_identify(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    spy = _install_ai(monkeypatch)
    session_id = await _start(client)

    await _send(client, session_id, "oi, quero uma vaga por favor")
    assert all(state != "IDENTIFY" for state, _ in spy.calls)
    assert spy.calls == []  # IDENTIFY is the only state visited → AI never called


async def test_low_confidence_falls_back_to_deterministic(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    await _location(db_session)

    def responder(state: str, _message: str) -> str:
        return _intent_json("unclear", confidence=0.2)

    _install_ai(monkeypatch, responder)
    session_id = await _start(client)

    await _send(client, session_id, _LEAD_CPF)
    # AI is unsure → raw text flows to the deterministic handler, which cannot
    # resolve the location and re-asks (same as if the AI layer did not exist).
    turn = await _send(client, session_id, "sei lá, qualquer coisa aí")
    assert turn["current_state"] == "CHOOSE_LOCATION"
    assert "não encontrei" in turn["assistant_message"].lower()


async def test_invalid_ai_json_falls_back_to_deterministic(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    await _location(db_session)

    def responder(state: str, _message: str) -> str:
        return "<<not json>>"

    _install_ai(monkeypatch, responder)
    session_id = await _start(client)

    await _send(client, session_id, _LEAD_CPF)
    # Deterministic path still works: an exact location name resolves normally.
    turn = await _send(client, session_id, "peritoró")
    assert turn["current_state"] == "CHOOSE_UNIT_OR_ANY"


async def test_ai_flow_never_creates_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    await _location(db_session)
    _install_ai(monkeypatch)
    session_id = await _start(client)

    for content in [
        _LEAD_CPF,
        "peritoro",
        "qualquer posto",
        "frentista",
        "de noite",
        "continue",
        "não tenho currículo",
        "Maria da Silva",
        "11987654321",
        "autorizo sim",
        "pode enviar",
    ]:
        await _send(client, session_id, content)

    pipeline_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    assert pipeline_count == 0


async def test_ai_disabled_is_fully_deterministic(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    await _location(db_session)
    spy = _install_ai(monkeypatch, enabled=False)
    session_id = await _start(client)

    await _send(client, session_id, _LEAD_CPF)
    # With the flag off, free text is never interpreted — the deterministic
    # handler cannot resolve "queria peritoro" and re-asks. AI is never called.
    turn = await _send(client, session_id, "queria peritoro")
    assert turn["current_state"] == "CHOOSE_LOCATION"
    assert spy.calls == []


async def test_ai_does_not_leak_pii_in_public_response(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    await _location(db_session)
    spy = _install_ai(monkeypatch)
    session_id = await _start(client)

    await _send(client, session_id, _LEAD_CPF)
    turn = await _send(client, session_id, "meu zap é 11987654321, quero peritoro")

    # The phone never appears in the public turn payload (context or message).
    assert "11987654321" not in json.dumps(turn)
    # And the AI provider received the masked text, not the raw phone.
    assert all("11987654321" not in message for _state, message in spy.calls)
