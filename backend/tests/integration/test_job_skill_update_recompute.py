from datetime import UTC, datetime
from uuid import uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


@pytest.mark.asyncio
async def test_editing_job_skills_recomputes_match_for_active_pipeline_only(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"skills-recompute-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Skill Recompute Job",
        include_ranking_row=False,
    )

    pipeline_count_before = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    analysis_count_before = await db_session.scalar(
        sa.select(sa.func.count(AnalysisModel.id))
    )

    response = await client.post(
        f"/api/v1/jobs/{job_id}/skills",
        headers=headers,
        json={
            "skill_name": "TypeScript",
            "priority_level": "complementary",
            "weight": 1,
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["priority_level"] == "complementary"

    job = await db_session.scalar(sa.select(JobModel).where(JobModel.id == job_id))
    match = await db_session.scalar(
        sa.select(CandidateJobMatchModel)
        .where(
            CandidateJobMatchModel.candidate_id == candidate_id,
            CandidateJobMatchModel.job_id == job_id,
        )
        .order_by(CandidateJobMatchModel.updated_at.desc(), CandidateJobMatchModel.created_at.desc())
    )

    pipeline_count_after = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    analysis_count_after = await db_session.scalar(
        sa.select(sa.func.count(AnalysisModel.id))
    )

    assert job is not None
    assert match is not None
    assert match.job_signature_hash == job.job_profile_hash
    assert pipeline_count_after == pipeline_count_before
    assert analysis_count_after == analysis_count_before


@pytest.mark.asyncio
async def test_editing_job_skills_does_not_recompute_for_inactive_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"skills-skip-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Inactive Pipeline Skill Update",
        include_ranking_row=False,
    )

    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
        .values(
            relationship_status="archived",
            pipeline_status="terminal",
            is_terminal=True,
            terminated_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    pipeline_count_before = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    analysis_count_before = await db_session.scalar(
        sa.select(sa.func.count(AnalysisModel.id))
    )

    response = await client.post(
        f"/api/v1/jobs/{job_id}/skills",
        headers=headers,
        json={
            "skill_name": "React",
            "priority_level": "priority",
            "weight": 1,
        },
    )

    assert response.status_code == 201

    match = await db_session.scalar(
        sa.select(CandidateJobMatchModel).where(
            CandidateJobMatchModel.candidate_id == candidate_id,
            CandidateJobMatchModel.job_id == job_id,
        )
    )
    pipeline_count_after = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    analysis_count_after = await db_session.scalar(
        sa.select(sa.func.count(AnalysisModel.id))
    )

    assert match is None
    assert pipeline_count_after == pipeline_count_before
    assert analysis_count_after == analysis_count_before
