from __future__ import annotations
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.adaptive_scorer_service import AdaptiveScorerService
from src.domain.entities.user import User, UserRole
from src.domain.value_objects.job_profile import JobProfile, JobRequirement
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
    ResumeJobMatchModel,
)
from src.infrastructure.database.models.candidate_job_link_model import CandidateJobLinkModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_pipeline_model import CandidatePipelineModel
from src.infrastructure.database.models.job_model import JobModel
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


def _job_profile() -> JobProfile:
    return JobProfile(
        area="data",
        target_level="senior",
        main_mission="Transformar dados em decisões.",
        critical_requirements=[
            JobRequirement(name="SQL", description="SQL em produção.", is_mandatory=True, importance_weight=2.0),
            JobRequirement(name="BI", description="Dashboards executivos.", is_mandatory=True, importance_weight=1.8),
            JobRequirement(name="pipelines", description="ETL/ELT e pipelines.", is_mandatory=True, importance_weight=1.8),
        ],
        desirable_requirements=[
            JobRequirement(name="comunicação", description="Comunicação com stakeholders.", is_mandatory=False, importance_weight=0.7),
        ],
        responsibilities=["definir métricas", "apresentar resultados"],
        required_tools=["SQL", "Power BI", "ETL"],
        required_capabilities=["autonomia", "comunicação"],
        seniority_signals=["sênior", "autonomia"],
        adaptive_weights={
            "technical_competencies": 0.30,
            "practical_experience": 0.30,
            "role_fit": 0.20,
            "seniority_alignment": 0.10,
            "education": 0.10,
        },
        job_completeness_score=0.88,
        confidence="high",
        description_hash="job-hash-data",
    )


def _candidate_extracted_data() -> dict:
    return {
        "candidate": {
            "name": "Ana Dados",
            "email": "ana@test.com",
        },
        "summary": "Analista de dados com forte experiência em SQL Server, Power BI e ETL.",
        "total_experience_months": 108,
        "experiences": [
            {
                "company": "Data Corp",
                "role": "Analista de Dados",
                "start_date": "2020-01",
                "end_date": None,
                "is_current": True,
                "duration_months": 48,
                "description": "Construção de dashboards e pipelines.",
                "is_leadership": False,
                "technologies": ["SQL Server", "Power BI", "ETL"],
            }
        ],
        "education": [
            {
                "institution": "USP",
                "degree": "bachelor",
                "field": "Estatística",
                "graduation_year": 2018,
                "is_completed": True,
            }
        ],
        "certifications": [],
        "skills": [
            {
                "name": "SQL Server",
                "proficiency": "advanced",
                "evidence_text": "Experiência em SQL Server.",
            },
            {
                "name": "Power BI",
                "proficiency": "advanced",
                "evidence_text": "Dashboards executivos em Power BI.",
            },
            {
                "name": "ETL",
                "proficiency": "advanced",
                "evidence_text": "ETL/ELT em produção.",
            },
        ],
        "skill_categories": ["data"],
        "languages": [],
        "communication_quality": {
            "structure": 82,
            "clarity": 80,
            "professionalism": 78,
            "completeness": 84,
        },
        "leadership_indicators": {
            "has_management": False,
            "has_project_lead": False,
            "has_mentoring": True,
            "has_cross_team": False,
        },
        "strengths": ["Reduziu o tempo de fechamento em 30%"],
        "weaknesses": ["Pouca liderança formal"],
        "recommendations": ["Descrever mais cases de stakeholders"],
        "keywords": ["SQL Server", "Power BI", "ETL", "dashboards"],
    }


