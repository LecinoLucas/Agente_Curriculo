"""Regression tests for GET /jobs/{job_id}/ranking endpoint.

Validates that the endpoint handles:
- Candidates with valid data_quality_status
- Candidates with unknown data_quality_status
- Candidates with invalid data_quality_status (filtered out)
- Jobs with no scores yet
- Jobs with mixed data quality states
"""
import pytest
import sqlalchemy as sa
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreFactorModel,
    CandidateJobScoreModel,
    CandidateJobScoreSnapshotModel,
    ScoreModelVersionModel,
)
from src.application.services.candidate_ranking_service import CandidateRankingService
from src.application.services.candidate_ranking_service import _coerce_utc_datetime
from src.application.services.analysis_service import AnalysisService
from src.infrastructure.repositories.sqlalchemy_analysis_repository import SQLAlchemyAnalysisRepository
from src.observability.metrics_service import PipelineMetricsService
from src.infrastructure.database.models.pipeline_event_model import PipelineEventModel
from tests.integration.helpers import _seed_scoring_case


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


@pytest.mark.asyncio
async def test_compute_single_candidate_matches_full_ranking_formula(db_session: AsyncSession):
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
    await db_session.commit()

    job_id, candidate_id, _ = await _seed_scoring_case(db_session, created_by=creator_id)
    version = ScoreModelVersionModel(
        id=uuid4(),
        version="ranking-parity",
        is_active=True,
        weights={"skill_match": 0.4, "experience_match": 0.25, "seniority_match": 0.2, "education": 0.1, "ai_confidence": 0.05},
        thresholds={"high": 70, "low": 45},
    )
    db_session.add(version)
    await db_session.commit()

    service = CandidateRankingService(db_session)
    full_count = await service.compute_and_persist(job_id)
    assert full_count == 1

    full_score = await db_session.scalar(
        sa.select(CandidateJobScoreModel).where(
            CandidateJobScoreModel.job_id == job_id,
            CandidateJobScoreModel.candidate_id == candidate_id,
            CandidateJobScoreModel.version_id == version.id,
        )
    )
    assert full_score is not None
    expected_score = full_score.final_score
    expected_decision = full_score.decision_suggestion

    await db_session.delete(full_score)
    await db_session.commit()

    single_result = await service.compute_single_candidate(job_id, candidate_id)
    assert single_result is not None

    single_score = await db_session.scalar(
        sa.select(CandidateJobScoreModel).where(
            CandidateJobScoreModel.job_id == job_id,
            CandidateJobScoreModel.candidate_id == candidate_id,
            CandidateJobScoreModel.version_id == version.id,
        )
    )
    assert single_score is not None
    assert single_score.final_score == expected_score
    assert single_score.decision_suggestion == expected_decision
    assert single_score.freshness_status == "fresh"
    assert single_result["final_score"] == expected_score
    assert single_score.explainability_version == "v1_structured_factors"
    assert single_score.factor_summary_json is not None
    assert single_score.delta_summary_json is not None

    snapshot_count = await db_session.scalar(
        sa.select(sa.func.count(CandidateJobScoreSnapshotModel.id)).where(
            CandidateJobScoreSnapshotModel.job_id == job_id,
            CandidateJobScoreSnapshotModel.candidate_id == candidate_id,
            CandidateJobScoreSnapshotModel.version_id == version.id,
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
            CandidateJobScoreSnapshotModel.version_id == version.id,
        )
    )
    assert snapshot_count == 2
    assert factor_count is not None and factor_count > 0


