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
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.user_model import UserModel
from src.domain.value_objects.adaptive_score_result import AdaptiveScoreResult
from src.domain.value_objects.candidate_evaluation_insight import CandidateEvaluationInsight
from src.domain.value_objects.candidate_profile import (
    CandidateProfile,
    EducationEntry,
    EvidencedSkill,
)
from src.domain.value_objects.job_profile import AREA_WEIGHTS, JobProfile


def test_skill_equivalence_directional_rules() -> None:
    assert candidate_satisfies_job_requirement("SQL Server", "SQL") is True
    assert candidate_satisfies_job_requirement("FastAPI", "backend") is True
    assert candidate_satisfies_job_requirement("React", "frontend") is True
    assert candidate_satisfies_job_requirement("react", "React.js") is False


def test_detached_adaptive_result_requires_real_confidence() -> None:
    result = MagicMock()
    result.overall_score = Decimal("87")

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

    adaptive_result = MatchingEngineService._build_detached_adaptive_result(
        result,
        job_profile,
        candidate_profile,
        confidence_score=72.0,
        low_confidence_alert=False,
    )

    assert adaptive_result.match_score == 87.0
    assert adaptive_result.recommendation == "strong_match"
    assert adaptive_result.confidence_score == 72.0
    assert adaptive_result.risk_points == []


@pytest.mark.asyncio
async def test_matching_engine_service_returns_adaptive_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = MagicMock()
    repo.session = MagicMock()
    job = MagicMock()
    job.id = uuid4()
    job.seniority_level = "senior"
    job.minimum_years_experience = Decimal("5")
    repo.find_active_job = AsyncMock(return_value=job)
    repo.list_active_job_skill_rows = AsyncMock(
        return_value=[
            SimpleNamespace(
                skill_name="SQL",
                JobRequiredSkillModel=SimpleNamespace(is_mandatory=True),
            ),
            SimpleNamespace(
                skill_name="Python",
                JobRequiredSkillModel=SimpleNamespace(is_mandatory=True),
            ),
        ]
    )
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
        evidenced_skills=[
            EvidencedSkill(
                name="SQL",
                evidence_text="SQL em projetos",
                confidence="high",
                years_evidenced=4.0,
                source="experience",
            ),
        ],
        tools_and_systems=[],
        capabilities=[],
        education=[EducationEntry(level="bachelor", is_completed=True)],
        certifications=[],
        leadership_evidence=[],
        business_impact_evidence=[],
        profile_completeness=0.8,
        confidence="high",
        resume_hash="resume-hash",
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
    monkeypatch.setattr(service, "_should_skip_profiler_ai", AsyncMock(return_value=False))
    monkeypatch.setattr(service, "_ensure_job_profile", AsyncMock(return_value=job_profile))
    monkeypatch.setattr(service, "_ensure_candidate_profile", AsyncMock(return_value=candidate_profile))
    monkeypatch.setattr(service, "_build_detached_adaptive_result", lambda *args, **kwargs: adaptive_result)
    service._observability_service.record_snapshot = AsyncMock()

    payload = await service.match_details_to_job(analysis, result, uuid4())

    assert payload.engine_used == "adaptive"
    assert payload.score_final == Decimal("84.20")
    assert payload.confidence_score == Decimal("78.00")
    assert payload.recommendation == "interview"
    assert payload.technical_competencies == Decimal("88.00")
    assert payload.bonus_signals == []


