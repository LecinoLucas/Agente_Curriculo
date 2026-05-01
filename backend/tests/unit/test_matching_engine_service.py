from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_service import AnalysisResultDetails, AnalysisService
from src.application.services.matching_engine_service import (
    MatchingEngineResult,
    MatchingEngineService,
)
from src.application.services.matching_observability_service import (
    MatchingObservabilityService,
)
from src.application.services.skill_normalizer_service import (
    candidate_satisfies_job_requirement,
)
from src.infrastructure.database.models.analysis_model import MatchingObservationModel
from src.domain.value_objects.adaptive_score_result import AdaptiveScoreResult
from src.domain.value_objects.candidate_evaluation_insight import CandidateEvaluationInsight
from src.domain.value_objects.candidate_profile import CandidateProfile
from src.domain.value_objects.evidence_mapping import EvidenceMapping
from src.domain.value_objects.job_profile import AREA_WEIGHTS, JobProfile


def test_skill_equivalence_directional_rules() -> None:
    assert candidate_satisfies_job_requirement("SQL Server", "SQL") is True
    assert candidate_satisfies_job_requirement("FastAPI", "backend") is True
    assert candidate_satisfies_job_requirement("React", "frontend") is True
    assert candidate_satisfies_job_requirement("react", "React.js") is False


@pytest.mark.asyncio
async def test_matching_engine_service_returns_adaptive_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = MagicMock()
    repo.session = MagicMock()
    repo.find_active_job = AsyncMock(return_value=MagicMock(id=uuid4()))
    service = MatchingEngineService(repo)

    analysis = MagicMock()
    analysis.id = uuid4()
    analysis.resume_version_id = uuid4()

    result = MagicMock()

    candidate = MagicMock()
    resume_version = MagicMock()
    job_profile = JobProfile(
        area="data",
        target_level="senior",
        main_mission="Dados",
        critical_requirements=[],
        desirable_requirements=[],
        responsibilities=[],
        required_tools=[],
        required_capabilities=[],
        seniority_signals=[],
        adaptive_weights=AREA_WEIGHTS["data"],
        job_completeness_score=0.9,
        confidence="high",
        description_hash="job-hash",
    )
    candidate_profile = CandidateProfile(
        detected_level="senior",
        estimated_experience_years=8.0,
        current_role="Engineer",
        professional_area="data",
        experiences=[],
        evidenced_skills=[],
        tools_and_systems=[],
        capabilities=[],
        education=[],
        certifications=[],
        leadership_evidence=[],
        business_impact_evidence=[],
        profile_completeness=0.8,
        confidence="high",
        resume_hash="resume-hash",
    )
    mapping = EvidenceMapping(
        job_profile_hash="job-hash",
        candidate_profile_hash="resume-hash",
        requirement_matches=[],
        overall_evidence_strength="high",
        confidence="high",
        unmapped_critical_requirements=[],
        candidate_extra_strengths=["Power BI"],
        risk_points=[],
    )
    adaptive_result = AdaptiveScoreResult(
        match_score=84.2,
        confidence_score=78.0,
        recommendation="interview",
        score_breakdown={
            "dimensions": {
                "technical_competencies": {"score": 88.0},
                "practical_experience": {"score": 82.0},
                "role_fit": {"score": 80.0},
                "seniority_alignment": {"score": 90.0},
                "education": {"score": 70.0},
                "leadership_evidence": {"score": 55.0},
            }
        },
        strengths=["SQL", "Power BI"],
        gaps=["Liderança formal"],
        risk_points=["leadership_gap"],
        critical_coverage=0.9,
        desirable_coverage=0.75,
        area="data",
        target_level="senior",
        detected_level="senior",
    )
    insight = CandidateEvaluationInsight(
        why_score_is_high=["Cobertura crítica forte."],
        why_score_is_low=["Liderança parcial."],
        matched_requirements=["SQL"],
        missing_critical_requirements=[],
    )

    monkeypatch.setattr(service, "_load_candidate_context", AsyncMock(return_value=(candidate, resume_version)))
    monkeypatch.setattr(service, "_resolve_ai_service", AsyncMock(return_value=None))
    monkeypatch.setattr(service, "_ensure_job_profile", AsyncMock(return_value=job_profile))
    monkeypatch.setattr(service, "_ensure_candidate_profile", AsyncMock(return_value=candidate_profile))
    monkeypatch.setattr(service, "_ensure_evidence_mapping", AsyncMock(return_value=mapping))
    monkeypatch.setattr(service._adaptive_scorer, "score", lambda *args, **kwargs: adaptive_result)
    monkeypatch.setattr(service._insight_service, "build", lambda *args, **kwargs: insight)

    payload = await service.match_details_to_job(analysis, result, uuid4())

    assert payload.engine_used == "adaptive"
    assert payload.score_final == Decimal("84.20")
    assert payload.confidence_score == Decimal("78.00")
    assert payload.recommendation == "interview"
    assert payload.technical_competencies == Decimal("88.00")
    assert payload.bonus_signals == ["Power BI"]