@pytest.mark.asyncio
async def test_get_ranking_marks_stale_when_match_is_newer(db_session: AsyncSession):
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
    await db_session.commit()

    job_id, candidate_id, match_id = await _seed_scoring_case(db_session, created_by=creator_id)
    version = ScoreModelVersionModel(
        id=uuid4(),
        version="ranking-freshness",
        is_active=True,
        weights={"skill_match": 0.4, "experience_match": 0.25, "seniority_match": 0.2, "education": 0.1, "ai_confidence": 0.05},
        thresholds={"high": 70, "low": 45},
    )
    db_session.add(version)
    await db_session.commit()

    service = CandidateRankingService(db_session)
    await service.compute_single_candidate(job_id, candidate_id)
    await db_session.commit()

    persisted_score = await db_session.scalar(
        sa.select(CandidateJobScoreModel).where(
            CandidateJobScoreModel.job_id == job_id,
            CandidateJobScoreModel.candidate_id == candidate_id,
            CandidateJobScoreModel.version_id == version.id,
        )
    )
    match_row = await db_session.get(CandidateJobMatchModel, match_id)
    assert persisted_score is not None
    assert match_row is not None

    persisted_score.updated_at = datetime(2026, 1, 1, tzinfo=UTC)
    match_row.updated_at = datetime(2026, 1, 2, tzinfo=UTC)
    await db_session.commit()

    result = await service.get_ranking(job_id)
    assert result["candidates"][0]["freshness_status"] == "stale"


@pytest.mark.asyncio
async def test_compute_single_candidate_is_idempotent(db_session: AsyncSession):
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
    await db_session.commit()

    job_id, candidate_id, _ = await _seed_scoring_case(db_session, created_by=creator_id)
    version = ScoreModelVersionModel(
        id=uuid4(),
        version="ranking-idempotent",
        is_active=True,
        weights={"skill_match": 0.4, "experience_match": 0.25, "seniority_match": 0.2, "education": 0.1, "ai_confidence": 0.05},
        thresholds={"high": 70, "low": 45},
    )
    db_session.add(version)
    await db_session.commit()

    service = CandidateRankingService(db_session)
    await service.compute_single_candidate(job_id, candidate_id)
    await service.compute_single_candidate(job_id, candidate_id)
    await db_session.commit()

    count = await db_session.scalar(
        sa.select(sa.func.count(CandidateJobScoreModel.id)).where(
            CandidateJobScoreModel.job_id == job_id,
            CandidateJobScoreModel.candidate_id == candidate_id,
            CandidateJobScoreModel.version_id == version.id,
        )
    )
    assert count == 1


