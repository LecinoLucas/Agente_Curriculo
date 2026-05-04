from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_job_link_model import CandidateJobLinkModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password


def _job_payload(title: str) -> dict:
    return {
        "title": title,
        "description": "Backend role",
        "requirements": "Python, FastAPI",
        "job_area": "technology",
        "seniority_level": "mid",
        "work_model": "remote",
        "location": "Brasil",
        "salary_currency": "BRL",
        "priority": "normal",
    }


async def _create_user(session: AsyncSession, email: str, role: UserRole) -> User:
    repo = SQLAlchemyUserRepository(session)
    user = User.create(
        email=email,
        password_hash=hash_password("password123"),
        full_name=f"{role.value.title()} User",
        role=role,
    )
    user.verify_email()
    await repo.save(user)
    await session.commit()
    return user


async def _auth_headers(client: AsyncClient, email: str) -> dict[str, str]:
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _create_published_job(client: AsyncClient, db_session: AsyncSession, headers: dict[str, str], title: str) -> UUID:
    job_resp = await client.post("/api/v1/jobs", json=_job_payload(title), headers=headers)
    assert job_resp.status_code == 201, job_resp.text
    job_id = UUID(job_resp.json()["id"])

    # Keep this helper deterministic for pipeline tests by avoiding publish side-effects.
    job = await db_session.scalar(sa.select(JobModel).where(JobModel.id == job_id))
    assert job is not None
    job.status = "published"
    await db_session.commit()
    return job_id


async def _create_candidate(client: AsyncClient, headers: dict[str, str], name: str, email: str) -> UUID:
    resp = await client.post(
        "/api/v1/candidates",
        json={"full_name": name, "email": email},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return UUID(resp.json()["id"])


async def _ensure_analysis_prerequisites(db_session: AsyncSession, created_by: UUID) -> None:
    active_model = await db_session.scalar(
        sa.select(AIModelModel).where(AIModelModel.is_active.is_(True)).limit(1)
    )
    if active_model is None:
        db_session.add(
            AIModelModel(
                provider="anthropic",
                model_id=f"claude-test-{uuid4().hex[:8]}",
                model_name="Claude Test",
                is_active=True,
            )
        )

    active_prompt = await db_session.scalar(
        sa.select(PromptTemplateModel)
        .where(
            PromptTemplateModel.template_type == "full_analysis",
            PromptTemplateModel.is_active.is_(True),
        )
        .limit(1)
    )
    if active_prompt is None:
        db_session.add(
            PromptTemplateModel(
                name=f"pipeline-transfer-prompt-{uuid4().hex[:8]}",
                version=1,
                template_type="full_analysis",
                system_prompt="Analyze resume",
                user_prompt_template="Resume: {resume_text} Context: {job_context}",
                is_active=True,
                created_by=created_by,
            )
        )
    await db_session.commit()


async def _attach_resume_version_with_text(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    created_by: UUID,
) -> UUID:
    resume = ResumeModel(
        candidate_id=candidate_id,
        title="CV principal",
        status="active",
        current_version=1,
        created_by=created_by,
    )
    db_session.add(resume)
    await db_session.flush()

    version = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test-bucket",
        s3_key=f"resumes/{uuid4().hex}.pdf",
        original_file_name="cv.pdf",
        file_size_bytes=1234,
        file_hash_sha256="a" * 64,
        mime_type="application/pdf",
        extracted_text="Senior Python engineer with FastAPI and PostgreSQL experience.",
        extraction_status="completed",
        uploaded_by=created_by,
    )
    db_session.add(version)
    await db_session.commit()
    return version.id