@pytest.mark.asyncio
async def test_matching_engine_service_records_engine_observation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = MagicMock()
    repo.session = MagicMock()
    repo.find_active_job = AsyncMock(return_value=MagicMock(id=uuid4()))
    service = MatchingEngineService(repo)

    analysis = MagicMock()
    analysis.id = uuid4()
    analysis.resume_version_id = uuid4()

    result = MagicMock()

    candidate = MagicMock()
    candidate.id = uuid4()
    resume_version = MagicMock()
    job_profile = JobProfile(
        area="data",
        target_level="senior",
        main_mission="Dados",
        critical_requirements=[],
        desirable_requirements=[],
        responsibilities=[],
        required_tools=[],
        required_capabilities=[],
        seniority_signals=[],
        adaptive_weights=AREA_WEIGHTS["data"],
        job_completeness_score=0.9,
        confidence="high",
        description_hash="job-hash",
    )
    candidate_profile = CandidateProfile(
        detected_level="senior",
        estimated_experience_years=8.0,
        current_role="Engineer",
        professional_area="data",
        experiences=[],
        evidenced_skills=[],
        tools_and_systems=[],
        capabilities=[],
        education=[],
        certifications=[],
        leadership_evidence=[],
        business_impact_evidence=[],
        profile_completeness=0.8,
        confidence="high",
        resume_hash="resume-hash",
    )
    mapping = EvidenceMapping(
        job_profile_hash="job-hash",
        candidate_profile_hash="resume-hash",
        requirement_matches=[],
        overall_evidence_strength="high",
        confidence="high",
        unmapped_critical_requirements=[],
        candidate_extra_strengths=["Power BI"],
        risk_points=[],
    )
    adaptive_result = AdaptiveScoreResult(
        match_score=84.2,
        confidence_score=78.0,
        recommendation="interview",
        score_breakdown={
            "dimensions": {
                "technical_competencies": {"score": 88.0},
                "practical_experience": {"score": 82.0},
                "role_fit": {"score": 80.0},
                "seniority_alignment": {"score": 90.0},
                "education": {"score": 70.0},
                "leadership_evidence": {"score": 55.0},
            }
        },
        strengths=["SQL", "Power BI"],
        gaps=["Liderança formal"],
        risk_points=["leadership_gap"],
        critical_coverage=0.9,
        desirable_coverage=0.75,
        area="data",
        target_level="senior",
        detected_level="senior",
    )
    insight = CandidateEvaluationInsight(
        why_score_is_high=["Cobertura crítica forte."],
        why_score_is_low=["Liderança parcial."],
        matched_requirements=["SQL"],
        missing_critical_requirements=[],
        equivalent_matches=[],
    )

    monkeypatch.setattr(service, "_load_candidate_context", AsyncMock(return_value=(candidate, resume_version)))
    monkeypatch.setattr(service, "_resolve_ai_service", AsyncMock(return_value=None))
    monkeypatch.setattr(service, "_ensure_job_profile", AsyncMock(return_value=job_profile))
    monkeypatch.setattr(service, "_ensure_candidate_profile", AsyncMock(return_value=candidate_profile))
    monkeypatch.setattr(service, "_ensure_evidence_mapping", AsyncMock(return_value=mapping))
    monkeypatch.setattr(service._adaptive_scorer, "score", lambda *args, **kwargs: adaptive_result)
    monkeypatch.setattr(service._insight_service, "build", lambda *args, **kwargs: insight)
    service._observability_service.record_snapshot = AsyncMock()

    await service.match_details_to_job(analysis, result, uuid4())

    service._observability_service.record_snapshot.assert_awaited_once()
    kwargs = service._observability_service.record_snapshot.await_args.kwargs
    assert kwargs["source"] == "engine"
    assert kwargs["candidate_id"] == candidate.id
    assert kwargs["analysis_id"] == analysis.id
    assert kwargs["engine_used"] == "adaptive"


