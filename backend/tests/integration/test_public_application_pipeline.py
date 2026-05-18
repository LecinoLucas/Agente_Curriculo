"""Integration tests for POST /api/v1/public/candidates/apply.

Covers:
- New application without job_id → 201, no pipeline row created.
- New application with published job_id → 201, pipeline row created,
  last_moved_by is NULL (no FK violation against the fake SYSTEM_USER_ID).
- Duplicate email → 422 (not 500).
- Duplicate CPF → 422 (not 500).
"""
from __future__ import annotations

import io
from uuid import uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.resume_model import ResumeVersionModel


_MINIMAL_PDF = (
    b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
    b"xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n9\n%%EOF"
)


def _form(
    *,
    full_name: str = "Fulano de Tal",
    cpf: str = "12345678901",
    email: str | None = None,
    phone: str = "11999998888",
    city: str = "São Paulo",
    state: str = "SP",
    salary_expectation: str = "4500.00",
    contract_type: str = "CLT",
    job_id: str | None = None,
    password: str = "Senha12345",
) -> dict:
    data: dict = {
        "full_name": full_name,
        "cpf": cpf,
        "email": email or f"test_{uuid4().hex[:8]}@example.com",
        "phone": phone,
        "city": city,
        "state": state,
        "salary_expectation": salary_expectation,
        "desired_contract_type": contract_type,
        "works_at_marajo_group": "false",
        "lgpd_consent": "true",
        "password": password,
        "confirm_password": password,
    }
    if job_id:
        data["job_id"] = job_id
    return data


def _pdf_file() -> tuple[str, io.BytesIO, str]:
    return ("resume.pdf", io.BytesIO(_MINIMAL_PDF), "application/pdf")


@pytest.mark.asyncio
async def test_new_application_without_job_returns_201(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    r = await client.post(
        "/api/v1/public/candidates/apply",
        data=_form(),
        files={"resume_file": _pdf_file()},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "awaiting_job"
    assert body["pipeline_id"] is None


@pytest.mark.asyncio
async def test_new_application_with_job_returns_201_and_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job,
) -> None:
    r = await client.post(
        "/api/v1/public/candidates/apply",
        data=_form(job_id=str(published_job.id)),
        files={"resume_file": _pdf_file()},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "entered_pipeline"
    assert body["pipeline_id"] is not None

    # Verify candidate_job_pipeline row was created
    from uuid import UUID
    candidate_id = UUID(body["candidate_id"])
    pipeline_row = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == published_job.id,
        )
    )
    assert pipeline_row is not None
    assert pipeline_row.pipeline_stage == "entry"
    assert pipeline_row.pipeline_status == "active"

    # last_moved_by must be NULL — no FK violation against fake SYSTEM_USER_ID
    assert pipeline_row.last_moved_by is None, (
        f"last_moved_by should be NULL but got {pipeline_row.last_moved_by}. "
        "Public applications must not reference a non-existent system user."
    )


@pytest.mark.asyncio
async def test_pipeline_resume_version_linked(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job,
) -> None:
    r = await client.post(
        "/api/v1/public/candidates/apply",
        data=_form(job_id=str(published_job.id)),
        files={"resume_file": _pdf_file()},
    )
    assert r.status_code == 201, r.text
    body = r.json()

    from uuid import UUID
    version_id = UUID(body["resume_version_id"])
    version_row = await db_session.scalar(
        sa.select(ResumeVersionModel).where(ResumeVersionModel.id == version_id)
    )
    assert version_row is not None
    assert version_row.uploaded_by is None  # public app — no system user


@pytest.mark.asyncio
async def test_duplicate_email_wrong_password_returns_409_not_500(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Sequential duplicate: same email but wrong password → 409, not 500.

    The race-condition path (both requests see no existing row, second INSERT
    violates uq_candidates_active_email) is covered by the IntegrityError
    handler in public_application_service.py and returns 422. Testing that
    path in an integration test would require concurrent requests; this test
    covers the sequential path that must also never return 500.
    """
    email = f"dup_{uuid4().hex[:8]}@example.com"

    r1 = await client.post(
        "/api/v1/public/candidates/apply",
        data=_form(email=email, cpf="11122233301", password="CorrectPass1"),
        files={"resume_file": _pdf_file()},
    )
    assert r1.status_code == 201, r1.text

    # Same email, different CPF, WRONG password → existing account error
    r2 = await client.post(
        "/api/v1/public/candidates/apply",
        data=_form(email=email, cpf="11122233399", password="WrongPass999"),
        files={"resume_file": _pdf_file()},
    )
    assert r2.status_code == 409, (
        f"Duplicate email with wrong password should return 409, got {r2.status_code}: {r2.text}"
    )
    assert r2.status_code != 500, "Duplicate email must not return 500"


@pytest.mark.asyncio
async def test_duplicate_cpf_wrong_password_returns_409_not_500(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Sequential duplicate: same CPF but wrong password → 409, not 500."""
    cpf = "99988877701"

    r1 = await client.post(
        "/api/v1/public/candidates/apply",
        data=_form(cpf=cpf, email=f"unique1_{uuid4().hex[:6]}@example.com", password="CorrectPass1"),
        files={"resume_file": _pdf_file()},
    )
    assert r1.status_code == 201, r1.text

    # Same CPF, different email, WRONG password → existing account error
    r2 = await client.post(
        "/api/v1/public/candidates/apply",
        data=_form(cpf=cpf, email=f"unique2_{uuid4().hex[:6]}@example.com", password="WrongPass999"),
        files={"resume_file": _pdf_file()},
    )
    assert r2.status_code == 409, (
        f"Duplicate CPF with wrong password should return 409, got {r2.status_code}: {r2.text}"
    )
    assert r2.status_code != 500, "Duplicate CPF must not return 500"
