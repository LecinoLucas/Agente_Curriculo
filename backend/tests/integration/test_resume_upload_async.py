import io
import zipfile
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.resume_text_quality import LOW_QUALITY_FAILURE_REASON
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeVersionModel
from src.infrastructure.pdf.text_extractor import PdfTextExtractionError
from src.interface.workers.resume_extraction_tasks import _process_resume_extraction_async
from tests.conftest import TestSessionFactory
from tests.integration.helpers import _auth_headers, _create_active_user
from tests.integration.test_resume_pipeline_smoke import _pdf_with_text

_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _minimal_docx_bytes(text: str = "Curriculo DOCX") -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "[Content_Types].xml",
            (
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                '<Default Extension="xml" ContentType="application/xml"/>'
                '<Override PartName="/word/document.xml" '
                'ContentType="application/vnd.openxmlformats-officedocument.'
                'wordprocessingml.document.main+xml"/>'
                "</Types>"
            ),
        )
        archive.writestr(
            "word/document.xml",
            (
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                f"<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body>"
                "</w:document>"
            ),
        )
    return buffer.getvalue()


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


async def _ensure_active_analysis_config(
    db_session: AsyncSession,
    *,
    created_by: UUID,
) -> tuple[AIModelModel, PromptTemplateModel]:
    ai_model = AIModelModel(
        provider="gemini",
        model_id=f"gemini-resume-upload-{uuid4().hex[:8]}",
        model_name="Gemini Resume Upload Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"resume_upload_prompt_{uuid4().hex[:8]}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="{}",
        is_active=True,
        created_by=created_by,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.commit()
    return ai_model, prompt


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
        lambda _content: (_ for _ in ()).throw(
            AssertionError("extract_pdf_text should not run in request")
        ),
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
async def test_upload_rejects_docx_with_clear_error(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        "src.interface.api.routers.resumes.enqueue_resume_extraction",
        lambda _version_id: (_ for _ in ()).throw(
            AssertionError("DOCX upload must not enqueue extraction")
        ),
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

    upload_resp = await client.post(
        f"/api/v1/resumes/{resume_id}/upload",
        headers=headers,
        files={"file": ("resume.docx", _minimal_docx_bytes(), _DOCX_MIME)},
    )

    assert upload_resp.status_code == 422
    assert upload_resp.json()["detail"] == "Apenas arquivos PDF são permitidos."


@pytest.mark.asyncio
async def test_extraction_task_fails_legacy_docx_without_calling_ai(
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
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _stub_celery_sessionmaker(),
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.enqueue_analysis",
        lambda analysis_id: enqueued.append(str(analysis_id)),
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.extract_pdf_text",
        lambda _content: (_ for _ in ()).throw(
            AssertionError("DOCX must fail before PDF extraction")
        ),
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
    version_id = UUID(init_resp.json()["version_id"])
    docx_content = _minimal_docx_bytes()

    version = await db_session.scalar(
        sa.select(ResumeVersionModel).where(ResumeVersionModel.id == version_id)
    )
    assert version is not None
    version.original_file_name = "resume.docx"
    version.mime_type = _DOCX_MIME
    version.file_size_bytes = len(docx_content)
    version.file_hash_sha256 = "b" * 64
    version.extraction_status = "pending"
    version.extraction_error = None
    await db_session.commit()

    stored_file = tmp_path / version.s3_key
    stored_file.parent.mkdir(parents=True, exist_ok=True)
    stored_file.write_bytes(docx_content)

    result = await _process_resume_extraction_async(resume_version_id=version_id)

    assert result == {
        "status": "failed",
        "reason": "Formato de currículo não suportado para extração. Envie um arquivo PDF.",
    }
    await db_session.refresh(version)
    assert version.extraction_status == "failed"
    assert version.extraction_error == (
        "Formato de currículo não suportado para extração. Envie um arquivo PDF."
    )
    assert version.extracted_text is None
    assert enqueued == []


@pytest.mark.asyncio
async def test_extraction_task_fails_low_quality_text_without_enqueueing_analysis(
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
        lambda version_id: None,
    )
    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _stub_celery_sessionmaker(),
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.enqueue_analysis",
        lambda analysis_id: enqueued.append(str(analysis_id)),
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.extract_pdf_text",
        lambda _content: (_ for _ in ()).throw(
            PdfTextExtractionError(LOW_QUALITY_FAILURE_REASON)
        ),
    )

    email = f"recruiter-{uuid4().hex[:6]}@test.com"
    user = await _create_active_user(db_session, email, "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, email, "password123")
    candidate_id = await _create_candidate(client, headers)

    init_resp = await client.post(
        "/api/v1/resumes",
        headers=headers,
        json={"candidate_id": candidate_id},
    )
    resume_id = init_resp.json()["resume_id"]

    pdf_content = _pdf_with_text("|||||||| 000000 ----")
    upload_resp = await client.post(
        f"/api/v1/resumes/{resume_id}/upload",
        headers=headers,
        files={"file": ("resume.pdf", pdf_content, "application/pdf")},
    )
    version_id = UUID(upload_resp.json()["version_id"])

    ai_model = AIModelModel(
        provider="gemini",
        model_id=f"gemini-low-quality-{uuid4().hex[:8]}",
        model_name="Gemini Low Quality Test",
        is_active=False,
    )
    prompt = PromptTemplateModel(
        name=f"low_quality_prompt_{uuid4().hex[:8]}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="{}",
        is_active=False,
        created_by=user.id,
    )
    job = JobModel(
        title="Analista",
        description="Análise",
        status="published",
        created_by=user.id,
        deal_breakers=[],
        behavioral_requirements=[],
    )
    db_session.add_all([ai_model, prompt, job])
    await db_session.flush()
    analysis = AnalysisModel(
        resume_version_id=version_id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt.id,
        requested_by=user.id,
        job_id=job.id,
        status="waiting_extraction",
        task_id=None,
    )
    db_session.add(analysis)
    await db_session.commit()

    result = await _process_resume_extraction_async(resume_version_id=version_id)

    assert result == {"status": "failed", "reason": LOW_QUALITY_FAILURE_REASON}
    assert enqueued == []
    version = await db_session.scalar(
        sa.select(ResumeVersionModel).where(ResumeVersionModel.id == version_id)
    )
    assert version is not None
    assert version.extraction_status == "failed"
    assert version.extraction_error == LOW_QUALITY_FAILURE_REASON
    assert version.extracted_text is None

    await db_session.refresh(analysis)
    assert analysis.status == "failed"
    assert analysis.failure_reason == LOW_QUALITY_FAILURE_REASON
    assert analysis.provider_error_type == LOW_QUALITY_FAILURE_REASON
    audit_event = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.resource_id == version_id,
            AuditLogModel.action == "extraction_failed",
        )
    )
    assert audit_event is not None
    assert audit_event.resource_type == "resume_version"
    assert audit_event.metadata_["failure_reason"] == LOW_QUALITY_FAILURE_REASON
    assert audit_event.metadata_["text_quality_status"] == "low_quality"


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
    audit_event = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.resource_id == UUID(version_id),
            AuditLogModel.action == "extraction_completed",
        )
    )
    assert audit_event is not None
    assert audit_event.metadata_["extraction_used_ocr"] is False
    assert audit_event.metadata_["text_quality_status"] == "useful"

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