@pytest.mark.asyncio
async def test_candidate_without_job_starts_waiting_for_job(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-nojob-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    candidate_id = await _create_candidate(
        client,
        headers,
        "No Job Candidate",
        f"nojob-{uuid4().hex[:6]}@test.com",
    )

    overview = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert overview.status_code == 200
    payload = overview.json()
    assert payload["active_job_id"] is None
    assert payload["active_job"] is None
    assert payload["latest_analysis"] is None
    assert payload["latest_analysis_pipeline"] is None
    assert payload["pipeline_entries"] == []
    assert payload["candidate_job_links"] == []


@pytest.mark.asyncio
async def test_candidate_can_be_added_when_no_active_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-add-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    job_id = await _create_published_job(client, db_session, headers, "Job A")
    candidate_id = await _create_candidate(
        client,
        headers,
        "Add Candidate",
        f"add-{uuid4().hex[:6]}@test.com",
    )

    add_resp = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_id), "initial_stage": "entry"},
        headers=headers,
    )
    assert add_resp.status_code == 200, add_resp.text

    overview = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert overview.status_code == 200
    payload = overview.json()
    assert payload["active_job_id"] == str(job_id)
    assert payload["active_job"] is not None
    assert payload["active_job"]["id"] == str(job_id)
    assert len(payload["pipeline_entries"]) == 1
    assert payload["pipeline_entries"][0]["job_id"] == str(job_id)
    active_links = [row for row in payload["candidate_job_links"] if row["status"] == "active"]
    assert len(active_links) == 1
    assert active_links[0]["job_id"] == str(job_id)


@pytest.mark.asyncio
async def test_transfer_flow_allows_return_to_previous_job(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-transfer-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    job_a = await _create_published_job(client, db_session, headers, "Job A")
    job_b = await _create_published_job(client, db_session, headers, "Job B")
    candidate_id = await _create_candidate(
        client,
        headers,
        "Transfer Candidate",
        f"transfer-{uuid4().hex[:6]}@test.com",
    )

    add_a = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_a), "initial_stage": "entry"},
        headers=headers,
    )
    assert add_a.status_code == 200

    transfer_b = await client.patch(
        f"/api/v1/pipeline/{candidate_id}/transfer-job",
        json={"from_job_id": str(job_a), "to_job_id": str(job_b), "reason": "Mudança de vaga"},
        headers=headers,
    )
    assert transfer_b.status_code == 200, transfer_b.text

    transfer_back_a = await client.patch(
        f"/api/v1/pipeline/{candidate_id}/transfer-job",
        json={"from_job_id": str(job_b), "to_job_id": str(job_a), "reason": "Retorno ao contexto"},
        headers=headers,
    )
    assert transfer_back_a.status_code == 200, transfer_back_a.text

    overview = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert overview.status_code == 200
    payload = overview.json()
    assert len(payload["pipeline_entries"]) == 1
    assert payload["pipeline_entries"][0]["job_id"] == str(job_a)


@pytest.mark.asyncio
async def test_add_candidate_with_active_pipeline_returns_clear_409(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-conflict-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    job_a = await _create_published_job(client, db_session, headers, "Job A")
    job_b = await _create_published_job(client, db_session, headers, "Job B")
    candidate_id = await _create_candidate(
        client,
        headers,
        "Conflict Candidate",
        f"conflict-{uuid4().hex[:6]}@test.com",
    )

    add_a = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_a), "initial_stage": "entry"},
        headers=headers,
    )
    assert add_a.status_code == 200

    add_a_again = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_a), "initial_stage": "entry"},
        headers=headers,
    )
    assert add_a_again.status_code == 409
    assert add_a_again.json()["detail"] == "Candidato já está ativo nesta vaga."

    add_b_parallel = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_b), "initial_stage": "entry"},
        headers=headers,
    )
    assert add_b_parallel.status_code == 409
    assert add_b_parallel.json()["detail"] == (
        "Candidato já possui vínculo ativo com outra vaga. Use transferência para mover o candidato."
    )


@pytest.mark.asyncio
async def test_add_candidate_to_job_creates_single_pending_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-add-analysis-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    await _ensure_analysis_prerequisites(db_session, recruiter.id)

    job_id = await _create_published_job(client, db_session, headers, "Job A")
    candidate_id = await _create_candidate(
        client,
        headers,
        "Add Analysis Candidate",
        f"add-analysis-{uuid4().hex[:6]}@test.com",
    )
    await _attach_resume_version_with_text(db_session, candidate_id=candidate_id, created_by=recruiter.id)

    add_resp = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_id), "initial_stage": "entry"},
        headers=headers,
    )
    assert add_resp.status_code == 200, add_resp.text

    analyses_for_job = await db_session.execute(
        sa.select(AnalysisModel)
        .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
        .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
        .where(
            ResumeModel.candidate_id == candidate_id,
            AnalysisModel.job_id == job_id,
        )
    )
    rows = analyses_for_job.scalars().all()
    assert len(rows) == 1
    status_value = getattr(rows[0].status, "value", rows[0].status)
    assert status_value in {"pending", "processing", "completed"}