@pytest.mark.asyncio
async def test_matching_engine_service_records_engine_observation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = MagicMock()
    repo.session = MagicMock()
    repo.find_active_job = AsyncMock(return_value=MagicMock(id=uuid4()))
    repo.list_active_job_skill_rows = AsyncMock(return_value=[])
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
    monkeypatch.setattr(service, "_should_skip_profiler_ai", AsyncMock(return_value=False))
    monkeypatch.setattr(service, "_ensure_job_profile", AsyncMock(return_value=job_profile))
    monkeypatch.setattr(service, "_ensure_candidate_profile", AsyncMock(return_value=candidate_profile))
    monkeypatch.setattr(service, "_build_detached_adaptive_result", lambda *args, **kwargs: adaptive_result)
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
    recruiter_id = uuid4()
    job_id = uuid4()
    candidate_id = uuid4()
    analysis_id = None

    db_session.add(
        UserModel(
            id=recruiter_id,
            email="matching-obsv@test.com",
            password_hash="hash",
            role="recruiter",
            status="active",
            full_name="Matching Observability",
        )
    )
    await db_session.flush()

    db_session.add(
        CandidateModel(
            id=candidate_id,
            full_name="Candidate Obs",
            email="candidate-obsv@test.com",
            created_by=recruiter_id,
        )
    )
    db_session.add(
        JobModel(
            id=job_id,
            title="Data Engineer",
            description="Test job",
            status="published",
            created_by=recruiter_id,
        )
    )
    await db_session.flush()

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
    candidate_id = uuid4()
    resume_version_id = uuid4()
    job = MagicMock()
    job.id = uuid4()
    job.title = "Test Job"
    job.description = "Test description"
    job.requirements = "Test requirements"
    job.seniority_level = "mid"
    job.job_area = "technology"
    job.responsibilities = []
    job.experience_context = ""
    job.behavioral_requirements = []
    job.priority = "normal"
    job.minimum_education_level = None
    job.minimum_years_experience = None
    job.deal_breakers = []
    repo.find_active_job = AsyncMock(return_value=job)
    repo.list_active_job_skill_rows = AsyncMock(return_value=[_make_row("Python", is_mandatory=True)])
    repo.find_active_score_model_version = AsyncMock(return_value=None)
    repo.find_latest_candidate_profile_analysis_for_resume = AsyncMock(
        return_value=SimpleNamespace(id=uuid4())
    )
    repo.find_preferred_ai_model = AsyncMock(return_value=None)
    repo.find_job_profile_analysis_by_signature = AsyncMock(
        return_value=SimpleNamespace(id=uuid4())
    )
    repo.get_candidate_id_from_analysis = AsyncMock(return_value=candidate_id)
    repo.get_resume_version_id_from_analysis = AsyncMock(return_value=resume_version_id)
    repo.upsert_candidate_job_match = AsyncMock()
    repo.session = MagicMock()
    repo.session.scalar = AsyncMock(return_value=None)

    service = AnalysisService(repository=repo)

    analysis = MagicMock()
    analysis.id = uuid4()
    analysis.resume_version_id = resume_version_id
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


@pytest.mark.asyncio
async def test_analysis_service_raises_when_profile_analysis_persistence_fails() -> None:
    repo = MagicMock()
    job = MagicMock()
    job.id = uuid4()
    job.title = "Test Job"
    job.description = "Test description"
    job.requirements = "Test requirements"
    job.seniority_level = "mid"
    job.job_area = "technology"
    job.responsibilities = []
    job.experience_context = ""
    job.behavioral_requirements = []
    job.priority = "normal"
    job.minimum_education_level = None
    job.minimum_years_experience = None
    job.deal_breakers = []
    repo.find_active_job = AsyncMock(return_value=job)
    repo.find_latest_candidate_profile_analysis_for_resume = AsyncMock(
        side_effect=RuntimeError("candidate profile insert failed")
    )
    repo.upsert_candidate_job_match = AsyncMock()
    repo.session = MagicMock()

    service = AnalysisService(repository=repo)

    analysis = MagicMock()
    analysis.id = uuid4()
    analysis.resume_version_id = uuid4()
    result = MagicMock()
    result.keywords = []
    result.extracted_data = {"skills": [{"name": "Python"}]}

    with pytest.raises(RuntimeError, match="candidate profile insert failed"):
        await service._match_details_to_job(
            AnalysisResultDetails(analysis=analysis, result=result),
            job.id,
        )

    repo.upsert_candidate_job_match.assert_not_called()


