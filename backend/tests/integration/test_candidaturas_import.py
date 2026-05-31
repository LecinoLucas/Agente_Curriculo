"""
Integration tests for:
  POST /api/v1/candidaturas/manual
  POST /api/v1/candidaturas/import
"""
from __future__ import annotations

import io
from uuid import uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_dispatch_service import CandidateJobAnalysisDispatcher
from src.core.settings import settings
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from tests.integration.helpers import _auth_headers, _create_active_user

# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
async def admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"admin_{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, email, "secret123", UserRole.ADMIN)
    return await _auth_headers(client, email, "secret123")


@pytest.fixture
async def hr_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"hr_{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, email, "secret123", UserRole.HR)
    return await _auth_headers(client, email, "secret123")


@pytest.fixture
async def recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"recruiter_{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, email, "secret123", UserRole.RECRUITER)
    return await _auth_headers(client, email, "secret123")


@pytest.fixture
async def viewer_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"viewer_{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, email, "secret123", UserRole.VIEWER)
    return await _auth_headers(client, email, "secret123")


def _csv(rows: list[str]) -> bytes:
    header = "nome,email,telefone,vaga,observacao\n"
    return (header + "\n".join(rows)).encode("utf-8")


def _csv_file(content: bytes, name: str = "candidatos.csv") -> tuple:
    return ("file", (name, io.BytesIO(content), "text/csv"))


async def _create_published_job(
    db_session: AsyncSession,
    *,
    title: str = "Import Job",
) -> JobModel:
    job = JobModel(
        id=uuid4(),
        title=f"{title} {uuid4().hex[:6]}",
        description="Vaga para testes de importacao",
        status="published",
        created_by=uuid4(),
        location="Sao Paulo, SP",
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    return job


async def _seed_candidate_with_resume(
    db_session: AsyncSession,
    *,
    created_by,
    email: str,
    extraction_status: str = "completed",
    extracted_text: str | None = "Experiencia em Python e FastAPI.",
) -> tuple[CandidateModel, ResumeVersionModel]:
    candidate = CandidateModel(
        full_name=f"Resume Ready {uuid4().hex[:6]}",
        email=email.lower(),
        created_by=created_by,
    )
    db_session.add(candidate)
    await db_session.flush()

    resume = ResumeModel(candidate_id=candidate.id, title="Curriculo", created_by=created_by)
    db_session.add(resume)
    await db_session.flush()

    version = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test",
        s3_key=f"resumes/{uuid4().hex}.pdf",
        original_file_name="curriculo.pdf",
        file_size_bytes=100,
        file_hash_sha256=(uuid4().hex * 2)[:64],
        mime_type="application/pdf",
        extracted_text=extracted_text,
        extraction_status=extraction_status,
        uploaded_by=created_by,
    )
    db_session.add(version)
    await db_session.commit()
    await db_session.refresh(candidate)
    await db_session.refresh(version)
    return candidate, version