async def _seed_scoring_case(
    session: AsyncSession,
    admin_id: UUID,
    *,
    job_profile: JobProfile | None = None,
    extracted_data: dict | None = None,
    include_ranking_row: bool = False,
) -> tuple[UUID, UUID, UUID]:
    now = datetime.now(UTC)
    job_profile = job_profile or _job_profile()
    extracted_data = extracted_data or _candidate_extracted_data()
    unique_suffix = uuid4().hex[:8]

    job = JobModel(
        title=f"Analista de Dados Sênior {unique_suffix}",
        description="Vaga para atuar com SQL, BI e pipelines.",
        requirements="Analisar dados, criar dashboards e manter ETL.",
        status="published",
        seniority_level="senior",
        minimum_education_level="bachelor",
        minimum_years_experience=Decimal("5.0"),
        deal_breakers=[],
        work_model="remote",
        location="Brasil",
        salary_currency="BRL",
        job_profile_json=job_profile.to_dict(),
        job_profile_hash=job_profile.description_hash,
        created_by=admin_id,
        published_at=now,
        created_at=now,
        updated_at=now,
    )
    candidate = CandidateModel(
        full_name=f"Ana Dados {unique_suffix}",
        email=f"ana-{unique_suffix}@test.com",
        location_country="BR",
        created_by=admin_id,
        created_at=now,
        updated_at=now,
    )
    session.add_all([job, candidate])
    await session.flush()

    resume = ResumeModel(
        candidate_id=candidate.id,
        title=f"Currículo Ana {unique_suffix}",
        status="active",
        current_version=1,
        created_by=admin_id,
        created_at=now,
        updated_at=now,
    )
    session.add(resume)
    await session.flush()

    resume_version = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test-bucket",
        s3_key=f"resume/ana-{unique_suffix}.pdf",
        original_file_name=f"ana-{unique_suffix}.pdf",
        file_size_bytes=1024,
        file_hash_sha256="c" * 64,
        mime_type="application/pdf",
        extracted_text="Resumo estruturado.",
        extraction_status="completed",
        uploaded_by=admin_id,
        uploaded_at=now,
    )
    ai_model = AIModelModel(
        provider="openai",
        model_id=f"test-model-{unique_suffix}",
        model_name=f"Test Model {unique_suffix}",
        context_window=128000,
        is_active=True,
        activated_at=now,
        created_at=now,
    )
    prompt_template = PromptTemplateModel(
        name=f"resume_analysis_{unique_suffix}",
        version=1,
        description="Template de teste",
        template_type="resume",
        system_prompt="system",
        user_prompt_template="user",
        output_schema={},
        max_tokens=1024,
        temperature=Decimal("0.1"),
        is_active=True,
        activated_at=now,
        created_by=admin_id,
        created_at=now,
    )
    session.add_all([resume_version, ai_model, prompt_template])
    await session.flush()

    analysis = AnalysisModel(
        resume_version_id=resume_version.id,
        job_id=job.id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt_template.id,
        status="completed",
        priority=5,
        requested_by=admin_id,
        started_at=now,
        completed_at=now,
        created_at=now,
        updated_at=now,
    )
    session.add(analysis)
    await session.flush()

    analysis_result = AnalysisResultModel(
        analysis_id=analysis.id,
        overall_score=Decimal("79.5"),
        technical_score=Decimal("86.0"),
        experience_score=Decimal("82.0"),
        education_score=Decimal("74.0"),
        communication_score=Decimal("78.0"),
        leadership_score=Decimal("42.0"),
        candidate_summary="Analista de dados com SQL Server, Power BI e ETL.",
        seniority_level="senior",
        total_experience_years=Decimal("9.0"),
        highest_education_level="bachelor",
        highest_education_field="Estatística",
        strengths=["SQL Server", "Power BI", "ETL"],
        weaknesses=["Liderança formal limitada"],
        recommendations=["Detalhar cases com stakeholders"],
        keywords=["SQL Server", "Power BI", "ETL", "dashboards"],
        extracted_data=extracted_data,
        processing_time_ms=180,
        raw_llm_response="{\"ok\": true}",
    )
    session.add(analysis_result)
    session.add(
        CandidateJobLinkModel(
            candidate_id=candidate.id,
            job_id=job.id,
            status="active",
            source="pipeline",
            created_at=now,
            updated_at=now,
        )
    )
    session.add(
        CandidatePipelineModel(
            candidate_id=candidate.id,
            job_id=job.id,
            stage="entry",
            status="active",
            is_active=True,
            match_score=Decimal("51.0"),
            entered_at=now,
            created_at=now,
            updated_at=now,
        )
    )

    if include_ranking_row:
        session.add(
            ResumeJobMatchModel(
                analysis_id=analysis.id,
                job_id=job.id,
                match_score=Decimal("51.0"),
                skills_match_score=Decimal("50.0"),
                experience_match_score=Decimal("55.0"),
                seniority_match_score=Decimal("48.0"),
                matched_skills=["SQL", "Power BI"],
                missing_skills=["pipelines"],
                bonus_skills=["ETL"],
                match_summary="Ranking legado de teste.",
                recommendation="good_match",
                validation_status="pass",
                missing_evidence=[],
                rejection_reasons=[],
                created_at=now,
            )
        )

    await session.commit()
    return job.id, candidate.id, analysis.id