@pytest.mark.asyncio
async def test_public_upload_textual_pdf_completes_extraction_and_enqueues_waiting_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job: JobModel,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"ocr-config-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    await _ensure_active_analysis_config(db_session, created_by=recruiter.id)

    monkeypatch.setattr(
        "src.infrastructure.storage.resume_files.RESUME_UPLOAD_DIR",
        tmp_path,
    )
    monkeypatch.setattr(
        "src.interface.api.routers.public.enqueue_resume_extraction",
        lambda _resume_version_id: None,
    )
    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _stub_celery_sessionmaker(),
    )

    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Fluxo Textual",
            "cpf": "98011111000",
            "email": f"fluxo-textual-{uuid4().hex[:6]}@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "7000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", _pdf_with_text("Ana Souza\nPython FastAPI"), "application/pdf")},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["analysis_auto_requested"] is True
    assert payload["analysis_status"] == "waiting_extraction"

    enqueued: list[str] = []
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.enqueue_analysis",
        lambda analysis_id: enqueued.append(str(analysis_id)),
    )

    result = await _process_resume_extraction_async(resume_version_id=payload["resume_version_id"])

    assert result["status"] == "completed"
    assert enqueued == [payload["analysis_id"]]

    version = await db_session.scalar(
        sa.select(ResumeVersionModel).where(ResumeVersionModel.id == UUID(payload["resume_version_id"]))
    )
    assert version is not None
    assert version.extraction_status == "completed"
    assert "Ana Souza" in (version.extracted_text or "")

    started_audit = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.resource_id == UUID(payload["resume_version_id"]),
            AuditLogModel.action == "extraction_started",
        )
    )
    assert started_audit is not None

    analysis = await db_session.scalar(
        sa.select(AnalysisModel).where(AnalysisModel.id == UUID(payload["analysis_id"]))
    )
    assert analysis is not None
    assert analysis.status == "pending"
    assert analysis.task_id == f"analysis:{payload['analysis_id']}"


