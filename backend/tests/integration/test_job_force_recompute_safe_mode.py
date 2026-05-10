from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_service import AnalysisService
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreSnapshotModel,
    ScoreModelVersionModel,
)
from src.interface.api.schemas.analysis_schemas import AnalysisMatchResponse

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


@pytest.mark.asyncio
async def test_force_recompute_uses_active_pipeline_and_returns_old_new_scores(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"force-recompute-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Force Recompute Job",
        include_ranking_row=True,
    )

    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline is not None
    assert pipeline.current_analysis_id is not None

    active_version = await db_session.scalar(
        sa.select(ScoreModelVersionModel).where(ScoreModelVersionModel.is_active.is_(True))
    )
    assert active_version is not None
    job = await db_session.scalar(sa.select(JobModel).where(JobModel.id == job_id))
    assert job is not None

    db_session.add(
        CandidateJobScoreSnapshotModel(
            candidate_id=candidate_id,
            job_id=job_id,
            version_id=active_version.id,
            ranking_version=active_version.version,
            source_analysis_id=pipeline.current_analysis_id,
            source_analysis_created_at=datetime.now(UTC),
            job_signature_hash=str(job.job_profile_hash),
            score_model_version=active_version.version,
            explainability_version="v1",
            input_hash=f"snapshot-{uuid4().hex}",
            final_score=41.52,
            freshness_status="fresh",
            computed_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    old_score = await db_session.scalar(
        sa.select(CandidateJobScoreSnapshotModel.final_score)
        .where(
            CandidateJobScoreSnapshotModel.candidate_id == candidate_id,
            CandidateJobScoreSnapshotModel.job_id == job_id,
        )
        .order_by(
            CandidateJobScoreSnapshotModel.computed_at.desc(),
            CandidateJobScoreSnapshotModel.id.desc(),
        )
        .limit(1)
    )
    assert old_score is not None

    mocked_match = AnalysisMatchResponse(
        analysis_id=pipeline.current_analysis_id,
        job_id=job_id,
        job_fit_score=58.75,
        recommendation="review_manually",
        mandatory_skills_matched=1,
        mandatory_skills_total=2,
        optional_skills_matched=1,
        optional_skills_total=1,
        seniority_score=72.0,
        validation_status="pass",
        missing_evidence=[],
        rejection_reasons=[],
        engine_used="canonical",
        score_breakdown={},
        strengths=[],
        gaps=[],
        risk_points=[],
        explanation=None,
        behavioral_indicators=[],
        match_freshness_status="fresh",
        ranking_refresh_status="updated",
        ranking_freshness_status="fresh",
        ranking_refreshed_at=datetime.now(UTC),
        ranking_warning=None,
    )

    with patch.object(
        AnalysisService,
        "match_completed_analysis_to_job",
        new=AsyncMock(return_value=mocked_match),
    ) as mocked_force:
        response = await client.post(
            f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/force-recompute",
            headers=headers,
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["candidate_id"] == str(candidate_id)
    assert payload["job_id"] == str(job_id)
    assert payload["analysis_id"] == str(pipeline.current_analysis_id)
    assert payload["old_score"] == float(old_score)
    assert payload["new_score"] == 58.75
    assert payload["score_delta"] == round(58.75 - float(old_score), 2)
    assert payload["ranking_refresh_status"] == "updated"
    assert payload["ranking_freshness_status"] == "fresh"

    mocked_force.assert_awaited_once()
    assert mocked_force.await_args.kwargs["analysis_id"] == pipeline.current_analysis_id
    assert mocked_force.await_args.kwargs["job_id"] == job_id
    assert mocked_force.await_args.kwargs["force_recompute"] is True
