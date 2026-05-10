from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.job_model import JobModel

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


@pytest.mark.asyncio
async def test_candidate_overview_prefers_active_job_completed_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-overview-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    active_job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Active Pipeline Job",
    )

    active_analysis = await db_session.scalar(
        sa.select(AnalysisModel).where(AnalysisModel.job_id == active_job_id)
    )
    assert active_analysis is not None

    other_job = JobModel(
        id=uuid4(),
        title="Other Job",
        description="Different job",
        status="published",
        created_by=recruiter.id,
    )
    db_session.add(other_job)
    await db_session.flush()

    now = datetime.now(UTC)
    db_session.add(
        AnalysisModel(
            resume_version_id=active_analysis.resume_version_id,
            job_id=other_job.id,
            ai_model_id=active_analysis.ai_model_id,
            prompt_template_id=active_analysis.prompt_template_id,
            status="pending",
            requested_by=recruiter.id,
            created_at=now + timedelta(minutes=5),
            updated_at=now + timedelta(minutes=5),
        )
    )
    await db_session.commit()

    response = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload["latest_analysis"] is not None
    assert payload["latest_analysis"]["job_id"] == str(active_job_id)
    assert payload["latest_analysis"]["status"] == "completed"
    assert payload["latest_analysis_pipeline"] is not None
    assert payload["latest_analysis_pipeline"]["job_id"] == str(active_job_id)


@pytest.mark.asyncio
async def test_candidate_overview_does_not_fallback_to_global_analysis_without_active_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-overview-nofallback-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    active_job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Pipeline Job",
    )

    pipeline_row = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == active_job_id,
        )
    )
    assert pipeline_row is not None
    pipeline_row.link_status = "transferred"
    pipeline_row.relationship_status = "archived"
    pipeline_row.pipeline_status = "terminal"
    pipeline_row.is_terminal = True
    pipeline_row.terminated_at = datetime.now(UTC)
    pipeline_row.termination_reason = "candidate_transferred"
    await db_session.commit()

    response = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["active_job_id"] is None
    assert payload["latest_analysis"] is None
    assert payload["latest_analysis_pipeline"] is None

    summary_response = await client.get("/api/v1/candidates/summaries?page=1&page_size=20", headers=headers)
    assert summary_response.status_code == 200, summary_response.text
    rows = summary_response.json().get("data") or []
    target = next((row for row in rows if row.get("id") == str(candidate_id)), None)
    assert target is not None
    assert target.get("active_job_id") is None
    assert target.get("active_job_job_fit_score") is None
