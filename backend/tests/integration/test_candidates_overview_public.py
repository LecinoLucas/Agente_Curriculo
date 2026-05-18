"""Integration test: GET /api/v1/candidates/{id}/overview for public-applied candidates.

Public applications create candidates with created_by=NULL. This test ensures the
overview endpoint returns 200 instead of 500 (pydantic ValidationError on created_by).
"""
from __future__ import annotations

import io
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.helpers import _auth_headers, _create_active_user
from src.domain.entities.user import UserRole


_MINIMAL_PDF = (
    b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
    b"xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n9\n%%EOF"
)


def _apply_form(*, job_id: str | None = None) -> dict:
    data: dict = {
        "full_name": "Candidato Público",
        "cpf": f"{''.join(str(i % 10) for i in range(11))}",
        "email": f"publico_{uuid4().hex[:8]}@example.com",
        "phone": "11999990000",
        "city": "São Paulo",
        "state": "SP",
        "salary_expectation": "5000.00",
        "desired_contract_type": "CLT",
        "works_at_marajo_group": "false",
        "lgpd_consent": "true",
        "password": "Senha12345",
        "confirm_password": "Senha12345",
    }
    if job_id:
        data["job_id"] = job_id
    return data


@pytest.mark.asyncio
async def test_overview_for_public_candidate_without_job_returns_200(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Public candidate (created_by=NULL) must not cause 500 on overview."""
    # Apply publicly — creates candidate with created_by=None
    r = await client.post(
        "/api/v1/public/candidates/apply",
        data=_apply_form(),
        files={"resume_file": ("resume.pdf", io.BytesIO(_MINIMAL_PDF), "application/pdf")},
    )
    assert r.status_code == 201, r.text
    candidate_id = r.json()["candidate_id"]

    # Authenticate as recruiter to access overview
    email = f"recruiter_{uuid4().hex[:6]}@example.com"
    await _create_active_user(db_session, email, "Recruiter12345", UserRole.RECRUITER)
    headers = await _auth_headers(client, email, "Recruiter12345")

    r2 = await client.get(
        f"/api/v1/candidates/{candidate_id}/overview",
        headers=headers,
    )
    assert r2.status_code == 200, (
        f"Expected 200 for public candidate overview, got {r2.status_code}: {r2.text}"
    )
    body = r2.json()
    assert body["candidate"]["id"] == candidate_id
    assert body["candidate"]["created_by"] is None


@pytest.mark.asyncio
async def test_overview_for_public_candidate_with_job_returns_200(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job,
) -> None:
    """Public candidate applied to a job — pipeline entry exists, created_by=NULL."""
    r = await client.post(
        "/api/v1/public/candidates/apply",
        data=_apply_form(job_id=str(published_job.id)),
        files={"resume_file": ("resume.pdf", io.BytesIO(_MINIMAL_PDF), "application/pdf")},
    )
    assert r.status_code == 201, r.text
    candidate_id = r.json()["candidate_id"]

    email = f"recruiter_{uuid4().hex[:6]}@example.com"
    await _create_active_user(db_session, email, "Recruiter12345", UserRole.RECRUITER)
    headers = await _auth_headers(client, email, "Recruiter12345")

    r2 = await client.get(
        f"/api/v1/candidates/{candidate_id}/overview",
        headers=headers,
    )
    assert r2.status_code == 200, (
        f"Expected 200 for public candidate with job, got {r2.status_code}: {r2.text}"
    )
    body = r2.json()
    assert body["candidate"]["id"] == candidate_id
    assert body["candidate"]["created_by"] is None
    # Pipeline entry should be present
    assert any(
        entry["job_id"] == str(published_job.id)
        for entry in body.get("pipeline_entries", [])
    ), "Expected pipeline entry for the applied job"
