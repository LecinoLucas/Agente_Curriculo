"""Tests for public candidate application — created_by=None for public candidates."""

import io
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

# Fase 30B (continued) — Validar que candidatos públicos não usam SYSTEM_USER_ID fictício.
# Testes críticos para evitar ForeignKeyViolationError.
pytestmark = pytest.mark.smoke

from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel


async def _get_candidate_created_by(
    db_session: AsyncSession,
    candidate_id: UUID,
) -> UUID | None:
    """Get the created_by value for a candidate."""
    return await db_session.scalar(
        sa.select(CandidateModel.created_by).where(CandidateModel.id == candidate_id)
    )


async def _get_resume_created_by(
    db_session: AsyncSession,
    resume_id: UUID,
) -> UUID | None:
    """Get the created_by value for a resume."""
    return await db_session.scalar(
        sa.select(ResumeModel.created_by).where(ResumeModel.id == resume_id)
    )


async def _get_resume_version_uploaded_by(
    db_session: AsyncSession,
    version_id: UUID,
) -> UUID | None:
    """Get the uploaded_by value for a resume version."""
    return await db_session.scalar(
        sa.select(ResumeVersionModel.uploaded_by).where(ResumeVersionModel.id == version_id)
    )


@pytest.mark.asyncio
async def test_public_apply_creates_candidate_with_null_created_by(
    db_session: AsyncSession,
    client: AsyncClient,
    published_job,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply creates candidate with created_by=None.
    
    Prevents ForeignKeyViolationError: candidates.created_by must not reference
    non-existent users (SYSTEM_USER_ID).
    """
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Candidato Público",
            "cpf": "12345678910",
            "email": "candidato.publico@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000-7000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    
    assert response.status_code == status.HTTP_201_CREATED, response.text
    data = response.json()
    candidate_id = UUID(data["candidate_id"])
    resume_id = UUID(data["resume_id"])
    version_id = UUID(data["resume_version_id"])
    
    # Validate candidate.created_by is NULL (not SYSTEM_USER_ID)
    created_by = await _get_candidate_created_by(db_session, candidate_id)
    assert created_by is None, (
        f"expected created_by=None for public candidate, got {created_by}. "
        "This prevents ForeignKeyViolationError with non-existent SYSTEM_USER_ID."
    )
    
    # Validate resume.created_by is NULL
    resume_created_by = await _get_resume_created_by(db_session, resume_id)
    assert resume_created_by is None, (
        f"expected resume.created_by=None for public application, got {resume_created_by}"
    )
    
    # Validate resume_version.uploaded_by is NULL
    version_uploaded_by = await _get_resume_version_uploaded_by(db_session, version_id)
    assert version_uploaded_by is None, (
        f"expected resume_version.uploaded_by=None for public application, got {version_uploaded_by}"
    )


@pytest.mark.asyncio
async def test_public_apply_without_job_creates_candidate_with_null_created_by(
    db_session: AsyncSession,
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply (without job) creates candidate with created_by=None."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Candidato Talento Pool",
            "cpf": "98765432100",
            "email": "talento.pool@example.com",
            "phone": "11987654322",
            "city": "Rio de Janeiro",
            "state": "RJ",
            "salary_expectation": "6000-8000",
            "desired_contract_type": "PJ",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura456",
            "confirm_password": "SenhaSegura456",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    
    assert response.status_code == status.HTTP_201_CREATED, response.text
    data = response.json()
    candidate_id = UUID(data["candidate_id"])
    
    # Validate candidate.created_by is NULL
    created_by = await _get_candidate_created_by(db_session, candidate_id)
    assert created_by is None, (
        f"expected created_by=None for talent pool candidate, got {created_by}"
    )
    assert data["talent_pool"] is True, "expected talent_pool=True when no job_id"


@pytest.mark.asyncio
async def test_public_apply_duplicate_cpf_returns_422(
    db_session: AsyncSession,
    client: AsyncClient,
    published_job,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply rejects duplicate CPF with 422."""
    cpf = "11122233344"
    
    # First application
    response1 = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Primeiro Candidato",
            "cpf": cpf,
            "email": "primeiro@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000-7000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response1.status_code == status.HTTP_201_CREATED
    
    # Second application with same CPF should fail (not 500)
    response2 = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Segundo Candidato",
            "cpf": cpf,
            "email": "segundo@example.com",
            "phone": "11987654322",
            "city": "Rio de Janeiro",
            "state": "RJ",
            "salary_expectation": "6000-8000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    
    # Should reject with 422 (UnprocessableEntity), not 500
    assert response2.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    detail = response2.json()["detail"]
    assert "CPF" in detail or "registrado" in detail


@pytest.mark.asyncio
async def test_public_apply_duplicate_email_returns_422(
    db_session: AsyncSession,
    client: AsyncClient,
    published_job,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply rejects duplicate email with 422."""
    email = "duplicado@example.com"
    
    # First application
    response1 = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Primeiro Email",
            "cpf": "22233344455",
            "email": email,
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000-7000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response1.status_code == status.HTTP_201_CREATED
    
    # Second application with same email should fail
    response2 = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Segundo Email",
            "cpf": "33344455566",
            "email": email,
            "phone": "11987654322",
            "city": "Rio de Janeiro",
            "state": "RJ",
            "salary_expectation": "6000-8000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    
    assert response2.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    detail = response2.json()["detail"]
    assert "email" in detail.lower() or "registrado" in detail.lower()


@pytest.mark.asyncio
async def test_public_apply_invalid_phone_returns_422(
    client: AsyncClient,
    published_job,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply rejects invalid phone with 422."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Telefone Inválido",
            "cpf": "44455566677",
            "email": "invalido@example.com",
            "phone": "123",  # Too short
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000-7000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    detail = response.json()["detail"]
    assert "telefone" in detail.lower() or "phone" in detail.lower()
