from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.ai_usage_log_model import AIUsageLogModel
from src.infrastructure.database.models.analysis_model import AIModelModel, AnalysisModel, PromptTemplateModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel, ScoreModelVersionModel

from .helpers import _auth_headers, _create_active_user


async def _admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    await _create_active_user(db_session, "admin-bi@test.com", "password123", UserRole.ADMIN)
    return await _auth_headers(client, "admin-bi@test.com", "password123")


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    await _create_active_user(db_session, "recruiter-bi@test.com", "password123", UserRole.RECRUITER)
    return await _auth_headers(client, "recruiter-bi@test.com", "password123")


async def _seed_bi_records(db_session: AsyncSession) -> dict[str, str]:
    actor = await _create_active_user(db_session, "seed-bi@test.com", "password123", UserRole.ADMIN)

    job = JobModel(
        title="Analista de Sistemas",
        description="Vaga de tecnologia",
        status="published",
        job_area="Tecnologia",
        created_by=actor.id,
        created_at=datetime.now(UTC) - timedelta(days=2),
    )
    archived_job = JobModel(
        title="Analista Financeiro",
        description="Vaga financeira",
        status="archived",
        job_area="Financeiro",
        created_by=actor.id,
        created_at=datetime.now(UTC) - timedelta(days=40),
    )
    db_session.add_all([job, archived_job])
    await db_session.flush()

    candidate = CandidateModel(
        full_name="Lucas Andrade",
        email="lucas.analytics@test.com",
        created_by=actor.id,
        created_at=datetime.now(UTC) - timedelta(days=2),
    )
    archived_candidate = CandidateModel(
        full_name="Ana Arquivada",
        email="ana.analytics@test.com",
        created_by=actor.id,
        archived_at=datetime.now(UTC) - timedelta(days=1),
        created_at=datetime.now(UTC) - timedelta(days=10),
    )
    db_session.add_all([candidate, archived_candidate])
    await db_session.flush()

    resume = ResumeModel(candidate_id=candidate.id, title="CV Lucas", created_by=actor.id)
    db_session.add(resume)
    await db_session.flush()

    resume_version = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test-bucket",
        s3_key="resume.pdf",
        original_file_name="resume.pdf",
        file_size_bytes=1234,
        file_hash_sha256="hash123",
        uploaded_by=actor.id,
    )
    db_session.add(resume_version)
    await db_session.flush()

    ai_model = AIModelModel(
        provider="google",
        model_id=f"gemini-bi-{uuid4()}",
        model_name="Gemini BI",
        is_active=True,
    )
    prompt_template = PromptTemplateModel(
        name=f"bi_template_{uuid4()}",
        version=1,
        template_type="candidate_analysis",
        user_prompt_template="Analyze",
        is_active=True,
        created_by=actor.id,
    )
    db_session.add_all([ai_model, prompt_template])
    await db_session.flush()

    completed_analysis = AnalysisModel(
        resume_version_id=resume_version.id,
        job_id=job.id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt_template.id,
        status="completed",
        requested_by=actor.id,
        created_at=datetime.now(UTC) - timedelta(days=1),
        completed_at=datetime.now(UTC) - timedelta(days=1),
    )
    failed_analysis = AnalysisModel(
        resume_version_id=resume_version.id,
        job_id=job.id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt_template.id,
        status="failed",
        requested_by=actor.id,
        created_at=datetime.now(UTC) - timedelta(hours=12),
        failed_at=datetime.now(UTC) - timedelta(hours=12),
        failure_reason="Falha no provider",
    )
    db_session.add_all([completed_analysis, failed_analysis])
    await db_session.flush()

    pipeline = CandidateJobPipelineModel(
        candidate_id=candidate.id,
        job_id=job.id,
        resume_version_id=resume_version.id,
        relationship_status="hired",
        is_terminal=True,
        terminated_at=datetime.now(UTC) - timedelta(hours=6),
        termination_reason="approved",
        link_status="hired",
        pipeline_stage="hired",
        pipeline_status="terminal",
        entered_at=datetime.now(UTC) - timedelta(days=1),
    )
    db_session.add(pipeline)

    score_version = ScoreModelVersionModel(
        version=f"bi-score-{uuid4()}",
        weights={"skill": 1},
        thresholds={"high": 80},
        is_active=True,
    )
    db_session.add(score_version)
    await db_session.flush()

    db_session.add(
        CandidateJobScoreModel(
            candidate_id=candidate.id,
            job_id=job.id,
            version_id=score_version.id,
            final_score=Decimal("74.50"),
            decision_suggestion="review",
            breakdown={},
            explanation_text="bom fit",
            freshness_status="fresh",
            recompute_reason="initial",
            job_signature_hash="signature",
            job_updated_at=datetime.now(UTC),
        )
    )

    db_session.add_all(
        [
            AIUsageLogModel(
                provider="google",
                model="gemini-2.5-flash",
                operation="resume_analysis",
                analysis_id=completed_analysis.id,
                candidate_id=candidate.id,
                job_id=job.id,
                input_tokens=1000,
                output_tokens=200,
                total_tokens=1200,
                estimated_cost_usd=Decimal("0.50"),
                latency_ms=1800,
                status="success",
                created_at=datetime.now(UTC) - timedelta(days=1),
            ),
            AIUsageLogModel(
                provider="google",
                model="gemini-2.5-flash",
                operation="resume_analysis",
                analysis_id=failed_analysis.id,
                candidate_id=candidate.id,
                job_id=job.id,
                input_tokens=300,
                output_tokens=0,
                total_tokens=300,
                estimated_cost_usd=Decimal("0.10"),
                latency_ms=2500,
                status="failed",
                error_message="provider timeout",
                created_at=datetime.now(UTC) - timedelta(hours=12),
            ),
        ]
    )
    await db_session.commit()
    return {"job_id": str(job.id)}


