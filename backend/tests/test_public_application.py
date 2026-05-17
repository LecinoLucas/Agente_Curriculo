"""Tests for public candidate application endpoint."""

import io
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import AIModelModel, AnalysisModel, PromptTemplateModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineEventModel,
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.security.password_service import hash_password

SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-000000000001")


async def _get_candidate_application_source(
    db_session: AsyncSession,
    email: str,
) -> str | None:
    return await db_session.scalar(
        sa.text("SELECT application_source FROM candidates WHERE email = :email"),
        {"email": email.strip().lower()},
    )


async def _get_candidate_password_hash(
    db_session: AsyncSession,
    email: str,
) -> str | None:
    return await db_session.scalar(
        sa.text("SELECT password_hash FROM candidates WHERE email = :email"),
        {"email": email.strip().lower()},
    )


async def _get_candidate_salary_expectation(
    db_session: AsyncSession,
    email: str,
) -> str | None:
    return await db_session.scalar(
        sa.text("SELECT salary_expectation FROM candidates WHERE email = :email"),
        {"email": email.strip().lower()},
    )


async def _list_pipeline_rows(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID | None = None,
    active_only: bool = False,
) -> list[dict]:
    def _normalize_uuid_text(value: str | None) -> str | None:
        if value is None:
            return None
        raw = value.strip()
        if len(raw) == 32:
            return str(UUID(raw))
        return raw

    table = CandidateJobPipelineModel.__table__
    query = sa.select(
        sa.cast(table.c.candidate_id, sa.String).label("candidate_id"),
        sa.cast(table.c.job_id, sa.String).label("job_id"),
        table.c.pipeline_stage.label("pipeline_stage"),
        table.c.link_status.label("link_status"),
        table.c.relationship_status.label("relationship_status"),
        table.c.pipeline_status.label("pipeline_status"),
        table.c.is_terminal.label("is_terminal"),
        table.c.terminated_at.label("terminated_at"),
        sa.cast(table.c.current_analysis_id, sa.String).label("current_analysis_id"),
    ).where(table.c.candidate_id == candidate_id)
    if job_id is not None:
        query = query.where(table.c.job_id == job_id)
    if active_only:
        query = query.where(
            table.c.relationship_status == "active",
            table.c.is_terminal.is_(False),
            table.c.terminated_at.is_(None),
        )
    result = await db_session.execute(query)
    rows: list[dict] = []
    for row in result.mappings().all():
        item = dict(row)
        item["candidate_id"] = _normalize_uuid_text(item["candidate_id"])
        item["job_id"] = _normalize_uuid_text(item["job_id"])
        item["current_analysis_id"] = _normalize_uuid_text(item["current_analysis_id"])
        rows.append(item)
    return rows


async def _get_analysis_job_id(db_session: AsyncSession, analysis_id: UUID) -> str | None:
    value = await db_session.scalar(
        sa.text("SELECT job_id FROM analyses WHERE replace(id, '-', '') = :analysis_id"),
        {"analysis_id": analysis_id.hex},
    )
    if value is None:
        return None
    raw = str(value).strip()
    if len(raw) == 32:
        return str(UUID(raw))
    return raw


async def _create_ai_config(db_session: AsyncSession) -> None:
    db_session.add_all(
        [
            AIModelModel(
                id=uuid4(),
                provider="google",
                model_id=f"gemini-{uuid4().hex[:8]}",
                model_name="Gemini Test",
                is_active=True,
            ),
            PromptTemplateModel(
                id=uuid4(),
                name=f"prompt-{uuid4().hex[:8]}",
                version=1,
                template_type="full_analysis",
                user_prompt_template="Analise o curriculo {{ resume_text }} para a vaga {{ job_text }}",
                temperature=Decimal("0.1"),
                max_tokens=2048,
                is_active=True,
                activated_at=datetime.now(UTC),
                created_by=SYSTEM_USER_ID,
            ),
        ]
    )
    await db_session.commit()


@pytest.fixture
def valid_pdf_bytes() -> bytes:
    """Minimal valid PDF for testing."""
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


