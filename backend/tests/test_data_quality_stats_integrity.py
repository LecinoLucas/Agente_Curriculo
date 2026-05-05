"""Tests to ensure data_quality_stats reflects actual database state, not filtered entries.

Validates that:
- stats are calculated from ALL candidates in job (not just ranked ones)
- valid/unknown/invalid counts match actual bank state
- no masking of errors through fallbacks
"""
import pytest
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4
import logging

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
async def test_stats_calculated_from_all_candidates_not_filtered(db_session: AsyncSession, caplog):
    """Stats should count ALL candidates with scores, including invalid ones (which are filtered from ranking)."""
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

    # Create 5 candidates with different data quality statuses
    candidates = {
        "valid_1": CandidateModel(
            id=uuid4(),
            full_name="Valid 1",
            email="valid1@example.com",
            created_by=creator_id,
            data_quality_status="valid",
        ),
        "valid_2": CandidateModel(
            id=uuid4(),
            full_name="Valid 2",
            email="valid2@example.com",
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
        "parsing_failed": CandidateModel(
            id=uuid4(),
            full_name="Parsing Failed",
            email="parsing@example.com",
            created_by=creator_id,
            data_quality_status="parsing_failed",
        ),
    }

    for candidate in candidates.values():
        db_session.add(candidate)

    await db_session.flush()

    # Add all to pipeline
    for key, candidate in candidates.items():
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

    # Add scores for all (even invalid ones have scores)
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

    # Call get_ranking
    service = CandidateRankingService(db_session)
    result = await service.get_ranking(job.id)

    # CRITICAL: Stats should count ALL 5 candidates, not just the 3 in ranking
    stats = result["data_quality_stats"]
    ranking_entries = result["candidates"]

    # Ranking only has valid + unknown (3 candidates)
    assert len(ranking_entries) == 3, "Ranking should only show valid + unknown candidates"

    # But stats count ALL (5 candidates)
    assert stats["total_candidates"] == 5, f"Total should be 5 (all candidates), got {stats['total_candidates']}"
    assert stats["valid_candidates"] == 2, f"Valid should be 2, got {stats['valid_candidates']}"
    assert stats["unknown_candidates"] == 1, f"Unknown should be 1, got {stats['unknown_candidates']}"
    assert stats["invalid_candidates"] == 2, f"Invalid should be 2 (no_resume + parsing_failed), got {stats['invalid_candidates']}"
    assert stats["filtered_candidates"] == 2, f"Filtered should be 2, got {stats['filtered_candidates']}"

    # Verify breakdown
    assert stats["valid_candidates"] + stats["unknown_candidates"] + stats["invalid_candidates"] == stats["total_candidates"]