@pytest.mark.asyncio
async def test_matching_observability_service_keeps_multiple_engine_records(
    db_session: AsyncSession,
) -> None:
    service = MatchingObservabilityService(db_session)
    job_id = uuid4()
    candidate_id = uuid4()
    analysis_id = uuid4()

    await service.record_snapshot(
        job_id=job_id,
        candidate_id=candidate_id,
        analysis_id=analysis_id,
        engine_used="adaptive",
        score=84.2,
        confidence_score=78.0,
        matched_skills=["SQL"],
        missing_skills=["Liderança"],
        equivalences_used=["BI"],
        source="engine",
    )
    await service.record_snapshot(
        job_id=job_id,
        candidate_id=candidate_id,
        analysis_id=analysis_id,
        engine_used="adaptive",
        score=85.5,
        confidence_score=80.0,
        matched_skills=["SQL", "Power BI"],
        missing_skills=[],
        equivalences_used=["BI"],
        source="engine",
    )

    rows = (
        await db_session.execute(
            sa.select(MatchingObservationModel).where(
                MatchingObservationModel.job_id == job_id,
                MatchingObservationModel.candidate_id == candidate_id,
                MatchingObservationModel.source == "engine",
            )
        )
    ).scalars().all()

    assert len(rows) == 2
    assert all(row.source == "engine" for row in rows)


def _make_row(skill_name: str, *, is_mandatory: bool) -> SimpleNamespace:
    return SimpleNamespace(
        skill_name=skill_name,
        skill_aliases=[],
        JobRequiredSkillModel=SimpleNamespace(is_mandatory=is_mandatory),
    )


@pytest.mark.asyncio
async def test_analysis_service_falls_back_to_legacy_when_matching_engine_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = MagicMock()
    job = MagicMock()
    job.id = uuid4()
    job.seniority_level = "mid"
    job.minimum_education_level = None
    job.minimum_years_experience = None
    job.deal_breakers = []
    repo.find_active_job = AsyncMock(return_value=job)
    repo.list_active_job_skill_rows = AsyncMock(return_value=[_make_row("Python", is_mandatory=True)])
    repo.find_active_score_model_version = AsyncMock(return_value=None)
    repo.find_job_match = AsyncMock(return_value=None)
    repo.save_job_match = AsyncMock()
    repo.session = MagicMock()
    repo.session.scalar = AsyncMock(return_value=None)

    service = AnalysisService(repository=repo)

    analysis = MagicMock()
    analysis.id = uuid4()
    result = MagicMock()
    result.keywords = []
    result.extracted_data = {"skills": [{"name": "Python"}]}
    result.seniority_level = "mid"
    result.overall_score = Decimal("70")
    result.experience_score = Decimal("70")
    result.highest_education_level = None
    result.total_experience_years = None

    monkeypatch.setattr(
        MatchingEngineService,
        "match_details_to_job",
        AsyncMock(side_effect=RuntimeError("adaptive failed")),
    )

    response = await service._match_details_to_job(
        AnalysisResultDetails(analysis=analysis, result=result),
        job.id,
    )

    assert response.engine_used == "legacy"
    assert response.recommendation in {"strong_match", "good_match", "potential", "not_recommended"}