@pytest.mark.asyncio
async def test_list_public_jobs_returns_only_published(
    db_session: AsyncSession, client: AsyncClient, published_job: JobModel
) -> None:
    """GET /api/v1/public/jobs retorna apenas vagas published."""
    response = await client.get("/api/v1/public/jobs")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert any(job["id"] == str(published_job.id) for job in data)
    assert all(job["id"] != str(published_job.id) for job in data if published_job.status != "published")


@pytest.mark.asyncio
async def test_apply_creates_candidate_and_resume(
    db_session: AsyncSession,
    client: AsyncClient,
    published_job: JobModel,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply cria candidato com currículo."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "12345678909",
            "email": "joao@example.com",
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
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["candidate_id"]
    assert data["job_id"] == str(published_job.id)
    assert data["status"] == "entered_pipeline"

    # Verificar candidato foi criado (validar via response fields)
    assert data["candidate_id"] is not None
    assert isinstance(data["candidate_id"], str)
    application_source = await _get_candidate_application_source(db_session, "joao@example.com")
    assert application_source == "public_application"
    password_hash = await _get_candidate_password_hash(db_session, "joao@example.com")
    assert password_hash is not None
    assert password_hash != "SenhaSegura123"
    assert await _get_candidate_salary_expectation(db_session, "joao@example.com") == "5000.00"


@pytest.mark.asyncio
async def test_apply_rejects_missing_salary_expectation(
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Sem Salario",
            "cpf": "12345678909",
            "email": "sem-salario@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert response.json()["detail"] == "Informe sua pretensão salarial."


@pytest.mark.asyncio
async def test_apply_rejects_invalid_salary_expectation(
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Salario Invalido",
            "cpf": "12345678909",
            "email": "salario-invalido@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "R$ 0,00",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert response.json()["detail"] == "Informe uma pretensão salarial válida."


@pytest.mark.asyncio
async def test_apply_normalizes_brazilian_salary_expectation(
    db_session: AsyncSession,
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Salario Normalizado",
            "cpf": "12345678909",
            "email": "salario-normalizado@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "R$ 2.500,00",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert await _get_candidate_salary_expectation(db_session, "salario-normalizado@example.com") == "2500.00"


@pytest.mark.asyncio
async def test_apply_talent_pool_no_pipeline(
    db_session: AsyncSession,
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply sem job_id não cria pipeline."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Maria Silva",
            "cpf": "98765432100",
            "email": "maria@example.com",
            "phone": "11987654321",
            "city": "Rio de Janeiro",
            "state": "RJ",
            "salary_expectation": "4000-6000",
            "desired_contract_type": "PJ",
            "works_at_marajo_group": True,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["job_id"] is None
    assert data["status"] == "awaiting_job"
    application_source = await _get_candidate_application_source(db_session, "maria@example.com")
    assert application_source == "public_application"


@pytest.mark.asyncio
async def test_apply_accepts_arbitrary_cpf(
    db_session: AsyncSession,
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply aceita CPF livre no fluxo público."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "CPF livre 123/abc",
            "email": "joao@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED
    stored_cpf = await db_session.scalar(
        sa.text("SELECT cpf FROM candidates WHERE email = :email"),
        {"email": "joao@example.com"},
    )
    assert stored_cpf == "CPF livre 123/abc"


@pytest.mark.asyncio
async def test_apply_enqueues_resume_extraction_only_after_commit(
    db_session: AsyncSession,
    client: AsyncClient,
    published_job: JobModel,
    valid_pdf_bytes: bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enqueued_version_ids: list[str] = []
    transaction_states: list[bool] = []

    def _fake_enqueue(resume_version_id: UUID) -> None:
        enqueued_version_ids.append(str(resume_version_id))
        transaction_states.append(db_session.in_transaction())

    monkeypatch.setattr(
        "src.interface.api.routers.public.enqueue_resume_extraction",
        _fake_enqueue,
    )

    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Fila Corrigida",
            "cpf": "fila-livre",
            "email": "fila.corrigida@example.com",
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

    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()
    assert enqueued_version_ids == [payload["resume_version_id"]]
    assert transaction_states == [False]


@pytest.mark.asyncio
async def test_apply_rejects_duplicate_cpf(
    db_session: AsyncSession,
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply reaproveita cadastro autenticado pelo mesmo CPF."""
    cpf = "12345678909"

    # Primeira candidatura
    response1 = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": cpf,
            "email": "joao@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response1.status_code == status.HTTP_201_CREATED

    first_candidate_id = response1.json()["candidate_id"]

    # Segunda candidatura com mesmo CPF reaproveita o mesmo cadastro
    response2 = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": cpf,
            "email": "joao2@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response2.status_code == status.HTTP_201_CREATED
    assert response2.json()["candidate_id"] == first_candidate_id

    total = await db_session.scalar(
        sa.text("SELECT COUNT(*) FROM candidates WHERE cpf = :cpf"),
        {"cpf": cpf},
    )
    assert total == 1


@pytest.mark.asyncio
async def test_apply_rejects_duplicate_email(
    db_session: AsyncSession,
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply reaproveita cadastro autenticado pelo mesmo e-mail."""
    email = "joao@example.com"

    # Primeira candidatura
    response1 = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "12345678909",
            "email": email,
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response1.status_code == status.HTTP_201_CREATED

    first_candidate_id = response1.json()["candidate_id"]

    # Segunda candidatura com mesmo email reaproveita o mesmo cadastro
    response2 = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Maria Silva",
            "cpf": "98765432100",
            "email": email,
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response2.status_code == status.HTTP_201_CREATED
    assert response2.json()["candidate_id"] == first_candidate_id

    total = await db_session.scalar(
        sa.text("SELECT COUNT(*) FROM candidates WHERE email = :email"),
        {"email": email},
    )
    assert total == 1


@pytest.mark.asyncio
async def test_apply_rejects_unavailable_job(
    client: AsyncClient,
    draft_job: JobModel,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply rejeita vaga não publicada."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "12345678909",
            "email": "joao@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(draft_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "indispon" in response.json()["detail"].lower() or "não está" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_apply_rejects_invalid_file(
    db_session: AsyncSession,
    client: AsyncClient,
    published_job: JobModel,
) -> None:
    """POST /api/v1/public/candidates/apply rejeita arquivo inválido."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "12345678909",
            "email": "joao@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.txt", io.BytesIO(b"Not a PDF"), "text/plain")},
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "PDF" in response.json()["detail"]


@pytest.mark.asyncio
async def test_apply_ignores_malicious_application_source_override(
    db_session: AsyncSession,
    client: AsyncClient,
    published_job: JobModel,
    valid_pdf_bytes: bytes,
) -> None:
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Ataque",
            "cpf": "52998224725",
            "email": "ataque@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
            "application_source": "manual",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )

    assert response.status_code == status.HTTP_201_CREATED
    application_source = await _get_candidate_application_source(
        db_session,
        "ataque@example.com",
    )
    assert application_source == "public_application"


@pytest.mark.asyncio
async def test_apply_reopens_terminal_pipeline_for_same_job_without_creating_second_active_row(
    db_session: AsyncSession,
    client: AsyncClient,
    published_job: JobModel,
    valid_pdf_bytes: bytes,
) -> None:
    await _create_ai_config(db_session)
    first_response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Claudio Reprovado",
            "cpf": "52998224725",
            "email": "claudio.reprovado@example.com",
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
    assert first_response.status_code == status.HTTP_201_CREATED
    candidate_id = UUID(first_response.json()["candidate_id"])

    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == published_job.id,
        )
        .values(
            pipeline_stage="rejected",
            link_status="rejected",
            relationship_status="rejected",
            pipeline_status="terminal",
            is_terminal=True,
            terminated_at=datetime.now(UTC),
            termination_reason="candidate_rejected",
            updated_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Claudio Reprovado",
            "cpf": "52998224725",
            "email": "claudio.reprovado@example.com",
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
    body = response.json()
    assert body["job_id"] == str(published_job.id)
    assert body["analysis_id"] is not None

    rows = await _list_pipeline_rows(
        db_session,
        candidate_id=candidate_id,
        job_id=published_job.id,
    )
    assert len(rows) == 1
    assert rows[0]["relationship_status"] == "active"
    assert rows[0]["link_status"] == "active"
    assert rows[0]["pipeline_stage"] == "entry"
    assert rows[0]["current_analysis_id"] is not None

    event = await db_session.scalar(
        sa.select(sa.func.count())
        .select_from(CandidateJobPipelineEventModel)
        .where(
            CandidateJobPipelineEventModel.candidate_id == candidate_id,
            CandidateJobPipelineEventModel.job_id == published_job.id,
            CandidateJobPipelineEventModel.event_type == "candidate_reapplied",
        )
    )
    assert event == 1


@pytest.mark.asyncio
async def test_apply_allows_new_job_when_previous_job_is_terminal_and_keeps_old_history(
    db_session: AsyncSession,
    client: AsyncClient,
    published_job: JobModel,
    valid_pdf_bytes: bytes,
) -> None:
    await _create_ai_config(db_session)

    old_job = JobModel(
        id=uuid4(),
        title="Vaga Antiga",
        description="Encerrada para o candidato",
        status="published",
        created_by=uuid4(),
    )
    db_session.add(old_job)
    await db_session.commit()

    first_response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Luciana Reaplica",
            "cpf": "39053344705",
            "email": "luciana.reaplica@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "8000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(old_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert first_response.status_code == status.HTTP_201_CREATED
    candidate_id = UUID(first_response.json()["candidate_id"])

    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == old_job.id,
        )
        .values(
            pipeline_stage="rejected",
            link_status="rejected",
            relationship_status="rejected",
            pipeline_status="terminal",
            is_terminal=True,
            terminated_at=datetime.now(UTC),
            termination_reason="candidate_rejected",
            updated_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Luciana Reaplica",
            "cpf": "39053344705",
            "email": "luciana.reaplica@example.com",
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
    body = response.json()
    assert body["job_id"] == str(published_job.id)
    assert body["analysis_id"] is not None

    old_rows = await _list_pipeline_rows(db_session, candidate_id=candidate_id, job_id=old_job.id)
    new_rows = await _list_pipeline_rows(db_session, candidate_id=candidate_id, job_id=published_job.id)
    assert len(old_rows) == 1
    assert old_rows[0]["relationship_status"] == "rejected"
    assert len(new_rows) == 1
    assert new_rows[0]["relationship_status"] == "active"
    assert new_rows[0]["current_analysis_id"] is not None

    analysis_job_id = await _get_analysis_job_id(
        db_session,
        UUID(new_rows[0]["current_analysis_id"]),
    )
    assert analysis_job_id == str(published_job.id)


@pytest.mark.asyncio
async def test_apply_blocks_existing_candidate_with_active_pipeline(
    db_session: AsyncSession,
    client: AsyncClient,
    published_job: JobModel,
    valid_pdf_bytes: bytes,
) -> None:
    other_job = JobModel(
        id=uuid4(),
        title="Outra Vaga",
        description="Ainda ativa",
        status="published",
        created_by=uuid4(),
    )
    other_job_id = other_job.id
    db_session.add(other_job)
    await db_session.commit()

    first_response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Ana Ativa",
            "cpf": "70548445052",
            "email": "ana.ativa@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "9000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(other_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert first_response.status_code == status.HTTP_201_CREATED
    candidate_id = UUID(first_response.json()["candidate_id"])

    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Ana Ativa",
            "cpf": "70548445052",
            "email": "ana.ativa@example.com",
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

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.json()["detail"] == "Você já possui uma candidatura em andamento. Acompanhe pelo portal."

    active_rows = await _list_pipeline_rows(
        db_session,
        candidate_id=candidate_id,
        active_only=True,
    )
    assert len(active_rows) == 1
    assert active_rows[0]["job_id"] == str(other_job_id)
