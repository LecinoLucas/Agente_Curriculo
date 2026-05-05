from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.resume_service import MAX_PDF_UPLOAD_BYTES
from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import SkillModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password


async def _create_active_user(
    session: AsyncSession,
    email: str,
    password: str,
    role: UserRole,
) -> User:
    repo = SQLAlchemyUserRepository(session)
    user = User.create(
        email=email,
        password_hash=hash_password(password),
        full_name=f"{role.value.title()} User",
        role=role,
    )
    user.verify_email()
    await repo.save(user)
    await session.commit()
    return user


async def _auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _create_linked_candidate(
    session: AsyncSession,
    user: User,
    created_by: UUID,
) -> CandidateModel:
    """Create a Candidate model linked to a user via user_id."""
    candidate = CandidateModel(
        full_name=user.full_name,
        email=user.email,
        user_id=user.id,
        created_by=created_by,
    )
    session.add(candidate)
    await session.flush()
    return candidate


def _pdf_with_text(text: str) -> bytes:
    stream = f"BT /F1 24 Tf 72 720 Td ({text}) Tj ET"
    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        (
            b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n"
        ),
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
        (
            f"5 0 obj << /Length {len(stream.encode())} >> stream\n"
            f"{stream}\nendstream endobj\n"
        ).encode(),
    ]
    body = b"%PDF-1.4\n"
    offsets = [0]
    for obj in objects:
        offsets.append(len(body))
        body += obj

    xref_offset = len(body)
    xref = f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets[1:]:
        xref += f"{offset:010d} 00000 n \n".encode()

    trailer = (
        f"trailer << /Root 1 0 R /Size {len(objects) + 1} >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n"
    ).encode()
    return body + xref + trailer


