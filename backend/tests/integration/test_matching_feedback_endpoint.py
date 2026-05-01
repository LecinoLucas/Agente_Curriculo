from __future__ import annotations

from decimal import Decimal

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import (
    MatchingObservationModel,
    ResumeJobMatchModel,
)

from .test_admin_scoring_comparison_endpoint import (
    _auth_headers,
    _create_active_user,
    _seed_scoring_case,
)


@pytest.mark.asyncio
async def test_score_explanation_records_matching_observation_snapshot(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(db_session, "admin-matching-obsv@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-matching-obsv@test.com", "password123")
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
    observation = await db_session.scalar(
        sa.select(MatchingObservationModel).where(
            MatchingObservationModel.job_id == job_id,
            MatchingObservationModel.candidate_id == candidate_id,
        )
    )

    assert observation is not None
    assert observation.engine_used in {"legacy", "adaptive"}
    assert Decimal(str(observation.score)) >= Decimal("0")
    assert Decimal(str(observation.confidence_score)) >= Decimal("0")
    assert isinstance(observation.matched_skills, list)
    assert isinstance(observation.missing_skills, list)
    assert isinstance(observation.equivalences_used, list)
    assert observation.source == "ui"
    assert observation.observed_at is not None


@pytest.mark.asyncio
async def test_recruiter_can_save_matching_feedback_without_changing_match_score(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(db_session, "admin-matching-feedback@test.com", "password123", UserRole.ADMIN)
    await _create_active_user(db_session, "recruiter-matching-feedback@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "recruiter-matching-feedback@test.com", "password123")
    job_id, candidate_id, analysis_id = await _seed_scoring_case(
        db_session,
        admin.id,
        include_ranking_row=True,
    )

    persisted_match = await db_session.scalar(
        sa.select(ResumeJobMatchModel).where(
            ResumeJobMatchModel.analysis_id == analysis_id,
            ResumeJobMatchModel.job_id == job_id,
        )
    )
    assert persisted_match is not None
    original_score = Decimal(str(persisted_match.match_score))

    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/matching-feedback",
        headers=headers,
        json={
            "liked": True,
            "rejected": False,
            "hired": False,
            "comment": "Bom sinal para shortlist",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["liked"] is True
    assert body["rejected"] is False
    assert body["hired"] is False
    assert body["comment"] == "Bom sinal para shortlist"

    observation = await db_session.scalar(
        sa.select(MatchingObservationModel).where(
            MatchingObservationModel.job_id == job_id,
            MatchingObservationModel.candidate_id == candidate_id,
        )
    )
    assert observation is not None
    assert observation.liked is True
    assert observation.rejected is False
    assert observation.hired is False
    assert observation.feedback_comment == "Bom sinal para shortlist"
    assert observation.feedback_at is not None

    refreshed_match = await db_session.scalar(
        sa.select(ResumeJobMatchModel).where(
            ResumeJobMatchModel.analysis_id == analysis_id,
            ResumeJobMatchModel.job_id == job_id,
        )
    )
    assert refreshed_match is not None
    assert Decimal(str(refreshed_match.match_score)) == original_score


@pytest.mark.asyncio
async def test_viewer_cannot_save_matching_feedback(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(db_session, "admin-matching-viewer@test.com", "password123", UserRole.ADMIN)
    await _create_active_user(db_session, "viewer-matching-feedback@test.com", "password123", UserRole.VIEWER)
    headers = await _auth_headers(client, "viewer-matching-feedback@test.com", "password123")
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        admin.id,
        include_ranking_row=True,
    )

    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/matching-feedback",
        headers=headers,
        json={"liked": True},
    )

    assert response.status_code == 403
