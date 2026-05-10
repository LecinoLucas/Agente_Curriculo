import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4, UUID

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from tests.integration.test_resume_pipeline_smoke import _create_active_user, _auth_headers, _pdf_with_text

@pytest.mark.asyncio
async def test_import_resume_does_not_create_pipeline_or_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
):
    # Setup: Recruiter user
    email = f"recruiter-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, email, "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, email, "password123")

    # 1. Create candidate via API first (as the frontend does)
    cand_resp = await client.post(
        "/api/v1/candidates",
        headers=headers,
        json={"full_name": "Import Test Candidate", "email": f"import-{uuid4().hex}@test.com"}
    )
    assert cand_resp.status_code == 201
    candidate_id = cand_resp.json()["id"]

    # 2. Initiate resume upload
    init_resp = await client.post(
        "/api/v1/resumes",
        headers=headers,
        json={"candidate_id": candidate_id}
    )
    assert init_resp.status_code == 202
    resume_id = init_resp.json()["resume_id"]

    # 3. Upload PDF
    pdf_content = _pdf_with_text("Candidate content for import test")
    upload_resp = await client.post(
        f"/api/v1/resumes/{resume_id}/upload",
        headers=headers,
        files={"file": ("resume.pdf", pdf_content, "application/pdf")}
    )
    assert upload_resp.status_code == 200
    
    # VERIFICATION: No pipeline, no analysis
    # Check Pipeline
    pipeline_count = await db_session.scalar(
        sa.select(sa.func.count(CandidateJobPipelineModel.candidate_id))
        .where(CandidateJobPipelineModel.candidate_id == UUID(candidate_id))
    )
    assert pipeline_count == 0, "Import should NOT create a pipeline entry automatically"

    # Check Analysis
    analysis_count = await db_session.scalar(
        sa.select(sa.func.count(AnalysisModel.id))
        .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
        .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
        .where(ResumeModel.candidate_id == UUID(candidate_id))
    )
    assert analysis_count == 0, "Import should NOT trigger AI analysis without a job link"

@pytest.mark.asyncio
async def test_dashboard_metrics_reflect_pipeline_status(
    client: AsyncClient,
    db_session: AsyncSession,
):
    email = f"recruiter-{uuid4().hex[:6]}@test.com"
    user = await _create_active_user(db_session, email, "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, email, "password123")

    # 1. Initial stats
    stats_resp = await client.get("/api/v1/dashboard/stats", headers=headers)
    assert stats_resp.status_code == 200
    base_stats = stats_resp.json()
    
    # 2. Add candidate without job
    candidate = CandidateModel(id=uuid4(), full_name="Waiting Cand", email=f"w-{uuid4()}@t.com", created_by=user.id)
    db_session.add(candidate)
    await db_session.commit()

    stats_waiting = (await client.get("/api/v1/dashboard/stats", headers=headers)).json()
    assert stats_waiting["total_candidates"] == base_stats["total_candidates"] + 1
    assert stats_waiting["candidates_waiting_job"] == base_stats["candidates_waiting_job"] + 1
    assert stats_waiting["candidates_in_pipeline"] == base_stats["candidates_in_pipeline"]

    # 3. Add job and link candidate (Active Pipeline)
    job = JobModel(
        id=uuid4(),
        title="Test Job",
        description="Test description",
        requirements="Test requirements",
        status="published",
        created_by=user.id
    )
    db_session.add(job)
    await db_session.commit()

    # Create active pipeline entry
    pipeline = CandidateJobPipelineModel(
        candidate_job_pipeline_id=uuid4(),
        candidate_id=candidate.id,
        job_id=job.id,
        pipeline_stage="entry",
        link_status="active",
        pipeline_status="active",
        relationship_status="active",
        is_terminal=False,
        entered_at=sa.func.now(),
        created_at=sa.func.now(),
        updated_at=sa.func.now()
    )
    db_session.add(pipeline)
    await db_session.commit()

    stats_linked = (await client.get("/api/v1/dashboard/stats", headers=headers)).json()
    assert stats_linked["candidates_waiting_job"] == base_stats["candidates_waiting_job"]
    assert stats_linked["candidates_in_pipeline"] == base_stats["candidates_in_pipeline"] + 1
    assert stats_linked["candidates_by_stage"].get("entry", 0) >= 1

    # 4. Deactivate pipeline (Remove from job)
    pipeline.relationship_status = "withdrawn"
    pipeline.is_terminal = True
    pipeline.terminated_at = sa.func.now()
    pipeline.link_status = "removed"
    pipeline.pipeline_status = "terminal"
    await db_session.commit()

    stats_removed = (await client.get("/api/v1/dashboard/stats", headers=headers)).json()
    assert stats_removed["candidates_waiting_job"] == base_stats["candidates_waiting_job"] + 1
    assert stats_removed["candidates_in_pipeline"] == base_stats["candidates_in_pipeline"]

@pytest.mark.asyncio
async def test_dashboard_stats_permissions(
    client: AsyncClient,
    db_session: AsyncSession,
):
    # 1. No auth -> 401
    resp_no_auth = await client.get("/api/v1/dashboard/stats")
    assert resp_no_auth.status_code == 401

    # 2. Candidate role -> 403
    cand_email = f"cand-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, cand_email, "password123", UserRole.CANDIDATE)
    cand_headers = await _auth_headers(client, cand_email, "password123")
    resp_cand = await client.get("/api/v1/dashboard/stats", headers=cand_headers)
    assert resp_cand.status_code == 403

    # 3. Viewer role -> 200
    view_email = f"view-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, view_email, "password123", UserRole.VIEWER)
    view_headers = await _auth_headers(client, view_email, "password123")
    resp_view = await client.get("/api/v1/dashboard/stats", headers=view_headers)
    assert resp_view.status_code == 200
