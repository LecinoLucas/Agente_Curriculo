import pytest
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    CandidateJobScoreSnapshotModel,
    ScoreModelVersionModel,
)
from src.application.services.candidate_ranking_service import CandidateRankingService
from .helpers import _create_active_user, _seed_scoring_case, _auth_headers

async def _seed_valid_scoring_case(db_session: AsyncSession, recruiter_id: str, job_title: str = "Test Job"):
    """Helper to seed a case that passes all filters for scoring."""
    job_id, candidate_id, match_id = await _seed_scoring_case(
        db_session, recruiter_id, job_title=job_title, include_ranking_row=False
    )
    
    # Fix match data - MUST have canonical component evidence for ranking
    await db_session.execute(
        sa.update(CandidateJobMatchModel)
        .where(CandidateJobMatchModel.id == match_id)
        .values(
            skill_evidence_breakdown={
                "mandatory_score_weighted": 100.0,
                "optional_score_weighted": 0.0,
                "optional_score_raw_weighted": 0.0,
                "validation_reasons": [],
                "matched_required_skills": ["Python", "FastAPI"],
                "missing_required_skills": [],
            }
        )
    )
    
    # Ensure active version exists
    active_version = await db_session.scalar(
        sa.select(ScoreModelVersionModel).where(ScoreModelVersionModel.is_active.is_(True))
    )
    if active_version is None:
        active_version = ScoreModelVersionModel(
            version=f"test-score-{uuid4().hex[:6]}",
            is_active=True,
            weights={
                "skill_match": 0.4,
                "experience_match": 0.25,
                "seniority_match": 0.2,
                "education": 0.1,
                "ai_confidence": 0.05,
            },
            thresholds={"high": 70, "low": 45},
        )
        db_session.add(active_version)
    
    await db_session.commit()
    
    # Create initial score
    await CandidateRankingService(db_session).compute_single_candidate(job_id, candidate_id)
    await db_session.commit()
    
    return job_id, candidate_id, match_id


@pytest.mark.asyncio
async def test_analysis_match_persists_only_evidence_and_ranking_persists_official_score(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session, f"recruiter-{uuid4().hex[:6]}@test.com", "password123", UserRole.RECRUITER
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session, recruiter.id, job_title="Analysis Match Evidence", include_ranking_row=False
    )
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline is not None
    assert pipeline.current_analysis_id is not None

    response = await client.post(
        f"/api/v1/analyses/{pipeline.current_analysis_id}/match/{job_id}",
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["job_fit_score"] is not None

    persisted_match = await db_session.scalar(
        sa.select(CandidateJobMatchModel)
        .where(
            CandidateJobMatchModel.candidate_id == candidate_id,
            CandidateJobMatchModel.job_id == job_id,
        )
        .order_by(CandidateJobMatchModel.created_at.desc())
    )
    assert persisted_match is not None
    breakdown = dict(persisted_match.skill_evidence_breakdown or {})
    assert "mandatory_score_weighted" in breakdown
    assert "final_score_after_cap" not in breakdown
    assert "final_score_before_cap" not in breakdown

    persisted_score = await db_session.scalar(
        sa.select(CandidateJobScoreModel).where(
            CandidateJobScoreModel.candidate_id == candidate_id,
            CandidateJobScoreModel.job_id == job_id,
        )
    )
    assert persisted_score is not None
    assert float(persisted_score.final_score) == payload["job_fit_score"]

@pytest.mark.asyncio
async def test_single_candidate_recompute_returns_delta(client: AsyncClient, db_session: AsyncSession) -> None:
    """Individual recompute returns previous_score, new_score and delta."""
    recruiter = await _create_active_user(
        db_session, f"recruiter-{uuid4().hex[:6]}@test.com", "password123", UserRole.RECRUITER
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    
    job_id, candidate_id, _ = await _seed_valid_scoring_case(
        db_session, recruiter.id, job_title="Recompute Job"
    )
    
    # Get initial score
    res = await db_session.execute(
        sa.select(CandidateJobScoreModel.final_score).where(
            CandidateJobScoreModel.job_id == job_id,
            CandidateJobScoreModel.candidate_id == candidate_id
        )
    )
    initial_score = res.scalar_one()
    
    # Request recompute
    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/scoring",
        headers=headers
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["candidate_id"] == str(candidate_id)
    assert data["job_id"] == str(job_id)
    assert Decimal(str(data["previous_score"])) == initial_score
    assert "job_fit_score" in data
    assert "delta" in data
    assert data["monotonicity_decision"] is not None

@pytest.mark.asyncio
async def test_recompute_fails_for_inactive_pipeline(client: AsyncClient, db_session: AsyncSession) -> None:
    """Candidate without active pipeline returns 409."""
    recruiter = await _create_active_user(
        db_session, f"recruiter-{uuid4().hex[:6]}@test.com", "password123", UserRole.RECRUITER
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    
    job_id, candidate_id, _ = await _seed_valid_scoring_case(
        db_session, recruiter.id, job_title="Inactive Pipeline Job"
    )
    
    # Scenario: pipeline_status != 'active'
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(CandidateJobPipelineModel.candidate_id == candidate_id, CandidateJobPipelineModel.job_id == job_id)
        .values(pipeline_status="terminal", relationship_status="archived", is_terminal=True, terminated_at=datetime.now(UTC))
    )
    await db_session.commit()
    
    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/scoring",
        headers=headers
    )
    assert response.status_code == 409
    assert "pipeline ativo" in response.json()["detail"].lower()
    
    # Scenario: relationship_status != 'active'
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(CandidateJobPipelineModel.candidate_id == candidate_id, CandidateJobPipelineModel.job_id == job_id)
        .values(pipeline_status="active", relationship_status="archived", is_terminal=True, terminated_at=datetime.now(UTC))
    )
    await db_session.commit()
    
    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/scoring",
        headers=headers
    )
    assert response.status_code == 409
    
    await db_session.commit()
    
    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/scoring",
        headers=headers
    )
    assert response.status_code == 409