@pytest.mark.asyncio
async def test_add_candidate_to_job_persists_task_id_on_enqueue(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-taskid-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    await _ensure_analysis_prerequisites(db_session, recruiter.id)

    job_id = await _create_published_job(client, db_session, headers, "Job Task ID")
    candidate_id = await _create_candidate(
        client,
        headers,
        "TaskId Candidate",
        f"taskid-{uuid4().hex[:6]}@test.com",
    )
    await _attach_resume_version_with_text(db_session, candidate_id=candidate_id, created_by=recruiter.id)

    add_resp = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_id), "initial_stage": "entry"},
        headers=headers,
    )
    assert add_resp.status_code == 200, add_resp.text

    analysis = await db_session.scalar(
        sa.select(AnalysisModel)
        .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
        .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
        .where(
            ResumeModel.candidate_id == candidate_id,
            AnalysisModel.job_id == job_id,
        )
        .order_by(AnalysisModel.created_at.desc())
        .limit(1)
    )
    assert analysis is not None
    assert analysis.task_id is not None
    assert analysis.queue_name == "analysis"
    status_value = getattr(analysis.status, "value", analysis.status)
    assert status_value in {"pending", "processing", "completed"}


@pytest.mark.asyncio
async def test_transfer_creates_new_analysis_for_destination_job(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-analysis-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    await _ensure_analysis_prerequisites(db_session, recruiter.id)

    job_a = await _create_published_job(client, db_session, headers, "Job A")
    job_b = await _create_published_job(client, db_session, headers, "Job B")
    candidate_id = await _create_candidate(
        client,
        headers,
        "Analysis Candidate",
        f"analysis-{uuid4().hex[:6]}@test.com",
    )
    await _attach_resume_version_with_text(db_session, candidate_id=candidate_id, created_by=recruiter.id)

    add_a = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_a), "initial_stage": "entry"},
        headers=headers,
    )
    assert add_a.status_code == 200, add_a.text

    transfer_b = await client.patch(
        f"/api/v1/pipeline/{candidate_id}/transfer-job",
        json={"from_job_id": str(job_a), "to_job_id": str(job_b), "reason": "Mudança de vaga"},
        headers=headers,
    )
    assert transfer_b.status_code == 200, transfer_b.text

    analysis_for_b = await db_session.scalar(
        sa.select(AnalysisModel)
        .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
        .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
        .where(
            ResumeModel.candidate_id == candidate_id,
            AnalysisModel.job_id == job_b,
        )
        .order_by(AnalysisModel.created_at.desc())
        .limit(1)
    )
    assert analysis_for_b is not None
    status_value = getattr(analysis_for_b.status, "value", analysis_for_b.status)
    assert status_value in {"pending", "processing", "completed"}


