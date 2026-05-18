"""
Fase 31R — Testes de segurança para download de currículo.

Cobre:
- recruiter/admin podem baixar currículo (200 + bytes corretos)
- viewer/manager bloqueados (403)
- candidato não acessa rota staff
- candidato sem currículo retorna 404 controlado
- filename sanitizado no header Content-Disposition
- audit log criado no download
- delete bloqueado para viewer/manager
- resumes router bloqueado para viewer/manager (RBAC fix)
"""

from hashlib import sha256
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from tests.integration.helpers import _auth_headers, _create_active_user
from tests.integration.test_resume_pipeline_smoke import _pdf_with_text


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _make_candidate(db_session: AsyncSession, created_by: UUID) -> CandidateModel:
    candidate = CandidateModel(
        email=f"candidate-{uuid4().hex[:8]}@test.com",
        full_name="Test Candidate Security",
        created_by=created_by,
    )
    db_session.add(candidate)
    await db_session.flush()
    return candidate


async def _make_resume_with_file(
    db_session: AsyncSession,
    *,
    candidate: CandidateModel,
    created_by: UUID,
    tmp_path,
    monkeypatch,
    file_bytes: bytes | None = None,
    original_file_name: str = "curriculo_teste.pdf",
) -> tuple[ResumeModel, ResumeVersionModel]:
    """Create a resume + version in the DB and write the actual file to tmp_path."""
    from src.infrastructure.storage import resume_files as _rf_module

    monkeypatch.setattr(_rf_module, "RESUME_UPLOAD_DIR", tmp_path)

    if file_bytes is None:
        file_bytes = _pdf_with_text("João Silva curriculo")

    resume_id = uuid4()
    resume = ResumeModel(
        id=resume_id,
        candidate_id=candidate.id,
        title="Currículo Segurança",
        status="active",
        current_version=1,
        created_by=created_by,
    )
    db_session.add(resume)
    await db_session.flush()

    s3_key = f"resumes/{candidate.id}/{resume_id}/v1_original.pdf"
    version = ResumeVersionModel(
        id=uuid4(),
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test-bucket",
        s3_key=s3_key,
        original_file_name=original_file_name,
        file_size_bytes=len(file_bytes),
        file_hash_sha256=sha256(file_bytes).hexdigest(),
        mime_type="application/pdf",
        extraction_status="completed",
        uploaded_by=created_by,
    )
    db_session.add(version)
    await db_session.flush()

    file_path = (tmp_path / s3_key)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(file_bytes)

    await db_session.commit()
    return resume, version