@pytest.mark.asyncio
async def test_recompute_does_not_create_new_pipeline(client: AsyncClient, db_session: AsyncSession) -> None:
    """Verify recompute operation doesn't have side effects on pipelines."""
    recruiter = await _create_active_user(
        db_session, f"recruiter-{uuid4().hex[:6]}@test.com", "password123", UserRole.RECRUITER
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    
    job_id, candidate_id, _ = await _seed_valid_scoring_case(
        db_session, recruiter.id
    )
    
    initial_pipeline_count = await db_session.scalar(sa.select(sa.func.count(CandidateJobPipelineModel.candidate_id)))
    
    await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/scoring",
        headers=headers
    )
    
    final_pipeline_count = await db_session.scalar(sa.select(sa.func.count(CandidateJobPipelineModel.candidate_id)))
    assert initial_pipeline_count == final_pipeline_count

@pytest.mark.asyncio
async def test_snapshots_preserved_after_recompute(client: AsyncClient, db_session: AsyncSession) -> None:
    """Verify that multiple recomputes preserve snapshots for history."""
    recruiter = await _create_active_user(
        db_session, f"recruiter-{uuid4().hex[:6]}@test.com", "password123", UserRole.RECRUITER
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    
    job_id, candidate_id, _ = await _seed_valid_scoring_case(
        db_session, recruiter.id
    )
    
    # First recompute
    await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/scoring",
        headers=headers
    )
    
    # Second recompute
    await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/scoring",
        headers=headers
    )
    
    snapshots = await db_session.scalars(
        sa.select(CandidateJobScoreSnapshotModel)
        .where(CandidateJobScoreSnapshotModel.candidate_id == candidate_id, CandidateJobScoreSnapshotModel.job_id == job_id)
        .order_by(CandidateJobScoreSnapshotModel.computed_at.desc())
    )
    snapshot_list = snapshots.all()
    # Initial (from seed helper) + 2 recomputes = 3 snapshots
    assert len(snapshot_list) >= 3

@pytest.mark.asyncio
async def test_bulk_recompute_returns_deltas_for_all_active(client: AsyncClient, db_session: AsyncSession) -> None:
    """Bulk recompute returns a list of deltas for all candidates in pipeline."""
    recruiter = await _create_active_user(
        db_session, f"recruiter-{uuid4().hex[:6]}@test.com", "password123", UserRole.RECRUITER
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    
    job_id, c1_id, _ = await _seed_valid_scoring_case(db_session, recruiter.id)
    
    response = await client.post(
        f"/api/v1/jobs/{job_id}/scoring",
        headers=headers
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["candidates_scored"] >= 1
    assert "score_deltas" in data
    assert len(data["score_deltas"]) == data["candidates_scored"]
    
    first_delta = data["score_deltas"][0]
    assert "candidate_id" in first_delta
    assert "previous_score" in first_delta
    assert "new_score" in first_delta
    assert "delta" in first_delta
    assert "monotonicity_decision" in first_delta
