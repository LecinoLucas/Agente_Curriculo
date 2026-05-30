"""Tests for the job skill add/remove/update → recompute_job_matches_task flow.

The recompute is now asynchronous (background task). Tests verify:
- The API call succeeds and the task is enqueued (not run synchronously).
- Running the task manually produces the expected match result.
- Inactive pipeline entries are skipped by the task.
- Analysis count never changes (no new Analysis created).
"""

import asyncio
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
from src.interface.workers.matching_tasks import _do_recompute_job_matches

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


@pytest.mark.asyncio
async def test_editing_job_skills_enqueues_recompute_and_task_creates_match(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Adding a skill invalidates the match and the background task recreates it."""
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

    # Track whether the background enqueue was called
    enqueued: list[str] = []

    async def fake_enqueue(jid):
        enqueued.append(str(jid))

    monkeypatch.setattr(
        "src.application.services.job_service.enqueue_job_match_recompute",
        fake_enqueue,
        raising=False,
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

    # The API enqueued the task — not run yet
    assert str(job_id) in enqueued, "recompute task was not enqueued after skill add"

    # Analysis count unchanged: no new AI analysis was created
    analysis_count_mid = await db_session.scalar(
        sa.select(sa.func.count(AnalysisModel.id))
    )
    assert analysis_count_mid == analysis_count_before

    # Now run the background task directly against the test session
    result = await _do_recompute_job_matches(db_session, job_id)
    await db_session.commit()

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
    assert match is not None, f"task result: {result}"
    assert pipeline_count_after == pipeline_count_before
    assert analysis_count_after == analysis_count_before
    assert result["processed"] >= 1


@pytest.mark.asyncio
async def test_editing_job_skills_does_not_recompute_for_inactive_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Inactive pipeline entries are skipped by the background task — no match created."""
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

    # Suppress the real Celery enqueue
    monkeypatch.setattr(
        "src.application.services.job_service.enqueue_job_match_recompute",
        lambda jid: asyncio.sleep(0),
        raising=False,
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

    # Run the background task directly
    result = await _do_recompute_job_matches(db_session, job_id)
    await db_session.commit()

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

    assert match is None, "Inactive pipeline should not have match created"
    assert pipeline_count_after == pipeline_count_before
    assert analysis_count_after == analysis_count_before
    assert result["processed"] == 0
