from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.resume_model import ResumeVersionModel
from src.interface.workers.resume_extraction_tasks import _process_resume_extraction_async
from tests.conftest import TestSessionFactory
from tests.integration.helpers import _auth_headers, _create_active_user
from tests.integration.test_resume_pipeline_smoke import _pdf_with_text


def _stub_celery_sessionmaker() -> AsyncMock:
    return AsyncMock(
        return_value=(
            SimpleNamespace(dispose=AsyncMock()),
            TestSessionFactory,
        )
    )


async def _create_candidate(client: AsyncClient, headers: dict[str, str]) -> str:
    response = await client.post(
        "/api/v1/candidates",
        headers=headers,
        json={
            "full_name": "Upload Async Candidate",
            "email": f"upload-{uuid4().hex[:8]}@test.com",
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


@pytest.mark.asyncio
async def test_upload_returns_202_and_does_not_extract_in_request(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    enqueued: list[str] = []

    monkeypatch.setattr(
        "src.infrastructure.storage.resume_files.RESUME_UPLOAD_DIR",
        tmp_path,
    )
    monkeypatch.setattr(
        "src.interface.api.routers.resumes.enqueue_resume_extraction",
        lambda version_id: enqueued.append(str(version_id)),
    )
    monkeypatch.setattr(
        "src.infrastructure.pdf.text_extractor.extract_pdf_text",
        lambda _content: (_ for _ in ()).throw(AssertionError("extract_pdf_text should not run in request")),
    )

    email = f"recruiter-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, email, "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, email, "password123")
    candidate_id = await _create_candidate(client, headers)

    init_resp = await client.post(
        "/api/v1/resumes",
        headers=headers,
        json={"candidate_id": candidate_id},
    )
    assert init_resp.status_code == 202
    resume_id = init_resp.json()["resume_id"]

    pdf_content = _pdf_with_text("Maria Silva\nmaria@example.com\nPython FastAPI")
    upload_resp = await client.post(
        f"/api/v1/resumes/{resume_id}/upload",
        headers=headers,
        files={"file": ("resume.pdf", pdf_content, "application/pdf")},
    )

    assert upload_resp.status_code == 202
    payload = upload_resp.json()
    assert payload["analysis_auto_requested"] is False
    assert payload["analysis_id"] is None
    assert payload["analysis_status"] is None
    assert payload["extraction_status"] == "pending"
    assert payload["page_count"] is None
    assert payload["word_count"] is None
    assert enqueued == [payload["version_id"]]

    version = await db_session.scalar(
        sa.select(ResumeVersionModel).where(ResumeVersionModel.id == UUID(payload["version_id"]))
    )
    assert version is not None
    assert version.extraction_status == "pending"
    assert version.extracted_text is None
    stored_file = tmp_path / version.s3_key
    assert stored_file.exists()
    assert stored_file.read_bytes() == pdf_content


@pytest.mark.asyncio
async def test_extraction_task_processes_resume(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    monkeypatch.setattr(
        "src.infrastructure.storage.resume_files.RESUME_UPLOAD_DIR",
        tmp_path,
    )
    monkeypatch.setattr(
        "src.interface.api.routers.resumes.enqueue_resume_extraction",
        lambda version_id: None,
    )
    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _stub_celery_sessionmaker(),
    )

    email = f"recruiter-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, email, "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, email, "password123")
    candidate_id = await _create_candidate(client, headers)

    init_resp = await client.post(
        "/api/v1/resumes",
        headers=headers,
        json={"candidate_id": candidate_id},
    )
    resume_id = init_resp.json()["resume_id"]

    pdf_content = _pdf_with_text("Ana Souza\nana@example.com\nPython FastAPI SQL")
    upload_resp = await client.post(
        f"/api/v1/resumes/{resume_id}/upload",
        headers=headers,
        files={"file": ("resume.pdf", pdf_content, "application/pdf")},
    )
    version_id = upload_resp.json()["version_id"]

    result = await _process_resume_extraction_async(resume_version_id=version_id)
    assert result["status"] == "completed"

    version = await db_session.scalar(
        sa.select(ResumeVersionModel).where(ResumeVersionModel.id == UUID(version_id))
    )
    assert version is not None
    assert version.extraction_status == "completed"
    assert "Ana Souza" in (version.extracted_text or "")
    assert (version.word_count or 0) > 0

    status_resp = await client.get(
        f"/api/v1/resumes/{resume_id}/extraction-status",
        headers=headers,
    )
    assert status_resp.status_code == 200
    assert status_resp.json()["extraction_status"] == "completed"


@pytest.mark.asyncio
async def test_upload_without_job_does_not_create_analysis_or_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        "src.interface.api.routers.resumes.enqueue_resume_extraction",
        lambda version_id: None,
    )

    email = f"recruiter-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, email, "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, email, "password123")
    candidate_id = await _create_candidate(client, headers)

    init_resp = await client.post(
        "/api/v1/resumes",
        headers=headers,
        json={"candidate_id": candidate_id},
    )
    resume_id = init_resp.json()["resume_id"]

    pdf_content = _pdf_with_text("No pipeline and no analysis should be created")
    upload_resp = await client.post(
        f"/api/v1/resumes/{resume_id}/upload",
        headers=headers,
        files={"file": ("resume.pdf", pdf_content, "application/pdf")},
    )

    assert upload_resp.status_code == 202

    pipeline_count = await db_session.scalar(
        sa.select(sa.func.count(CandidateJobPipelineModel.candidate_id)).where(
            CandidateJobPipelineModel.candidate_id == UUID(candidate_id)
        )
    )
    analysis_count = await db_session.scalar(
        sa.select(sa.func.count(AnalysisModel.id))
        .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
        .where(ResumeVersionModel.resume_id == UUID(init_resp.json()["resume_id"]))
    )

    assert pipeline_count == 0
    assert analysis_count == 0
