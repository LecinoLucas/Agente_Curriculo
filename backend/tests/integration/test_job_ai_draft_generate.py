"""Integration tests — POST /api/v1/jobs/ai-draft/generate (Fase IA Vaga 3).

Tests validate the HTTP contract: auth, role enforcement, request validation,
response structure, and token usage logging. AI provider is always mocked —
no real Gemini/Anthropic calls are made.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.ports.ai_service import AIAnalysisResponse
from src.domain.entities.user import UserRole
from tests.integration.helpers import _auth_headers, _create_active_user

GENERATE_URL = "/api/v1/jobs/ai-draft/generate"

# ── Mock helpers ──────────────────────────────────────────────────────────────

_MOCK_DRAFT: dict = {
    "title": "Operador de Caixa",
    "area": "Atendimento",
    "seniority": None,
    "work_model": "onsite",
    "unit": "São Paulo, SP",
    "salary_min": None,
    "salary_max": None,
    "description": "Vaga de operador de caixa para loja de varejo com atendimento ao cliente.",
    "responsibilities": ["Operar caixa registradora", "Atender clientes com cordialidade"],
    "requirements": ["Ensino médio completo", "Disponibilidade para trabalhar em turnos"],
    "mandatory_skills": ["Atendimento ao cliente", "Responsabilidade com dinheiro"],
    "nice_to_have_skills": ["Experiência em varejo"],
    "benefits": [],
    "working_hours": "6x1",
    "screening_questions": ["Você tem disponibilidade para trabalho em turno integral?"],
    "pipeline_steps": ["Triagem", "Entrevista RH", "Decisão"],
    "matching_criteria": ["Experiência em atendimento ao cliente"],
    "requires_manager_review": True,
    "requires_behavioral_assessment": False,
}


def _mock_ai_response(draft: dict | None = None) -> AIAnalysisResponse:
    return AIAnalysisResponse(
        content=json.dumps(draft or _MOCK_DRAFT),
        input_tokens=150,
        output_tokens=80,
        cache_read_tokens=0,
        cache_write_tokens=0,
        processing_time_ms=300,
    )


def _mock_ai_service(response: AIAnalysisResponse | None = None) -> AsyncMock:
    svc = AsyncMock()
    svc.analyze = AsyncMock(return_value=response or _mock_ai_response())
    return svc


_PATCH_TARGET = "src.application.services.job_ai_draft_service.AIServiceFactory.create"


# ── Auth & RBAC ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_requires_authentication(client: AsyncClient) -> None:
    """No auth token → 401."""
    response = await client.post(GENERATE_URL, json={"text_input": "Vaga de caixa"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_generate_rejects_candidate_role(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """CANDIDATE role → 403."""
    await _create_active_user(db_session, "gen_cand@test.com", "pw123456", UserRole.CANDIDATE)
    headers = await _auth_headers(client, "gen_cand@test.com", "pw123456")
    response = await client.post(
        GENERATE_URL, json={"text_input": "Vaga de caixa"}, headers=headers
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_generate_admin_role_accepted(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """ADMIN role should be allowed."""
    await _create_active_user(db_session, "gen_admin@test.com", "pw123456", UserRole.ADMIN)
    headers = await _auth_headers(client, "gen_admin@test.com", "pw123456")
    with patch(_PATCH_TARGET, return_value=_mock_ai_service()):
        response = await client.post(
            GENERATE_URL, json={"text_input": "Operador de Caixa"}, headers=headers
        )
    assert response.status_code == 200


# ── Happy path ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_text_input_only_returns_200(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Valid text_input only → 200 with structured draft."""
    await _create_active_user(db_session, "gen_r1@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "gen_r1@test.com", "pw123456")
    with patch(_PATCH_TARGET, return_value=_mock_ai_service()):
        response = await client.post(
            GENERATE_URL,
            json={"text_input": "Operador de Caixa para loja de varejo"},
            headers=headers,
        )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_generate_ocr_text_only_returns_200(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Valid ocr_text only → 200."""
    await _create_active_user(db_session, "gen_r2@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "gen_r2@test.com", "pw123456")
    with patch(_PATCH_TARGET, return_value=_mock_ai_service()):
        response = await client.post(
            GENERATE_URL,
            json={"ocr_text": "Vaga: Operador de Caixa. Local: SP."},
            headers=headers,
        )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_generate_both_inputs_returns_200(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Both text_input and ocr_text → 200."""
    await _create_active_user(db_session, "gen_r3@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "gen_r3@test.com", "pw123456")
    with patch(_PATCH_TARGET, return_value=_mock_ai_service()):
        response = await client.post(
            GENERATE_URL,
            json={
                "text_input": "Operador de Caixa",
                "ocr_text": "Texto extraído via OCR: loja de varejo",
            },
            headers=headers,
        )
    assert response.status_code == 200


# ── Response schema ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_response_has_required_fields(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Response body must have draft, needs_review, usage, source."""
    await _create_active_user(db_session, "gen_r4@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "gen_r4@test.com", "pw123456")
    with patch(_PATCH_TARGET, return_value=_mock_ai_service()):
        response = await client.post(
            GENERATE_URL,
            json={"text_input": "Operador de Caixa"},
            headers=headers,
        )
    assert response.status_code == 200
    body = response.json()

    assert "draft" in body
    assert "needs_review" in body
    assert "usage" in body
    assert "source" in body

    draft = body["draft"]
    assert "title" in draft
    assert "area" in draft
    assert "seniority" in draft
    assert "work_model" in draft
    assert "unit" in draft
    assert "salary_min" in draft
    assert "salary_max" in draft
    assert "description" in draft
    assert "responsibilities" in draft
    assert "mandatory_skills" in draft
    assert "benefits" in draft
    assert "working_hours" in draft
    assert "screening_questions" in draft
    assert "pipeline_steps" in draft
    assert "matching_criteria" in draft
    assert "requires_manager_review" in draft
    assert "requires_behavioral_assessment" in draft


@pytest.mark.asyncio
async def test_generate_draft_fields_populated(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Draft fields should match the mocked AI response."""
    await _create_active_user(db_session, "gen_r5@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "gen_r5@test.com", "pw123456")
    with patch(_PATCH_TARGET, return_value=_mock_ai_service()):
        response = await client.post(
            GENERATE_URL,
            json={"text_input": "Operador de Caixa"},
            headers=headers,
        )
    body = response.json()
    draft = body["draft"]

    assert draft["title"] == "Operador de Caixa"
    assert draft["work_model"] == "onsite"
    assert draft["unit"] == "São Paulo, SP"
    assert draft["working_hours"] == "6x1"
    assert draft["requires_manager_review"] is True
    assert draft["requires_behavioral_assessment"] is False
    assert isinstance(draft["responsibilities"], list)
    assert len(draft["responsibilities"]) > 0


@pytest.mark.asyncio
async def test_generate_needs_review_always_contains_salary_range(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """salary_range is always in needs_review — never inferred."""
    await _create_active_user(db_session, "gen_r6@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "gen_r6@test.com", "pw123456")
    with patch(_PATCH_TARGET, return_value=_mock_ai_service()):
        response = await client.post(
            GENERATE_URL,
            json={"text_input": "Operador de Caixa"},
            headers=headers,
        )
    body = response.json()
    assert "salary_range" in body["needs_review"]


@pytest.mark.asyncio
async def test_generate_usage_fields_populated(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """usage must have provider, model, token counts."""
    await _create_active_user(db_session, "gen_r7@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "gen_r7@test.com", "pw123456")
    with patch(_PATCH_TARGET, return_value=_mock_ai_service()):
        response = await client.post(
            GENERATE_URL,
            json={"text_input": "Operador de Caixa"},
            headers=headers,
        )
    usage = response.json()["usage"]

    assert "provider" in usage
    assert "model" in usage
    assert usage["input_tokens"] == 150
    assert usage["output_tokens"] == 80
    assert usage["total_tokens"] == 230


# ── Input validation ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_empty_inputs_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Both inputs absent → 422 validation error."""
    await _create_active_user(db_session, "gen_r8@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "gen_r8@test.com", "pw123456")
    with patch(_PATCH_TARGET, return_value=_mock_ai_service()):
        response = await client.post(GENERATE_URL, json={}, headers=headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_generate_whitespace_only_inputs_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Whitespace-only inputs → 422."""
    await _create_active_user(db_session, "gen_r9@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "gen_r9@test.com", "pw123456")
    with patch(_PATCH_TARGET, return_value=_mock_ai_service()):
        response = await client.post(
            GENERATE_URL,
            json={"text_input": "   \n\n", "ocr_text": "\t   "},
            headers=headers,
        )
    assert response.status_code == 422


# ── Error handling ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_ai_error_returns_503(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """AI provider failure → 503 Service Unavailable."""
    await _create_active_user(db_session, "gen_r10@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "gen_r10@test.com", "pw123456")

    failing_ai = AsyncMock()
    failing_ai.analyze = AsyncMock(side_effect=RuntimeError("AI unreachable"))

    with patch(_PATCH_TARGET, return_value=failing_ai):
        response = await client.post(
            GENERATE_URL,
            json={"text_input": "Operador de Caixa"},
            headers=headers,
        )
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_generate_source_object_populated(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """source must be an object with text_used, ocr_used, input_character_count."""
    await _create_active_user(db_session, "gen_r11@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "gen_r11@test.com", "pw123456")
    with patch(_PATCH_TARGET, return_value=_mock_ai_service()):
        response = await client.post(
            GENERATE_URL,
            json={"text_input": "Operador de Caixa"},
            headers=headers,
        )
    source = response.json()["source"]
    assert source["text_used"] is True
    assert source["ocr_used"] is False
    assert isinstance(source["input_character_count"], int)
    assert source["input_character_count"] > 0


# ── Rate limiting (Fase IA Vaga 5) ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_rate_limit_blocks_after_daily_limit(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """11th generate request within the day → 429 for same user."""
    from src.core.settings import settings
    from src.interface.api.rate_limiting import reset_rate_limit_storage

    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_AI_DRAFT_GENERATE", "10/day")

    await _create_active_user(db_session, "gen_rl1@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "gen_rl1@test.com", "pw123456")

    statuses = []
    for _ in range(11):
        with patch(_PATCH_TARGET, return_value=_mock_ai_service()):
            r = await client.post(
                GENERATE_URL,
                json={"text_input": "Operador de Caixa"},
                headers=headers,
            )
        statuses.append(r.status_code)

    assert all(s != 429 for s in statuses[:10]), f"Unexpected 429 in first 10: {statuses}"
    assert statuses[10] == 429, f"Expected 429 on 11th attempt, got {statuses[10]}"
    assert "limite" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_generate_rate_limit_disabled_does_not_block(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With RATE_LIMIT_ENABLED=False, many generate calls never 429."""
    from src.core.settings import settings
    from src.interface.api.rate_limiting import reset_rate_limit_storage

    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", False)

    await _create_active_user(db_session, "gen_rl3@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "gen_rl3@test.com", "pw123456")

    for _ in range(5):
        with patch(_PATCH_TARGET, return_value=_mock_ai_service()):
            r = await client.post(
                GENERATE_URL,
                json={"text_input": "Operador de Caixa"},
                headers=headers,
            )
        assert r.status_code != 429, f"Should not 429 when disabled, got {r.status_code}"