@pytest.mark.asyncio
async def test_admin_can_access_bi_overview(client: AsyncClient, db_session: AsyncSession):
    headers = await _admin_headers(client, db_session)

    response = await client.get("/api/v1/admin/bi/overview", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert "summary" in body
    assert "jobs_by_status" in body
    assert "ai_usage" in body


@pytest.mark.asyncio
async def test_non_admin_receives_403_on_bi_overview(client: AsyncClient, db_session: AsyncSession):
    headers = await _recruiter_headers(client, db_session)

    response = await client.get("/api/v1/admin/bi/overview", headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_bi_overview_returns_zeroes_without_data(client: AsyncClient, db_session: AsyncSession):
    headers = await _admin_headers(client, db_session)

    response = await client.get("/api/v1/admin/bi/overview", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["total_candidates"] == 0
    assert body["summary"]["ai_total_calls"] == 0
    assert body["jobs_by_status"] == []
    assert body["analyses_daily"] == []


@pytest.mark.asyncio
async def test_bi_overview_period_filter_works(client: AsyncClient, db_session: AsyncSession):
    headers = await _admin_headers(client, db_session)
    await _seed_bi_records(db_session)

    response = await client.get(
        "/api/v1/admin/bi/overview",
        params={"date_from": (datetime.now(UTC) - timedelta(days=7)).date().isoformat()},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["published_jobs"] == 1
    assert body["summary"]["archived_jobs"] == 0


@pytest.mark.asyncio
async def test_bi_overview_aggregates_analysis_status_and_ai_usage(client: AsyncClient, db_session: AsyncSession):
    headers = await _admin_headers(client, db_session)
    seeded = await _seed_bi_records(db_session)

    response = await client.get(
        "/api/v1/admin/bi/overview",
        params={"job_id": seeded["job_id"], "provider": "google"},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["completed_analyses"] == 1
    assert body["summary"]["failed_analyses"] == 1
    assert body["summary"]["average_score"] == 74.5
    assert body["summary"]["ai_total_tokens"] == 1500
    assert body["summary"]["ai_total_calls"] == 2
    assert body["ai_usage"]["failed_calls"] == 1
    assert body["top_expensive_analyses"][0]["candidate_name"] == "Lucas Andrade"


@pytest.mark.asyncio
async def test_bi_overview_does_not_expose_api_keys(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    headers = await _admin_headers(client, db_session)
    monkeypatch.setattr(settings, "GOOGLE_API_KEY", "super-secret-google-key")

    response = await client.get("/api/v1/admin/bi/overview", headers=headers)

    assert response.status_code == 200
    assert "super-secret-google-key" not in response.text