@pytest.mark.asyncio
async def test_matching_engine_reuses_cached_job_profile_analysis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = MagicMock()
    repo.session = MagicMock()
    repo.session.add = MagicMock()
    repo.session.flush = AsyncMock()
    repo.find_preferred_ai_model = AsyncMock(
        return_value=SimpleNamespace(provider="google", model_id="gemini-2.5-flash")
    )
    repo.find_job_profile_analysis_by_signature = AsyncMock()
    service = MatchingEngineService(repo)

    cached_profile = JobProfile(
        area="technology",
        target_level="mid",
        main_mission="Entregar APIs",
        critical_requirements=[],
        desirable_requirements=[],
        responsibilities=[],
        required_tools=["Python"],
        required_capabilities=[],
        seniority_signals=[],
        adaptive_weights=AREA_WEIGHTS["technology"],
        job_completeness_score=0.7,
        confidence="high",
        description_hash="job-cached-hash",
    )
    repo.find_job_profile_analysis_by_signature.return_value = SimpleNamespace(
        raw_response_json=cached_profile.to_dict()
    )
    repo.list_active_job_skill_rows = AsyncMock(return_value=[])

    profiler_call = AsyncMock(side_effect=AssertionError("job profiler AI should not run"))
    monkeypatch.setattr(
        "src.application.services.matching_engine_service.JobProfilerService.generate_profile",
        profiler_call,
    )

    job = MagicMock()
    job.id = uuid4()
    job.title = "Backend Engineer"
    job.description = "Construir APIs."
    job.requirements = "Python"
    job.seniority_level = "mid"
    job.minimum_years_experience = None
    job.minimum_education_level = None
    job.job_area = "technology"
    job.responsibilities = None
    job.experience_context = None
    job.behavioral_requirements = []
    job.priority = "normal"
    job.job_profile_json = None
    job.job_profile_hash = None

    profile = await service._ensure_job_profile(job, ai_service=object())

    assert profile.description_hash == "job-cached-hash"
    assert job.job_profile_json["description_hash"] == "job-cached-hash"
    profiler_call.assert_not_awaited()


@pytest.mark.asyncio
async def test_matching_engine_reuses_cached_candidate_profile_analysis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = MagicMock()
    repo.session = MagicMock()
    repo.session.add = MagicMock()
    repo.session.flush = AsyncMock()
    repo.find_latest_candidate_profile_analysis_for_resume = AsyncMock()
    service = MatchingEngineService(repo)

    cached_profile = CandidateProfile(
        detected_level="senior",
        estimated_experience_years=6.0,
        current_role="Data Engineer",
        professional_area="data",
        experiences=[],
        evidenced_skills=[],
        tools_and_systems=["SQL"],
        capabilities=[],
        education=[],
        certifications=[],
        leadership_evidence=[],
        business_impact_evidence=[],
        profile_completeness=0.8,
        confidence="high",
        resume_hash="cached-resume-hash",
    )
    repo.find_latest_candidate_profile_analysis_for_resume.return_value = SimpleNamespace(
        raw_response_json={"candidate_profile": cached_profile.to_dict()}
    )

    profiler_call = AsyncMock(side_effect=AssertionError("resume profiler AI should not run"))
    monkeypatch.setattr(
        "src.application.services.matching_engine_service.ResumeProfilerService.generate_profile",
        profiler_call,
    )

    candidate = MagicMock()
    candidate.id = uuid4()
    resume_version = MagicMock()
    resume_version.id = uuid4()
    resume_version.extracted_text = "Currículo completo"
    resume_version.candidate_profile_json = None
    resume_version.candidate_profile_hash = None
    analysis = MagicMock()
    analysis.id = uuid4()
    result = MagicMock()
    result.seniority_level = "senior"
    result.total_experience_years = 6

    profile = await service._ensure_candidate_profile(
        candidate=candidate,
        resume_version=resume_version,
        analysis=analysis,
        analysis_result=result,
        ai_service=object(),
    )

    assert profile.resume_hash == "cached-resume-hash"
    assert resume_version.candidate_profile_json["resume_hash"] == "cached-resume-hash"
    profiler_call.assert_not_awaited()


