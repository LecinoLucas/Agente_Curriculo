"""
Integration tests for Phase 9 — dedicated AI draft fields on jobs.

Validates that the new dedicated columns on the jobs table:
  - mandatory_skills
  - nice_to_have_skills
  - screening_questions
  - benefits
  - working_hours

are correctly accepted by Create/Update endpoints, returned by Response,
normalized server-side, and never leak into behavioral_requirements.
"""
from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from tests.integration.helpers import _auth_headers, _create_active_user


def _job_payload(**overrides) -> dict:
    """Minimal valid job payload with optional overrides."""
    payload: dict = {
        "title": f"AI Draft Job {uuid4().hex[:6]}",
        "description": "Vaga para testar campos dedicados do rascunho IA.",
        "status": "draft",
        "salary_currency": "BRL",
    }
    payload.update(overrides)
    return payload


@pytest.fixture
async def recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"recruiter-{uuid4().hex[:8]}@phase9.com"
    await _create_active_user(db_session, email, "pass1234", UserRole.RECRUITER)
    return await _auth_headers(client, email, "pass1234")


# ── Create ────────────────────────────────────────────────────────────────────


async def test_create_job_with_dedicated_ai_draft_fields(
    client: AsyncClient, recruiter_headers: dict
) -> None:
    payload = _job_payload(
        mandatory_skills=["Atendimento ao cliente", "Operação de caixa"],
        nice_to_have_skills=["Excel"],
        screening_questions=["Tem CNH?"],
        benefits=["Vale refeição"],
        working_hours="6x1",
    )
    resp = await client.post("/api/v1/jobs", json=payload, headers=recruiter_headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["mandatory_skills"] == ["Atendimento ao cliente", "Operação de caixa"]
    assert body["nice_to_have_skills"] == ["Excel"]
    assert body["screening_questions"] == ["Tem CNH?"]
    assert body["benefits"] == ["Vale refeição"]
    assert body["working_hours"] == "6x1"


async def test_create_job_without_new_fields_uses_defaults(
    client: AsyncClient, recruiter_headers: dict
) -> None:
    """Old payloads (no new fields) must still work — defaults: empty lists, None."""
    resp = await client.post("/api/v1/jobs", json=_job_payload(), headers=recruiter_headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["mandatory_skills"] == []
    assert body["nice_to_have_skills"] == []
    assert body["screening_questions"] == []
    assert body["benefits"] == []
    assert body["working_hours"] is None


async def test_create_job_normalizes_string_lists(
    client: AsyncClient, recruiter_headers: dict
) -> None:
    """Trim, drop empties, dedup case-insensitive."""
    payload = _job_payload(
        mandatory_skills=["  Excel  ", "EXCEL", "", "  ", "Python"],
        nice_to_have_skills=["  ", "Power BI", "POWER BI"],
        screening_questions=["", "Pode viajar?"],
        benefits=["", "Vale refeição", "vale refeição"],
    )
    resp = await client.post("/api/v1/jobs", json=payload, headers=recruiter_headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["mandatory_skills"] == ["Excel", "Python"]
    assert body["nice_to_have_skills"] == ["Power BI"]
    assert body["screening_questions"] == ["Pode viajar?"]
    assert body["benefits"] == ["Vale refeição"]


async def test_create_job_normalizes_working_hours_empty_to_none(
    client: AsyncClient, recruiter_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/jobs",
        json=_job_payload(working_hours="   "),
        headers=recruiter_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["working_hours"] is None


async def test_screening_questions_do_not_leak_into_behavioral_requirements(
    client: AsyncClient, recruiter_headers: dict
) -> None:
    payload = _job_payload(
        behavioral_requirements=["Comunicação clara"],
        screening_questions=["Tem disponibilidade noturna?"],
        nice_to_have_skills=["Excel"],
        benefits=["Vale alimentação"],
    )
    resp = await client.post("/api/v1/jobs", json=payload, headers=recruiter_headers)
    assert resp.status_code == 201
    body = resp.json()
    # behavioral_requirements only contains the explicitly provided behavioral entry
    assert body["behavioral_requirements"] == ["Comunicação clara"]
    # Neither questions nor benefits leak into it
    assert "Tem disponibilidade noturna?" not in body["behavioral_requirements"]
    assert "Excel" not in body["behavioral_requirements"]
    assert "Vale alimentação" not in body["behavioral_requirements"]
    # They live in their dedicated fields
    assert body["screening_questions"] == ["Tem disponibilidade noturna?"]
    assert body["nice_to_have_skills"] == ["Excel"]
    assert body["benefits"] == ["Vale alimentação"]


# ── Update ────────────────────────────────────────────────────────────────────


async def test_update_job_with_new_fields(
    client: AsyncClient, recruiter_headers: dict
) -> None:
    create = await client.post(
        "/api/v1/jobs", json=_job_payload(), headers=recruiter_headers
    )
    job_id = create.json()["id"]

    resp = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={
            "mandatory_skills": ["Liderança", "Gestão"],
            "nice_to_have_skills": ["MBA"],
            "screening_questions": ["Disponível para mudança?"],
            "benefits": ["Plano de saúde", "Vale transporte"],
            "working_hours": "44h semanais",
        },
        headers=recruiter_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["mandatory_skills"] == ["Liderança", "Gestão"]
    assert body["nice_to_have_skills"] == ["MBA"]
    assert body["screening_questions"] == ["Disponível para mudança?"]
    assert body["benefits"] == ["Plano de saúde", "Vale transporte"]
    assert body["working_hours"] == "44h semanais"


async def test_update_omitting_new_fields_keeps_existing_values(
    client: AsyncClient, recruiter_headers: dict
) -> None:
    """Patching unrelated fields must not wipe new dedicated fields."""
    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(
            mandatory_skills=["Skill A"],
            benefits=["Benefit A"],
            working_hours="12x36",
        ),
        headers=recruiter_headers,
    )
    job_id = create.json()["id"]

    resp = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={"title": "Updated Title"},
        headers=recruiter_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["mandatory_skills"] == ["Skill A"]
    assert body["benefits"] == ["Benefit A"]
    assert body["working_hours"] == "12x36"


async def test_update_can_clear_string_list_with_empty(
    client: AsyncClient, recruiter_headers: dict
) -> None:
    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(mandatory_skills=["Skill A"]),
        headers=recruiter_headers,
    )
    job_id = create.json()["id"]

    resp = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={"mandatory_skills": []},
        headers=recruiter_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["mandatory_skills"] == []


# ── Get ───────────────────────────────────────────────────────────────────────


async def test_get_job_returns_new_fields(
    client: AsyncClient, recruiter_headers: dict
) -> None:
    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(
            mandatory_skills=["Excel"],
            nice_to_have_skills=["Power BI"],
            screening_questions=["Quando pode começar?"],
            benefits=["VR"],
            working_hours="6x1",
        ),
        headers=recruiter_headers,
    )
    job_id = create.json()["id"]
    resp = await client.get(f"/api/v1/jobs/{job_id}", headers=recruiter_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["mandatory_skills"] == ["Excel"]
    assert body["nice_to_have_skills"] == ["Power BI"]
    assert body["screening_questions"] == ["Quando pode começar?"]
    assert body["benefits"] == ["VR"]
    assert body["working_hours"] == "6x1"
