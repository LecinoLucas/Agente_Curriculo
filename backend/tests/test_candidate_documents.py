from hashlib import sha256
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from tests.integration.helpers import _auth_headers, _create_active_user
from tests.integration.test_resume_pipeline_smoke import _pdf_with_text


async def _make_candidate(db_session: AsyncSession, created_by: UUID, email_suffix: str = "") -> CandidateModel:
    candidate = CandidateModel(
        email=f"candidate-{uuid4().hex[:8]}{email_suffix}@test.com",
        full_name="Candidate Documents",
        created_by=created_by,
    )
    db_session.add(candidate)
    await db_session.flush()
    return candidate


async def _make_resume(
    db_session: AsyncSession,
    *,
    candidate: CandidateModel,
    created_by: UUID,
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
    original_file_name: str = "curriculo.pdf",
    file_bytes: bytes | None = None,
    write_file: bool = True,
) -> tuple[ResumeModel, ResumeVersionModel]:
    from src.infrastructure.storage import resume_files as resume_files_module

    monkeypatch.setattr(resume_files_module, "RESUME_UPLOAD_DIR", tmp_path)
    payload = file_bytes or _pdf_with_text("Curriculo para teste")

    resume = ResumeModel(
        id=uuid4(),
        candidate_id=candidate.id,
        title="Currículo principal",
        status="active",
        current_version=1,
        created_by=created_by,
    )
    db_session.add(resume)
    await db_session.flush()

    s3_key = f"resumes/{candidate.id}/{resume.id}/v1_original.pdf"
    version = ResumeVersionModel(
        id=uuid4(),
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test-bucket",
        s3_key=s3_key,
        original_file_name=original_file_name,
        file_size_bytes=len(payload),
        file_hash_sha256=sha256(payload).hexdigest(),
        mime_type="application/pdf",
        extraction_status="completed",
        uploaded_by=created_by,
    )
    db_session.add(version)
    await db_session.flush()
    await db_session.commit()

    if write_file:
        target = tmp_path / s3_key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)

    return resume, version


@pytest.mark.asyncio
async def test_recruiter_can_get_download_url_and_download_resume(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    recruiter_email = f"recruiter-{uuid4().hex[:6]}@test.com"
    recruiter = await _create_active_user(db_session, recruiter_email, "pass1234", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter_email, "pass1234")

    candidate = await _make_candidate(db_session, recruiter.id)
    resume, _ = await _make_resume(db_session, candidate=candidate, created_by=recruiter.id, tmp_path=tmp_path, monkeypatch=monkeypatch)

    url_resp = await client.get(
        f"/api/v1/candidates/{candidate.id}/resumes/{resume.id}/download-url",
        headers=headers,
    )
    assert url_resp.status_code == 200
    payload = url_resp.json()
    assert payload["content_type"] == "application/pdf"
    assert payload["filename"]
    assert payload["expires_at"] is None
    assert "s3_key" not in payload
    assert "file_path" not in payload
    assert "uploads/" not in payload["url"]

    download_resp = await client.get(
        f"/api/v1/candidates/{candidate.id}/resumes/{resume.id}/download",
        headers=headers,
    )
    assert download_resp.status_code == 200
    assert "attachment;" in (download_resp.headers.get("content-disposition") or "")
    assert download_resp.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_admin_can_download_resume_inline(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    admin_email = f"admin-{uuid4().hex[:6]}@test.com"
    admin = await _create_active_user(db_session, admin_email, "pass1234", UserRole.ADMIN)
    headers = await _auth_headers(client, admin_email, "pass1234")

    candidate = await _make_candidate(db_session, admin.id)
    resume, version = await _make_resume(db_session, candidate=candidate, created_by=admin.id, tmp_path=tmp_path, monkeypatch=monkeypatch)

    resp = await client.get(
        f"/api/v1/candidates/{candidate.id}/resumes/{resume.id}/download",
        params={"version_id": str(version.id), "disposition": "inline"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert "inline;" in (resp.headers.get("content-disposition") or "")


@pytest.mark.asyncio
async def test_user_without_permission_gets_403(
    client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_email = f"viewer-{uuid4().hex[:6]}@test.com"
    viewer = await _create_active_user(db_session, viewer_email, "pass1234", UserRole.VIEWER)
    headers = await _auth_headers(client, viewer_email, "pass1234")

    resp = await client.get(
        f"/api/v1/candidates/{uuid4()}/resumes/{uuid4()}/download-url",
        headers=headers,
    )
    assert resp.status_code == 403
    assert viewer.role.value == "viewer"


@pytest.mark.asyncio
async def test_candidate_role_cannot_access_internal_resume_endpoint(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate_email = f"portal-{uuid4().hex[:6]}@test.com"
    candidate_user = await _create_active_user(db_session, candidate_email, "pass1234", UserRole.CANDIDATE)
    headers = await _auth_headers(client, candidate_email, "pass1234")

    resp = await client.get(
        f"/api/v1/candidates/{uuid4()}/resumes/{uuid4()}/download",
        headers=headers,
    )
    assert resp.status_code == 403
    assert candidate_user.role.value == "candidate"


@pytest.mark.asyncio
async def test_resume_id_from_other_candidate_returns_404(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    recruiter_email = f"recruiter-{uuid4().hex[:6]}@test.com"
    recruiter = await _create_active_user(db_session, recruiter_email, "pass1234", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter_email, "pass1234")

    candidate_a = await _make_candidate(db_session, recruiter.id, email_suffix="-a")
    candidate_b = await _make_candidate(db_session, recruiter.id, email_suffix="-b")
    resume_b, _ = await _make_resume(db_session, candidate=candidate_b, created_by=recruiter.id, tmp_path=tmp_path, monkeypatch=monkeypatch)

    resp = await client.get(
        f"/api/v1/candidates/{candidate_a.id}/resumes/{resume_b.id}/download",
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_candidate_not_found_returns_404(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recruiter_email = f"recruiter-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, recruiter_email, "pass1234", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter_email, "pass1234")

    resp = await client.get(
        f"/api/v1/candidates/{uuid4()}/resumes/{uuid4()}/download-url",
        headers=headers,
    )
    assert resp.status_code == 404
    assert "Candidato não encontrado" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_missing_resume_file_returns_controlled_error(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    recruiter_email = f"recruiter-{uuid4().hex[:6]}@test.com"
    recruiter = await _create_active_user(db_session, recruiter_email, "pass1234", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter_email, "pass1234")

    candidate = await _make_candidate(db_session, recruiter.id)
    resume, _ = await _make_resume(
        db_session,
        candidate=candidate,
        created_by=recruiter.id,
        tmp_path=tmp_path,
        monkeypatch=monkeypatch,
        write_file=False,
    )

    resp = await client.get(
        f"/api/v1/candidates/{candidate.id}/resumes/{resume.id}/download",
        headers=headers,
    )
    assert resp.status_code == 404
    assert "Arquivo do currículo não encontrado no servidor" in resp.json()["detail"]