@pytest.mark.asyncio
async def test_matching_engine_skips_profiler_ai_when_minimum_requirements_fail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = MagicMock()
    repo.session = MagicMock()
    repo.find_active_job = AsyncMock(return_value=MagicMock(id=uuid4()))
    repo.list_active_job_skill_rows = AsyncMock(return_value=[])
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
        detected_level="junior",
        estimated_experience_years=1.0,
        current_role="Analyst",
        professional_area="data",
        experiences=[],
        evidenced_skills=[],
        tools_and_systems=[],
        capabilities=[],
        education=[],
        certifications=[],
        leadership_evidence=[],
        business_impact_evidence=[],
        profile_completeness=0.6,
        confidence="medium",
        resume_hash="resume-hash",
    )
    adaptive_result = AdaptiveScoreResult(
        match_score=40.0,
        confidence_score=70.0,
        recommendation="reject",
        score_breakdown={"dimensions": {}},
        strengths=[],
        gaps=[],
        risk_points=[],
        critical_coverage=0.1,
        desirable_coverage=0.1,
        area="data",
        target_level="senior",
        detected_level="junior",
    )

    monkeypatch.setattr(service, "_load_candidate_context", AsyncMock(return_value=(candidate, resume_version)))
    monkeypatch.setattr(service, "_resolve_ai_service", AsyncMock(return_value=object()))
    monkeypatch.setattr(service, "_should_skip_profiler_ai", AsyncMock(return_value=True))
    ensure_job_profile = AsyncMock(return_value=job_profile)
    ensure_candidate_profile = AsyncMock(return_value=candidate_profile)
    monkeypatch.setattr(service, "_ensure_job_profile", ensure_job_profile)
    monkeypatch.setattr(service, "_ensure_candidate_profile", ensure_candidate_profile)
    monkeypatch.setattr(service, "_build_detached_adaptive_result", lambda *args, **kwargs: adaptive_result)
    service._observability_service.record_snapshot = AsyncMock()

    await service.match_details_to_job(analysis, result, uuid4())

    assert ensure_job_profile.await_args.args[1] is None
    assert ensure_candidate_profile.await_args.kwargs["ai_service"] is None


@pytest.mark.asyncio
async def test_matching_engine_service_computes_nonzero_confidence_from_structured_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    job = MagicMock()
    job.id = uuid4()
    job.seniority_level = "senior"
    job.minimum_years_experience = Decimal("5")

    repo = MagicMock()
    repo.session = MagicMock()
    repo.find_active_job = AsyncMock(return_value=job)
    repo.list_active_job_skill_rows = AsyncMock(
        return_value=[
            SimpleNamespace(
                skill_name="SQL",
                JobRequiredSkillModel=SimpleNamespace(is_mandatory=True),
            ),
            SimpleNamespace(
                skill_name="Python",
                JobRequiredSkillModel=SimpleNamespace(is_mandatory=True),
            ),
        ]
    )
    service = MatchingEngineService(repo)

    analysis = MagicMock()
    analysis.id = uuid4()
    analysis.resume_version_id = uuid4()
    result = MagicMock()
    result.overall_score = Decimal("87")

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
        evidenced_skills=[
            EvidencedSkill(
                name="SQL",
                evidence_text="SQL em projetos",
                confidence="high",
                years_evidenced=4.0,
                source="experience",
            ),
            EvidencedSkill(
                name="Python",
                evidence_text="Python em pipelines",
                confidence="high",
                years_evidenced=4.0,
                source="experience",
            ),
        ],
        tools_and_systems=[],
        capabilities=[],
        education=[EducationEntry(level="bachelor", is_completed=True)],
        certifications=[],
        leadership_evidence=[],
        business_impact_evidence=[],
        profile_completeness=0.8,
        confidence="high",
        resume_hash="resume-hash",
    )

    monkeypatch.setattr(service, "_load_candidate_context", AsyncMock(return_value=(candidate, resume_version)))
    monkeypatch.setattr(service, "_resolve_ai_service", AsyncMock(return_value=None))
    monkeypatch.setattr(service, "_should_skip_profiler_ai", AsyncMock(return_value=False))
    monkeypatch.setattr(service, "_ensure_job_profile", AsyncMock(return_value=job_profile))
    monkeypatch.setattr(service, "_ensure_candidate_profile", AsyncMock(return_value=candidate_profile))
    service._observability_service.record_snapshot = AsyncMock()

    payload = await service.match_details_to_job(analysis, result, uuid4())

    assert payload.score_final == Decimal("87.00")
    assert payload.confidence_score == Decimal("100.00")


@pytest.mark.asyncio
async def test_matching_engine_requirement_gate_detects_skill_miss() -> None:
    repo = MagicMock()
    repo.session = MagicMock()
    repo.list_active_job_skill_rows = AsyncMock(
        return_value=[
            SimpleNamespace(
                skill_name="Python",
                JobRequiredSkillModel=SimpleNamespace(is_mandatory=True),
            )
        ]
    )
    service = MatchingEngineService(repo)

    job = MagicMock()
    job.id = uuid4()
    job.minimum_education_level = None
    job.minimum_years_experience = None

    result = MagicMock()
    result.highest_education_level = None
    result.total_experience_years = None
    result.keywords = ["Excel"]
    result.extracted_data = {"skills": [{"name": "Power BI"}]}

    should_skip = await service._should_skip_profiler_ai(job=job, result=result)

    assert should_skip is True
