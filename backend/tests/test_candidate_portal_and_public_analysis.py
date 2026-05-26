import io
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from hashlib import sha256
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.application.services.candidate_portal_auth_service import (
    PORTAL_SESSION_PURPOSE,
)
from src.infrastructure.security.password_service import hash_password
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_auth_token_model import (
    CandidateAuthTokenModel,
)
from src.infrastructure.database.models.communication_model import CandidateCommunicationModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.user_model import UserModel
from src.interface.workers.resume_extraction_tasks import _process_resume_extraction_async
from src.domain.entities.user import UserRole
from tests.integration.helpers import _auth_headers, _create_active_user

SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-00000000000a")


@pytest.fixture
def valid_pdf_bytes() -> bytes:
    return b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
160
%%EOF
"""


async def _create_candidate(
    db_session: AsyncSession,
    *,
    full_name: str,
    email: str,
    cpf: str,
    phone: str = "11999999999",
    application_source: str = "manual",
    create_resume: bool = True,
) -> CandidateModel:
    candidate = CandidateModel(
        id=uuid4(),
        full_name=full_name,
        email=email,
        cpf=cpf,
        phone=phone,
        location_city="São Paulo",
        location_state="SP",
        location_country="BR",
        created_by=SYSTEM_USER_ID,
        application_source=application_source,
        salary_expectation="5000.00",
        lgpd_consent_at=datetime.now(UTC),
    )
    db_session.add(candidate)
    if create_resume:
        resume = ResumeModel(
            id=uuid4(),
            candidate_id=candidate.id,
            title="Currículo",
            status="active",
            current_version=1,
            created_by=SYSTEM_USER_ID,
        )
        version = ResumeVersionModel(
            id=uuid4(),
            resume_id=resume.id,
            version_number=1,
            s3_bucket="test",
            s3_key=f"resumes/{candidate.id}/curriculo.pdf",
            original_file_name="curriculo.pdf",
            file_size_bytes=1024,
            file_hash_sha256="a" * 64,
            mime_type="application/pdf",
            extraction_status="completed",
            uploaded_by=SYSTEM_USER_ID,
        )
        db_session.add_all([resume, version])
    await db_session.commit()
    return candidate


async def _create_ai_config(db_session: AsyncSession) -> None:
    ai_model = AIModelModel(
        id=uuid4(),
        provider="google",
        model_id="gemini-2.5-flash-test",
        model_name="Gemini Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        id=uuid4(),
        name="Full Analysis Test",
        version=1,
        template_type="full_analysis",
        user_prompt_template="Analise o curriculo {{ resume_text }} para a vaga {{ job_text }}",
        max_tokens=2048,
        temperature=Decimal("0.1"),
        is_active=True,
        activated_at=datetime.now(UTC),
        created_by=SYSTEM_USER_ID,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.commit()


async def _create_portal_session(db_session: AsyncSession, candidate_id: UUID, raw_token: str) -> None:
    db_session.add(
        CandidateAuthTokenModel(
            candidate_id=candidate_id,
            purpose=PORTAL_SESSION_PURPOSE,
            token_hash=sha256(raw_token.encode("utf-8")).hexdigest(),
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
    )
    await db_session.commit()


async def _create_published_job(db_session: AsyncSession, *, title: str) -> JobModel:
    job = JobModel(
        id=uuid4(),
        title=title,
        description=f"Descricao para {title}",
        status="published",
        created_by=uuid4(),
        location="São Paulo, SP",
        job_area="Technology",
    )
    db_session.add(job)
    await db_session.commit()
    return job


@pytest.mark.asyncio
async def test_login_rejects_invalid_credentials_with_generic_message(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    email = "maria.portal@example.com"
    candidate = await _create_candidate(
        db_session,
        full_name="Maria da Silva",
        email=email,
        cpf="12345678909",
    )
    candidate.password_hash = hash_password("SenhaSegura123")
    await db_session.commit()

    response = await client.post(
        "/api/v1/public/candidate-auth/login",
        json={
            "email": email,
            "password": "senha-invalida",
        },
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["detail"] == "E-mail ou senha inválidos."


@pytest.mark.asyncio
async def test_login_sets_portal_cookie_and_allows_access(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Joana Portal",
        email="joana.portal@example.com",
        cpf="98765432100",
    )
    candidate.password_hash = hash_password("SenhaSegura123")
    await db_session.commit()

    response = await client.post(
        "/api/v1/public/candidate-auth/login",
        json={
            "email": "joana.portal@example.com",
            "password": "SenhaSegura123",
        },
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["redirect_to"] == "/candidato/portal"
    assert "candidate_portal_token=" in response.headers.get("set-cookie", "")

    overview_response = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_response.status_code == status.HTTP_200_OK
    payload = overview_response.json()
    assert payload["candidate"]["id"] == str(candidate.id)
    assert payload["candidate"]["cpf_masked"].endswith("-00")
    assert "notes" not in payload
    assert "notes" not in payload["candidate"]


@pytest.mark.asyncio
async def test_login_rejects_unknown_candidate(
    client: AsyncClient,
) -> None:
    response = await client.post(
        "/api/v1/public/candidate-auth/login",
        json={"email": "desconhecido@example.com", "password": "SenhaSegura123"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["detail"] == "E-mail ou senha inválidos."


@pytest.mark.asyncio
async def test_legacy_candidate_portal_endpoints_are_removed(
    client: AsyncClient,
) -> None:
    me_response = await client.get("/api/v1/public/candidate-portal/me")
    applications_response = await client.get("/api/v1/public/candidate-portal/applications")

    assert me_response.status_code == status.HTTP_404_NOT_FOUND
    assert applications_response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_candidate_portal_only_returns_authenticated_candidate_data(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate_one = await _create_candidate(
        db_session,
        full_name="Ana Portal",
        email="ana.portal@example.com",
        cpf="52998224725",
    )
    await _create_candidate(
        db_session,
        full_name="Bruno Portal",
        email="bruno.portal@example.com",
        cpf="39053344705",
    )
    await _create_portal_session(db_session, candidate_one.id, "portal-token-1")
    client.cookies.set("candidate_portal_token", "portal-token-1")

    response = await client.get("/api/v1/public/candidate-portal/overview")
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["candidate"]["id"] == str(candidate_one.id)
    assert payload["candidate"]["full_name"] == "Ana Portal"
    assert payload["candidate"]["full_name"] != "Bruno Portal"


@pytest.mark.asyncio
async def test_public_application_with_job_creates_waiting_analysis_and_pipeline_link(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job,
    valid_pdf_bytes: bytes,
) -> None:
    await _create_ai_config(db_session)

    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Talita Publica",
            "cpf": "63537905467",
            "email": "talita.publica@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "8000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )

    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()
    assert payload["analysis_auto_requested"] is True
    assert payload["analysis_status"] == "waiting_extraction"
    assert payload["analysis_id"] is not None
    assert payload["pipeline_id"] is not None

    pipeline_row = await db_session.execute(
        sa.select(
            CandidateJobPipelineModel.current_analysis_id,
            CandidateJobPipelineModel.resume_version_id,
        ).where(
            CandidateJobPipelineModel.candidate_id == UUID(payload["candidate_id"]),
            CandidateJobPipelineModel.job_id == published_job.id,
        )
    )
    pipeline = pipeline_row.mappings().first()
    assert pipeline is not None
    assert pipeline["current_analysis_id"] == UUID(payload["analysis_id"])
    assert pipeline["resume_version_id"] == UUID(payload["resume_version_id"])

    analysis_row = await db_session.execute(
        sa.select(AnalysisModel.status, AnalysisModel.job_id).where(
            AnalysisModel.id == UUID(payload["analysis_id"])
        )
    )
    analysis = analysis_row.mappings().first()
    assert analysis is not None
    assert analysis["status"] == "waiting_extraction"
    assert analysis["job_id"] == published_job.id


@pytest.mark.asyncio
async def test_public_application_creates_analysis_when_system_user_is_missing(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    admin = await _create_active_user(
        db_session,
        f"analysis-config-{uuid4().hex[:8]}@test.com",
        "password123",
        UserRole.ADMIN,
    )
    ai_model = AIModelModel(
        id=uuid4(),
        provider="google",
        model_id=f"gemini-missing-system-{uuid4().hex[:8]}",
        model_name="Gemini Missing System User Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        id=uuid4(),
        name=f"Full Analysis Missing System User {uuid4().hex[:8]}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="Analise o curriculo {{ resume_text }} para a vaga {{ job_text }}",
        max_tokens=2048,
        temperature=Decimal("0.1"),
        is_active=True,
        activated_at=datetime.now(UTC),
        created_by=admin.id,
    )
    db_session.add_all([ai_model, prompt])
    published_job = JobModel(
        id=uuid4(),
        title="Vaga Sem Usuario Sistema",
        description="Teste de submissao publica sem usuario tecnico preexistente",
        status="published",
        created_by=admin.id,
        location="São Paulo, SP",
        job_area="Technology",
    )
    db_session.add(published_job)
    await db_session.commit()
    await db_session.execute(sa.delete(UserModel).where(UserModel.id == SYSTEM_USER_ID))
    await db_session.commit()

    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Paulo Sem Usuario Sistema",
            "cpf": "75948752005",
            "email": "paulo.sem.usuario@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "8000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )

    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()
    assert payload["analysis_id"] is not None
    assert payload["analysis_status"] == "waiting_extraction"

    pipeline_current_analysis_id = await db_session.scalar(
        sa.select(CandidateJobPipelineModel.current_analysis_id).where(
            CandidateJobPipelineModel.candidate_id == UUID(payload["candidate_id"]),
            CandidateJobPipelineModel.job_id == published_job.id,
        )
    )
    assert pipeline_current_analysis_id == UUID(payload["analysis_id"])


@pytest.mark.asyncio
async def test_public_application_does_not_duplicate_analysis_on_duplicate_submit(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job,
    valid_pdf_bytes: bytes,
) -> None:
    await _create_ai_config(db_session)

    request_data = {
        "full_name": "Daniel Duplicado",
        "cpf": "01234567890",
        "email": "daniel.duplicado@example.com",
        "phone": "11987654321",
        "city": "São Paulo",
        "state": "SP",
        "salary_expectation": "9000",
        "desired_contract_type": "CLT",
        "works_at_marajo_group": False,
        "job_id": str(published_job.id),
        "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
    }

    first = await client.post(
        "/api/v1/public/candidates/apply",
        data=request_data,
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    second = await client.post(
        "/api/v1/public/candidates/apply",
        data=request_data,
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )

    assert first.status_code == status.HTTP_201_CREATED
    assert second.status_code == status.HTTP_409_CONFLICT

    total_analyses = int(
        (
            await db_session.scalar(
                sa.select(sa.func.count(AnalysisModel.id)).select_from(AnalysisModel)
            )
        )
        or 0
    )
    assert total_analyses == 1


@pytest.mark.asyncio
async def test_public_talent_pool_does_not_create_job_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    await _create_ai_config(db_session)

    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Bianca Talentos",
            "cpf": "11144477735",
            "email": "bianca.talentos@example.com",
            "phone": "11987654321",
            "city": "Recife",
            "state": "PE",
            "salary_expectation": "7000",
            "desired_contract_type": "PJ",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )

    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()
    assert payload["job_id"] is None
    assert payload["pipeline_id"] is None
    assert payload["analysis_auto_requested"] is False
    assert payload["analysis_id"] is None
    assert payload["talent_pool"] is True
    assert payload["talent_pool_profile_status"] == "pending"

    total_analyses = int(
        (
            await db_session.scalar(
                sa.select(sa.func.count(AnalysisModel.id)).select_from(AnalysisModel)
            )
        )
        or 0
    )
    assert total_analyses == 0


@pytest.mark.asyncio
async def test_resume_extraction_enqueues_pending_analysis_only_once(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job,
    valid_pdf_bytes: bytes,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    await _create_ai_config(db_session)
    monkeypatch.setattr(
        "src.interface.api.routers.public.enqueue_resume_extraction",
        lambda resume_version_id: None,
    )

    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Renata Fila",
            "cpf": "70548445052",
            "email": "renata.fila@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "8500",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()

    await db_session.execute(
        sa.update(ResumeVersionModel)
        .where(ResumeVersionModel.id == UUID(payload["resume_version_id"]))
        .values(
            extraction_status="pending",
            extraction_error=None,
            extracted_text=None,
            page_count=None,
            word_count=None,
        )
    )
    await db_session.execute(
        sa.update(AnalysisModel)
        .where(AnalysisModel.id == UUID(payload["analysis_id"]))
        .values(
            status="waiting_extraction",
            task_id=None,
        )
    )
    await db_session.commit()

    enqueued: list[str] = []

    def _fake_enqueue(analysis_id: UUID, *, delay_seconds: int | None = None) -> None:
        enqueued.append(str(analysis_id))

    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.enqueue_analysis",
        _fake_enqueue,
    )

    resume_path = tmp_path / "resume.pdf"
    resume_path.write_bytes(valid_pdf_bytes)

    async def _fake_claim_resume_version_for_processing(**kwargs) -> bool:
        return True

    async def _fake_load_resume_context(**kwargs):
        return (
            SimpleNamespace(
                id=UUID(payload["resume_version_id"]),
                resume_id=UUID(payload["resume_id"]),
                s3_key="resumes/test.pdf",
                extracted_text=None,
                extraction_status="processing",
                extraction_error=None,
                page_count=None,
                word_count=None,
            ),
            SimpleNamespace(
                id=UUID(payload["resume_id"]),
                candidate_id=UUID(payload["candidate_id"]),
                updated_at=None,
            ),
            SimpleNamespace(
                id=UUID(payload["candidate_id"]),
                updated_at=None,
            ),
        )

    class _FakeResumeRepository:
        def __init__(self, session) -> None:
            self.session = session

        async def save_candidate(self, candidate) -> None:
            return None

        async def save_version(self, version) -> None:
            return None

        async def save_resume(self, resume) -> None:
            return None

    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks._claim_resume_version_for_processing",
        _fake_claim_resume_version_for_processing,
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks._load_resume_context",
        _fake_load_resume_context,
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.resolve_resume_storage_path",
        lambda _s3_key: resume_path,
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.extract_pdf_text",
        lambda _content: SimpleNamespace(
            text="Curriculo de teste",
            page_count=1,
            word_count=3,
            used_ocr=False,
        ),
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.extract_candidate_prefill",
        lambda _text: {},
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.ResumeService._apply_candidate_prefill",
        staticmethod(lambda _candidate, _prefill: []),
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.SQLAlchemyResumeRepository",
        _FakeResumeRepository,
    )

    class _FakeCeleryEngine:
        async def dispose(self) -> None:
            return None

    async def _fake_create_celery_async_sessionmaker():
        assert db_session.bind is not None
        return _FakeCeleryEngine(), async_sessionmaker(
            db_session.bind,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )

    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _fake_create_celery_async_sessionmaker,
    )

    result = await _process_resume_extraction_async(resume_version_id=payload["resume_version_id"])
    assert result["status"] == "completed"
    assert enqueued == [payload["analysis_id"]]

    analysis_row = await db_session.execute(
        sa.select(AnalysisModel.status, AnalysisModel.task_id).where(
            AnalysisModel.id == UUID(payload["analysis_id"])
        )
    )
    analysis = analysis_row.mappings().first()
    assert analysis is not None
    assert analysis["status"] == "pending"
    assert analysis["task_id"] == f"analysis:{payload['analysis_id']}"


@pytest.mark.asyncio
async def test_resume_extraction_failure_marks_waiting_analysis_failed(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job,
    valid_pdf_bytes: bytes,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    from src.infrastructure.pdf.text_extractor import PdfTextExtractionError

    await _create_ai_config(db_session)
    monkeypatch.setattr(
        "src.interface.api.routers.public.enqueue_resume_extraction",
        lambda resume_version_id: None,
    )

    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Falha Extracao",
            "cpf": "18120474008",
            "email": "falha.extracao@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "8500",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()
    assert payload["analysis_status"] == "waiting_extraction"

    resume_path = tmp_path / "resume.pdf"
    resume_path.write_bytes(valid_pdf_bytes)

    async def _fake_claim_resume_version_for_processing(**kwargs) -> bool:
        return True

    async def _fake_load_resume_context(**kwargs):
        return (
            SimpleNamespace(
                id=UUID(payload["resume_version_id"]),
                resume_id=UUID(payload["resume_id"]),
                s3_key="resumes/test.pdf",
                extracted_text=None,
                extraction_status="processing",
                extraction_error=None,
                page_count=None,
                word_count=None,
            ),
            SimpleNamespace(id=UUID(payload["resume_id"]), candidate_id=UUID(payload["candidate_id"])),
            SimpleNamespace(id=UUID(payload["candidate_id"])),
        )

    class _FakeCeleryEngine:
        async def dispose(self) -> None:
            return None

    async def _fake_create_celery_async_sessionmaker():
        assert db_session.bind is not None
        return _FakeCeleryEngine(), async_sessionmaker(
            db_session.bind,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )

    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks._claim_resume_version_for_processing",
        _fake_claim_resume_version_for_processing,
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks._load_resume_context",
        _fake_load_resume_context,
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.resolve_resume_storage_path",
        lambda _s3_key: resume_path,
    )
    monkeypatch.setattr(
        "src.interface.workers.resume_extraction_tasks.extract_pdf_text",
        lambda _content: (_ for _ in ()).throw(PdfTextExtractionError("PDF inválido")),
    )
    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _fake_create_celery_async_sessionmaker,
    )

    result = await _process_resume_extraction_async(resume_version_id=payload["resume_version_id"])
    assert result["status"] == "failed"

    rows = await db_session.execute(
        sa.select(
            ResumeVersionModel.extraction_status,
            AnalysisModel.status,
            AnalysisModel.failure_reason,
            AnalysisModel.provider_error_type,
        )
        .join(AnalysisModel, AnalysisModel.resume_version_id == ResumeVersionModel.id)
        .where(AnalysisModel.id == UUID(payload["analysis_id"]))
    )
    row = rows.mappings().first()
    assert row is not None
    assert row["extraction_status"] == "failed"
    assert row["status"] == "failed"
    assert row["failure_reason"] == "resume_extraction_failed"
    assert row["provider_error_type"] == "resume_extraction_failed"


@pytest.mark.asyncio
async def test_portal_overview_uses_active_pipeline_instead_of_latest_updated_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job: JobModel,
    valid_pdf_bytes: bytes,
) -> None:
    await _create_ai_config(db_session)
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Claudia Ativa",
            "cpf": "52998224725",
            "email": "claudia.ativa@example.com",
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
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()
    candidate_id = UUID(payload["candidate_id"])

    closed_job = await _create_published_job(db_session, title="Vaga Encerrada")
    now = datetime.now(UTC)
    db_session.add(
        CandidateJobPipelineModel(
            candidate_job_pipeline_id=uuid4(),
            candidate_id=candidate_id,
            job_id=closed_job.id,
            pipeline_stage="rejected",
            link_status="rejected",
            relationship_status="rejected",
            pipeline_status="terminal",
            is_terminal=True,
            terminated_at=now,
            termination_reason="candidate_rejected",
            entered_at=now,
            updated_at=now,
        )
    )
    await db_session.commit()

    await _create_portal_session(db_session, candidate_id, "portal-token-active-pipeline")
    client.cookies.set("candidate_portal_token", "portal-token-active-pipeline")

    overview_response = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_response.status_code == status.HTTP_200_OK
    overview_payload = overview_response.json()

    assert overview_payload["active_application"] is not None
    assert overview_payload["active_application"]["job_id"] == str(published_job.id)
    assert overview_payload["active_application"]["status_public"] == "Aguardando extração"
    assert any(
        item["job_id"] == str(closed_job.id)
        for item in overview_payload["application_history"]
    )


@pytest.mark.asyncio
async def test_portal_overview_uses_current_analysis_id_instead_of_latest_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job: JobModel,
    valid_pdf_bytes: bytes,
) -> None:
    await _create_ai_config(db_session)
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Patricia Analise",
            "cpf": "39053344705",
            "email": "patricia.analise@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "9000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()
    candidate_id = UUID(payload["candidate_id"])
    current_analysis_id = UUID(payload["analysis_id"])
    resume_version_id = UUID(payload["resume_version_id"])

    config = await db_session.execute(
        sa.select(AnalysisModel.ai_model_id, AnalysisModel.prompt_template_id).where(
            AnalysisModel.id == current_analysis_id
        )
    )
    config_row = config.mappings().first()
    assert config_row is not None

    latest_completed = AnalysisModel(
        id=uuid4(),
        resume_version_id=resume_version_id,
        job_id=published_job.id,
        ai_model_id=config_row["ai_model_id"],
        prompt_template_id=config_row["prompt_template_id"],
        status="completed",
        requested_by=SYSTEM_USER_ID,
        idempotency_key=f"manual-{uuid4()}",
        created_at=datetime.now(UTC) + timedelta(minutes=1),
        updated_at=datetime.now(UTC) + timedelta(minutes=1),
        completed_at=datetime.now(UTC) + timedelta(minutes=1),
    )
    db_session.add(latest_completed)
    await db_session.commit()

    await _create_portal_session(db_session, candidate_id, "portal-token-current-analysis")
    client.cookies.set("candidate_portal_token", "portal-token-current-analysis")

    overview_response = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_response.status_code == status.HTTP_200_OK
    overview_payload = overview_response.json()

    assert overview_payload["active_application"] is not None
    assert overview_payload["active_application"]["current_analysis_id"] == str(current_analysis_id)
    assert overview_payload["active_application"]["analysis_status"] == "waiting_extraction"
    assert overview_payload["active_application"]["status_public"] == "Aguardando extração"


@pytest.mark.asyncio
async def test_portal_overview_shows_transferred_active_job_only(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job: JobModel,
    valid_pdf_bytes: bytes,
) -> None:
    await _create_ai_config(db_session)
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Roger Transferido",
            "cpf": "11144477735",
            "email": "roger.transferido@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "9500",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()
    candidate_id = UUID(payload["candidate_id"])

    destination_job = await _create_published_job(db_session, title="Nova Vaga")
    now = datetime.now(UTC)
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == published_job.id,
        )
        .values(
            link_status="transferred",
            relationship_status="archived",
            pipeline_status="terminal",
            is_terminal=True,
            terminated_at=now,
            termination_reason="candidate_transferred",
            updated_at=now,
        )
    )
    db_session.add(
        CandidateJobPipelineModel(
            candidate_job_pipeline_id=uuid4(),
            candidate_id=candidate_id,
            job_id=destination_job.id,
            pipeline_stage="entry",
            link_status="active",
            relationship_status="active",
            pipeline_status="active",
            is_terminal=False,
            terminated_at=None,
            termination_reason=None,
            entered_at=now,
            updated_at=now,
        )
    )
    await db_session.commit()

    await _create_portal_session(db_session, candidate_id, "portal-token-transfer")
    client.cookies.set("candidate_portal_token", "portal-token-transfer")

    overview_response = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_response.status_code == status.HTTP_200_OK
    overview_payload = overview_response.json()

    assert overview_payload["active_application"] is not None
    assert overview_payload["active_application"]["job_id"] == str(destination_job.id)
    assert overview_payload["active_application"]["job_title"] == "Nova Vaga"
    assert any(
        item["job_id"] == str(published_job.id)
        for item in overview_payload["application_history"]
    )


@pytest.mark.asyncio
async def test_transfer_endpoint_updates_overview_analysis_for_new_active_job(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job: JobModel,
    valid_pdf_bytes: bytes,
) -> None:
    await _create_ai_config(db_session)
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Marina Transferida",
            "cpf": "11144477735",
            "email": "marina.transferida@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "8800",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED
    candidate_id = response.json()["candidate_id"]

    destination_job = await _create_published_job(db_session, title="Vaga Destino Oficial")

    await _create_active_user(db_session, "transfer-admin@example.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "transfer-admin@example.com", "password123")

    transfer_response = await client.patch(
        f"/api/v1/pipeline/{candidate_id}/transfer-job",
        headers=headers,
        json={
            "from_job_id": str(published_job.id),
            "to_job_id": str(destination_job.id),
            "reason": "Nova vaga mais aderente",
        },
    )
    assert transfer_response.status_code == status.HTTP_200_OK

    await _create_portal_session(db_session, UUID(candidate_id), "portal-token-transfer-api")
    client.cookies.set("candidate_portal_token", "portal-token-transfer-api")

    overview_response = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_response.status_code == status.HTTP_200_OK
    overview_payload = overview_response.json()

    assert overview_payload["active_application"] is not None
    assert overview_payload["active_application"]["job_id"] == str(destination_job.id)
    assert overview_payload["active_application"]["job_title"] == "Vaga Destino Oficial"
    assert overview_payload["active_application"]["current_analysis_id"] is not None

    history_jobs = {item["job_id"] for item in overview_payload["application_history"]}
    assert str(published_job.id) in history_jobs


@pytest.mark.asyncio
async def test_portal_overview_returns_talent_pool_when_candidate_has_no_active_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job: JobModel,
    valid_pdf_bytes: bytes,
) -> None:
    await _create_ai_config(db_session)
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Lucia Sem Vaga",
            "cpf": "70548445052",
            "email": "lucia.semvaga@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "8200",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()
    candidate_id = UUID(payload["candidate_id"])

    await db_session.execute(
        sa.delete(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == published_job.id,
        )
    )
    await db_session.commit()

    await _create_portal_session(db_session, candidate_id, "portal-token-talent-pool")
    client.cookies.set("candidate_portal_token", "portal-token-talent-pool")

    overview_response = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_response.status_code == status.HTTP_200_OK
    overview_payload = overview_response.json()

    assert overview_payload["active_application"] is None
    assert overview_payload["talent_pool"] is True
    assert overview_payload["application_status"] == "talent_pool"
    assert overview_payload["is_process_closed"] is False
    assert overview_payload["status_public"] == "Você está em nosso banco de talentos"
    assert overview_payload["closed_reason_public_label"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("stage", "expected_status"),
    [
        ("hired", "Contratado"),
        ("pre_admission", "Pré-admissão"),
        ("protheus", "Protheus"),
    ],
)
async def test_portal_overview_keeps_post_hiring_stages_active(
    client: AsyncClient,
    db_session: AsyncSession,
    stage: str,
    expected_status: str,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name=f"Candidato {stage}",
        email=f"portal-{stage}-{uuid4().hex[:6]}@example.com",
        cpf=f"{uuid4().int % 10**11:011d}",
    )
    job = await _create_published_job(db_session, title=f"Vaga {expected_status}")
    now = datetime.now(UTC)
    db_session.add(
        CandidateJobPipelineModel(
            candidate_job_pipeline_id=uuid4(),
            candidate_id=candidate.id,
            job_id=job.id,
            pipeline_stage=stage,
            link_status="active",
            relationship_status="active",
            pipeline_status="active",
            is_terminal=False,
            terminated_at=None,
            termination_reason=None,
            entered_at=now - timedelta(days=2),
            updated_at=now,
        )
    )
    await db_session.commit()

    await _create_portal_session(db_session, candidate.id, f"portal-token-{stage}")
    client.cookies.set("candidate_portal_token", f"portal-token-{stage}")

    overview_response = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_response.status_code == status.HTTP_200_OK
    payload = overview_response.json()

    assert payload["active_application"] is not None
    assert payload["active_application"]["job_id"] == str(job.id)
    assert payload["active_application"]["pipeline_stage"] == stage
    assert payload["active_application"]["status_public"] == expected_status
    assert payload["application_status"] == "active"
    assert payload["status_public"] == expected_status
    assert payload["current_process_status_label"] == expected_status
    assert payload["is_process_closed"] is False
    assert payload["closed_reason_public_label"] is None
    assert payload["talent_pool"] is False
    assert payload["public_timeline"]["current_step_key"] == "result"
    assert payload["public_timeline"]["steps"][-1]["label"] == "Aprovado"


@pytest.mark.asyncio
async def test_portal_overview_shows_admitted_as_closed_success_not_talent_pool(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Candidato Admitido",
        email=f"portal-admitted-{uuid4().hex[:6]}@example.com",
        cpf=f"{uuid4().int % 10**11:011d}",
    )
    job = await _create_published_job(db_session, title="Vaga Admitido")
    now = datetime.now(UTC)
    db_session.add(
        CandidateJobPipelineModel(
            candidate_job_pipeline_id=uuid4(),
            candidate_id=candidate.id,
            job_id=job.id,
            pipeline_stage="admitted",
            link_status="hired",
            relationship_status="hired",
            pipeline_status="terminal",
            is_terminal=True,
            terminated_at=now,
            termination_reason=None,
            entered_at=now - timedelta(days=2),
            updated_at=now,
        )
    )
    await db_session.commit()

    await _create_portal_session(db_session, candidate.id, "portal-token-admitted")
    client.cookies.set("candidate_portal_token", "portal-token-admitted")

    overview_response = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_response.status_code == status.HTTP_200_OK
    payload = overview_response.json()

    assert payload["active_application"] is None
    assert payload["application_status"] == "admitted"
    assert payload["status_public"] == "Admitido"
    assert payload["current_process_status_label"] == "Admitido"
    assert payload["is_process_closed"] is True
    assert payload["closed_reason_public_label"] == "Admissão concluída."
    assert payload["talent_pool"] is False
    assert payload["application_history"][0]["job_id"] == str(job.id)
    assert payload["application_history"][0]["status"] == "admitted"
    assert payload["public_timeline"]["current_step_key"] == "result"
    assert payload["public_timeline"]["steps"][-1]["label"] == "Admitido"


@pytest.mark.asyncio
async def test_portal_overview_returns_rejected_status_without_internal_reason(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Renata Encerrada",
        email="renata.encerrada@example.com",
        cpf="71237464004",
    )
    job = await _create_published_job(db_session, title="Analista Encerrado")
    now = datetime.now(UTC)
    db_session.add(
        CandidateJobPipelineModel(
            candidate_job_pipeline_id=uuid4(),
            candidate_id=candidate.id,
            job_id=job.id,
            pipeline_stage="rejected",
            link_status="rejected",
            relationship_status="rejected",
            pipeline_status="terminal",
            is_terminal=True,
            terminated_at=now,
            termination_reason="motivo interno sensível",
            entered_at=now - timedelta(days=4),
            updated_at=now,
        )
    )
    await db_session.commit()

    await _create_portal_session(db_session, candidate.id, "portal-token-rejected")
    client.cookies.set("candidate_portal_token", "portal-token-rejected")

    overview_response = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_response.status_code == status.HTTP_200_OK
    payload = overview_response.json()

    assert payload["active_application"] is None
    assert payload["application_status"] == "rejected"
    assert payload["status_public"] == "Processo encerrado"
    assert payload["current_process_status_label"] == "Processo encerrado"
    assert payload["is_process_closed"] is True
    assert payload["closed_reason_public_label"] == "Você não foi selecionado para esta vaga no momento."
    assert payload["talent_pool"] is True
    assert payload["can_request_contact"] is True
    assert payload["can_apply_to_other_jobs"] is True
    assert payload["application_history"][0]["job_id"] == str(job.id)
    assert payload["public_timeline"]["current_step_key"] == "result"
    assert payload["public_timeline"]["steps"][-1]["label"] == "Processo encerrado"
    assert "motivo interno sensível" not in str(payload)


@pytest.mark.asyncio
async def test_portal_overview_returns_closed_status_for_withdrawn_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Paula Desistiu",
        email="paula.desistiu@example.com",
        cpf="76814494000",
    )
    job = await _create_published_job(db_session, title="Analista Withdrawn")
    now = datetime.now(UTC)
    db_session.add(
        CandidateJobPipelineModel(
            candidate_job_pipeline_id=uuid4(),
            candidate_id=candidate.id,
            job_id=job.id,
            pipeline_stage="screening",
            link_status="removed",
            relationship_status="withdrawn",
            pipeline_status="terminal",
            is_terminal=True,
            terminated_at=now,
            termination_reason="candidate_removed",
            entered_at=now - timedelta(days=3),
            updated_at=now,
        )
    )
    await db_session.commit()

    await _create_portal_session(db_session, candidate.id, "portal-token-withdrawn")
    client.cookies.set("candidate_portal_token", "portal-token-withdrawn")

    overview_response = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_response.status_code == status.HTTP_200_OK
    payload = overview_response.json()

    assert payload["active_application"] is None
    assert payload["application_status"] == "rejected"
    assert payload["status_public"] == "Processo encerrado"
    assert payload["current_process_status_label"] == "Processo encerrado"
    assert payload["is_process_closed"] is True
    assert payload["closed_reason_public_label"] == "Você não foi selecionado para esta vaga no momento."
    assert payload["public_timeline"]["current_step_key"] == "result"


@pytest.mark.asyncio
async def test_candidate_contact_request_creates_hr_communication(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Clara Contato",
        email="clara.contato@example.com",
        cpf="34665378006",
    )
    job = await _create_published_job(db_session, title="Vaga com Contato")
    now = datetime.now(UTC)
    db_session.add(
        CandidateJobPipelineModel(
            candidate_job_pipeline_id=uuid4(),
            candidate_id=candidate.id,
            job_id=job.id,
            pipeline_stage="rejected",
            link_status="rejected",
            relationship_status="rejected",
            pipeline_status="terminal",
            is_terminal=True,
            terminated_at=now,
            termination_reason="motivo interno",
            entered_at=now - timedelta(days=2),
            updated_at=now,
        )
    )
    await db_session.commit()

    await _create_portal_session(db_session, candidate.id, "portal-token-contact")
    client.cookies.set("candidate_portal_token", "portal-token-contact")

    response = await client.post(
        "/api/v1/candidate-portal/communications/contact-request",
        json={
            "job_id": str(job.id),
            "subject": "Solicitação de contato sobre processo encerrado",
            "body": "Olá, gostaria de solicitar contato sobre o processo seletivo da vaga Vaga com Contato.",
        },
    )

    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()
    assert payload["audience"] == "hr"
    assert payload["channel"] == "internal"
    assert payload["status"] == "sent"
    assert payload["candidate_id"] == str(candidate.id)
    assert payload["job_id"] == str(job.id)

    saved = await db_session.scalar(
        sa.select(CandidateCommunicationModel).where(CandidateCommunicationModel.id == UUID(payload["id"]))
    )
    assert saved is not None
    assert saved.template_key == "candidate_contact_request"