@pytest.mark.asyncio
async def test_candidate_can_manage_own_resume_lifecycle(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate_user = await _create_active_user(
        db_session,
        "candidate-resume@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    recruiter = await _create_active_user(
        db_session,
        "recruiter-resume@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    await _create_linked_candidate(db_session, candidate_user, recruiter.id)
    await db_session.commit()

    headers = await _auth_headers(client, "candidate-resume@test.com", "password123")

    upload = await client.post("/api/v1/resumes", headers=headers)
    assert upload.status_code == 202
    uploaded = upload.json()
    assert uploaded["upload_url"].startswith("https://upload.local/resumes/")
    assert uploaded["upload_fields"]["Content-Type"] == "application/pdf"

    resume_id = uploaded["resume_id"]
    detail = await client.get(f"/api/v1/resumes/{resume_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["title"] == "Currículo principal"
    assert len(detail.json()["versions"]) == 1

    listing = await client.get("/api/v1/resumes", headers=headers)
    assert listing.status_code == 200
    assert any(item["id"] == resume_id for item in listing.json())

    update = await client.patch(
        f"/api/v1/resumes/{resume_id}",
        json={"title": "Currículo Backend"},
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()["title"] == "Currículo Backend"

    archive = await client.patch(f"/api/v1/resumes/{resume_id}/archive", headers=headers)
    assert archive.status_code == 200
    assert archive.json()["status"] == "archived"

    activate = await client.patch(f"/api/v1/resumes/{resume_id}/activate", headers=headers)
    assert activate.status_code == 200
    assert activate.json()["status"] == "active"

    delete = await client.delete(f"/api/v1/resumes/{resume_id}", headers=headers)
    assert delete.status_code == 204

    deleted_detail = await client.get(f"/api/v1/resumes/{resume_id}", headers=headers)
    assert deleted_detail.status_code == 404


@pytest.mark.asyncio
async def test_recruiter_must_inform_candidate_id_when_starting_resume_upload(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(
        db_session,
        "recruiter-resume-missing-candidate@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(
        client,
        "recruiter-resume-missing-candidate@test.com",
        "password123",
    )

    response = await client.post("/api/v1/resumes", headers=headers)

    assert response.status_code == 422
    assert response.json()["detail"] == "candidate_id é obrigatório para este perfil"


@pytest.mark.asyncio
async def test_recruiter_can_start_resume_upload_for_explicit_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recruiter = await _create_active_user(
        db_session,
        "recruiter-explicit-candidate@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    await _create_active_user(
        db_session,
        "candidate-explicit-resume@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    headers = await _auth_headers(client, "recruiter-explicit-candidate@test.com", "password123")

    candidate = await db_session.scalar(
        sa.select(CandidateModel).where(CandidateModel.email == "candidate-explicit-resume@test.com")
    )
    if candidate is None:
        candidate = CandidateModel(
            user_id=None,
            full_name="Candidate Explicit Resume",
            email="candidate-explicit-resume@test.com",
            created_by=recruiter.id,
        )
        db_session.add(candidate)
        await db_session.commit()
        await db_session.refresh(candidate)

    upload = await client.post(
        "/api/v1/resumes",
        headers=headers,
        json={"candidate_id": str(candidate.id)},
    )

    assert upload.status_code == 202
    body = upload.json()
    assert body["candidate_id"] == str(candidate.id)

    resume = await db_session.scalar(
        sa.select(ResumeModel).where(ResumeModel.id == UUID(body["resume_id"]))
    )
    assert resume is not None
    assert resume.candidate_id == candidate.id

    recruiter_candidate = await db_session.scalar(
        sa.select(CandidateModel).where(CandidateModel.user_id == recruiter.id)
    )
    assert recruiter_candidate is None


@pytest.mark.asyncio
async def test_candidate_can_upload_pdf_and_extract_text(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate_user = await _create_active_user(
        db_session,
        "candidate-pdf-upload@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    recruiter = await _create_active_user(
        db_session,
        "recruiter-pdf-upload@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    await _create_linked_candidate(db_session, candidate_user, recruiter.id)
    await db_session.commit()

    headers = await _auth_headers(client, "candidate-pdf-upload@test.com", "password123")

    upload = await client.post("/api/v1/resumes", headers=headers)
    assert upload.status_code == 202
    resume_id = upload.json()["resume_id"]
    version_id = upload.json()["version_id"]
    pdf = _pdf_with_text("Lucas Backend Python FastAPI")

    response = await client.post(
        f"/api/v1/resumes/{resume_id}/upload",
        headers=headers,
        files={"file": ("lucas-resume.pdf", pdf, "application/pdf")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["resume_id"] == resume_id
    assert body["version_id"] == version_id
    assert body["original_file_name"] == "lucas-resume.pdf"
    assert body["file_size_bytes"] == len(pdf)
    assert body["extraction_status"] == "completed"
    assert body["page_count"] == 1
    assert body["word_count"] == 4
    assert body["analysis_auto_requested"] is False
    assert body["analysis_id"] is None
    assert body["analysis_status"] is None

    version = await db_session.scalar(
        sa.select(ResumeVersionModel).where(ResumeVersionModel.id == UUID(version_id))
    )
    assert version is not None
    assert version.extracted_text == "Lucas Backend Python FastAPI"
    assert version.extraction_status == "completed"


@pytest.mark.asyncio
async def test_candidate_upload_pdf_does_not_request_analysis_even_when_ai_is_configured(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate_user = await _create_active_user(
        db_session,
        "candidate-upload-auto-analysis@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    recruiter = await _create_active_user(
        db_session,
        "recruiter-upload-auto-analysis@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    candidate = candidate_user
    await _create_linked_candidate(db_session, candidate_user, recruiter.id)
    await db_session.commit()

    headers = await _auth_headers(client, "candidate-upload-auto-analysis@test.com", "password123")

    upload = await client.post("/api/v1/resumes", headers=headers)
    assert upload.status_code == 202
    resume_id = upload.json()["resume_id"]
    version_id = UUID(upload.json()["version_id"])

    ai_model = AIModelModel(
        provider="anthropic",
        model_id=f"claude-upload-auto-{uuid4()}",
        model_name="Claude Upload Auto Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"upload_auto_prompt_{uuid4()}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="Analyze resume",
        is_active=True,
        created_by=candidate.id,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.commit()

    pdf = _pdf_with_text("Marina Python SQL FastAPI")
    response = await client.post(
        f"/api/v1/resumes/{resume_id}/upload",
        headers=headers,
        files={"file": ("marina-resume.pdf", pdf, "application/pdf")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["analysis_auto_requested"] is False
    assert body["analysis_id"] is None
    assert body["analysis_status"] is None

    analyses = (
        await db_session.execute(
            sa.select(AnalysisModel).where(AnalysisModel.resume_version_id == version_id)
        )
    ).scalars().all()
    assert analyses == []


@pytest.mark.asyncio
async def test_candidate_upload_pdf_does_not_create_analysis_when_enqueue_would_fail(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    candidate_user = await _create_active_user(
        db_session,
        "candidate-upload-enqueue-fails@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    recruiter = await _create_active_user(
        db_session,
        "recruiter-upload-enqueue-fails@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    candidate = candidate_user
    await _create_linked_candidate(db_session, candidate_user, recruiter.id)
    await db_session.commit()

    headers = await _auth_headers(client, "candidate-upload-enqueue-fails@test.com", "password123")

    upload = await client.post("/api/v1/resumes", headers=headers)
    assert upload.status_code == 202
    resume_id = upload.json()["resume_id"]

    ai_model = AIModelModel(
        provider="anthropic",
        model_id=f"claude-upload-fail-{uuid4()}",
        model_name="Claude Upload Fail Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"upload_fail_prompt_{uuid4()}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="Analyze resume",
        is_active=True,
        created_by=candidate.id,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.commit()

    def _raise_enqueue_error(analysis_id):
        raise RuntimeError(f"queue unavailable for {analysis_id}")

    monkeypatch.setattr(
        "src.interface.api.routers.resumes.enqueue_analysis",
        _raise_enqueue_error,
        raising=False,
    )

    pdf = _pdf_with_text("Marina Python SQL FastAPI")
    response = await client.post(
        f"/api/v1/resumes/{resume_id}/upload",
        headers=headers,
        files={"file": ("marina-resume.pdf", pdf, "application/pdf")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["analysis_auto_requested"] is False
    assert body["analysis_id"] is None
    assert body["analysis_status"] is None

    analyses = (
        await db_session.execute(sa.select(AnalysisModel))
    ).scalars().all()
    assert analyses == []


@pytest.mark.asyncio
async def test_candidate_cannot_request_analysis_before_text_extraction(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate_user = await _create_active_user(
        db_session,
        "candidate-analysis-not-ready@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    recruiter = await _create_active_user(
        db_session,
        "recruiter-analysis-not-ready@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    await _create_linked_candidate(db_session, candidate_user, recruiter.id)
    await db_session.commit()

    headers = await _auth_headers(client, "candidate-analysis-not-ready@test.com", "password123")

    upload = await client.post("/api/v1/resumes", headers=headers)
    assert upload.status_code == 202
    version_id = upload.json()["version_id"]

    response = await client.post(
        f"/api/v1/analyses?resume_version_id={version_id}&job_id={uuid4()}",
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Currículo ainda em processamento. Faça upload do PDF e aguarde extração antes de solicitar análise."
    )


@pytest.mark.asyncio
async def test_candidate_cannot_upload_pdf_larger_than_limit(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate_user = await _create_active_user(
        db_session,
        "candidate-pdf-too-large@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    recruiter = await _create_active_user(
        db_session,
        "recruiter-pdf-too-large@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    await _create_linked_candidate(db_session, candidate_user, recruiter.id)
    await db_session.commit()

    headers = await _auth_headers(client, "candidate-pdf-too-large@test.com", "password123")

    upload = await client.post("/api/v1/resumes", headers=headers)
    assert upload.status_code == 202
    resume_id = upload.json()["resume_id"]

    response = await client.post(
        f"/api/v1/resumes/{resume_id}/upload",
        headers=headers,
        files={
            "file": (
                "large-resume.pdf",
                b"%PDF-1.4\n" + b"x" * (MAX_PDF_UPLOAD_BYTES + 1),
                "application/pdf",
            )
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Arquivo PDF excede o limite de 10MB"


@pytest.mark.asyncio
async def test_candidate_can_view_operational_analysis_status(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate_user = await _create_active_user(
        db_session,
        "candidate-analysis-status@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    recruiter = await _create_active_user(
        db_session,
        "recruiter-analysis-status@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    candidate = candidate_user
    candidate_record = await _create_linked_candidate(
        db_session,
        candidate_user,
        recruiter.id,
    )
    await db_session.commit()

    headers = await _auth_headers(client, "candidate-analysis-status@test.com", "password123")

    upload = await client.post("/api/v1/resumes", headers=headers)
    assert upload.status_code == 202
    version_id = UUID(upload.json()["version_id"])

    ai_model = AIModelModel(
        provider="anthropic",
        model_id=f"claude-status-{uuid4()}",
        model_name="Claude Status Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"status_prompt_{uuid4()}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="Analyze resume",
        is_active=True,
        created_by=candidate.id,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.flush()

    now = datetime.now(UTC)
    analysis = AnalysisModel(
        id=uuid4(),
        resume_version_id=version_id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt.id,
        status="pending",
        requested_by=candidate.id,
        retry_count=2,
        failure_reason="provider timeout",
        next_retry_at=now,
        started_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(analysis)
    await db_session.commit()

    response = await client.get(f"/api/v1/analyses/{analysis.id}/status", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["analysis_id"] == str(analysis.id)
    assert body["status"] == "pending"
    assert body["retry_count"] == 2
    assert body["failure_reason"] == "provider timeout"
    assert body["next_retry_at"] is not None
    assert body["started_at"] is not None
    assert body["completed_at"] is None
    assert body["failed_at"] is None
    assert body["updated_at"] is not None


@pytest.mark.asyncio
async def test_candidate_can_view_matching_pipeline_summary(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate_user = await _create_active_user(
        db_session,
        "candidate-pipeline-status@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    recruiter = await _create_active_user(
        db_session,
        "recruiter-pipeline-status@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    candidate = candidate_user
    candidate_record = await _create_linked_candidate(
        db_session,
        candidate_user,
        recruiter.id,
    )
    await db_session.commit()

    candidate_headers = await _auth_headers(
        client,
        "candidate-pipeline-status@test.com",
        "password123",
    )
    recruiter_headers = await _auth_headers(
        client,
        "recruiter-pipeline-status@test.com",
        "password123",
    )

    upload = await client.post("/api/v1/resumes", headers=candidate_headers)
    assert upload.status_code == 202
    version_id = UUID(upload.json()["version_id"])

    ai_model = AIModelModel(
        provider="anthropic",
        model_id=f"claude-pipeline-{uuid4()}",
        model_name="Claude Pipeline Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"pipeline_prompt_{uuid4()}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="Analyze resume",
        is_active=True,
        created_by=candidate.id,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.flush()

    now = datetime.now(UTC)
    analysis = AnalysisModel(
        id=uuid4(),
        resume_version_id=version_id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt.id,
        status="completed",
        requested_by=candidate.id,
        created_at=now,
        updated_at=now,
        completed_at=now,
    )
    db_session.add(analysis)
    await db_session.commit()

    first_job = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Backend Pipeline One",
            "description": "Pipeline test",
            "requirements": "Python",
            "job_area": "technology",
            "seniority_level": "senior",
            "work_model": "remote",
            "location": "Brasil",
            "minimum_years_experience": "3.0",
            "salary_min": "10000.00",
            "salary_max": "15000.00",
            "salary_currency": "brl",
        },
        headers=recruiter_headers,
    )
    second_job = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Backend Pipeline Two",
            "description": "Pipeline test",
            "requirements": "FastAPI",
            "job_area": "technology",
            "seniority_level": "senior",
            "work_model": "remote",
            "location": "Brasil",
            "minimum_years_experience": "3.0",
            "salary_min": "11000.00",
            "salary_max": "16000.00",
            "salary_currency": "brl",
        },
        headers=recruiter_headers,
    )
    assert first_job.status_code == 201
    assert second_job.status_code == 201
    first_job_id = UUID(first_job.json()["id"])
    second_job_id = UUID(second_job.json()["id"])
    analysis.job_id = first_job_id

    python_skill = SkillModel(
        name="Python Resume Pipeline",
        normalized_name=f"python-resume-pipeline-{uuid4().hex[:8]}",
        category="backend",
        aliases=[],
        is_verified=True,
    )
    fastapi_skill = SkillModel(
        name="FastAPI Resume Pipeline",
        normalized_name=f"fastapi-resume-pipeline-{uuid4().hex[:8]}",
        category="backend",
        aliases=[],
        is_verified=True,
    )
    db_session.add_all([python_skill, fastapi_skill])
    await db_session.commit()

    for job_id in (first_job_id, second_job_id):
        for skill_id in (python_skill.id, fastapi_skill.id):
            add_skill = await client.post(
                f"/api/v1/jobs/{job_id}/skills",
                json={"skill_id": str(skill_id), "is_mandatory": True},
                headers=recruiter_headers,
            )
            assert add_skill.status_code == 201

    publish_first = await client.patch(
        f"/api/v1/jobs/{first_job_id}/publish",
        headers=recruiter_headers,
    )
    publish_second = await client.patch(
        f"/api/v1/jobs/{second_job_id}/publish",
        headers=recruiter_headers,
    )
    assert publish_first.status_code == 200
    assert publish_second.status_code == 200

    candidate_profile = CandidateProfileAnalysisModel(
        candidate_id=candidate_record.id,
        resume_version_id=version_id,
        provider=ai_model.provider,
        model_id=ai_model.model_id,
        prompt_version=str(prompt.version),
        skills_json=["python", "fastapi"],
        strengths_json=[],
        weaknesses_json=[],
        raw_response_json={},
    )
    job_profile = JobProfileAnalysisModel(
        job_id=first_job_id,
        provider=ai_model.provider,
        model_id=ai_model.model_id,
        prompt_version=str(prompt.version),
        job_signature_hash="a" * 64,
        required_skills_json=["python"],
        nice_to_have_skills_json=[],
        responsibilities_json=[],
        raw_response_json={},
    )
    db_session.add_all([candidate_profile, job_profile])
    await db_session.flush()

    db_session.add(
        CandidateJobMatchModel(
            candidate_id=candidate_record.id,
            job_id=first_job_id,
            resume_version_id=version_id,
            candidate_profile_analysis_id=candidate_profile.id,
            job_profile_analysis_id=job_profile.id,
            match_score="82.00",
            recommendation="strong_match",
            created_at=now,
        )
    )
    await db_session.commit()

    response = await client.get(
        f"/api/v1/analyses/{analysis.id}/pipeline",
        headers=candidate_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["analysis_id"] == str(analysis.id)
    assert body["job_id"] == str(first_job_id)
    assert body["analysis_status"] == "completed"
    assert body["matching_status"] == "completed"
    assert body["published_jobs_total"] == 1
    assert body["matched_jobs_count"] == 1
    assert body["pending_jobs_count"] == 0
    assert len(body["recent_matches"]) == 1
    assert body["recent_matches"][0]["job_id"] == str(first_job_id)
    assert body["recent_matches"][0]["recommendation"] == "strong_match"


@pytest.mark.asyncio
async def test_candidate_cannot_access_another_candidate_resume(
    client: AsyncClient,
    db_session: AsyncSession,
):
    owner_user = await _create_active_user(
        db_session,
        "resume-owner@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    intruder_user = await _create_active_user(
        db_session,
        "resume-intruder@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    recruiter = await _create_active_user(
        db_session,
        "recruiter-resume@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    await _create_linked_candidate(db_session, owner_user, recruiter.id)
    await _create_linked_candidate(db_session, intruder_user, recruiter.id)
    await db_session.commit()

    owner_headers = await _auth_headers(client, "resume-owner@test.com", "password123")
    intruder_headers = await _auth_headers(client, "resume-intruder@test.com", "password123")

    upload = await client.post("/api/v1/resumes", headers=owner_headers)
    assert upload.status_code == 202
    resume_id = upload.json()["resume_id"]

    forbidden_detail = await client.get(f"/api/v1/resumes/{resume_id}", headers=intruder_headers)
    assert forbidden_detail.status_code == 404

    forbidden_update = await client.patch(
        f"/api/v1/resumes/{resume_id}",
        json={"title": "Tentativa indevida"},
        headers=intruder_headers,
    )
    assert forbidden_update.status_code == 404


@pytest.mark.asyncio
async def test_recruiter_can_access_candidate_resume(client: AsyncClient, db_session: AsyncSession):
    owner_user = await _create_active_user(
        db_session,
        "resume-visible-owner@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    recruiter_user = await _create_active_user(
        db_session,
        "resume-recruiter@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    await _create_linked_candidate(db_session, owner_user, recruiter_user.id)
    await db_session.commit()

    owner_headers = await _auth_headers(client, "resume-visible-owner@test.com", "password123")
    recruiter_headers = await _auth_headers(client, "resume-recruiter@test.com", "password123")

    upload = await client.post("/api/v1/resumes", headers=owner_headers)
    assert upload.status_code == 202
    resume_id = upload.json()["resume_id"]

    detail = await client.get(f"/api/v1/resumes/{resume_id}", headers=recruiter_headers)
    assert detail.status_code == 200
    assert detail.json()["id"] == resume_id