async def _seed_active_analysis_config(
    db_session: AsyncSession,
    *,
    created_by,
) -> tuple[AIModelModel, PromptTemplateModel]:
    ai_model = AIModelModel(
        provider="google",
        model_id=f"gemini-import-{uuid4().hex[:8]}",
        model_name="Gemini Import Test",
        context_window=200000,
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"tpl-import-{uuid4().hex[:8]}",
        version=1,
        description="Import analysis template",
        template_type="full_analysis",
        user_prompt_template="Analyze: {resume}",
        is_active=True,
        created_by=created_by,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.commit()
    await db_session.refresh(ai_model)
    await db_session.refresh(prompt)
    return ai_model, prompt


async def _seed_completed_analysis_for_user(
    db_session: AsyncSession,
    *,
    requested_by,
) -> None:
    ai_model = AIModelModel(
        provider="google",
        model_id=f"gemini-limit-seed-{uuid4().hex[:8]}",
        model_name="Gemini Limit Seed",
        context_window=200000,
        is_active=False,
    )
    prompt = PromptTemplateModel(
        name=f"tpl-limit-seed-{uuid4().hex[:8]}",
        version=1,
        description="Seed template",
        template_type=f"full_analysis_seed_{uuid4().hex[:8]}",
        user_prompt_template="x",
        is_active=False,
        created_by=requested_by,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.flush()

    _, version = await _seed_candidate_with_resume(
        db_session,
        created_by=requested_by,
        email=f"limit_seed_{uuid4().hex[:8]}@test.com",
    )
    db_session.add(
        AnalysisModel(
            resume_version_id=version.id,
            ai_model_id=ai_model.id,
            prompt_template_id=prompt.id,
            requested_by=requested_by,
            job_id=None,
            idempotency_key=f"seed-{uuid4().hex}",
            priority=5,
            status="completed",
        )
    )
    await db_session.commit()


async def _count_candidates_by_email(db_session: AsyncSession, email: str) -> int:
    return int(
        await db_session.scalar(
            sa.select(sa.func.count())
            .select_from(CandidateModel)
            .where(CandidateModel.email == email.lower())
        )
        or 0
    )


async def _count_analyses(db_session: AsyncSession) -> int:
    return int(await db_session.scalar(sa.select(sa.func.count()).select_from(AnalysisModel)) or 0)


_IMPORT_RESPONSE_KEYS = {"created", "linked", "duplicates", "errors", "preview"}
_IMPORT_PREVIEW_KEYS = {
    "row",
    "nome",
    "email",
    "telefone",
    "status",
    "job_linked",
    "job_link_error",
    "analysis",
}
_IMPORT_ANALYSIS_KEYS = {
    "analysis_id",
    "status",
    "created",
    "blocked",
    "reused",
    "stuck",
    "reason",
    "stage",
    "trigger_source",
}


def _assert_import_response_shape(body: dict) -> None:
    assert set(body) == _IMPORT_RESPONSE_KEYS
    assert isinstance(body["created"], int)
    assert isinstance(body["linked"], int)
    assert isinstance(body["duplicates"], int)
    assert isinstance(body["errors"], list)
    assert isinstance(body["preview"], list)


def _assert_error_item_shape(item: dict) -> None:
    assert set(item) == {"row", "message"}
    assert isinstance(item["row"], int)
    assert isinstance(item["message"], str)


def _assert_preview_item_shape(item: dict) -> None:
    assert set(item).issubset(_IMPORT_PREVIEW_KEYS)
    if "row" in item:
        assert isinstance(item["row"], int)
    if "nome" in item:
        assert isinstance(item["nome"], str)
    if "email" in item:
        assert item["email"] is None or isinstance(item["email"], str)
    if "telefone" in item:
        assert item["telefone"] is None or isinstance(item["telefone"], str)
    if "status" in item:
        assert isinstance(item["status"], str)
    if "job_linked" in item:
        assert isinstance(item["job_linked"], bool)
    if "job_link_error" in item:
        assert isinstance(item["job_link_error"], str)
    if "analysis" in item:
        assert isinstance(item["analysis"], dict)
        assert set(item["analysis"]).issubset(_IMPORT_ANALYSIS_KEYS)


# ── Manual endpoint ───────────────────────────────────────────────────────────


async def test_manual_admin_creates_candidate(
    client: AsyncClient, admin_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Ana Teste", "email": "ana_manual@test.com"},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["full_name"] == "Ana Teste"
    assert body["email"] == "ana_manual@test.com"
    assert body["job_linked"] is False


async def test_manual_hr_creates_candidate(
    client: AsyncClient, hr_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Carlos RH", "phone": "11999990002"},
        headers=hr_headers,
    )
    assert resp.status_code == 201


async def test_manual_recruiter_creates_candidate(
    client: AsyncClient, recruiter_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Maria Rec", "email": "maria_rec@test.com"},
        headers=recruiter_headers,
    )
    assert resp.status_code == 201


async def test_manual_viewer_gets_403(
    client: AsyncClient, viewer_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Bloqueado", "email": "blocked@test.com"},
        headers=viewer_headers,
    )
    assert resp.status_code == 403


async def test_manual_invalid_missing_contact_returns_422(
    client: AsyncClient, admin_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Sem Contato"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


async def test_manual_missing_name_returns_422(
    client: AsyncClient, admin_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={"email": "namedless@test.com"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


async def test_manual_duplicate_email_returns_duplicate_warning(
    client: AsyncClient, admin_headers: dict
) -> None:
    email = f"dup_{uuid4().hex[:6]}@test.com"
    # Cria a primeira vez
    r1 = await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Primeiro", "email": email},
        headers=admin_headers,
    )
    assert r1.status_code == 201

    # Tenta criar novamente com o mesmo email
    r2 = await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Segundo", "email": email},
        headers=admin_headers,
    )
    assert r2.status_code == 201
    body = r2.json()
    assert body["duplicate_warning"] is not None
    assert "já existe" in body["duplicate_warning"].lower()


async def test_manual_with_job_id_invalid_returns_404(
    client: AsyncClient, admin_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={
            "full_name": "Com Vaga",
            "email": f"comvaga_{uuid4().hex[:6]}@test.com",
            "job_id": str(uuid4()),
        },
        headers=admin_headers,
    )
    assert resp.status_code == 404


async def test_manual_with_job_id_published_links(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict,
    published_job,
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={
            "full_name": "Vinculado",
            "email": f"vinculado_{uuid4().hex[:6]}@test.com",
            "job_id": str(published_job.id),
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["job_linked"] is True
    assert body["job_id"] == str(published_job.id)


# ── Import endpoint ───────────────────────────────────────────────────────────


async def test_import_valid_csv_creates_candidates(
    client: AsyncClient, admin_headers: dict
) -> None:
    u1 = uuid4().hex[:8]
    u2 = uuid4().hex[:8]
    content = _csv([
        f"João {u1},{u1}@test.com,,()",
        f"Maria {u2},{u2}@test.com,,",
    ])
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(content)],
        headers=admin_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    _assert_import_response_shape(body)
    assert body["created"] == 2
    assert body["duplicates"] == 0
    assert body["errors"] == []
    assert len(body["preview"]) == 2
    for item in body["preview"]:
        _assert_preview_item_shape(item)
        assert "analysis" not in item
        assert set(item) == {"row", "nome", "email", "telefone", "status"}


async def test_import_viewer_gets_403(
    client: AsyncClient, viewer_headers: dict
) -> None:
    content = _csv(["João Test,joao_viewer@test.com,,"])
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(content)],
        headers=viewer_headers,
    )
    assert resp.status_code == 403


async def test_import_empty_file_returns_422(
    client: AsyncClient, admin_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(b"")],
        headers=admin_headers,
    )
    assert resp.status_code == 422


async def test_import_invalid_format_returns_422(
    client: AsyncClient, admin_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[("file", ("test.txt", io.BytesIO(b"hello"), "text/plain"))],
        headers=admin_headers,
    )
    assert resp.status_code == 422


async def test_import_csv_with_invalid_email_reports_per_row_error(
    client: AsyncClient, admin_headers: dict
) -> None:
    u = uuid4().hex[:8]
    content = _csv([
        f"Válido {u},{u}@test.com,,",
        "Inválido,not-an-email,,",
    ])
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(content)],
        headers=admin_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    _assert_import_response_shape(body)
    assert body["created"] == 1
    assert len(body["errors"]) == 1
    _assert_error_item_shape(body["errors"][0])
    assert body["errors"][0]["row"] == 3


async def test_import_duplicate_email_reports_duplicate(
    client: AsyncClient, admin_headers: dict
) -> None:
    email = f"dup_import_{uuid4().hex[:6]}@test.com"
    # Cria o candidato previamente
    await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Pré-existente", "email": email},
        headers=admin_headers,
    )

    content = _csv([f"Duplicado,{email},,"])
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(content)],
        headers=admin_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["duplicates"] == 1
    assert body["created"] == 0