@pytest.mark.asyncio
async def test_persist_score_does_not_overwrite_newer_analysis(db_session: AsyncSession):
    creator_id = uuid4()
    candidate_id = uuid4()
    job_id = uuid4()
    version_id = uuid4()
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
    db_session.add(
        CandidateModel(
            id=candidate_id,
            full_name="Race Candidate",
            email="race@example.com",
            created_by=creator_id,
            data_quality_status="valid",
        )
    )
    db_session.add(
        JobModel(
            id=job_id,
            title="Race Job",
            description="Test",
            status="published",
            created_by=creator_id,
        )
    )
    version = ScoreModelVersionModel(
        id=version_id,
        version="ranking-race",
        is_active=True,
        weights={"skill_match": 0.4, "experience_match": 0.25, "seniority_match": 0.2, "education": 0.1, "ai_confidence": 0.05},
        thresholds={"high": 70, "low": 45},
    )
    db_session.add(version)
    await db_session.commit()

    service = CandidateRankingService(db_session)
    newer_analysis_at = datetime(2026, 1, 2, tzinfo=UTC)
    older_analysis_at = datetime(2026, 1, 1, tzinfo=UTC)

    await service._persist_score(
        candidate_id=candidate_id,
        job_id=job_id,
        version=version,
        payload={
            "source_analysis_id": uuid4(),
            "source_analysis_created_at": newer_analysis_at,
            "score_model_version": version.version,
            "final_score": Decimal("82.00"),
            "decision_suggestion": "approved",
            "breakdown": {
                "skill_match_score": 82.0,
                "experience_match_score": 82.0,
                "seniority_match_score": 82.0,
                "education_score": 82.0,
                "confidence_score": 100.0,
                "ai_confidence_score": 100.0,
                "penalty_score": 0.0,
                "validation_penalty_score": 0.0,
                "final_score": 82.0,
            },
            "reason_codes": [],
            "explanation_text": "newer score",
            "freshness_status": "fresh",
            "computed_at": datetime(2026, 1, 2, 12, 0, tzinfo=UTC),
            "updated_at": datetime(2026, 1, 2, 12, 0, tzinfo=UTC),
        },
    )
    await service._persist_score(
        candidate_id=candidate_id,
        job_id=job_id,
        version=version,
        payload={
            "source_analysis_id": uuid4(),
            "source_analysis_created_at": older_analysis_at,
            "score_model_version": version.version,
            "final_score": Decimal("76.00"),
            "decision_suggestion": "review",
            "breakdown": {
                "skill_match_score": 76.0,
                "experience_match_score": 76.0,
                "seniority_match_score": 76.0,
                "education_score": 76.0,
                "confidence_score": 100.0,
                "ai_confidence_score": 100.0,
                "penalty_score": 0.0,
                "validation_penalty_score": 0.0,
                "final_score": 76.0,
            },
            "reason_codes": [],
            "explanation_text": "older score",
            "freshness_status": "fresh",
            "computed_at": datetime(2026, 1, 3, 12, 0, tzinfo=UTC),
            "updated_at": datetime(2026, 1, 3, 12, 0, tzinfo=UTC),
        },
    )
    await db_session.commit()

    persisted = await db_session.scalar(
        sa.select(CandidateJobScoreModel).where(
            CandidateJobScoreModel.job_id == job_id,
            CandidateJobScoreModel.candidate_id == candidate_id,
            CandidateJobScoreModel.version_id == version_id,
        )
    )
    assert persisted is not None
    assert persisted.final_score == Decimal("82.00")
    assert persisted.decision_suggestion == "approved"
    assert _coerce_utc_datetime(persisted.source_analysis_created_at) == newer_analysis_at


@pytest.mark.asyncio
async def test_match_recompute_failure_does_not_break_matching(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch):
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
    await db_session.commit()

    job_id, candidate_id, _ = await _seed_scoring_case(db_session, created_by=creator_id)
    version = ScoreModelVersionModel(
        id=uuid4(),
        version="ranking-failure",
        is_active=True,
        weights={"skill_match": 0.4, "experience_match": 0.25, "seniority_match": 0.2, "education": 0.1, "ai_confidence": 0.05},
        thresholds={"high": 70, "low": 45},
    )
    db_session.add(version)
    await db_session.commit()

    match_row = await db_session.scalar(
        sa.select(CandidateJobMatchModel).where(
            CandidateJobMatchModel.job_id == job_id,
            CandidateJobMatchModel.candidate_id == candidate_id,
        )
    )
    assert match_row is not None

    analysis_id = await db_session.scalar(
        sa.select(AnalysisModel.id).where(
            AnalysisModel.resume_version_id == match_row.resume_version_id,
            AnalysisModel.job_id == job_id,
            AnalysisModel.status == "completed",
        )
    )
    assert analysis_id is not None
    repo = SQLAlchemyAnalysisRepository(db_session)
    service = AnalysisService(repo)

    async def _boom(self, job_id, candidate_id):
        raise RuntimeError("single candidate recompute exploded")

    monkeypatch.setattr(
        "src.application.services.candidate_ranking_service.CandidateRankingService.compute_single_candidate",
        _boom,
    )

    response = await service.match_completed_analysis_to_job(analysis_id, job_id)
    assert response.ranking_refresh_status == "failed"
    assert response.ranking_freshness_status == "stale"
    assert response.ranking_warning is not None

    persisted_match = await db_session.scalar(
        sa.select(CandidateJobMatchModel).where(
            CandidateJobMatchModel.job_id == job_id,
            CandidateJobMatchModel.candidate_id == candidate_id,
        )
    )
    assert persisted_match is not None
    assert persisted_match.match_score is not None