@pytest.mark.asyncio
async def test_overview_uses_active_job_analysis_after_transfer(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-active-analysis-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    await _ensure_analysis_prerequisites(db_session, recruiter.id)

    job_a = await _create_published_job(client, db_session, headers, "Job A")
    job_b = await _create_published_job(client, db_session, headers, "Job B")
    candidate_id = await _create_candidate(
        client,
        headers,
        "Scoped Analysis Candidate",
        f"scoped-analysis-{uuid4().hex[:6]}@test.com",
    )
    await _attach_resume_version_with_text(db_session, candidate_id=candidate_id, created_by=recruiter.id)

    add_a = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_a), "initial_stage": "entry"},
        headers=headers,
    )
    assert add_a.status_code == 200, add_a.text

    analysis_for_a = await db_session.scalar(
        sa.select(AnalysisModel)
        .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
        .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
        .where(
            ResumeModel.candidate_id == candidate_id,
            AnalysisModel.job_id == job_a,
        )
        .order_by(AnalysisModel.created_at.desc())
        .limit(1)
    )
    assert analysis_for_a is not None
    analysis_for_a.status = "completed"
    analysis_for_a.completed_at = datetime.now(UTC)
    analysis_for_a.updated_at = datetime.now(UTC)
    db_session.add(AnalysisResultModel(analysis_id=analysis_for_a.id, overall_score="95.00"))
    await db_session.commit()

    transfer_b = await client.patch(
        f"/api/v1/pipeline/{candidate_id}/transfer-job",
        json={"from_job_id": str(job_a), "to_job_id": str(job_b), "reason": "Mudança de vaga"},
        headers=headers,
    )
    assert transfer_b.status_code == 200, transfer_b.text

    analysis_for_b = await db_session.scalar(
        sa.select(AnalysisModel)
        .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
        .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
        .where(
            ResumeModel.candidate_id == candidate_id,
            AnalysisModel.job_id == job_b,
        )
        .order_by(AnalysisModel.created_at.desc())
        .limit(1)
    )
    assert analysis_for_b is not None
    assert analysis_for_b.id != analysis_for_a.id

    overview = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert overview.status_code == 200, overview.text
    payload = overview.json()
    assert payload["active_job_id"] == str(job_b)
    assert payload["latest_analysis"] is not None
    assert payload["latest_analysis"]["analysis_id"] == str(analysis_for_b.id)


@pytest.mark.asyncio
async def test_transferred_link_not_treated_as_active(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-link-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    job_a = await _create_published_job(client, db_session, headers, "Job A")
    job_b = await _create_published_job(client, db_session, headers, "Job B")
    candidate_id = await _create_candidate(
        client,
        headers,
        "Link Candidate",
        f"link-{uuid4().hex[:6]}@test.com",
    )

    add_a = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_a), "initial_stage": "entry"},
        headers=headers,
    )
    assert add_a.status_code == 200

    transfer_b = await client.patch(
        f"/api/v1/pipeline/{candidate_id}/transfer-job",
        json={"from_job_id": str(job_a), "to_job_id": str(job_b), "reason": "Mudança de vaga"},
        headers=headers,
    )
    assert transfer_b.status_code == 200

    link_a = await db_session.scalar(
        sa.select(CandidateJobLinkModel).where(
            CandidateJobLinkModel.candidate_id == candidate_id,
            CandidateJobLinkModel.job_id == job_a,
            CandidateJobLinkModel.deleted_at.is_(None),
        )
    )
    link_b = await db_session.scalar(
        sa.select(CandidateJobLinkModel).where(
            CandidateJobLinkModel.candidate_id == candidate_id,
            CandidateJobLinkModel.job_id == job_b,
            CandidateJobLinkModel.deleted_at.is_(None),
        )
    )
    assert link_a is not None and link_a.status == "transferred"
    assert link_b is not None and link_b.status == "active"

    score_old_job = await client.get(
        f"/api/v1/jobs/{job_a}/candidates/{candidate_id}/score-explanation",
        headers=headers,
    )
    assert score_old_job.status_code == 422


@pytest.mark.asyncio
async def test_jobs_link_endpoint_creates_pipeline_not_orphan_link(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-jobslink-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    job_id = await _create_published_job(client, db_session, headers, "Job A")
    candidate_id = await _create_candidate(
        client,
        headers,
        "Jobs Link Candidate",
        f"jobslink-{uuid4().hex[:6]}@test.com",
    )

    link_resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates",
        json={"candidate_id": str(candidate_id), "source": "manual"},
        headers=headers,
    )
    assert link_resp.status_code == 201, link_resp.text
    assert link_resp.json()["status"] == "active"

    overview = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert overview.status_code == 200
    payload = overview.json()
    assert any(entry["job_id"] == str(job_id) for entry in payload["pipeline_entries"])
    assert any(
        entry["job_id"] == str(job_id) and entry["status"] == "active"
        for entry in payload["candidate_job_links"]
    )