async def test_import_row_without_contact_reports_error(
    client: AsyncClient, admin_headers: dict
) -> None:
    content = _csv(["Sem Contato,,,"])
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(content)],
        headers=admin_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    _assert_import_response_shape(body)
    assert body["created"] == 0
    assert len(body["errors"]) == 1
    _assert_error_item_shape(body["errors"][0])


async def test_import_missing_required_column_returns_422(
    client: AsyncClient, admin_headers: dict
) -> None:
    # CSV sem coluna 'nome'
    content = b"email,telefone\ntest@test.com,11999\n"
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(content)],
        headers=admin_headers,
    )
    assert resp.status_code == 422
    assert "nome" in resp.json()["detail"].lower()


async def test_import_with_valid_job_links_candidates(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict,
    published_job,
) -> None:
    u = uuid4().hex[:8]
    content = _csv([f"Com Vaga {u},{u}@test.com,,"])
    resp = await client.post(
        "/api/v1/candidaturas/import",
        data={"default_job_id": str(published_job.id)},
        files=[_csv_file(content)],
        headers=admin_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    _assert_import_response_shape(body)
    assert body["created"] == 1
    assert body["linked"] == 1
    assert body["preview"][0]["job_linked"] is True
    assert body["preview"][0]["analysis"]["reason"] == "request_analysis_false"


async def test_import_rejects_more_than_200_rows(
    client: AsyncClient,
    admin_headers: dict,
) -> None:
    rows = [f"Candidato {i},bulk_{uuid4().hex}_{i}@test.com,," for i in range(201)]
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(_csv(rows))],
        headers=admin_headers,
    )
    assert resp.status_code == 422
    assert "200" in resp.json()["detail"]