@pytest.mark.asyncio
async def test_ranking_observability_metrics_and_event_payload(db_session: AsyncSession):
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
    await db_session.commit()

    job_id, candidate_id, match_id = await _seed_scoring_case(db_session, created_by=creator_id)
    version = ScoreModelVersionModel(
        id=uuid4(),
        version="ranking-observability",
        is_active=True,
        weights={"skill_match": 0.4, "experience_match": 0.25, "seniority_match": 0.2, "education": 0.1, "ai_confidence": 0.05},
        thresholds={"high": 70, "low": 45},
    )
    db_session.add(version)
    await db_session.commit()

    service = CandidateRankingService(db_session)
    result = await service.compute_single_candidate(job_id, candidate_id)
    assert result is not None
    await db_session.commit()

    persisted_score = await db_session.scalar(
        sa.select(CandidateJobScoreModel).where(
            CandidateJobScoreModel.job_id == job_id,
            CandidateJobScoreModel.candidate_id == candidate_id,
            CandidateJobScoreModel.version_id == version.id,
        )
    )
    match_row = await db_session.get(CandidateJobMatchModel, match_id)
    assert persisted_score is not None
    assert match_row is not None

    persisted_score.updated_at = datetime(2026, 1, 1, tzinfo=UTC)
    match_row.updated_at = datetime(2026, 1, 2, tzinfo=UTC)
    await db_session.commit()

    recompute_event = await db_session.scalar(
        sa.select(PipelineEventModel)
        .where(PipelineEventModel.event_type == "ranking.recomputed")
        .order_by(PipelineEventModel.created_at.desc())
    )
    assert recompute_event is not None
    assert recompute_event.payload["event"] == "ranking_recomputed"
    assert recompute_event.payload["candidate_id"] == str(candidate_id)
    assert recompute_event.payload["job_id"] == str(job_id)
    assert recompute_event.payload["monotonicity_decision"] == "updated"
    assert recompute_event.payload["score_model_version"] == version.version
    assert recompute_event.payload["ranking_version"] == version.version
    assert recompute_event.payload["input_hash"]

    metrics = await PipelineMetricsService(db_session).get_metrics(window_hours=24)
    ranking_metrics = metrics["ranking"]
    assert ranking_metrics["counters"]["ranking_recompute_total"] >= 1
    assert ranking_metrics["counters"]["ranking_recompute_success_total"] >= 1
    assert ranking_metrics["histograms"]["ranking_recompute_duration_ms"]["count"] >= 1
    assert ranking_metrics["gauges"]["ranking_stale_candidates_total"] >= 1


