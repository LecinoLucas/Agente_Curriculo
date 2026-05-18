from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import CandidateProfileAnalysisModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from tests.integration.helpers import _auth_headers, _create_active_user


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> tuple[dict[str, str], UUID]:
    email = f"filters-{uuid4().hex[:8]}@example.com"
    user = await _create_active_user(db_session, email, "pass1234", UserRole.RECRUITER)
    headers = await _auth_headers(client, email, "pass1234")
    return headers, user.id


async def _make_candidate(
    db_session: AsyncSession,
    created_by: UUID,
    *,
    full_name: str,
    email: str,
    city: str | None = None,
    state: str | None = None,
    salary_expectation: str | None = None,
    desired_contract_type: str | None = None,
    application_source: str = "manual",
) -> CandidateModel:
    candidate = CandidateModel(
        full_name=full_name,
        email=email,
        phone="(11) 99999-0000",
        cpf="123.456.789-00",
        location_city=city,
        location_state=state,
        salary_expectation=salary_expectation,
        desired_contract_type=desired_contract_type,
        application_source=application_source,
        created_by=created_by,
    )
    db_session.add(candidate)
    await db_session.flush()
    return candidate


async def _make_resume(db_session: AsyncSession, candidate_id: UUID, created_by: UUID) -> ResumeVersionModel:
    resume = ResumeModel(candidate_id=candidate_id, title="Currículo", created_by=created_by)
    db_session.add(resume)
    await db_session.flush()
    version = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="bucket",
        s3_key=f"resume-{uuid4().hex}.pdf",
        original_file_name="cv.pdf",
        file_size_bytes=1234,
        file_hash_sha256=hashlib.sha256(uuid4().bytes).hexdigest(),
        uploaded_by=created_by,
    )
    db_session.add(version)
    await db_session.flush()
    return version


async def _make_job(db_session: AsyncSession, created_by: UUID, *, title: str = "Vaga Teste") -> JobModel:
    job = JobModel(
        title=title,
        description="Descrição de vaga",
        status="published",
        location="São Paulo",
        created_by=created_by,
    )
    db_session.add(job)
    await db_session.flush()
    return job


async def _link_pipeline(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
    resume_version_id: UUID | None,
    active: bool,
) -> CandidateJobPipelineModel:
    pipeline = CandidateJobPipelineModel(
        candidate_id=candidate_id,
        job_id=job_id,
        resume_version_id=resume_version_id,
        pipeline_stage="entry" if active else "rejected",
        relationship_status="active" if active else "rejected",
        is_terminal=not active,
        terminated_at=None if active else datetime.now(timezone.utc),
        pipeline_status="active" if active else "terminal",
        link_status="active",
    )
    db_session.add(pipeline)
    await db_session.flush()
    return pipeline


async def _add_profile_analysis(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    resume_version_id: UUID,
    skills: list[str],
    seniority_level: str | None = None,
) -> None:
    db_session.add(
        CandidateProfileAnalysisModel(
            candidate_id=candidate_id,
            resume_version_id=resume_version_id,
            provider="google",
            model_id="gemini-test",
            prompt_version="v1",
            skills_json=skills,
            seniority_level=seniority_level,
            experience_years=Decimal("4.0"),
        )
    )
    await db_session.flush()


@pytest.mark.asyncio
async def test_filters_city_and_state(client: AsyncClient, db_session: AsyncSession):
    headers, creator = await _recruiter_headers(client, db_session)
    sao_paulo = await _make_candidate(
        db_session,
        creator,
        full_name="Ana São Paulo",
        email=f"ana-{uuid4().hex[:6]}@example.com",
        city="São Paulo",
        state="SP",
    )
    await _make_candidate(
        db_session,
        creator,
        full_name="Bruno Rio",
        email=f"bruno-{uuid4().hex[:6]}@example.com",
        city="Rio de Janeiro",
        state="RJ",
    )
    await db_session.commit()

    response = await client.get(
        "/api/v1/candidates/summaries",
        headers=headers,
        params={"city": "São Paulo", "state": "SP"},
    )
    assert response.status_code == 200
    ids = {item["id"] for item in response.json()["data"]}
    assert str(sao_paulo.id) in ids
    assert len(ids) == 1


@pytest.mark.asyncio
async def test_filters_salary_and_contract_type(client: AsyncClient, db_session: AsyncSession):
    headers, creator = await _recruiter_headers(client, db_session)
    target = await _make_candidate(
        db_session,
        creator,
        full_name="Carla PJ",
        email=f"carla-{uuid4().hex[:6]}@example.com",
        salary_expectation="7500.00",
        desired_contract_type="PJ",
    )
    await _make_candidate(
        db_session,
        creator,
        full_name="Diego CLT",
        email=f"diego-{uuid4().hex[:6]}@example.com",
        salary_expectation="3200.00",
        desired_contract_type="CLT",
    )
    await db_session.commit()

    response = await client.get(
        "/api/v1/candidates/summaries",
        headers=headers,
        params={"salary_min": 7000, "salary_max": 9000, "desired_contract_type": "PJ"},
    )
    assert response.status_code == 200
    ids = {item["id"] for item in response.json()["data"]}
    assert ids == {str(target.id)}