async def test_import_rejects_file_larger_than_2mb(
    client: AsyncClient,
    admin_headers: dict,
) -> None:
    content = b"nome,email,telefone,vaga,observacao\n" + b"a" * (2 * 1024 * 1024)
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(content)],
        headers=admin_headers,
    )
    assert resp.status_code == 422
    assert "Arquivo muito grande" in resp.json()["detail"]


async def test_import_rejects_invalid_encoding(
    client: AsyncClient,
    admin_headers: dict,
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(b"nome,email\nJoao,\xff@test.com\n")],
        headers=admin_headers,
    )
    assert resp.status_code == 422
    assert "UTF-8" in resp.json()["detail"]


async def test_import_rejects_csv_without_header(
    client: AsyncClient,
    admin_headers: dict,
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(b"Joao Sem Header,joao_sem_header@test.com\n")],
        headers=admin_headers,
    )
    assert resp.status_code == 422
    assert "sem cabe" in resp.json()["detail"].lower()


async def test_import_invalid_default_job_id_does_not_create_candidates(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict,
) -> None:
    email = f"invalid_job_{uuid4().hex[:8]}@test.com"
    resp = await client.post(
        "/api/v1/candidaturas/import",
        data={"default_job_id": str(uuid4())},
        files=[_csv_file(_csv([f"Sem Vaga,{email},,"]))],
        headers=admin_headers,
    )
    assert resp.status_code == 404
    assert "Vaga" in resp.json()["detail"]
    assert await _count_candidates_by_email(db_session, email) == 0