@pytest.mark.asyncio
async def test_compute_single_candidate_appends_snapshots_and_derives_delta(db_session: AsyncSession):
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
    await db_session.commit()

    job_id, candidate_id, match_id = await _seed_scoring_case(db_session, created_by=creator_id)
    version = ScoreModelVersionModel(
        id=uuid4(),
        version="ranking-delta",
        is_active=True,
        weights={"skill_match": 0.4, "experience_match": 0.25, "seniority_match": 0.2, "education": 0.1, "ai_confidence": 0.05},
        thresholds={"high": 70, "low": 45},
    )
    db_session.add(version)
    await db_session.commit()

    service = CandidateRankingService(db_session)
    first = await service.compute_single_candidate(job_id, candidate_id)
    assert first is not None
    await db_session.commit()

    match_row = await db_session.get(CandidateJobMatchModel, match_id)
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.job_id == job_id,
            CandidateJobPipelineModel.candidate_id == candidate_id,
        )
    )
    assert match_row is not None
    assert pipeline is not None

    newer_analysis = AnalysisModel(
        resume_version_id=match_row.resume_version_id,
        job_id=job_id,
        ai_model_id=(await db_session.scalar(sa.select(AnalysisModel.ai_model_id).where(AnalysisModel.id == pipeline.current_analysis_id))),
        prompt_template_id=(await db_session.scalar(sa.select(AnalysisModel.prompt_template_id).where(AnalysisModel.id == pipeline.current_analysis_id))),
        status="completed",
        requested_by=creator_id,
        started_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
    )
    db_session.add(newer_analysis)
    await db_session.flush()

    pipeline.current_analysis_id = newer_analysis.id
    match_row.match_score = Decimal("61.00")
    match_row.recommendation = "potential"
    match_row.matched_skills_json = ["Python"]
    match_row.missing_skills_json = ["FastAPI", "pipelines"]
    await db_session.commit()

    second = await service.compute_single_candidate(job_id, candidate_id)
    assert second is not None
    await db_session.commit()

    snapshot_count = await db_session.scalar(
        sa.select(sa.func.count(CandidateJobScoreSnapshotModel.id)).where(
            CandidateJobScoreSnapshotModel.job_id == job_id,
            CandidateJobScoreSnapshotModel.candidate_id == candidate_id,
            CandidateJobScoreSnapshotModel.version_id == version.id,
        )
    )
    assert snapshot_count == 2
    assert second["delta"]["change_reason"] == "candidate_analysis_changed"
    assert second["delta"]["score_change"] < 0
    assert second["delta"]["top_changes"]

    persisted_head = await db_session.scalar(
        sa.select(CandidateJobScoreModel).where(
            CandidateJobScoreModel.job_id == job_id,
            CandidateJobScoreModel.candidate_id == candidate_id,
            CandidateJobScoreModel.version_id == version.id,
        )
    )
    assert persisted_head is not None
    assert persisted_head.delta_summary_json is not None
    assert persisted_head.delta_summary_json["change_reason"] == "candidate_analysis_changed"


@pytest.mark.asyncio
async def test_persist_score_rejects_unknown_factor_type(db_session: AsyncSession):
    creator_id = uuid4()
    candidate_id = uuid4()
    job_id = uuid4()
    version_id = uuid4()
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
    db_session.add(
        CandidateModel(
            id=candidate_id,
            full_name="Factor Candidate",
            email="factor@example.com",
            created_by=creator_id,
            data_quality_status="valid",
        )
    )
    db_session.add(
        JobModel(
            id=job_id,
            title="Factor Job",
            description="Test",
            status="published",
            created_by=creator_id,
        )
    )
    version = ScoreModelVersionModel(
        id=version_id,
        version="ranking-factor-guard",
        is_active=True,
        weights={"skill_match": 0.4, "experience_match": 0.25, "seniority_match": 0.2, "education": 0.1, "ai_confidence": 0.05},
        thresholds={"high": 70, "low": 45},
    )
    db_session.add(version)
    await db_session.commit()

    service = CandidateRankingService(db_session)
    with pytest.raises(ValueError, match="Unsupported factor_type"):
        await service._persist_score(
            candidate_id=candidate_id,
            job_id=job_id,
            version=version,
            payload={
                "source_analysis_id": uuid4(),
                "source_analysis_created_at": datetime(2026, 1, 2, tzinfo=UTC),
                "final_score": Decimal("82.00"),
                "decision_suggestion": "approved",
                "breakdown": {
                    "skill_match_score": 82.0,
                    "experience_match_score": 82.0,
                    "seniority_match_score": 82.0,
                    "education_score": 82.0,
                    "confidence_score": 100.0,
                    "ai_confidence_score": 100.0,
                    "penalty_score": 0.0,
                    "validation_penalty_score": 0.0,
                    "final_score": 82.0,
                },
                "reason_codes": [],
                "factors": [
                    {
                        "factor_type": "totally_unknown_factor",
                        "factor_key": "x",
                        "factor_label": "Should fail",
                        "impact_score": 1.0,
                        "normalized_weight": 0.1,
                        "direction": "positive",
                        "evidence_json": {},
                        "display_order": 0,
                    }
                ],
            },
        )
