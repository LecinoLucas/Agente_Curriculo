from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_model import CandidateModel
from tests.integration.helpers import _auth_headers, _create_active_user


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"candidate-endpoint-{uuid4().hex[:8]}@example.com"
    await _create_active_user(db_session, email, "pass1234", UserRole.RECRUITER)
    return await _auth_headers(client, email, "pass1234")


@pytest.mark.asyncio
async def test_list_candidates_accepts_new_filter_params(client: AsyncClient, db_session: AsyncSession):
    headers = await _recruiter_headers(client, db_session)
    db_session.add(
        CandidateModel(
            full_name="Endpoint Candidate",
            email=f"endpoint-{uuid4().hex[:6]}@example.com",
            phone="(11) 98888-7777",
            cpf="123.456.789-00",
            location_city="São Paulo",
            location_state="SP",
            salary_expectation="5500.00",
            desired_contract_type="CLT",
            application_source="manual",
            created_by=uuid4(),
        )
    )
    await db_session.commit()

    response = await client.get(
        "/api/v1/candidates",
        headers=headers,
        params={
            "search": "12345678900",
            "city": "São Paulo",
            "state": "SP",
            "salary_min": 5000,
            "salary_max": 6000,
            "desired_contract_type": "CLT",
            "link_status_filter": "without_active_job",
            "has_resume": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["data"][0]["full_name"] == "Endpoint Candidate"


@pytest.mark.asyncio
async def test_summaries_search_matches_phone_and_cpf_digits(client: AsyncClient, db_session: AsyncSession):
    headers = await _recruiter_headers(client, db_session)
    candidate = CandidateModel(
        full_name="Telefone CPF",
        email=f"phone-{uuid4().hex[:6]}@example.com",
        phone="(11) 91234-5678",
        cpf="987.654.321-00",
        created_by=uuid4(),
    )
    db_session.add(candidate)
    await db_session.commit()

    by_phone = await client.get(
        "/api/v1/candidates/summaries",
        headers=headers,
        params={"search": "11912345678"},
    )
    assert by_phone.status_code == 200
    assert any(item["id"] == str(candidate.id) for item in by_phone.json()["data"])

    by_cpf = await client.get(
        "/api/v1/candidates/summaries",
        headers=headers,
        params={"search": "98765432100"},
    )
    assert by_cpf.status_code == 200
    assert any(item["id"] == str(candidate.id) for item in by_cpf.json()["data"])