@pytest.mark.asyncio
async def test_public_upload_low_quality_pdf_uses_ocr_fallback_and_releases_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job: JobModel,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"ocr-fallback-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    await _ensure_active_analysis_config(db_session, created_by=recruiter.id)

    monkeypatch.setattr(
        "src.infrastructure.storage.resume_files.RESUME_UPLOAD_DIR",
        tmp_path,
    )
    monkeypatch.setattr(
        "src.interface.api.routers.public.enqueue_resume_extraction",
        lambda _resume_version_id: None,
    )
    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _stub_celery_sessionmaker(),
    )

    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Fluxo OCR",
            "cpf": "98011111001",
            "email": f"fluxo-ocr-{uuid4().hex[:6]}@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "7000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", _pdf_with_text("|||||||| 000000 ----"), "application/pdf")},
    )

    payload = response.json()
    enqueued: list[str] = []
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.enqueue_analysis",
        lambda analysis_id: enqueued.append(str(analysis_id)),
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.extract_pdf_text",
        lambda _content: SimpleNamespace(
            text="Bruna Lima\nExperiência: Analista de Dados\nPython SQL",
            page_count=1,
            word_count=8,
            used_ocr=True,
            empty_pages=1,
        ),
    )

    result = await _process_resume_extraction_async(resume_version_id=payload["resume_version_id"])

    assert result["status"] == "completed"
    assert result["used_ocr"] is True
    assert enqueued == [payload["analysis_id"]]

    audit_event = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.resource_id == UUID(payload["resume_version_id"]),
            AuditLogModel.action == "extraction_completed",
        )
    )
    assert audit_event is not None
    assert audit_event.metadata_["extraction_used_ocr"] is True


@pytest.mark.asyncio
async def test_public_upload_ocr_unavailable_marks_extraction_failed_without_enqueueing_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job: JobModel,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"ocr-unavailable-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    await _ensure_active_analysis_config(db_session, created_by=recruiter.id)

    monkeypatch.setattr(
        "src.infrastructure.storage.resume_files.RESUME_UPLOAD_DIR",
        tmp_path,
    )
    monkeypatch.setattr(
        "src.interface.api.routers.public.enqueue_resume_extraction",
        lambda _resume_version_id: None,
    )
    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _stub_celery_sessionmaker(),
    )

    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Fluxo OCR Indisponivel",
            "cpf": "98011111002",
            "email": f"fluxo-ocr-off-{uuid4().hex[:6]}@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "7000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", _pdf_with_text("|||||||| 000000 ----"), "application/pdf")},
    )

    payload = response.json()
    enqueued: list[str] = []
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.enqueue_analysis",
        lambda analysis_id: enqueued.append(str(analysis_id)),
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.extract_pdf_text",
        lambda _content: (_ for _ in ()).throw(
            PdfTextExtractionError(
                "OCR indisponível neste ambiente. Envie um PDF com texto selecionável ou habilite pdf2image/pytesseract.",
                reason_code="ocr_unavailable",
                ocr_available=False,
            )
        ),
    )

    result = await _process_resume_extraction_async(resume_version_id=payload["resume_version_id"])

    assert result["status"] == "failed"
    assert enqueued == []

    version = await db_session.scalar(
        sa.select(ResumeVersionModel).where(ResumeVersionModel.id == UUID(payload["resume_version_id"]))
    )
    assert version is not None
    assert version.extraction_status == "failed"
    assert version.extraction_error == (
        "OCR indisponível neste ambiente. Envie um PDF com texto selecionável ou habilite pdf2image/pytesseract."
    )

    analysis = await db_session.scalar(
        sa.select(AnalysisModel).where(AnalysisModel.id == UUID(payload["analysis_id"]))
    )
    assert analysis is not None
    assert analysis.status == "failed"
    assert analysis.failure_reason == "resume_extraction_failed"
    assert analysis.provider_error_type == "resume_extraction_failed"

    failure_audit = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.resource_id == UUID(payload["resume_version_id"]),
            AuditLogModel.action == "extraction_failed",
        )
    )
    assert failure_audit is not None
    assert failure_audit.metadata_["failure_code"] == "ocr_unavailable"
    assert failure_audit.metadata_["text_quality_status"] == "ocr_unavailable"
