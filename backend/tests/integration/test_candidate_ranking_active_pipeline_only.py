from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_ranking_service import CandidateRankingService
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    ScoreModelVersionModel,
)

from .helpers import _create_active_user, _seed_scoring_case


@pytest.mark.asyncio
async def test_ranking_uses_only_active_pipeline_for_active_job(db_session: AsyncSession) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"ranking-active-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    job_id, candidate_id, match_id = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Ranking Active Job",
    )
    job = await db_session.scalar(sa.select(JobModel).where(JobModel.id == job_id))
    match_row = await db_session.scalar(sa.select(CandidateJobMatchModel).where(CandidateJobMatchModel.id == match_id))
    pipeline_row = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert job is not None
    assert match_row is not None
    assert pipeline_row is not None
    assert pipeline_row.current_analysis_id is not None

    match_row.skill_evidence_breakdown = {
        "priority_score_weighted": 100.0,
        "complementary_score_weighted": 0.0,
        "optional_score_raw_weighted": 0.0,
        "validation_reasons": [],
        "missing_required_skills": [],
    }
    match_row.updated_at = datetime.now(UTC)
    await db_session.execute(sa.update(ScoreModelVersionModel).values(is_active=False))
    version = ScoreModelVersionModel(
        version=f"active-ranking-{uuid4().hex[:6]}",
        is_active=True,
        weights={"skill_match": 0.4},
        thresholds={"high": 70, "low": 45},
    )
    db_session.add(version)
    await db_session.flush()

    now = datetime.now(UTC)
    db_session.add(
        CandidateJobScoreModel(
            candidate_id=candidate_id,
            job_id=job_id,
            version_id=version.id,
            source_analysis_id=pipeline_row.current_analysis_id,
            source_analysis_created_at=now,
            input_hash=f"hash-{uuid4().hex}",
            score_model_version=version.version,
            explainability_version="v1",
            final_score=Decimal("77.50"),
            decision_suggestion="approved",
            breakdown={
                "skill_match_score": 100,
                "experience_match_score": 90,
                "seniority_match_score": 100,
                "education_score": 50,
                "confidence_score": 90,
                "penalty_score": 0,
                "validation_penalty_score": 0,
                "job_fit_score": 77.5,
            },
            reason_codes=[],
            explanation_text="ok",
            freshness_status="fresh",
            computed_at=now,
            updated_at=now,
            previous_score=None,
            recompute_reason="test",
            job_signature_hash=str(job.job_profile_hash),
            job_updated_at=job.updated_at,
        )
    )
    await db_session.commit()

    ranking_service = CandidateRankingService(db_session)

    pipeline_row = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline_row is not None
    pipeline_row.link_status = "transferred"
    pipeline_row.relationship_status = "archived"
    pipeline_row.pipeline_status = "terminal"
    pipeline_row.is_terminal = True
    pipeline_row.terminated_at = datetime.now(UTC)
    pipeline_row.termination_reason = "candidate_transferred"
    await db_session.commit()

    persisted_score_count = int(
        (
            await db_session.scalar(
                sa.select(sa.func.count())
                .select_from(CandidateJobScoreModel)
                .where(
                    CandidateJobScoreModel.candidate_id == candidate_id,
                    CandidateJobScoreModel.job_id == job_id,
                )
            )
        )
        or 0
    )
    assert persisted_score_count == 1

    after = await ranking_service.get_ranking(job_id)
    assert after["total_candidates"] == 0
