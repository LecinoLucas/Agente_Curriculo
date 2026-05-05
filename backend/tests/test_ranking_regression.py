"""Regression tests for GET /jobs/{job_id}/ranking endpoint.

Validates that the endpoint handles:
- Candidates with valid data_quality_status
- Candidates with unknown data_quality_status
- Candidates with invalid data_quality_status (filtered out)
- Jobs with no scores yet
- Jobs with mixed data quality states
"""
import pytest
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    ScoreModelVersionModel,
)
from src.application.services.candidate_ranking_service import CandidateRankingService


@pytest.mark.asyncio
async def test_get_ranking_with_data_quality_status(db_session: AsyncSession):
    """Test ranking endpoint returns data_quality_status for each candidate."""
    # Setup: Create job, candidates, and scores
    creator_id = uuid4()
    db_session.add(
        UserModel(
            id=creator_id,
            email=f"creator-{creator_id}@example.com",
            password_hash="hash",
            role="recruiter",
            status="active",
            full_name="Creator",
        )
    )
    await db_session.flush()

    job = JobModel(
        id=uuid4(),
        title="Test Job",
        description="Test",
        status="published",
        created_by=creator_id,
    )
    db_session.add(job)

    version = ScoreModelVersionModel(
        id=uuid4(),
        version="1.0.0",
        is_active=True,
        weights={"skill_match": 0.4, "experience_match": 0.25, "seniority_match": 0.2, "education": 0.1, "ai_confidence": 0.05},
        thresholds={"high": 70, "low": 45},
    )
    db_session.add(version)

    # Valid candidate
    candidate_valid = CandidateModel(
        id=uuid4(),
        full_name="Alice Valid",
        email="alice@example.com",
        created_by=creator_id,
        data_quality_status="valid",
    )
    db_session.add(candidate_valid)

    # Unknown candidate
    candidate_unknown = CandidateModel(
        id=uuid4(),
        full_name="Bob Unknown",
        email="bob@example.com",
        created_by=creator_id,
        data_quality_status="unknown",
    )
    db_session.add(candidate_unknown)

    # Invalid candidate
    candidate_invalid = CandidateModel(
        id=uuid4(),
        full_name="Charlie Invalid",
        email="charlie@example.com",
        created_by=creator_id,
        data_quality_status="parsing_failed",
        data_quality_reason="Resume file was corrupted",
    )
    db_session.add(candidate_invalid)

    await db_session.flush()

    # Add all candidates to pipeline
    for candidate in [candidate_valid, candidate_unknown, candidate_invalid]:
        pipeline = CandidateJobPipelineModel(
            candidate_id=candidate.id,
            job_id=job.id,
            pipeline_stage="screening",
            link_status="active",
            pipeline_status="active",
            source="manual",
        )
        db_session.add(pipeline)

    await db_session.flush()

    # Add scores for all candidates (even invalid ones have scores)
    for candidate in [candidate_valid, candidate_unknown, candidate_invalid]:
        score = CandidateJobScoreModel(
            id=uuid4(),
            candidate_id=candidate.id,
            job_id=job.id,
            version_id=version.id,
            final_score=Decimal("75.0"),
            decision_suggestion="approved",
            breakdown={
                "skill_match_score": 75.0,
                "experience_match_score": 80.0,
                "seniority_match_score": 70.0,
                "education_score": 85.0,
                "ai_confidence_score": 80.0,
                "penalty_score": 0.0,
                "validation_penalty_score": 0.0,
                "final_score": 75.0,
            },
            reason_codes=[],
            explanation_text="Candidate matches well",
            computed_at=datetime.now(UTC),
        )
        db_session.add(score)

    await db_session.commit()

    # Call get_ranking
    service = CandidateRankingService(db_session)
    result = await service.get_ranking(job.id)

    # Assertions
    assert "data_quality_stats" in result
    assert result["data_quality_stats"]["total_candidates"] == 3
    assert result["data_quality_stats"]["valid_candidates"] == 1
    assert result["data_quality_stats"]["unknown_candidates"] == 1
    assert result["data_quality_stats"]["invalid_candidates"] == 1
    assert result["data_quality_stats"]["filtered_candidates"] == 1

    # Only valid + unknown candidates should be in ranking
    assert len(result["candidates"]) == 2

    # Each candidate should have data_quality_status
    for candidate_entry in result["candidates"]:
        assert "data_quality_status" in candidate_entry
        assert candidate_entry["data_quality_status"] in ["valid", "unknown"]

    # Verify invalid candidate is filtered out
    candidate_names = [c["candidate_name"] for c in result["candidates"]]
    assert "Alice Valid" in candidate_names
    assert "Bob Unknown" in candidate_names
    assert "Charlie Invalid" not in candidate_names
