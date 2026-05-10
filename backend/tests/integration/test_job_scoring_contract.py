from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_service import AnalysisService
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


@pytest.mark.asyncio
async def test_single_candidate_scoring_reuses_existing_match_without_rematch(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"scoring-contract-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id, candidate_id, match_id = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Scoring Contract Job",
        include_ranking_row=False,
    )

    await db_session.execute(
        sa.update(CandidateJobMatchModel)
        .where(CandidateJobMatchModel.id == match_id)
        .values(
            skill_evidence_breakdown={
                "priority_score_weighted": 100.0,
                "complementary_score_weighted": 0.0,
                "complementary_score_raw_weighted": 0.0,
                "priority_strong_coverage": 100.0,
                "matched_priority_skills": ["Python", "FastAPI"],
                "missing_priority_skills": [],
                "matched_complementary_skills": [],
                "missing_complementary_skills": [],
                "matched_eliminatory_skills": [],
                "missing_eliminatory_skills": [],
                "validation_reasons": [],
            }
        )
    )
    await db_session.commit()

    with patch.object(
        AnalysisService,
        "match_completed_analysis_to_job",
        new=AsyncMock(),
    ) as mocked_match:
        response = await client.post(
            f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/scoring",
            headers=headers,
        )

    assert response.status_code in {200, 409}
    mocked_match.assert_not_awaited()
