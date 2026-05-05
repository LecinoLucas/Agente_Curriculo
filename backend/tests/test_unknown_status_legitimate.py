"""Test to validate that "unknown" is treated as legitimate state, not error.

Ensures:
- unknown candidates are included in ranking (not filtered)
- unknown is counted in stats as "unknown_candidates"
- unknown does NOT count as invalid
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
async def test_unknown_is_legitimate_not_invalid(db_session: AsyncSession):
    """Unknown candidates should be included in ranking, not filtered as invalid."""
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

    # Create candidates with different statuses
    candidates = {
        "valid": CandidateModel(
            id=uuid4(),
            full_name="Valid",
            email="valid@example.com",
            created_by=creator_id,
            data_quality_status="valid",
        ),
        "unknown": CandidateModel(
            id=uuid4(),
            full_name="Unknown",
            email="unknown@example.com",
            created_by=creator_id,
            data_quality_status="unknown",
        ),
        "no_resume": CandidateModel(
            id=uuid4(),
            full_name="No Resume",
            email="noresume@example.com",
            created_by=creator_id,
            data_quality_status="no_resume",
        ),
    }

    for candidate in candidates.values():
        db_session.add(candidate)

    await db_session.flush()

    # Add to pipeline
    for candidate in candidates.values():
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

    # Add scores
    for candidate in candidates.values():
        score = CandidateJobScoreModel(
            id=uuid4(),
            candidate_id=candidate.id,
            job_id=job.id,
            version_id=version.id,
            final_score=Decimal("50.0"),
            decision_suggestion="review",
            breakdown={
                "skill_match_score": 50.0,
                "experience_match_score": 45.0,
                "seniority_match_score": 50.0,
                "education_score": 55.0,
                "ai_confidence_score": 50.0,
                "penalty_score": 0.0,
                "validation_penalty_score": 0.0,
                "final_score": 50.0,
            },
            reason_codes=[],
            explanation_text="Test",
            computed_at=datetime.now(UTC),
        )
        db_session.add(score)

    await db_session.commit()

    # Get ranking
    service = CandidateRankingService(db_session)
    result = await service.get_ranking(job.id)

    # CRITICAL: unknown should be in ranking, not filtered
    ranking_names = {c["candidate_name"] for c in result["candidates"]}
    assert "Valid" in ranking_names
    assert "Unknown" in ranking_names, "Unknown should be INCLUDED in ranking"
    assert "No Resume" not in ranking_names, "No Resume should be FILTERED from ranking"

    # Stats should properly categorize
    stats = result["data_quality_stats"]
    assert stats["total_candidates"] == 3
    assert stats["valid_candidates"] == 1
    assert stats["unknown_candidates"] == 1, "Unknown should be counted as unknown, not invalid"
    assert stats["invalid_candidates"] == 1  # Only no_resume
    assert stats["filtered_candidates"] == 1, "Only invalid should be filtered"

    # Unknown is NOT part of filtered
    assert stats["unknown_candidates"] + stats["valid_candidates"] == 2
    assert stats["total_candidates"] == stats["valid_candidates"] + stats["unknown_candidates"] + stats["invalid_candidates"]