# ---------------------------------------------------------------------------
# 1. Recruiter baixa currículo → 200
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_recruiter_can_download_resume(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    recruiter_email = f"recruiter-{uuid4().hex[:6]}@test.com"
    recruiter = await _create_active_user(db_session, recruiter_email, "pass1234", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter_email, "pass1234")

    candidate = await _make_candidate(db_session, recruiter.id)
    pdf_bytes = _pdf_with_text("candidato recruiter download")
    await _make_resume_with_file(
        db_session, candidate=candidate, created_by=recruiter.id,
        tmp_path=tmp_path, monkeypatch=monkeypatch, file_bytes=pdf_bytes,
    )

    resp = await client.get(
        f"/api/v1/candidates/{candidate.id}/resume/download",
        headers=headers,
    )

    assert resp.status_code == 200
    assert resp.content == pdf_bytes
    assert "attachment" in resp.headers.get("content-disposition", "")


# ---------------------------------------------------------------------------
# 2. Admin baixa currículo → 200
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_can_download_resume(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    admin_email = f"admin-{uuid4().hex[:6]}@test.com"
    admin = await _create_active_user(db_session, admin_email, "pass1234", UserRole.ADMIN)
    headers = await _auth_headers(client, admin_email, "pass1234")

    candidate = await _make_candidate(db_session, admin.id)
    pdf_bytes = _pdf_with_text("candidato admin download")
    await _make_resume_with_file(
        db_session, candidate=candidate, created_by=admin.id,
        tmp_path=tmp_path, monkeypatch=monkeypatch, file_bytes=pdf_bytes,
    )

    resp = await client.get(
        f"/api/v1/candidates/{candidate.id}/resume/download",
        headers=headers,
    )

    assert resp.status_code == 200
    assert resp.content == pdf_bytes


# ---------------------------------------------------------------------------
# 3. Viewer bloqueado → 403
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_viewer_cannot_download_resume(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    admin_email = f"admin-{uuid4().hex[:6]}@test.com"
    admin = await _create_active_user(db_session, admin_email, "pass1234", UserRole.ADMIN)

    viewer_email = f"viewer-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, viewer_email, "pass1234", UserRole.VIEWER)
    viewer_headers = await _auth_headers(client, viewer_email, "pass1234")

    candidate = await _make_candidate(db_session, admin.id)
    await _make_resume_with_file(
        db_session, candidate=candidate, created_by=admin.id,
        tmp_path=tmp_path, monkeypatch=monkeypatch,
    )

    resp = await client.get(
        f"/api/v1/candidates/{candidate.id}/resume/download",
        headers=viewer_headers,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 4. Manager bloqueado → 403
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_manager_cannot_download_resume(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    admin_email = f"admin-{uuid4().hex[:6]}@test.com"
    admin = await _create_active_user(db_session, admin_email, "pass1234", UserRole.ADMIN)

    manager_email = f"manager-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, manager_email, "pass1234", UserRole.MANAGER)
    manager_headers = await _auth_headers(client, manager_email, "pass1234")

    candidate = await _make_candidate(db_session, admin.id)
    await _make_resume_with_file(
        db_session, candidate=candidate, created_by=admin.id,
        tmp_path=tmp_path, monkeypatch=monkeypatch,
    )

    resp = await client.get(
        f"/api/v1/candidates/{candidate.id}/resume/download",
        headers=manager_headers,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 5. Candidato sem currículo → 404 controlado
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_download_candidate_without_resume_returns_404(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recruiter_email = f"recruiter-{uuid4().hex[:6]}@test.com"
    recruiter = await _create_active_user(db_session, recruiter_email, "pass1234", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter_email, "pass1234")

    candidate = await _make_candidate(db_session, recruiter.id)
    await db_session.commit()

    resp = await client.get(
        f"/api/v1/candidates/{candidate.id}/resume/download",
        headers=headers,
    )
    assert resp.status_code == 404
    assert "Currículo não encontrado" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# 6. Filename sanitizado no Content-Disposition
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_download_sanitizes_filename(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    recruiter_email = f"recruiter-{uuid4().hex[:6]}@test.com"
    recruiter = await _create_active_user(db_session, recruiter_email, "pass1234", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter_email, "pass1234")

    candidate = await _make_candidate(db_session, recruiter.id)
    await _make_resume_with_file(
        db_session, candidate=candidate, created_by=recruiter.id,
        tmp_path=tmp_path, monkeypatch=monkeypatch,
        original_file_name="João Silva (curriculo) 2024.pdf",
    )

    resp = await client.get(
        f"/api/v1/candidates/{candidate.id}/resume/download",
        headers=headers,
    )
    assert resp.status_code == 200
    disposition = resp.headers.get("content-disposition", "")
    assert 'filename="' in disposition
    filename = disposition.split('filename="')[1].rstrip('"')
    # Must not contain shell-dangerous characters
    assert "(" not in filename
    assert ")" not in filename
    assert " " not in filename


# ---------------------------------------------------------------------------
# 7. Audit log criado no download staff
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_download_creates_audit_log(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    recruiter_email = f"recruiter-{uuid4().hex[:6]}@test.com"
    recruiter = await _create_active_user(db_session, recruiter_email, "pass1234", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter_email, "pass1234")

    candidate = await _make_candidate(db_session, recruiter.id)
    _, version = await _make_resume_with_file(
        db_session, candidate=candidate, created_by=recruiter.id,
        tmp_path=tmp_path, monkeypatch=monkeypatch,
    )

    resp = await client.get(
        f"/api/v1/candidates/{candidate.id}/resume/download",
        headers=headers,
    )
    assert resp.status_code == 200

    # Verify audit log was persisted
    log = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.action == "resume.download",
            AuditLogModel.resource_type == "resume_version",
            AuditLogModel.resource_id == version.id,
        )
    )
    assert log is not None
    assert log.user_id == recruiter.id
    assert str(candidate.id) in str(log.metadata_.get("candidate_id", ""))
    assert log.metadata_.get("actor_role") == "recruiter"


# ---------------------------------------------------------------------------
# 8. RBAC do resumes router — viewer/manager bloqueados
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_viewer_cannot_list_resumes(
    client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_email = f"viewer-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, viewer_email, "pass1234", UserRole.VIEWER)
    headers = await _auth_headers(client, viewer_email, "pass1234")

    resp = await client.get("/api/v1/resumes", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_manager_cannot_list_resumes(
    client: AsyncClient,
    db_session: AsyncSession,
):
    manager_email = f"manager-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, manager_email, "pass1234", UserRole.MANAGER)
    headers = await _auth_headers(client, manager_email, "pass1234")

    resp = await client.get("/api/v1/resumes", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_delete_resume(
    client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_email = f"viewer-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, viewer_email, "pass1234", UserRole.VIEWER)
    headers = await _auth_headers(client, viewer_email, "pass1234")

    fake_id = uuid4()
    resp = await client.delete(f"/api/v1/resumes/{fake_id}", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_manager_cannot_delete_resume(
    client: AsyncClient,
    db_session: AsyncSession,
):
    manager_email = f"manager-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, manager_email, "pass1234", UserRole.MANAGER)
    headers = await _auth_headers(client, manager_email, "pass1234")

    fake_id = uuid4()
    resp = await client.delete(f"/api/v1/resumes/{fake_id}", headers=headers)
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 9. Upload público salva arquivo original e metadata
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_public_apply_saves_file_and_metadata(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
    published_job,
    system_user_for_public_app,
):
    from src.infrastructure.storage import resume_files as _rf_module
    from src.infrastructure.database.models.resume_model import ResumeVersionModel as RVM

    monkeypatch.setattr(_rf_module, "RESUME_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(
        "src.interface.api.routers.public.enqueue_resume_extraction",
        lambda version_id: None,
    )

    pdf_bytes = _pdf_with_text("candidato publico teste")
    resp = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Candidato Publico",
            "cpf": "12345678901",
            "email": f"pub-{uuid4().hex[:6]}@test.com",
            "phone": "11999999999",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "3000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": "false",
            "password": "SenhaForte123",
            "confirm_password": "SenhaForte123",
            "lgpd_consent": "true",
        },
        files={"resume_file": ("curriculo.pdf", pdf_bytes, "application/pdf")},
    )
    assert resp.status_code == 201

    payload = resp.json()
    version_id = UUID(payload["resume_version_id"])

    version = await db_session.scalar(
        sa.select(RVM).where(RVM.id == version_id)
    )
    assert version is not None
    assert version.original_file_name == "curriculo.pdf"
    assert version.file_size_bytes == len(pdf_bytes)
    assert version.file_hash_sha256 == sha256(pdf_bytes).hexdigest()
    assert version.s3_key is not None and len(version.s3_key) > 0

    stored_path = tmp_path / version.s3_key
    assert stored_path.exists()
    assert stored_path.read_bytes() == pdf_bytes
