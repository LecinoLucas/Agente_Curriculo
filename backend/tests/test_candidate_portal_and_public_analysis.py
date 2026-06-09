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
    PASSWORD_SETUP_PURPOSE,
    PORTAL_SESSION_PURPOSE,
    CandidatePasswordSetupToken,
)
from src.core.settings import settings
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_auth_token_model import (
    CandidateAuthTokenModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.communication_model import CandidateCommunicationModel
from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.pre_admission_model import PreAdmissionCaseModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.email.smtp_email_sender import EmailDeliveryError
from src.infrastructure.security.password_service import hash_password
from src.interface.workers.resume_extraction_tasks import _process_resume_extraction_async
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


async def _create_portal_session(
    db_session: AsyncSession,
    candidate_id: UUID,
    raw_token: str,
) -> None:
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


async def _create_pipeline_for_portal(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
    pipeline_id: UUID,
    stage: str = "hr_interview",
    relationship_status: str = "active",
    link_status: str = "active",
    pipeline_status: str = "active",
    is_terminal: bool = False,
    terminated_at: datetime | None = None,
) -> None:
    now = datetime.now(UTC)
    db_session.add(
        CandidateJobPipelineModel(
            candidate_job_pipeline_id=pipeline_id,
            candidate_id=candidate_id,
            job_id=job_id,
            pipeline_stage=stage,
            link_status=link_status,
            relationship_status=relationship_status,
            pipeline_status=pipeline_status,
            is_terminal=is_terminal,
            terminated_at=terminated_at,
            termination_reason="candidate_rejected" if is_terminal else None,
            entered_at=now,
            updated_at=now,
        )
    )
    await db_session.commit()


async def _create_interview_schedule(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
    pipeline_id: UUID,
    status: str,
    scheduled_start: datetime,
    scheduled_end: datetime,
    title: str = "Entrevista RH",
    public_notes: str | None = "Entraremos na sala 5 minutos antes.",
    meeting_url: str | None = "https://meet.example.com/portal",
    location: str | None = "Sala 3",
    interview_type: str = "hr",
    interview_format: str = "online",
) -> InterviewScheduleModel:
    schedule = InterviewScheduleModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        pipeline_id=pipeline_id,
        title=title,
        description="Descrição pública",
        public_notes=public_notes,
        internal_notes="NÃO EXPOR",
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
        timezone="America/Sao_Paulo",
        interview_type=interview_type,
        interview_format=interview_format,
        status=status,
        location=location,
        meeting_url=meeting_url,
        created_by=SYSTEM_USER_ID,
    )
    db_session.add(schedule)
    await db_session.commit()
    return schedule


@pytest.mark.asyncio
async def test_candidate_portal_me_returns_authenticated_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Perfil Real",
        email="perfil.real@example.com",
        cpf="12345678110",
        phone="11988887777",
    )
    await _create_portal_session(db_session, candidate.id, "portal-token-me")
    client.cookies.set("candidate_portal_token", "portal-token-me")

    response = await client.get("/api/v1/candidate-portal/me")

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["id"] == str(candidate.id)
    assert payload["full_name"] == "Perfil Real"
    assert payload["email"] == "perfil.real@example.com"
    assert payload["phone"] == "11988887777"
    assert "cpf" not in payload
    assert "internal_notes" not in payload


@pytest.mark.asyncio
async def test_candidate_portal_applications_list_only_authenticated_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Dono Candidatura",
        email="dono.candidatura@example.com",
        cpf="12345678111",
    )
    other_candidate = await _create_candidate(
        db_session,
        full_name="Outro Candidato",
        email="outro.candidato@example.com",
        cpf="12345678112",
    )
    own_job = await _create_published_job(db_session, title="Vaga do Dono")
    other_job = await _create_published_job(db_session, title="Vaga de Outro")
    own_pipeline_id = uuid4()
    other_pipeline_id = uuid4()
    await _create_pipeline_for_portal(
        db_session,
        candidate_id=candidate.id,
        job_id=own_job.id,
        pipeline_id=own_pipeline_id,
    )
    await _create_pipeline_for_portal(
        db_session,
        candidate_id=other_candidate.id,
        job_id=other_job.id,
        pipeline_id=other_pipeline_id,
    )
    await _create_portal_session(db_session, candidate.id, "portal-token-own-apps")
    client.cookies.set("candidate_portal_token", "portal-token-own-apps")

    response = await client.get("/api/v1/public/candidate-portal/me/applications")

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert [item["application_id"] for item in payload] == [str(own_pipeline_id)]
    assert payload[0]["job_id"] == str(own_job.id)
    assert payload[0]["job_title"] == "Vaga do Dono"
    assert "Vaga de Outro" not in repr(payload)
    assert str(other_pipeline_id) not in repr(payload)


@pytest.mark.asyncio
async def test_candidate_portal_applications_list_returns_multiple_real_applications(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Multiplas Candidaturas",
        email="multiplas.candidaturas@example.com",
        cpf="12345678113",
    )
    active_job = await _create_published_job(db_session, title="Vaga Ativa Real")
    closed_job = await _create_published_job(db_session, title="Vaga Encerrada Real")
    active_pipeline_id = uuid4()
    closed_pipeline_id = uuid4()
    await _create_pipeline_for_portal(
        db_session,
        candidate_id=candidate.id,
        job_id=active_job.id,
        pipeline_id=active_pipeline_id,
        stage="screening",
    )
    await _create_pipeline_for_portal(
        db_session,
        candidate_id=candidate.id,
        job_id=closed_job.id,
        pipeline_id=closed_pipeline_id,
        stage="rejected",
        relationship_status="rejected",
        link_status="rejected",
        pipeline_status="terminal",
        is_terminal=True,
        terminated_at=datetime.now(UTC),
    )
    await _create_portal_session(db_session, candidate.id, "portal-token-many-apps")
    client.cookies.set("candidate_portal_token", "portal-token-many-apps")

    response = await client.get("/api/v1/public/candidate-portal/me/applications")

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert {item["application_id"] for item in payload} == {
        str(active_pipeline_id),
        str(closed_pipeline_id),
    }
    assert {item["job_title"] for item in payload} == {
        "Vaga Ativa Real",
        "Vaga Encerrada Real",
    }