async def test_import_reports_link_error_when_candidate_active_in_other_job(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user_email = f"admin_import_link_{uuid4().hex[:8]}@test.com"
    await _create_active_user(db_session, user_email, "secret123", UserRole.ADMIN)
    headers = await _auth_headers(client, user_email, "secret123")
    current_job = await _create_published_job(db_session, title="Current")
    destination_job = await _create_published_job(db_session, title="Destination")
    candidate_email = f"active_elsewhere_{uuid4().hex[:8]}@test.com"

    manual = await client.post(
        "/api/v1/candidaturas/manual",
        json={
            "full_name": "Ativo Em Outra",
            "email": candidate_email,
            "job_id": str(current_job.id),
        },
        headers=headers,
    )
    assert manual.status_code == 201
    assert manual.json()["job_linked"] is True

    resp = await client.post(
        "/api/v1/candidaturas/import",
        data={"default_job_id": str(destination_job.id)},
        files=[_csv_file(_csv([f"Ativo Em Outra,{candidate_email},,"]))],
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    _assert_import_response_shape(body)
    assert body["created"] == 0
    assert body["duplicates"] == 1
    assert body["linked"] == 0
    assert len(body["errors"]) == 1
    _assert_error_item_shape(body["errors"][0])
    assert body["errors"][0]["row"] == 2
    assert "não vinculado" in body["errors"][0]["message"]
    assert "outra vaga" in body["errors"][0]["message"]
    assert len(body["preview"]) == 1
    _assert_preview_item_shape(body["preview"][0])
    assert body["preview"][0]["status"] == "duplicate"
    assert body["preview"][0]["job_linked"] is False
    assert "outra vaga" in body["preview"][0]["job_link_error"]


async def test_import_does_not_request_analysis_by_default_for_existing_resume(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user_email = f"admin_no_analysis_{uuid4().hex[:8]}@test.com"
    user = await _create_active_user(db_session, user_email, "secret123", UserRole.ADMIN)
    headers = await _auth_headers(client, user_email, "secret123")
    job = await _create_published_job(db_session)
    candidate_email = f"ready_no_analysis_{uuid4().hex[:8]}@test.com"
    await _seed_candidate_with_resume(db_session, created_by=user.id, email=candidate_email)

    resp = await client.post(
        "/api/v1/candidaturas/import",
        data={"default_job_id": str(job.id)},
        files=[_csv_file(_csv([f"Ready No Analysis,{candidate_email},,"]))],
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    _assert_import_response_shape(body)
    assert body["linked"] == 1
    assert body["errors"] == []
    assert await _count_analyses(db_session) == 0
    _assert_preview_item_shape(body["preview"][0])
    assert body["preview"][0]["analysis"]["reason"] == "request_analysis_false"


async def test_import_request_analysis_skips_missing_resume_without_token(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user_email = f"admin_missing_resume_{uuid4().hex[:8]}@test.com"
    await _create_active_user(db_session, user_email, "secret123", UserRole.ADMIN)
    headers = await _auth_headers(client, user_email, "secret123")
    job = await _create_published_job(db_session)
    candidate_email = f"missing_resume_{uuid4().hex[:8]}@test.com"

    resp = await client.post(
        "/api/v1/candidaturas/import",
        data={"default_job_id": str(job.id), "request_analysis": "true"},
        files=[_csv_file(_csv([f"Sem Curriculo,{candidate_email},,"]))],
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    _assert_import_response_shape(body)
    assert body["created"] == 1
    assert body["linked"] == 1
    assert await _count_analyses(db_session) == 0
    _assert_preview_item_shape(body["preview"][0])
    assert body["preview"][0]["analysis"]["reason"] == "analysis_skipped_no_resume"


async def test_import_request_analysis_respects_daily_limit(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_USER", 1)
    user_email = f"admin_limit_{uuid4().hex[:8]}@test.com"
    user = await _create_active_user(db_session, user_email, "secret123", UserRole.ADMIN)
    headers = await _auth_headers(client, user_email, "secret123")
    await _seed_completed_analysis_for_user(db_session, requested_by=user.id)
    job = await _create_published_job(db_session)
    candidate_email = f"ready_limit_{uuid4().hex[:8]}@test.com"
    await _seed_candidate_with_resume(db_session, created_by=user.id, email=candidate_email)

    before_count = await _count_analyses(db_session)
    resp = await client.post(
        "/api/v1/candidaturas/import",
        data={"default_job_id": str(job.id), "request_analysis": "true"},
        files=[_csv_file(_csv([f"Ready Limit,{candidate_email},,"]))],
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    _assert_import_response_shape(body)
    assert body["linked"] == 1
    assert await _count_analyses(db_session) == before_count
    _assert_preview_item_shape(body["preview"][0])
    assert body["preview"][0]["analysis"]["blocked"] is True
    assert body["preview"][0]["analysis"]["reason"] == "auto_analysis_blocked_daily_limit"


async def test_dispatcher_does_not_bypass_daily_limit(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_USER", 1)
    user = await _create_active_user(
        db_session,
        f"dispatcher_limit_{uuid4().hex[:8]}@test.com",
        "secret123",
        UserRole.ADMIN,
    )
    await _seed_completed_analysis_for_user(db_session, requested_by=user.id)
    job = await _create_published_job(db_session)
    candidate, version = await _seed_candidate_with_resume(
        db_session,
        created_by=user.id,
        email=f"dispatcher_ready_{uuid4().hex[:8]}@test.com",
    )
    db_session.add(
        CandidateJobPipelineModel(
            candidate_job_pipeline_id=uuid4(),
            candidate_id=candidate.id,
            job_id=job.id,
            resume_version_id=version.id,
            link_status="active",
            relationship_status="active",
            is_terminal=False,
            pipeline_stage="entry",
            pipeline_status="active",
            source="import",
        )
    )
    await db_session.commit()

    before_count = await _count_analyses(db_session)
    decision = await CandidateJobAnalysisDispatcher(db_session).request_auto_analysis(
        candidate_id=candidate.id,
        job_id=job.id,
        requested_by=user.id,
    )
    assert decision.blocked is True
    assert decision.reason == "auto_analysis_blocked_daily_limit"
    assert await _count_analyses(db_session) == before_count


async def test_import_enqueue_failure_does_not_fail_import(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _raise_enqueue(_analysis_id):
        raise RuntimeError("broker down")

    monkeypatch.setattr(
        "src.application.services.analysis_dispatch_service.enqueue_analysis",
        _raise_enqueue,
    )
    user_email = f"admin_enqueue_fail_{uuid4().hex[:8]}@test.com"
    user = await _create_active_user(db_session, user_email, "secret123", UserRole.ADMIN)
    headers = await _auth_headers(client, user_email, "secret123")
    await _seed_active_analysis_config(db_session, created_by=user.id)
    job = await _create_published_job(db_session)
    candidate_email = f"enqueue_fail_{uuid4().hex[:8]}@test.com"
    await _seed_candidate_with_resume(db_session, created_by=user.id, email=candidate_email)

    resp = await client.post(
        "/api/v1/candidaturas/import",
        data={"default_job_id": str(job.id), "request_analysis": "true"},
        files=[_csv_file(_csv([f"Enqueue Fail,{candidate_email},,"]))],
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    _assert_import_response_shape(body)
    assert body["linked"] == 1
    assert body["errors"] == []
    _assert_preview_item_shape(body["preview"][0])
    assert body["preview"][0]["analysis"]["reason"] == "analysis_enqueue_failed"
    failed = await db_session.scalar(
        sa.select(AnalysisModel)
        .where(AnalysisModel.status == "failed")
        .order_by(AnalysisModel.created_at.desc())
    )
    assert failed is not None
    assert failed.failure_reason == "analysis_enqueue_failed"
