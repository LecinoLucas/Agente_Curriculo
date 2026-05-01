from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole

from .test_admin_scoring_comparison_endpoint import (
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
    assert body["engine_used"] in {"legacy", "adaptive"}
    assert isinstance(body["high_score_reasons"], list)
    assert body["high_score_reasons"]
    assert isinstance(body["recommended_questions"], list)
    assert body["recommended_questions"]
    assert isinstance(body["strongest_evidence"], list)
    assert body["strongest_evidence"]
    assert isinstance(body["matched_equivalences"], list)


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
    assert body["recommended_questions"]
    assert body["strongest_evidence"]
    assert isinstance(body["gaps"], list)
    assert body["gaps"]
    assert body["overestimation_risks"] == []


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
    assert body["high_score_reasons"] == []
    assert body["low_score_reasons"] == []
    assert body["recommended_questions"] == []
    assert body["strongest_evidence"] == []
    assert body["matched_equivalences"] == []
    assert body["gaps"] == []
    assert body["strengths"] == []


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
