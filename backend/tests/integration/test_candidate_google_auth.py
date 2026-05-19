from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient

# Fase 30B — Google auth do candidato: cobertura crítica de auth + LGPD.
pytestmark = pytest.mark.smoke
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.security.google_identity_verifier import (
    GoogleIdentityConfigurationError,
    GoogleIdentityVerificationError,
    GoogleIdentityVerifier,
)

SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-00000000000a")


async def _create_candidate(
    db_session: AsyncSession,
    *,
    email: str,
    full_name: str = "Maria Google",
    cpf: str | None = None,
    phone: str | None = None,
    google_sub: str | None = None,
    salary_expectation: str | None = None,
    lgpd_consent: bool = False,
) -> CandidateModel:
    candidate = CandidateModel(
        id=uuid4(),
        full_name=full_name,
        email=email,
        cpf=cpf,
        phone=phone,
        created_by=SYSTEM_USER_ID,
        salary_expectation=salary_expectation,
        google_sub=google_sub,
        application_source="manual",
        lgpd_consent_at=datetime.now(UTC) if lgpd_consent else None,
    )
    db_session.add(candidate)
    await db_session.commit()
    return candidate


async def _create_resume(db_session: AsyncSession, candidate_id: UUID) -> None:
    resume = ResumeModel(
        id=uuid4(),
        candidate_id=candidate_id,
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
        s3_key=f"resumes/{candidate_id}/curriculo.pdf",
        original_file_name="curriculo.pdf",
        file_size_bytes=1024,
        file_hash_sha256="a" * 64,
        mime_type="application/pdf",
        extraction_status="completed",
        uploaded_by=SYSTEM_USER_ID,
    )
    db_session.add_all([resume, version])
    await db_session.commit()


def _identity(
    *,
    sub: str = "google-sub-1",
    email: str = "google@example.com",
    verified: bool = True,
    name: str = "Google User",
) -> SimpleNamespace:
    return SimpleNamespace(
        sub=sub,
        email=email,
        email_verified=verified,
        name=name,
        picture="https://example.com/avatar.png",
    )


@pytest.mark.asyncio
async def test_google_invalid_token_returns_401(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    token = "invalid-google-token"

    async def _raise_invalid(self: GoogleIdentityVerifier, id_token: str):
        raise GoogleIdentityVerificationError("Token do Google inválido.")

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "frontend-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(GoogleIdentityVerifier, "verify", _raise_invalid)

    response = await client.post("/api/v1/public/candidate-auth/google", json={"id_token": token})

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["detail"] == "Não foi possível validar sua conta Google."
    assert token not in response.text
    assert token not in caplog.text


@pytest.mark.asyncio
async def test_google_unverified_email_is_blocked(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _verify(self: GoogleIdentityVerifier, id_token: str):
        return _identity(verified=False)

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "frontend-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(GoogleIdentityVerifier, "verify", _verify)

    response = await client.post("/api/v1/public/candidate-auth/google", json={"id_token": "token"})

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["detail"] == "Não foi possível validar sua conta Google."


@pytest.mark.asyncio
async def test_google_new_candidate_returns_needs_completion(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _verify(self: GoogleIdentityVerifier, id_token: str):
        return _identity(email="novo.google@example.com", name="Novo Google")

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "frontend-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(GoogleIdentityVerifier, "verify", _verify)

    response = await client.post("/api/v1/public/candidate-auth/google", json={"id_token": "token"})

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["status"] == "needs_completion"
    assert payload["candidate"]["email"] == "novo.google@example.com"
    assert "google_sub" not in payload["candidate"]
    assert "salary_expectation" in payload["missing_fields"]
    assert "resume" in payload["missing_fields"]
    assert "candidate_portal_token=" in response.headers.get("set-cookie", "")

    overview_response = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_response.status_code == status.HTTP_403_FORBIDDEN
    overview_payload = overview_response.json()
    assert overview_payload["detail"]["code"] == "candidate_profile_incomplete"
    assert overview_payload["detail"]["redirect_to"] == "/candidato/cadastro"
    assert "salary_expectation" in overview_payload["detail"]["missing_fields"]
    assert "google_sub" not in overview_response.text

    satellite_response = await client.get("/api/v1/candidate-portal/communications")
    assert satellite_response.status_code == status.HTTP_403_FORBIDDEN
    satellite_payload = satellite_response.json()
    assert satellite_payload["detail"]["code"] == "candidate_profile_incomplete"
    assert satellite_payload["detail"]["redirect_to"] == "/candidato/cadastro"
    assert "salary_expectation" in satellite_payload["detail"]["missing_fields"]
    assert "google_sub" not in satellite_response.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("email", "sub"),
    [
        ("candidato.gmail@gmail.com", "candidate-gmail-sub"),
        ("candidato.hotmail@hotmail.com", "candidate-hotmail-sub"),
        ("candidato.outlook@outlook.com", "candidate-outlook-sub"),
        ("candidato.marajo@redemarajo.com.br", "candidate-marajo-sub"),
    ],
)
async def test_google_candidate_public_auth_accepts_any_verified_email_domain_without_user_model(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    email: str,
    sub: str,
) -> None:
    monkeypatch.setattr(settings, "GOOGLE_ALLOWED_DOMAIN", "redemarajo.com.br")

    async def _verify(self: GoogleIdentityVerifier, id_token: str):
        return _identity(email=email.upper(), sub=sub, name="Candidato Público")

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "frontend-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(GoogleIdentityVerifier, "verify", _verify)

    response = await client.post("/api/v1/public/candidate-auth/google", json={"id_token": f"token-{sub}"})

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["status"] == "needs_completion"
    assert payload["candidate"]["email"] == email
    assert payload["redirect_to"] == "/candidato/cadastro"

    candidate = await db_session.scalar(
        sa.select(CandidateModel).where(CandidateModel.email == email)
    )
    assert candidate is not None
    assert candidate.google_sub == sub
    assert candidate.user_id is None

    internal_user = await db_session.scalar(
        sa.select(UserModel).where(UserModel.email == email)
    )
    assert internal_user is None


@pytest.mark.asyncio
async def test_google_incomplete_candidate_can_complete_application_and_access_satellite_endpoint(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _verify(self: GoogleIdentityVerifier, id_token: str):
        return _identity(email="completar.google@example.com", name="Completar Google")

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "frontend-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(GoogleIdentityVerifier, "verify", _verify)

    login_response = await client.post("/api/v1/public/candidate-auth/google", json={"id_token": "token"})
    assert login_response.status_code == status.HTTP_200_OK
    assert login_response.json()["status"] == "needs_completion"

    completion_response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Completar Google",
            "cpf": "12345678909",
            "email": "completar.google@example.com",
            "phone": "11999999999",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "R$ 5.000,00",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": "false",
            "lgpd_consent": "true",
        },
        files={
            "resume_file": (
                "curriculo.pdf",
                b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
                "application/pdf",
            )
        },
    )

    assert completion_response.status_code == status.HTTP_201_CREATED
    assert "google_sub" not in completion_response.text

    overview_response = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_response.status_code == status.HTTP_200_OK
    assert "google_sub" not in overview_response.text

    satellite_response = await client.get("/api/v1/candidate-portal/communications")
    assert satellite_response.status_code == status.HTTP_200_OK
    assert "google_sub" not in satellite_response.text


@pytest.mark.asyncio
async def test_google_completion_rejects_email_tampering(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _verify(self: GoogleIdentityVerifier, id_token: str):
        return _identity(email="travado.google@example.com", name="Travado Google")

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "frontend-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(GoogleIdentityVerifier, "verify", _verify)

    login_response = await client.post("/api/v1/public/candidate-auth/google", json={"id_token": "token"})
    assert login_response.status_code == status.HTTP_200_OK

    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Travado Google",
            "cpf": "12345678909",
            "email": "outro.email@example.com",
            "phone": "11999999999",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "R$ 5.000,00",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": "false",
            "lgpd_consent": "true",
        },
        files={
            "resume_file": (
                "curriculo.pdf",
                b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
                "application/pdf",
            )
        },
    )

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.json()["detail"] == "Não é possível alterar o e-mail validado pela conta Google."