@pytest.mark.asyncio
async def test_candidate_portal_applications_list_empty_when_candidate_has_no_applications(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Sem Candidaturas",
        email="sem.candidaturas@example.com",
        cpf="12345678114",
    )
    await _create_portal_session(db_session, candidate.id, "portal-token-no-apps")
    client.cookies.set("candidate_portal_token", "portal-token-no-apps")

    response = await client.get("/api/v1/public/candidate-portal/me/applications")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == []


@pytest.mark.asyncio
async def test_candidate_portal_application_detail_does_not_allow_other_candidate_application(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Candidato Logado",
        email="candidato.logado@example.com",
        cpf="12345678115",
    )
    other_candidate = await _create_candidate(
        db_session,
        full_name="Candidato Dono",
        email="candidato.dono@example.com",
        cpf="12345678116",
    )
    job = await _create_published_job(db_session, title="Vaga Restrita")
    other_pipeline_id = uuid4()
    await _create_pipeline_for_portal(
        db_session,
        candidate_id=other_candidate.id,
        job_id=job.id,
        pipeline_id=other_pipeline_id,
    )
    await _create_portal_session(db_session, candidate.id, "portal-token-forbidden-app")
    client.cookies.set("candidate_portal_token", "portal-token-forbidden-app")

    response = await client.get(
        f"/api/v1/public/candidate-portal/me/applications/{other_pipeline_id}"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_candidate_portal_application_detail_omits_internal_rh_data(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Sem Dados Internos",
        email="sem.dados.internos@example.com",
        cpf="12345678117",
    )
    await db_session.execute(
        sa.update(CandidateModel)
        .where(CandidateModel.id == candidate.id)
        .values(internal_notes="NAO_EXPOR_NOTA_INTERNA_RH")
    )
    job = await _create_published_job(db_session, title="Vaga Segura")
    pipeline_id = uuid4()
    await _create_pipeline_for_portal(
        db_session,
        candidate_id=candidate.id,
        job_id=job.id,
        pipeline_id=pipeline_id,
        stage="hr_interview",
    )
    db_session.add_all(
        [
            CandidateCommunicationModel(
                candidate_id=candidate.id,
                job_id=job.id,
                channel="internal",
                audience="recruiter",
                subject="Interno",
                body="NAO_EXPOR_MENSAGEM_INTERNA_RH",
                status="sent",
            ),
            CandidateCommunicationModel(
                candidate_id=candidate.id,
                job_id=job.id,
                channel="email",
                audience="candidate",
                subject="Mensagem ao candidato",
                body="Mensagem pública real ao candidato.",
                status="sent",
                sent_at=datetime.now(UTC),
            ),
        ]
    )
    await db_session.commit()
    await _create_portal_session(db_session, candidate.id, "portal-token-safe-detail")
    client.cookies.set("candidate_portal_token", "portal-token-safe-detail")

    response = await client.get(f"/api/v1/public/candidate-portal/me/applications/{pipeline_id}")

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    payload_dump = repr(payload)
    assert payload["application"]["application_id"] == str(pipeline_id)
    assert payload["job"]["title"] == "Vaga Segura"
    assert payload["messages"][0]["body"] == "Mensagem pública real ao candidato."
    assert "NAO_EXPOR_NOTA_INTERNA_RH" not in payload_dump
    assert "NAO_EXPOR_MENSAGEM_INTERNA_RH" not in payload_dump
    assert "review_notes" not in payload_dump
    assert "score" not in payload_dump.lower()


@pytest.mark.asyncio
async def test_session_endpoint_without_cookie_returns_200_unauthenticated(
    client: AsyncClient,
) -> None:
    """GET /auth/session sem cookie retorna 200 authenticated=false — sem 401."""
    response = await client.get("/api/v1/public/auth/session")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["authenticated"] is False
    assert data["candidate_name"] is None


@pytest.mark.asyncio
async def test_session_endpoint_with_invalid_cookie_returns_200_unauthenticated(
    client: AsyncClient,
) -> None:
    """GET /auth/session com cookie inválido retorna 200 authenticated=false — sem 401."""
    response = await client.get(
        "/api/v1/public/auth/session",
        cookies={"candidate_portal_token": "invalid-token-that-does-not-exist"},
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["authenticated"] is False
    assert data["candidate_name"] is None


@pytest.mark.asyncio
async def test_session_endpoint_with_valid_cookie_returns_authenticated(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
    published_job: "JobModel",
) -> None:
    """GET /auth/session com cookie válido retorna 200 authenticated=true e nome do candidato."""
    # Cria candidato via candidatura pública (que cria sessão via cookie)
    from decimal import Decimal

    from src.infrastructure.database.models.analysis_model import AIModelModel, PromptTemplateModel

    db_session.add_all(
        [
            AIModelModel(
                id=uuid4(),
                provider="google",
                model_id=f"gemini-{uuid4().hex[:8]}",
                model_name="Test",
                is_active=True,
            ),
            PromptTemplateModel(
                id=uuid4(),
                name=f"pt-{uuid4().hex[:8]}",
                version=1,
                template_type="full_analysis",
                user_prompt_template="test",
                temperature=Decimal("0.1"),
                max_tokens=1024,
                is_active=True,
                activated_at=datetime.now(UTC),
                created_by=SYSTEM_USER_ID,
            ),
        ]
    )
    await db_session.commit()

    import io

    apply_resp = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Sessao Teste",
            "cpf": "33311122200",
            "email": "sessao.teste@example.com",
            "phone": "11999999999",
            "city": "SP",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(published_job.id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("cv.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert apply_resp.status_code == status.HTTP_201_CREATED

    # Pega o cookie de sessão da resposta de apply
    session_cookie = apply_resp.cookies.get("candidate_portal_token")
    assert session_cookie is not None

    response = await client.get(
        "/api/v1/public/auth/session",
        cookies={"candidate_portal_token": session_cookie},
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["authenticated"] is True
    assert data["candidate_name"] == "Sessao Teste"


@pytest.mark.asyncio
async def test_overview_without_cookie_still_returns_401(
    client: AsyncClient,
) -> None:
    """GET /candidate-portal/overview sem cookie continua retornando 401 — proteção intacta."""
    response = await client.get("/api/v1/public/candidate-portal/overview")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_password_setup_request_is_generic_for_existing_and_unknown_candidates(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _create_candidate(
        db_session,
        full_name="Candidato Sem Senha",
        email="sem.senha@example.com",
        cpf="12345678001",
    )
    monkeypatch.setattr(
        "src.application.services.candidate_portal_auth_service.secrets.token_urlsafe",
        lambda _: "setup-token-existing",
    )

    existing_response = await client.post(
        "/api/v1/candidate-portal/auth/request-password-setup",
        json={"email": "sem.senha@example.com"},
    )
    unknown_response = await client.post(
        "/api/v1/candidate-portal/auth/request-password-setup",
        json={"email": "nao.existe@example.com"},
    )

    assert existing_response.status_code == status.HTTP_200_OK
    assert unknown_response.status_code == status.HTTP_200_OK
    assert existing_response.json() == unknown_response.json()
    assert existing_response.json() == {
        "message": "Se houver um cadastro com este e-mail, enviaremos as instruções de acesso."
    }

    token_count = await db_session.scalar(
        sa.select(sa.func.count(CandidateAuthTokenModel.id)).where(
            CandidateAuthTokenModel.purpose == PASSWORD_SETUP_PURPOSE,
        )
    )
    assert token_count == 1


@pytest.mark.asyncio
async def test_password_setup_request_creates_password_setup_token_when_candidate_exists(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Token Criado",
        email="token.criado@example.com",
        cpf="12345678041",
    )
    monkeypatch.setattr(
        "src.application.services.candidate_portal_auth_service.secrets.token_urlsafe",
        lambda _: "setup-token-created-000000",
    )

    response = await client.post(
        "/api/v1/public/auth/request-password-setup",
        json={"email": "token.criado@example.com"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "message": "Se houver um cadastro com este e-mail, enviaremos as instruções de acesso."
    }
    token_row = await db_session.scalar(
        sa.select(CandidateAuthTokenModel).where(
            CandidateAuthTokenModel.candidate_id == candidate.id,
            CandidateAuthTokenModel.purpose == PASSWORD_SETUP_PURPOSE,
        )
    )
    assert token_row is not None
    assert token_row.used_at is None
    assert token_row.token_hash == sha256(b"setup-token-created-000000").hexdigest()


@pytest.mark.asyncio
async def test_password_setup_request_for_unknown_candidate_returns_200_without_token(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_if_called(_: int) -> str:
        pytest.fail("unknown candidate must not create a setup token")

    monkeypatch.setattr(
        "src.application.services.candidate_portal_auth_service.secrets.token_urlsafe",
        fail_if_called,
    )

    response = await client.post(
        "/api/v1/public/auth/request-password-setup",
        json={"email": "inexistente@example.com"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "message": "Se houver um cadastro com este e-mail, enviaremos as instruções de acesso."
    }
    token_count = await db_session.scalar(
        sa.select(sa.func.count(CandidateAuthTokenModel.id)).where(
            CandidateAuthTokenModel.purpose == PASSWORD_SETUP_PURPOSE,
        )
    )
    assert token_count == 0


@pytest.mark.asyncio
async def test_password_setup_request_sends_email_only_for_existing_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _create_candidate(
        db_session,
        full_name="Entrega Real",
        email="entrega.real@example.com",
        cpf="12345678004",
    )
    monkeypatch.setattr(
        "src.application.services.candidate_portal_auth_service.secrets.token_urlsafe",
        lambda _: "setup-token-delivery-000000",
    )
    deliveries: list[CandidatePasswordSetupToken] = []

    async def capture_delivery(setup_token: CandidatePasswordSetupToken) -> None:
        deliveries.append(setup_token)

    monkeypatch.setattr(
        "src.interface.api.routers.candidate_portal_auth.send_candidate_password_setup_email",
        capture_delivery,
    )

    existing_response = await client.post(
        "/api/v1/public/auth/request-password-setup",
        json={"email": "entrega.real@example.com"},
    )
    unknown_response = await client.post(
        "/api/v1/public/auth/request-password-setup",
        json={"email": "sem.entrega@example.com"},
    )

    assert existing_response.status_code == status.HTTP_200_OK
    assert unknown_response.status_code == status.HTTP_200_OK
    assert existing_response.json() == unknown_response.json()
    assert len(deliveries) == 1
    assert deliveries[0].email == "entrega.real@example.com"
    assert deliveries[0].token == "setup-token-delivery-000000"

    token_row = await db_session.scalar(
        sa.select(CandidateAuthTokenModel).where(
            CandidateAuthTokenModel.purpose == PASSWORD_SETUP_PURPOSE,
        )
    )
    assert token_row is not None
    assert token_row.token_hash != "setup-token-delivery-000000"


@pytest.mark.asyncio
async def test_password_setup_email_failure_keeps_generic_response(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _create_candidate(
        db_session,
        full_name="Falha Entrega",
        email="falha.entrega@example.com",
        cpf="12345678005",
    )
    monkeypatch.setattr(
        "src.application.services.candidate_portal_auth_service.secrets.token_urlsafe",
        lambda _: "setup-token-failure-000000",
    )

    async def fail_delivery(setup_token: CandidatePasswordSetupToken) -> None:
        raise EmailDeliveryError("delivery failed")

    monkeypatch.setattr(
        "src.interface.api.routers.candidate_portal_auth.send_candidate_password_setup_email",
        fail_delivery,
    )

    existing_response = await client.post(
        "/api/v1/public/auth/request-password-setup",
        json={"email": "falha.entrega@example.com"},
    )
    unknown_response = await client.post(
        "/api/v1/public/auth/request-password-setup",
        json={"email": "falha.desconhecida@example.com"},
    )

    assert existing_response.status_code == status.HTTP_200_OK
    assert unknown_response.status_code == status.HTTP_200_OK
    assert existing_response.json() == unknown_response.json()


@pytest.mark.asyncio
async def test_password_setup_missing_smtp_configuration_returns_200(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _create_candidate(
        db_session,
        full_name="SMTP Ausente",
        email="smtp.ausente@example.com",
        cpf="12345678042",
    )
    monkeypatch.setattr(settings, "APP_ENV", "development")
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "SMTP_FROM_EMAIL", "")
    monkeypatch.setattr(settings, "CANDIDATE_PORTAL_PUBLIC_URL", "http://127.0.0.1:5174")
    monkeypatch.setattr(
        "src.application.services.candidate_portal_auth_service.secrets.token_urlsafe",
        lambda _: "setup-token-no-smtp-000000",
    )

    response = await client.post(
        "/api/v1/public/auth/request-password-setup",
        json={"email": "smtp.ausente@example.com"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "message": "Se houver um cadastro com este e-mail, enviaremos as instruções de acesso."
    }


@pytest.mark.asyncio
async def test_password_setup_unexpected_exception_never_returns_500(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Exceção inesperada no envio de e-mail não deve retornar 500 — CP-C5 regression guard."""
    await _create_candidate(
        db_session,
        full_name="Excecao Inesperada",
        email="excecao.inesperada@example.com",
        cpf="12345678099",
    )
    monkeypatch.setattr(
        "src.application.services.candidate_portal_auth_service.secrets.token_urlsafe",
        lambda _: "setup-token-unexpected-err",
    )

    async def raise_unexpected(setup_token: CandidatePasswordSetupToken) -> None:
        # Simulates an unexpected error (e.g. AttributeError from misconfigured settings)
        raise AttributeError("unexpected configuration error")

    monkeypatch.setattr(
        "src.interface.api.routers.candidate_portal_auth.send_candidate_password_setup_email",
        raise_unexpected,
    )

    response = await client.post(
        "/api/v1/public/auth/request-password-setup",
        json={"email": "excecao.inesperada@example.com"},
    )

    # Must never return 500 — email failure is always non-fatal
    assert response.status_code == status.HTTP_200_OK
    assert (
        response.json()["message"]
        == "Se houver um cadastro com este e-mail, enviaremos as instruções de acesso."
    )


def test_password_setup_dev_fallback_logs_link_only_in_dev_and_test(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.interface.api.routers import candidate_portal_auth

    events: list[tuple[str, dict[str, object]]] = []

    def capture_warning(event: str, **kwargs: object) -> None:
        events.append((event, kwargs))

    monkeypatch.setattr(
        candidate_portal_auth,
        "logger",
        SimpleNamespace(warning=capture_warning),
    )
    monkeypatch.setattr(settings, "CANDIDATE_PORTAL_PUBLIC_URL", "http://portal.local")
    setup_token = CandidatePasswordSetupToken(
        candidate_id=uuid4(),
        email="fallback.dev@example.com",
        full_name="Fallback Dev",
        token="setup-token-dev-fallback",
        expires_at=datetime.now(UTC) + timedelta(hours=2),
    )

    for app_env in ("development", "test"):
        events.clear()
        monkeypatch.setattr(settings, "APP_ENV", app_env)
        candidate_portal_auth.log_candidate_password_setup_dev_fallback(
            setup_token,
            reason="EmailDeliveryConfigurationError",
        )

        assert len(events) == 1
        assert events[0][0] == "candidate_portal.password_setup_dev_fallback_link"
        assert (
            events[0][1]["setup_url"]
            == "http://portal.local/definir-senha?token=setup-token-dev-fallback"
        )

    for app_env in ("staging", "production"):
        events.clear()
        monkeypatch.setattr(settings, "APP_ENV", app_env)
        candidate_portal_auth.log_candidate_password_setup_dev_fallback(
            setup_token,
            reason="EmailDeliveryConfigurationError",
        )

        assert events == []


@pytest.mark.asyncio
async def test_password_setup_production_does_not_log_setup_token_when_smtp_fails(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.interface.api.routers import candidate_portal_auth

    await _create_candidate(
        db_session,
        full_name="Producao Sem Log",
        email="producao.sem.log@example.com",
        cpf="12345678043",
    )
    events: list[tuple[str, dict[str, object]]] = []

    def capture_warning(event: str, **kwargs: object) -> None:
        events.append((event, kwargs))

    monkeypatch.setattr(
        candidate_portal_auth,
        "logger",
        SimpleNamespace(warning=capture_warning, exception=lambda *args, **kwargs: None),
    )
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "CANDIDATE_PORTAL_PUBLIC_URL", "https://portal.example.com")
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "SMTP_FROM_EMAIL", "")
    monkeypatch.setattr(
        "src.application.services.candidate_portal_auth_service.secrets.token_urlsafe",
        lambda _: "setup-token-prod-never-log",
    )

    response = await client.post(
        "/api/v1/public/auth/request-password-setup",
        json={"email": "producao.sem.log@example.com"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert any(event == "candidate_portal.password_setup_delivery_failed" for event, _ in events)
    log_dump = repr(events)
    assert "setup-token-prod-never-log" not in log_dump
    assert "https://portal.example.com/definir-senha" not in log_dump
    assert "candidate_portal.password_setup_dev_fallback_link" not in log_dump


@pytest.mark.asyncio
async def test_password_setup_invalid_payload_returns_422(
    client: AsyncClient,
) -> None:
    """Payload inválido retorna 422 de validação, nunca 500."""
    for payload in [
        {},
        {"email": ""},
        {"email": "notanemail"},
        {"wrong_field": "test@example.com"},
    ]:
        response = await client.post(
            "/api/v1/public/auth/request-password-setup",
            json=payload,
        )
        assert (
            response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        ), f"Expected 422 for payload {payload!r}, got {response.status_code}"


@pytest.mark.asyncio
async def test_password_setup_email_uses_candidate_portal_public_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.interface.api.routers.candidate_portal_auth import (
        send_candidate_password_setup_email,
    )

    sent_payload: dict[str, str | None] = {}

    async def capture_send(self, *, to_email, subject, text_body, html_body=None) -> None:
        sent_payload["to_email"] = to_email
        sent_payload["subject"] = subject
        sent_payload["text_body"] = text_body
        sent_payload["html_body"] = html_body

    monkeypatch.setattr(settings, "CANDIDATE_PORTAL_PUBLIC_URL", "https://vagas.marajo.test")
    monkeypatch.setattr(
        "src.infrastructure.email.smtp_email_sender.SMTPEmailSender.send",
        capture_send,
    )

    await send_candidate_password_setup_email(
        CandidatePasswordSetupToken(
            candidate_id=uuid4(),
            email="link.portal@example.com",
            full_name="Link Portal",
            token="setup-token-url-000000",
            expires_at=datetime.now(UTC) + timedelta(hours=2),
        )
    )

    assert sent_payload["to_email"] == "link.portal@example.com"
    assert sent_payload["subject"] == "Acesso ao Portal do Candidato - Marajó RH"
    assert "https://vagas.marajo.test/definir-senha?token=setup-token-url-000000" in str(
        sent_payload["text_body"]
    )
    assert "https://vagas.marajo.test/definir-senha?token=setup-token-url-000000" in str(
        sent_payload["html_body"]
    )


@pytest.mark.asyncio
async def test_password_setup_valid_token_defines_password_and_allows_login(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Primeiro Acesso",
        email="primeiro.acesso@example.com",
        cpf="12345678002",
    )
    assert candidate.password_hash is None
    monkeypatch.setattr(
        "src.application.services.candidate_portal_auth_service.secrets.token_urlsafe",
        lambda _: "setup-token-valid-000000",
    )

    request_response = await client.post(
        "/api/v1/public/auth/request-password-setup",
        json={"email": "primeiro.acesso@example.com"},
    )
    assert request_response.status_code == status.HTTP_200_OK

    confirm_response = await client.post(
        "/api/v1/public/auth/confirm-password-setup",
        json={"token": "setup-token-valid-000000", "password": "SenhaSegura123"},
    )

    assert confirm_response.status_code == status.HTTP_200_OK
    assert confirm_response.json() == {
        "message": "Senha definida com sucesso. Acesse sua área do candidato."
    }
    await db_session.refresh(candidate)
    assert candidate.password_hash is not None
    monkeypatch.setattr(
        "src.application.services.candidate_portal_auth_service.secrets.token_urlsafe",
        lambda _: "portal-session-valid-000000",
    )

    login_response = await client.post(
        "/api/v1/public/candidate-auth/login",
        json={"email": "primeiro.acesso@example.com", "password": "SenhaSegura123"},
    )
    assert login_response.status_code == status.HTTP_200_OK
    assert "candidate_portal_token=" in login_response.headers.get("set-cookie", "")


@pytest.mark.asyncio
async def test_password_setup_invalid_or_expired_token_fails(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Token Expirado",
        email="token.expirado@example.com",
        cpf="12345678003",
    )
    db_session.add(
        CandidateAuthTokenModel(
            candidate_id=candidate.id,
            purpose=PASSWORD_SETUP_PURPOSE,
            token_hash=sha256(b"expired-token-value-000000").hexdigest(),
            expires_at=datetime.now(UTC) - timedelta(minutes=1),
        )
    )
    await db_session.commit()

    invalid_response = await client.post(
        "/api/v1/public/auth/confirm-password-setup",
        json={"token": "invalid-token-value-000000", "password": "SenhaSegura123"},
    )
    expired_response = await client.post(
        "/api/v1/public/auth/confirm-password-setup",
        json={"token": "expired-token-value-000000", "password": "SenhaSegura123"},
    )

    assert invalid_response.status_code == status.HTTP_400_BAD_REQUEST
    assert expired_response.status_code == status.HTTP_400_BAD_REQUEST
    assert invalid_response.json()["detail"] == "Link inválido ou expirado."
    assert expired_response.json()["detail"] == "Link inválido ou expirado."


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
async def test_dev_login_creates_candidate_sets_cookie_and_allows_portal_access(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "APP_ENV", "development")
    monkeypatch.setattr(settings, "ENABLE_DEV_CANDIDATE_LOGIN", True)

    response = await client.post(
        "/api/v1/public/auth/dev-login",
        json={"email": "dev-candidato@local.test", "name": "Candidato Teste"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["redirect_to"] == "/candidato/portal"
    assert "candidate_portal_token=" in response.headers.get("set-cookie", "")

    candidate = await db_session.scalar(
        sa.select(CandidateModel).where(CandidateModel.email == "dev-candidato@local.test")
    )
    assert candidate is not None
    assert candidate.full_name == "Candidato Teste"
    assert candidate.application_source == "dev_test"
    assert candidate.password_hash is None
    assert candidate.cpf is None

    assert await db_session.scalar(sa.select(sa.func.count(ResumeModel.id))) == 0
    assert (
        await db_session.scalar(
            sa.select(sa.func.count(CandidateJobPipelineModel.candidate_job_pipeline_id))
        )
        == 0
    )

    me_response = await client.get("/api/v1/public/candidate-portal/me")
    applications_response = await client.get("/api/v1/public/candidate-portal/me/applications")

    assert me_response.status_code == status.HTTP_200_OK
    assert me_response.json()["id"] == str(candidate.id)
    assert applications_response.status_code == status.HTTP_200_OK
    assert applications_response.json() == []


@pytest.mark.asyncio
async def test_dev_login_reuses_existing_candidate_without_creating_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "APP_ENV", "test")
    monkeypatch.setattr(settings, "ENABLE_DEV_CANDIDATE_LOGIN", True)
    candidate = await _create_candidate(
        db_session,
        full_name="Candidato Existente",
        email="existente.dev@example.com",
        cpf="12345678004",
        create_resume=False,
    )

    response = await client.post(
        "/api/v1/public/auth/dev-login",
        json={"email": "EXISTENTE.DEV@example.com"},
    )

    assert response.status_code == status.HTTP_200_OK
    candidates_count = await db_session.scalar(
        sa.select(sa.func.count(CandidateModel.id)).where(
            sa.func.lower(CandidateModel.email) == "existente.dev@example.com"
        )
    )
    assert candidates_count == 1
    assert (
        await db_session.scalar(
            sa.select(sa.func.count(CandidateJobPipelineModel.candidate_job_pipeline_id))
        )
        == 0
    )

    me_response = await client.get("/api/v1/public/candidate-portal/me")
    assert me_response.status_code == status.HTTP_200_OK
    assert me_response.json()["id"] == str(candidate.id)


@pytest.mark.asyncio
@pytest.mark.parametrize("app_env", ["production", "staging"])
async def test_dev_login_is_not_exposed_in_production_or_staging(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    app_env: str,
) -> None:
    monkeypatch.setattr(settings, "APP_ENV", app_env)
    monkeypatch.setattr(settings, "ENABLE_DEV_CANDIDATE_LOGIN", True)

    response = await client.post(
        "/api/v1/public/auth/dev-login",
        json={"email": "dev-candidato@local.test", "name": "Candidato Teste"},
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_dev_login_is_not_exposed_when_flag_is_disabled(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "APP_ENV", "development")
    monkeypatch.setattr(settings, "ENABLE_DEV_CANDIDATE_LOGIN", False)

    response = await client.post(
        "/api/v1/public/auth/dev-login",
        json={"email": "dev-candidato@local.test", "name": "Candidato Teste"},
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


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

    assert me_response.status_code == status.HTTP_401_UNAUTHORIZED
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
                mime_type="application/pdf",
                original_file_name="resume.pdf",
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
            empty_pages=0,
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
                mime_type="application/pdf",
                original_file_name="resume.pdf",
                extracted_text=None,
                extraction_status="processing",
                extraction_error=None,
                page_count=None,
                word_count=None,
            ),
            SimpleNamespace(
                id=UUID(payload["resume_id"]),
                candidate_id=UUID(payload["candidate_id"]),
            ),
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
        item["job_id"] == str(closed_job.id) for item in overview_payload["application_history"]
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
        item["job_id"] == str(published_job.id) for item in overview_payload["application_history"]
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

    await _create_active_user(
        db_session,
        "transfer-admin@example.com",
        "password123",
        UserRole.ADMIN,
    )
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
        ("protheus", "Pré-admissão"),
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
    assert payload["closed_reason_public_label"] == "Seu processo foi concluído com sucesso."
    assert payload["can_apply_to_other_jobs"] is False
    assert payload["talent_pool"] is False
    assert payload["application_history"][0]["job_id"] == str(job.id)
    assert payload["application_history"][0]["status"] == "admitted"
    assert payload["public_timeline"]["current_step_key"] == "result"
    assert payload["public_timeline"]["steps"][-1]["label"] == "Admitido"


@pytest.mark.asyncio
async def test_portal_overview_uses_admitted_pre_admission_case_as_success_state(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Candidata Caso Admitido",
        email=f"portal-case-admitted-{uuid4().hex[:6]}@example.com",
        cpf=f"{uuid4().int % 10**11:011d}",
    )
    job = await _create_published_job(db_session, title="Vaga Caso Admitido")
    now = datetime.now(UTC)
    resume_version_id = await db_session.scalar(
        sa.select(ResumeVersionModel.id)
        .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
        .where(ResumeModel.candidate_id == candidate.id)
    )
    decision = CandidateJobHiringDecisionModel(
        candidate_id=candidate.id,
        job_id=job.id,
        decision_status="submitted",
        decision_outcome="hire",
        reason_code="strong_fit",
        submitted_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(decision)
    await db_session.flush()
    db_session.add_all(
        [
            CandidateJobPipelineModel(
                candidate_id=candidate.id,
                job_id=job.id,
                resume_version_id=resume_version_id,
                link_status="hired",
                pipeline_stage="protheus",
                pipeline_status="active",
                relationship_status="active",
                is_terminal=False,
                entered_at=now,
                updated_at=now,
            ),
            PreAdmissionCaseModel(
                candidate_id=candidate.id,
                job_id=job.id,
                hiring_decision_id=decision.id,
                status="admitted",
                created_at=now,
                updated_at=now,
                closed_at=now,
            ),
        ]
    )
    await db_session.commit()

    await _create_portal_session(db_session, candidate.id, "portal-token-case-admitted")
    client.cookies.set("candidate_portal_token", "portal-token-case-admitted")

    response = await client.get("/api/v1/public/candidate-portal/overview")
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()

    assert payload["application_status"] == "admitted"
    assert payload["current_process_status_label"] == "Admitido"
    assert payload["is_process_closed"] is True
    assert payload["can_apply_to_other_jobs"] is False
    assert payload["talent_pool"] is False
    assert payload["pre_admission"]["pre_admission_status"] == "admitted"


@pytest.mark.asyncio
async def test_portal_overview_uses_dismissed_pre_admission_case_without_talent_pool(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Candidata Desligada",
        email=f"portal-case-dismissed-{uuid4().hex[:6]}@example.com",
        cpf=f"{uuid4().int % 10**11:011d}",
    )
    job = await _create_published_job(db_session, title="Vaga Caso Desligado")
    now = datetime.now(UTC)
    resume_version_id = await db_session.scalar(
        sa.select(ResumeVersionModel.id)
        .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
        .where(ResumeModel.candidate_id == candidate.id)
    )
    decision = CandidateJobHiringDecisionModel(
        candidate_id=candidate.id,
        job_id=job.id,
        decision_status="submitted",
        decision_outcome="hire",
        reason_code="strong_fit",
        submitted_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(decision)
    await db_session.flush()
    db_session.add_all(
        [
            CandidateJobPipelineModel(
                candidate_id=candidate.id,
                job_id=job.id,
                resume_version_id=resume_version_id,
                link_status="hired",
                pipeline_stage="admitted",
                pipeline_status="terminal",
                relationship_status="hired",
                is_terminal=True,
                terminated_at=now,
                entered_at=now,
                updated_at=now,
            ),
            PreAdmissionCaseModel(
                candidate_id=candidate.id,
                job_id=job.id,
                hiring_decision_id=decision.id,
                status="dismissed",
                created_at=now,
                updated_at=now,
                closed_at=now - timedelta(days=10),
                dismissed_at=now,
                dismissal_reason="Motivo interno sigiloso",
            ),
        ]
    )
    await db_session.commit()

    await _create_portal_session(db_session, candidate.id, "portal-token-case-dismissed")
    client.cookies.set("candidate_portal_token", "portal-token-case-dismissed")

    response = await client.get("/api/v1/public/candidate-portal/overview")
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()

    assert payload["application_status"] == "dismissed"
    assert payload["current_process_status_label"] == "Processo admissional encerrado"
    assert payload["is_process_closed"] is True
    assert (
        payload["closed_reason_public_label"]
        == "Seu vínculo admissional foi encerrado pela equipe de RH."
    )
    assert payload["can_apply_to_other_jobs"] is False
    assert payload["can_request_contact"] is True
    assert payload["talent_pool"] is False
    assert payload["pre_admission"]["pre_admission_status"] == "dismissed"
    assert "Motivo interno sigiloso" not in str(payload)


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
    assert (
        payload["closed_reason_public_label"]
        == "Você não foi selecionado para esta vaga no momento."
    )
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
    assert (
        payload["closed_reason_public_label"]
        == "Você não foi selecionado para esta vaga no momento."
    )
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
            "body": (
                "Olá, gostaria de solicitar contato sobre o processo seletivo da vaga "
                "Vaga com Contato."
            ),
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
        sa.select(CandidateCommunicationModel).where(
            CandidateCommunicationModel.id == UUID(payload["id"])
        )
    )
    assert saved is not None
    assert saved.template_key == "candidate_contact_request"


@pytest.mark.asyncio
async def test_portal_overview_returns_public_interview_for_active_cycle_only(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Renata Entrevista",
        email="renata.entrevista@example.com",
        cpf="34665378007",
    )
    job = await _create_published_job(db_session, title="Analista RH")
    previous_job = await _create_published_job(db_session, title="Analista RH - Processo Anterior")
    active_pipeline_id = uuid4()
    previous_pipeline_id = uuid4()

    await _create_pipeline_for_portal(
        db_session,
        candidate_id=candidate.id,
        job_id=job.id,
        pipeline_id=active_pipeline_id,
    )
    await _create_pipeline_for_portal(
        db_session,
        candidate_id=candidate.id,
        job_id=previous_job.id,
        pipeline_id=previous_pipeline_id,
        stage="rejected",
        relationship_status="rejected",
        link_status="rejected",
        pipeline_status="terminal",
        is_terminal=True,
        terminated_at=datetime.now(UTC),
    )

    old_start = datetime.now(UTC) + timedelta(days=1)
    old_interview = await _create_interview_schedule(
        db_session,
        candidate_id=candidate.id,
        job_id=previous_job.id,
        pipeline_id=previous_pipeline_id,
        status="scheduled",
        scheduled_start=old_start,
        scheduled_end=old_start + timedelta(hours=1),
        title="Entrevista antiga",
        meeting_url="https://meet.example.com/old-cycle",
    )
    next_start = datetime.now(UTC) + timedelta(days=3)
    active_interview = await _create_interview_schedule(
        db_session,
        candidate_id=candidate.id,
        job_id=job.id,
        pipeline_id=active_pipeline_id,
        status="scheduled",
        scheduled_start=next_start,
        scheduled_end=next_start + timedelta(hours=1),
        title="Entrevista ativa",
        meeting_url="https://meet.example.com/active-cycle",
    )

    await _create_portal_session(db_session, candidate.id, "portal-token-public-interview")
    client.cookies.set("candidate_portal_token", "portal-token-public-interview")

    response = await client.get("/api/v1/public/candidate-portal/overview")
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()

    assert payload["public_interview"]["id"] == str(active_interview.id)
    assert payload["public_interview"]["meeting_url"] == "https://meet.example.com/active-cycle"
    assert payload["public_interview"]["status"] == "scheduled"
    assert payload["public_interview"]["status_label"] == "Entrevista agendada"
    assert payload["public_timeline"]["steps"][3]["interview"]["id"] == str(active_interview.id)
    assert payload["public_interview"]["id"] != str(old_interview.id)


@pytest.mark.asyncio
async def test_portal_overview_does_not_return_interview_from_other_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Camila Portal",
        email="camila.portal@example.com",
        cpf="34665378008",
    )
    other_candidate = await _create_candidate(
        db_session,
        full_name="Outro Candidato",
        email="outro.portal@example.com",
        cpf="34665378009",
    )
    job = await _create_published_job(db_session, title="Assistente Administrativo")
    pipeline_id = uuid4()

    await _create_pipeline_for_portal(
        db_session,
        candidate_id=candidate.id,
        job_id=job.id,
        pipeline_id=pipeline_id,
    )
    await _create_interview_schedule(
        db_session,
        candidate_id=other_candidate.id,
        job_id=job.id,
        pipeline_id=pipeline_id,
        status="scheduled",
        scheduled_start=datetime.now(UTC) + timedelta(days=2),
        scheduled_end=datetime.now(UTC) + timedelta(days=2, hours=1),
        title="Entrevista de outro candidato",
    )

    await _create_portal_session(db_session, candidate.id, "portal-token-own-candidate")
    client.cookies.set("candidate_portal_token", "portal-token-own-candidate")

    response = await client.get("/api/v1/public/candidate-portal/overview")
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()

    assert payload["public_interview"] is None
    interview_step = next(
        step for step in payload["public_timeline"]["steps"] if step["key"] == "interview"
    )
    assert interview_step["interview"] is None


@pytest.mark.asyncio
async def test_portal_overview_refreshes_public_interview_when_rescheduled_cancelled_and_completed(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Paula Reagendada",
        email="paula.reagendada@example.com",
        cpf="34665378010",
    )
    job = await _create_published_job(db_session, title="Analista de Pessoas")
    pipeline_id = uuid4()
    await _create_pipeline_for_portal(
        db_session,
        candidate_id=candidate.id,
        job_id=job.id,
        pipeline_id=pipeline_id,
    )

    original_start = datetime.now(UTC) + timedelta(days=1)
    interview = await _create_interview_schedule(
        db_session,
        candidate_id=candidate.id,
        job_id=job.id,
        pipeline_id=pipeline_id,
        status="scheduled",
        scheduled_start=original_start,
        scheduled_end=original_start + timedelta(hours=1),
    )

    await _create_portal_session(db_session, candidate.id, "portal-token-refresh-interview")
    client.cookies.set("candidate_portal_token", "portal-token-refresh-interview")

    response = await client.get("/api/v1/public/candidate-portal/overview")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["public_interview"]["status"] == "scheduled"

    interview.status = "rescheduled"
    interview.scheduled_start = original_start + timedelta(days=1)
    interview.scheduled_end = interview.scheduled_start + timedelta(hours=1)
    interview.updated_at = datetime.now(UTC)
    db_session.add(interview)
    await db_session.commit()

    response = await client.get("/api/v1/public/candidate-portal/overview")
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["public_interview"]["status"] == "rescheduled"
    assert payload["public_interview"]["status_label"] == "Entrevista agendada"

    interview.status = "cancelled"
    interview.updated_at = datetime.now(UTC)
    db_session.add(interview)
    await db_session.commit()

    response = await client.get("/api/v1/public/candidate-portal/overview")
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["public_interview"]["status"] == "cancelled"

    interview.status = "completed"
    interview.updated_at = datetime.now(UTC)
    db_session.add(interview)
    await db_session.commit()

    response = await client.get("/api/v1/public/candidate-portal/overview")
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["public_interview"]["status"] == "completed"
    assert payload["public_interview"]["status_label"] == "Entrevista concluída"


@pytest.mark.asyncio
async def test_closed_process_does_not_show_old_scheduled_interview_as_active(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = await _create_candidate(
        db_session,
        full_name="Luana Encerrada",
        email="luana.encerrada@example.com",
        cpf="34665378011",
    )
    job = await _create_published_job(db_session, title="Coordenadora")
    pipeline_id = uuid4()
    await _create_pipeline_for_portal(
        db_session,
        candidate_id=candidate.id,
        job_id=job.id,
        pipeline_id=pipeline_id,
        stage="rejected",
        relationship_status="rejected",
        link_status="rejected",
        pipeline_status="terminal",
        is_terminal=True,
        terminated_at=datetime.now(UTC),
    )
    await _create_interview_schedule(
        db_session,
        candidate_id=candidate.id,
        job_id=job.id,
        pipeline_id=pipeline_id,
        status="scheduled",
        scheduled_start=datetime.now(UTC) + timedelta(days=2),
        scheduled_end=datetime.now(UTC) + timedelta(days=2, hours=1),
        title="Entrevista que não deve aparecer como ativa",
    )

    await _create_portal_session(db_session, candidate.id, "portal-token-closed-process")
    client.cookies.set("candidate_portal_token", "portal-token-closed-process")

    response = await client.get("/api/v1/public/candidate-portal/overview")
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()

    assert payload["application_status"] == "rejected"
    assert payload["public_interview"] is None


# ── CP-C8B: Session invalidation on password change ───────────────────────────


@pytest.mark.asyncio
async def test_confirm_password_setup_invalidates_existing_sessions(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sessões portal_session ativas são invalidadas ao confirmar password setup."""
    candidate = await _create_candidate(
        db_session,
        full_name="Invalida Sessao",
        email="invalida.sessao@example.com",
        cpf="88811122299",
    )

    # Create an active portal_session before password setup
    await _create_portal_session(db_session, candidate.id, "old-session-token-abc123")

    # Verify old session works
    client.cookies.set("candidate_portal_token", "old-session-token-abc123")
    overview_before = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_before.status_code == status.HTTP_200_OK

    # Request + confirm password setup
    monkeypatch.setattr(
        "src.application.services.candidate_portal_auth_service.secrets.token_urlsafe",
        lambda _: "setup-token-c8b-000000",
    )
    monkeypatch.setattr(
        "src.interface.api.routers.candidate_portal_auth.send_candidate_password_setup_email",
        lambda _: None,
    )
    await client.post(
        "/api/v1/public/auth/request-password-setup",
        json={"email": "invalida.sessao@example.com"},
    )
    confirm_response = await client.post(
        "/api/v1/public/auth/confirm-password-setup",
        json={"token": "setup-token-c8b-000000", "password": "NovaSenha@123"},
    )
    assert confirm_response.status_code == status.HTTP_200_OK

    # Old session cookie must now return 401
    client.cookies.set("candidate_portal_token", "old-session-token-abc123")
    overview_after = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_after.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_new_login_after_password_setup_creates_valid_session(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Após invalidação, login com nova senha cria sessão válida."""
    await _create_candidate(
        db_session,
        full_name="Nova Senha Login",
        email="nova.senha.login@example.com",
        cpf="88811122288",
    )

    # Each call to token_urlsafe returns a unique value so setup and session
    # tokens don't collide on the unique token_hash index.
    from itertools import count as _count

    _call = _count()
    monkeypatch.setattr(
        "src.application.services.candidate_portal_auth_service.secrets.token_urlsafe",
        lambda _: f"c8b-login-token-{next(_call):04d}",
    )
    monkeypatch.setattr(
        "src.interface.api.routers.candidate_portal_auth.send_candidate_password_setup_email",
        lambda _: None,
    )

    # The first token_urlsafe call → "c8b-login-token-0000" (password setup token)
    await client.post(
        "/api/v1/public/auth/request-password-setup",
        json={"email": "nova.senha.login@example.com"},
    )
    confirm = await client.post(
        "/api/v1/public/auth/confirm-password-setup",
        json={"token": "c8b-login-token-0000", "password": "SenhaNova@456"},
    )
    assert confirm.status_code == status.HTTP_200_OK

    # Login with the new password should succeed — token_urlsafe returns "c8b-login-token-0001"
    login_response = await client.post(
        "/api/v1/public/auth/login",
        json={"email": "nova.senha.login@example.com", "password": "SenhaNova@456"},
    )
    assert login_response.status_code == status.HTTP_200_OK
    assert "candidate_portal_token=" in login_response.headers.get("set-cookie", "")


@pytest.mark.asyncio
async def test_confirm_password_setup_token_cannot_be_reused(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Token de password_setup só pode ser usado uma vez."""
    await _create_candidate(
        db_session,
        full_name="Token Unico",
        email="token.unico@example.com",
        cpf="88811122277",
    )
    monkeypatch.setattr(
        "src.application.services.candidate_portal_auth_service.secrets.token_urlsafe",
        lambda _: "setup-token-c8b-once",
    )
    monkeypatch.setattr(
        "src.interface.api.routers.candidate_portal_auth.send_candidate_password_setup_email",
        lambda _: None,
    )
    await client.post(
        "/api/v1/public/auth/request-password-setup",
        json={"email": "token.unico@example.com"},
    )

    first = await client.post(
        "/api/v1/public/auth/confirm-password-setup",
        json={"token": "setup-token-c8b-once", "password": "Senha@First123"},
    )
    assert first.status_code == status.HTTP_200_OK

    # Second use of same token must fail
    second = await client.post(
        "/api/v1/public/auth/confirm-password-setup",
        json={"token": "setup-token-c8b-once", "password": "Senha@Second456"},
    )
    assert second.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.asyncio
async def test_invalid_token_does_not_invalidate_sessions(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Tentativa com token inválido não afeta sessões ativas do candidato."""
    candidate = await _create_candidate(
        db_session,
        full_name="Sessao Preservada",
        email="sessao.preservada@example.com",
        cpf="88811122266",
    )
    await _create_portal_session(db_session, candidate.id, "preserved-session-token")

    # Attempt to confirm with a token that does not exist
    bad_confirm = await client.post(
        "/api/v1/public/auth/confirm-password-setup",
        json={"token": "completely-invalid-token-xyz", "password": "SenhaAlguma123"},
    )
    assert bad_confirm.status_code == status.HTTP_400_BAD_REQUEST

    # Session must still be valid
    client.cookies.set("candidate_portal_token", "preserved-session-token")
    overview = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview.status_code == status.HTTP_200_OK
