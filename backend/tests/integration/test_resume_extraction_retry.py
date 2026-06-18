"""Integration tests for POST /api/v1/resumes/{resume_id}/retry-extraction."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from tests.integration.helpers import _create_active_user, _auth_headers

pytestmark = pytest.mark.asyncio

_RECRUITER_EMAIL = "recruiter.retry@test.com"
_RECRUITER_PASSWORD = "Pass1234!"
_S3_KEY = "resumes/candidate-id-placeholder/resume-id-placeholder/v1_original.pdf"


async def _seed_resume(
    db_session: AsyncSession,
    *,
    extraction_status: str = "failed",
    age_seconds: int = 600,
    has_file: bool = True,
    word_count: int | None = None,
    extracted_text: str | None = None,
) -> tuple[ResumeModel, ResumeVersionModel]:
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Test Candidate",
        email=f"candidate-retry-{uuid4()}@test.com",
        created_by=uuid4(),
    )
    db_session.add(candidate)
    await db_session.flush()

    resume = ResumeModel(
        id=uuid4(),
        candidate_id=candidate.id,
        title="Currículo teste",
        status="active",
        current_version=1,
        created_by=uuid4(),
    )
    db_session.add(resume)
    await db_session.flush()

    s3_key = f"resumes/{candidate.id}/{resume.id}/v1_original.pdf"
    version = ResumeVersionModel(
        id=uuid4(),
        resume_id=resume.id,
        version_number=1,
        s3_bucket="resume-ai-dev-uploads",
        s3_key=s3_key,
        original_file_name="curriculo.pdf",
        file_size_bytes=1024,
        file_hash_sha256="abc123",
        mime_type="application/pdf",
        extraction_status=extraction_status,
        extraction_error="prior error" if extraction_status == "failed" else None,
        extracted_text=extracted_text,
        word_count=word_count,
        uploaded_by=uuid4(),
        uploaded_at=datetime.now(UTC) - timedelta(seconds=age_seconds),
    )
    db_session.add(version)
    await db_session.commit()
    return resume, version


def _patch_file(exists: bool = True):
    from pathlib import Path
    m = patch(
        "src.application.services.resume_service.resolve_resume_storage_path",
        return_value=Path("/fake/path/v1_original.pdf"),
    )
    exists_patch = patch.object(Path, "exists", return_value=exists)
    return m, exists_patch


def _patch_enqueue():
    return patch(
        "src.interface.api.routers.resumes.enqueue_resume_extraction",
    )


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    await _create_active_user(db_session, _RECRUITER_EMAIL, _RECRUITER_PASSWORD, UserRole.RECRUITER)
    return await _auth_headers(client, _RECRUITER_EMAIL, _RECRUITER_PASSWORD)


# ─── tests ───────────────────────────────────────────────────────────────────


async def test_retry_failed_extraction_enqueues_and_returns_queued_true(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    resume, version = await _seed_resume(db_session, extraction_status="failed", age_seconds=3600)

    with _patch_file()[0], _patch_file()[1], _patch_enqueue() as mock_enqueue:
        response = await client.post(
            f"/api/v1/resumes/{resume.id}/retry-extraction", headers=headers
        )

    assert response.status_code == 200
    body = response.json()
    assert body["queued"] is True
    assert body["can_retry_extraction"] is True
    assert body["extraction_status"] == "pending"
    mock_enqueue.assert_called_once_with(version.id)


async def test_retry_stale_processing_enqueues(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    resume, version = await _seed_resume(
        db_session, extraction_status="processing", age_seconds=700
    )

    with _patch_file()[0], _patch_file()[1], _patch_enqueue() as mock_enqueue:
        response = await client.post(
            f"/api/v1/resumes/{resume.id}/retry-extraction", headers=headers
        )

    assert response.status_code == 200
    body = response.json()
    assert body["queued"] is True
    mock_enqueue.assert_called_once()


async def test_retry_recent_processing_returns_409(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    resume, _ = await _seed_resume(
        db_session, extraction_status="processing", age_seconds=30
    )

    with _patch_file()[0], _patch_file()[1]:
        response = await client.post(
            f"/api/v1/resumes/{resume.id}/retry-extraction", headers=headers
        )

    assert response.status_code == 409
    assert "andamento" in response.json()["detail"].lower()


async def test_retry_stale_pending_enqueues(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    resume, _ = await _seed_resume(
        db_session, extraction_status="pending", age_seconds=3600
    )

    with _patch_file()[0], _patch_file()[1], _patch_enqueue() as mock_enqueue:
        response = await client.post(
            f"/api/v1/resumes/{resume.id}/retry-extraction", headers=headers
        )

    assert response.status_code == 200
    assert response.json()["queued"] is True
    mock_enqueue.assert_called_once()


async def test_retry_recent_pending_returns_not_queued(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    resume, _ = await _seed_resume(
        db_session, extraction_status="pending", age_seconds=30
    )

    with _patch_file()[0], _patch_file()[1], _patch_enqueue() as mock_enqueue:
        response = await client.post(
            f"/api/v1/resumes/{resume.id}/retry-extraction", headers=headers
        )

    assert response.status_code == 200
    body = response.json()
    assert body["queued"] is False
    assert body["can_retry_extraction"] is False
    mock_enqueue.assert_not_called()


async def test_retry_completed_with_text_returns_not_queued(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    resume, _ = await _seed_resume(
        db_session,
        extraction_status="completed",
        extracted_text="João Silva, Engenheiro de Software",
        word_count=5,
    )

    with _patch_file()[0], _patch_file()[1], _patch_enqueue() as mock_enqueue:
        response = await client.post(
            f"/api/v1/resumes/{resume.id}/retry-extraction", headers=headers
        )

    assert response.status_code == 200
    body = response.json()
    assert body["queued"] is False
    assert body["can_retry_extraction"] is False
    mock_enqueue.assert_not_called()


async def test_retry_no_file_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    resume, _ = await _seed_resume(db_session, extraction_status="failed")

    with _patch_file(exists=False)[0], _patch_file(exists=False)[1]:
        response = await client.post(
            f"/api/v1/resumes/{resume.id}/retry-extraction", headers=headers
        )

    assert response.status_code == 422
    assert "arquivo" in response.json()["detail"].lower()


async def test_retry_requires_recruiter_or_admin(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    viewer_email = "viewer.retry@test.com"
    await _create_active_user(db_session, viewer_email, _RECRUITER_PASSWORD, UserRole.VIEWER)
    viewer_headers = await _auth_headers(client, viewer_email, _RECRUITER_PASSWORD)

    resume, _ = await _seed_resume(db_session, extraction_status="failed")

    response = await client.post(
        f"/api/v1/resumes/{resume.id}/retry-extraction", headers=viewer_headers
    )
    assert response.status_code == 403


async def test_retry_response_does_not_expose_sensitive_data(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    resume, _ = await _seed_resume(db_session, extraction_status="failed", age_seconds=3600)

    with _patch_file()[0], _patch_file()[1], _patch_enqueue():
        response = await client.post(
            f"/api/v1/resumes/{resume.id}/retry-extraction", headers=headers
        )

    body_str = response.text
    assert "extracted_text" not in body_str
    assert "s3_key" not in body_str
    assert "uploads" not in body_str


async def test_retry_idempotent_on_failed_status(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Two consecutive retries are both safe: first resets failed→pending+enqueue,
    second sees stale pending and re-enqueues (claim guard in the worker deduplicates)."""
    headers = await _recruiter_headers(client, db_session)
    resume, _ = await _seed_resume(db_session, extraction_status="failed", age_seconds=3600)

    with _patch_file()[0], _patch_file()[1], _patch_enqueue() as mock_enqueue:
        r1 = await client.post(f"/api/v1/resumes/{resume.id}/retry-extraction", headers=headers)
        r2 = await client.post(f"/api/v1/resumes/{resume.id}/retry-extraction", headers=headers)

    assert r1.status_code == 200
    assert r1.json()["queued"] is True
    assert r2.status_code == 200
    # uploaded_at is unchanged — version is still stale pending → enqueued again
    # the worker's claim guard prevents double-processing
    assert r2.json()["queued"] is True
    assert mock_enqueue.call_count == 2


async def test_extraction_status_endpoint_includes_can_retry(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    resume, _ = await _seed_resume(db_session, extraction_status="failed", age_seconds=3600)

    response = await client.get(
        f"/api/v1/resumes/{resume.id}/extraction-status", headers=headers
    )

    assert response.status_code == 200
    body = response.json()
    assert body["can_retry_extraction"] is True
    assert body["retry_extraction_reason"] == "extraction_failed"
    assert body["extraction_status_label"] is not None