@pytest.mark.asyncio
async def test_google_existing_complete_candidate_authenticates(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    candidate = await _create_candidate(
        db_session,
        email="existente.google@example.com",
        full_name="Existente Google",
        cpf="12345678909",
        phone="11999999999",
        google_sub="google-sub-1",
        salary_expectation="6500.00",
        lgpd_consent=True,
    )
    await _create_resume(db_session, candidate.id)

    async def _verify(self: GoogleIdentityVerifier, id_token: str):
        return _identity(email="existente.google@example.com", sub="google-sub-1")

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "frontend-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(GoogleIdentityVerifier, "verify", _verify)

    response = await client.post("/api/v1/public/candidate-auth/google", json={"id_token": "token"})

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["status"] == "authenticated"
    assert payload["redirect_to"] == "/candidato/portal"
    assert "google_sub" not in payload["candidate"]

    overview_response = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview_response.status_code == status.HTTP_200_OK


@pytest.mark.asyncio
async def test_google_links_existing_candidate_by_email_without_duplicate(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    candidate = await _create_candidate(
        db_session,
        email="linkar.google@example.com",
        full_name="Linkar Google",
        cpf="12345678909",
        phone="11999999999",
        salary_expectation="5500.00",
        lgpd_consent=True,
    )

    async def _verify(self: GoogleIdentityVerifier, id_token: str):
        return _identity(email="linkar.google@example.com", sub="google-sub-link")

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "frontend-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(GoogleIdentityVerifier, "verify", _verify)

    response = await client.post("/api/v1/public/candidate-auth/google", json={"id_token": "token"})

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["candidate"]["id"] == str(candidate.id)

    linked_google_sub = await db_session.scalar(
        sa.select(CandidateModel.google_sub).where(CandidateModel.id == candidate.id)
    )
    assert linked_google_sub == "google-sub-link"


@pytest.mark.asyncio
async def test_google_conflicting_google_sub_returns_409(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _create_candidate(
        db_session,
        email="conflito@example.com",
        full_name="Conflito",
        google_sub="google-sub-existente",
    )

    async def _verify(self: GoogleIdentityVerifier, id_token: str):
        return _identity(email="conflito@example.com", sub="google-sub-diferente")

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "frontend-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(GoogleIdentityVerifier, "verify", _verify)

    response = await client.post("/api/v1/public/candidate-auth/google", json={"id_token": "token"})

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.json()["detail"] == "Não foi possível vincular esta conta Google com segurança."


@pytest.mark.asyncio
async def test_google_missing_config_returns_503(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _verify(self: GoogleIdentityVerifier, id_token: str):
        raise GoogleIdentityConfigurationError

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    monkeypatch.setattr(GoogleIdentityVerifier, "verify", _verify)

    response = await client.post("/api/v1/public/candidate-auth/google", json={"id_token": "token"})

    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert response.json()["detail"] == "Login com Google não está configurado."