async def _count_resume_job_matches(session: AsyncSession) -> int:
    return int((await session.scalar(sa.select(sa.func.count()).select_from(ResumeJobMatchModel))) or 0)


@pytest.mark.asyncio
async def test_admin_get_scoring_comparison_returns_audit_payload(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(db_session, "admin-scoring@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-scoring@test.com", "password123")
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        admin.id,
        include_ranking_row=True,
    )

    before_count = await _count_resume_job_matches(db_session)
    response = await client.get(
        f"/api/v1/admin/scoring-comparison/{job_id}/{candidate_id}",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["job_id"] == str(job_id)
    assert body["candidate_id"] == str(candidate_id)
    assert body["legacy_match_score"] >= 0
    assert body["adaptive_match_score"] >= 0
    assert isinstance(body["major_differences"], list)
    assert isinstance(body["strengths"], list)
    assert isinstance(body["gaps"], list)
    assert isinstance(body["risk_points"], list)
    assert isinstance(body["evaluation_insight"], dict)
    assert "why_score_is_high" in body["evaluation_insight"]
    assert "why_score_is_low" in body["evaluation_insight"]
    assert "equivalent_matches" in body["evaluation_insight"]
    assert "inferred_matches" in body["evaluation_insight"]
    assert "recommended_interview_questions" in body["evaluation_insight"]

    after_count = await _count_resume_job_matches(db_session)
    assert after_count == before_count


@pytest.mark.asyncio
async def test_scoring_comparison_requires_admin(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _create_active_user(db_session, "recruiter-scoring@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "recruiter-scoring@test.com", "password123")

    response = await client.get(
        f"/api/v1/admin/scoring-comparison/{uuid4()}/{uuid4()}",
        headers=headers,
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_missing_job_returns_404(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _create_active_user(db_session, "admin-missing-job@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-missing-job@test.com", "password123")

    response = await client.get(
        f"/api/v1/admin/scoring-comparison/{uuid4()}/{uuid4()}",
        headers=headers,
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_missing_candidate_or_analysis_returns_404(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(db_session, "admin-missing-candidate@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-missing-candidate@test.com", "password123")
    job, _, _ = await _seed_scoring_case(
        db_session,
        admin.id,
        extracted_data=_candidate_extracted_data(),
    )

    response = await client.get(
        f"/api/v1/admin/scoring-comparison/{job}/{uuid4()}",
        headers=headers,
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_missing_analysis_returns_404(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(db_session, "admin-missing-analysis@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-missing-analysis@test.com", "password123")
    job_id, candidate_id, analysis_id = await _seed_scoring_case(
        db_session,
        admin.id,
    )

    await db_session.execute(sa.delete(AnalysisResultModel).where(AnalysisResultModel.analysis_id == analysis_id))
    await db_session.execute(sa.delete(AnalysisModel).where(AnalysisModel.id == analysis_id))
    await db_session.commit()

    response = await client.get(
        f"/api/v1/admin/scoring-comparison/{job_id}/{candidate_id}",
        headers=headers,
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_adaptive_failure_does_not_break_legacy(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin = await _create_active_user(db_session, "admin-failure@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-failure@test.com", "password123")
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        admin.id,
    )

    def _fail(self, job_profile, candidate_profile, evidence_mapping):  # type: ignore[no-untyped-def]
        raise RuntimeError("adaptive failure")

    monkeypatch.setattr(AdaptiveScorerService, "score", _fail)

    response = await client.get(
        f"/api/v1/admin/scoring-comparison/{job_id}/{candidate_id}",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["legacy_match_score"] >= 0
    assert body["adaptive_match_score"] == 0
    assert body["should_review_manually"] is True
    assert "adaptive_scoring_fallback" in body["risk_points"]
    assert body["evaluation_insight"]["why_score_is_low"]
