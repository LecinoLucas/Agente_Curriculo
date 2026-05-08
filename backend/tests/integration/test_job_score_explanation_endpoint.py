from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
import sqlalchemy as sa

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreFactorModel,
    CandidateJobScoreModel,
    CandidateJobScoreSnapshotModel,
)

from .helpers import (
    _auth_headers,
    _create_active_user,
    _seed_scoring_case,
)


@pytest.mark.asyncio
async def test_job_score_explanation_admin_sees_full_payload(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(db_session, "admin-score-expl@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-score-expl@test.com", "password123")
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        admin.id,
        include_ranking_row=True,
    )

    response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/score-explanation",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["job_id"] == str(job_id)
    assert body["candidate_id"] == str(candidate_id)
    assert body["score"] >= 0
    assert body["final_score"] == body["score"]
    assert body["engine_used"] == "canonical"
    assert body["recommendation"] == "good_match"
    assert body["freshness_status"] == "fresh"
    assert body["explainability_version"] == "v1_structured_factors"
    assert body["factor_summary"]["positive"]
    assert "delta" in body
    assert body["confidence_score"] > 0
    assert isinstance(body["breakdown"], dict)
    assert body["breakdown"]["mandatory"]["score"] > 0
    assert isinstance(body["highlights"], list)
    assert body["highlights"]
    assert isinstance(body["risks"], list)
    assert body["risks"]
    assert body["gaps"] == ["pipelines"]
    assert body["recommended_questions"] == []
    assert body["strongest_evidence"] == []
    assert body["matched_equivalences"] == []


@pytest.mark.asyncio
async def test_job_score_explanation_recruiter_gets_filtered_sensitive_fields(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(db_session, "admin-score-expl-recruiter@test.com", "password123", UserRole.ADMIN)
    await _create_active_user(db_session, "recruiter-score-expl@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "recruiter-score-expl@test.com", "password123")
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        admin.id,
        include_ranking_row=True,
    )

    response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/score-explanation",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["recommendation"] == "good_match"
    assert body["confidence_score"] > 0
    assert body["breakdown"]["experience"]["score"] >= 80
    assert body["highlights"]
    assert isinstance(body["gaps"], list)
    assert body["gaps"]
    assert isinstance(body["overestimation_risks"], list)


@pytest.mark.asyncio
async def test_job_score_explanation_viewer_gets_summary_only(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(db_session, "admin-score-expl-viewer@test.com", "password123", UserRole.ADMIN)
    await _create_active_user(db_session, "viewer-score-expl@test.com", "password123", UserRole.VIEWER)
    headers = await _auth_headers(client, "viewer-score-expl@test.com", "password123")
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        admin.id,
        include_ranking_row=True,
    )

    response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/score-explanation",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert "Consulte recrutador ou admin" in body["explanation"]
    assert body["breakdown"]["mandatory"] is None
    assert body["breakdown"]["optional"] is None
    assert body["breakdown"]["experience"] is None
    assert body["breakdown"]["seniority"] is None
    assert body["breakdown"]["ai_adjustment"] is None
    assert body["highlights"] == []
    assert body["risks"] == []
    assert body["high_score_reasons"] == []
    assert body["low_score_reasons"] == []
    assert body["recommended_questions"] == []
    assert body["strongest_evidence"] == []
    assert body["matched_equivalences"] == []
    assert body["gaps"] == []
    assert body["strengths"] == []
    assert body["factor_summary"]["positive"] == []
    assert body["factor_summary"]["negative"] == []
    assert body["factor_summary"]["contextual"] == []


@pytest.mark.asyncio
async def test_job_score_explanation_forbids_candidate_role(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(db_session, "admin-score-expl-candidate@test.com", "password123", UserRole.ADMIN)
    await _create_active_user(db_session, "candidate-score-expl@test.com", "password123", UserRole.CANDIDATE)
    headers = await _auth_headers(client, "candidate-score-expl@test.com", "password123")
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        admin.id,
        include_ranking_row=True,
    )

    response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/score-explanation",
        headers=headers,
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_job_score_explanation_uses_persisted_snapshot_not_head_text(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(db_session, "admin-score-expl-persisted@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-score-expl-persisted@test.com", "password123")
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        admin.id,
        include_ranking_row=True,
    )

    persisted_score = await db_session.scalar(
        sa.select(CandidateJobScoreModel).where(
            CandidateJobScoreModel.job_id == job_id,
            CandidateJobScoreModel.candidate_id == candidate_id,
        )
    )
    snapshot = await db_session.scalar(
        sa.select(CandidateJobScoreSnapshotModel).where(
            CandidateJobScoreSnapshotModel.job_id == job_id,
            CandidateJobScoreSnapshotModel.candidate_id == candidate_id,
        )
    )
    factor_count = await db_session.scalar(
        sa.select(sa.func.count(CandidateJobScoreFactorModel.id))
        .select_from(CandidateJobScoreFactorModel)
        .join(
            CandidateJobScoreSnapshotModel,
            CandidateJobScoreSnapshotModel.id == CandidateJobScoreFactorModel.snapshot_id,
        )
        .where(
            CandidateJobScoreSnapshotModel.job_id == job_id,
            CandidateJobScoreSnapshotModel.candidate_id == candidate_id,
        )
    )
    assert persisted_score is not None
    assert snapshot is not None
    assert factor_count is not None and factor_count > 0

    persisted_score.explanation_text = "TEXTO FALSO NÃO DEVE VAZAR"
    await db_session.commit()

    response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/score-explanation",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["explanation"] != "TEXTO FALSO NÃO DEVE VAZAR"
    assert body["factor_summary"]["positive"]
    assert body["computed_at"] is not None


@pytest.mark.asyncio
async def test_job_score_explanation_falls_back_when_snapshot_is_missing(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(db_session, "admin-score-expl-fallback@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-score-expl-fallback@test.com", "password123")
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        admin.id,
        include_ranking_row=False,
    )

    response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/score-explanation",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["explainability_version"] is None
    assert body["freshness_status"] == "unknown"
    assert body["factor_summary"]["positive"] == []
    assert body["factor_summary"]["negative"] == []