@pytest.mark.asyncio
async def test_filters_application_source_and_has_resume(client: AsyncClient, db_session: AsyncSession):
    headers, creator = await _recruiter_headers(client, db_session)
    public_candidate = await _make_candidate(
        db_session,
        creator,
        full_name="Eva Pública",
        email=f"eva-{uuid4().hex[:6]}@example.com",
        application_source="public_application",
    )
    manual_candidate = await _make_candidate(
        db_session,
        creator,
        full_name="Felipe Manual",
        email=f"felipe-{uuid4().hex[:6]}@example.com",
        application_source="manual",
    )
    await _make_resume(db_session, public_candidate.id, creator)
    await db_session.commit()

    response = await client.get(
        "/api/v1/candidates/summaries",
        headers=headers,
        params={"application_source": "public_application", "has_resume": True},
    )
    assert response.status_code == 200
    ids = {item["id"] for item in response.json()["data"]}
    assert str(public_candidate.id) in ids
    assert str(manual_candidate.id) not in ids


@pytest.mark.asyncio
async def test_filters_link_status_variants(client: AsyncClient, db_session: AsyncSession):
    headers, creator = await _recruiter_headers(client, db_session)

    candidate_active = await _make_candidate(
        db_session,
        creator,
        full_name="Gabi Ativa",
        email=f"gabi-{uuid4().hex[:6]}@example.com",
    )
    candidate_closed = await _make_candidate(
        db_session,
        creator,
        full_name="Heitor Fechado",
        email=f"heitor-{uuid4().hex[:6]}@example.com",
    )
    candidate_pool = await _make_candidate(
        db_session,
        creator,
        full_name="Igor Banco",
        email=f"igor-{uuid4().hex[:6]}@example.com",
    )

    active_resume = await _make_resume(db_session, candidate_active.id, creator)
    closed_resume = await _make_resume(db_session, candidate_closed.id, creator)
    job = await _make_job(db_session, creator)

    await _link_pipeline(
        db_session,
        candidate_id=candidate_active.id,
        job_id=job.id,
        resume_version_id=active_resume.id,
        active=True,
    )
    await _link_pipeline(
        db_session,
        candidate_id=candidate_closed.id,
        job_id=job.id,
        resume_version_id=closed_resume.id,
        active=False,
    )
    await db_session.commit()

    with_active = await client.get(
        "/api/v1/candidates/summaries",
        headers=headers,
        params={"link_status_filter": "with_active_job"},
    )
    assert with_active.status_code == 200
    with_active_ids = {item["id"] for item in with_active.json()["data"]}
    assert str(candidate_active.id) in with_active_ids

    without_active = await client.get(
        "/api/v1/candidates/summaries",
        headers=headers,
        params={"link_status_filter": "without_active_job"},
    )
    assert without_active.status_code == 200
    without_active_ids = {item["id"] for item in without_active.json()["data"]}
    assert str(candidate_pool.id) in without_active_ids
    assert str(candidate_active.id) not in without_active_ids

    closed_process = await client.get(
        "/api/v1/candidates/summaries",
        headers=headers,
        params={"link_status_filter": "closed_process"},
    )
    assert closed_process.status_code == 200
    closed_ids = {item["id"] for item in closed_process.json()["data"]}
    assert str(candidate_closed.id) in closed_ids
    assert str(candidate_active.id) not in closed_ids


@pytest.mark.asyncio
async def test_filters_skill_seniority_and_combination_with_pagination(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, creator = await _recruiter_headers(client, db_session)

    candidate_1 = await _make_candidate(
        db_session,
        creator,
        full_name="Julia SQL",
        email=f"julia-{uuid4().hex[:6]}@example.com",
        city="Belém",
        state="PA",
        desired_contract_type="CLT",
    )
    candidate_2 = await _make_candidate(
        db_session,
        creator,
        full_name="Kaio SQL",
        email=f"kaio-{uuid4().hex[:6]}@example.com",
        city="Belém",
        state="PA",
        desired_contract_type="CLT",
    )
    candidate_3 = await _make_candidate(
        db_session,
        creator,
        full_name="Lia Python",
        email=f"lia-{uuid4().hex[:6]}@example.com",
        city="Belém",
        state="PA",
        desired_contract_type="CLT",
    )

    resume_1 = await _make_resume(db_session, candidate_1.id, creator)
    resume_2 = await _make_resume(db_session, candidate_2.id, creator)
    resume_3 = await _make_resume(db_session, candidate_3.id, creator)

    await _add_profile_analysis(
        db_session,
        candidate_id=candidate_1.id,
        resume_version_id=resume_1.id,
        skills=["SQL", "Power BI"],
        seniority_level="senior",
    )
    await _add_profile_analysis(
        db_session,
        candidate_id=candidate_2.id,
        resume_version_id=resume_2.id,
        skills=["SQL", "Excel"],
        seniority_level="senior",
    )
    await _add_profile_analysis(
        db_session,
        candidate_id=candidate_3.id,
        resume_version_id=resume_3.id,
        skills=["Python"],
        seniority_level="junior",
    )
    await db_session.commit()

    filtered = await client.get(
        "/api/v1/candidates/summaries",
        headers=headers,
        params={
            "city": "Belém",
            "state": "PA",
            "desired_contract_type": "CLT",
            "skill": "SQL",
            "seniority": "senior",
            "page": 1,
            "page_size": 1,
        },
    )
    assert filtered.status_code == 200
    payload = filtered.json()
    assert payload["total"] == 2
    assert len(payload["data"]) == 1

    page_2 = await client.get(
        "/api/v1/candidates/summaries",
        headers=headers,
        params={
            "city": "Belém",
            "state": "PA",
            "desired_contract_type": "CLT",
            "skill": "SQL",
            "seniority": "senior",
            "page": 2,
            "page_size": 1,
        },
    )
    assert page_2.status_code == 200
    payload_2 = page_2.json()
    assert payload_2["total"] == 2
    assert len(payload_2["data"]) == 1
