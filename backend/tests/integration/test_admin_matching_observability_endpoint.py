from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import MatchingObservationModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel

from .test_admin_scoring_comparison_endpoint import (
    _auth_headers,
    _create_active_user,
)


@pytest.mark.asyncio
async def test_admin_matching_observability_summary_aggregates_observations(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(db_session, "admin-matching-summary@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-matching-summary@test.com", "password123")

    now = datetime.now(UTC)
    job_a = JobModel(
        title="Analista de Dados",
        description="Dados e BI",
        status="published",
        salary_currency="BRL",
        created_by=admin.id,
        created_at=now,
        updated_at=now,
    )
    job_b = JobModel(
        title="Analista Financeiro",
        description="Financeiro",
        status="published",
        salary_currency="BRL",
        created_by=admin.id,
        created_at=now,
        updated_at=now,
    )
    candidate_a = CandidateModel(
        full_name="Ana",
        email="ana-summary@test.com",
        location_country="BR",
        created_by=admin.id,
        created_at=now,
        updated_at=now,
    )
    candidate_b = CandidateModel(
        full_name="Bruno",
        email="bruno-summary@test.com",
        location_country="BR",
        created_by=admin.id,
        created_at=now,
        updated_at=now,
    )
    db_session.add_all([job_a, job_b, candidate_a, candidate_b])
    await db_session.flush()

    db_session.add_all(
        [
            MatchingObservationModel(
                job_id=job_a.id,
                candidate_id=candidate_a.id,
                engine_used="adaptive",
                score=Decimal("86.00"),
                confidence_score=Decimal("78.00"),
                matched_skills=["SQL", "Power BI"],
                missing_skills=["Python"],
                equivalences_used=["BI"],
                source="engine",
                observed_at=now,
                created_at=now,
                updated_at=now,
                liked=False,
                rejected=True,
            ),
            MatchingObservationModel(
                job_id=job_a.id,
                candidate_id=candidate_a.id,
                engine_used="adaptive",
                score=Decimal("82.00"),
                confidence_score=Decimal("74.00"),
                matched_skills=["SQL"],
                missing_skills=["Python"],
                equivalences_used=["BI"],
                source="ui",
                observed_at=now,
                created_at=now,
                updated_at=now,
            ),
            MatchingObservationModel(
                job_id=job_b.id,
                candidate_id=candidate_b.id,
                engine_used="legacy",
                score=Decimal("42.00"),
                confidence_score=Decimal("39.00"),
                matched_skills=["Excel"],
                missing_skills=["Conciliação bancária"],
                equivalences_used=["ERP"],
                source="ui",
                observed_at=now,
                created_at=now,
                updated_at=now,
                liked=True,
                rejected=False,
            ),
        ]
    )
    await db_session.commit()

    response = await client.get(
        "/api/v1/admin/matching-observability/summary",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_observations"] == 3
    assert body["adaptive_count"] == 2
    assert body["legacy_count"] == 1
    assert body["high_score_negative_feedback"] == 1
    assert body["low_score_positive_feedback"] == 1
    assert body["average_score"] > 0
    assert body["average_confidence"] > 0
    assert body["top_missing_skills"][0]["name"] == "Python"
    assert body["top_missing_skills"][0]["count"] == 2
    assert body["top_equivalences_used"][0]["name"] == "BI"
    assert body["top_equivalences_used"][0]["count"] == 2
    assert body["jobs_with_most_negative_feedback"][0]["job_title"] == "Analista de Dados"
    assert body["jobs_with_most_negative_feedback"][0]["negative_feedback_count"] == 1


@pytest.mark.asyncio
async def test_admin_matching_observability_summary_forbids_recruiter(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _create_active_user(db_session, "recruiter-matching-summary@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "recruiter-matching-summary@test.com", "password123")

    response = await client.get(
        "/api/v1/admin/matching-observability/summary",
        headers=headers,
    )

    assert response.status_code == 403
