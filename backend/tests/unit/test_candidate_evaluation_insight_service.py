from __future__ import annotations

from src.application.services.candidate_evaluation_insight_service import CandidateEvaluationInsightService
from src.domain.value_objects.adaptive_score_result import AdaptiveScoreResult
from src.domain.value_objects.candidate_profile import CandidateProfile
from src.domain.value_objects.evidence_mapping import EvidenceMapping, RequirementMatch
from src.domain.value_objects.job_profile import AREA_WEIGHTS, JobProfile, JobRequirement


def _job_profile() -> JobProfile:
    return JobProfile(
        area="data",
        target_level="senior",
        main_mission="Transformar dados em decisão.",
        critical_requirements=[
            JobRequirement(name="SQL", description="SQL", is_mandatory=True, importance_weight=2.0),
            JobRequirement(name="Liderança", description="Liderança técnica", is_mandatory=True, importance_weight=1.8),
            JobRequirement(name="Impacto de negócio", description="Impacto de negócio", is_mandatory=True, importance_weight=1.7),
        ],
        desirable_requirements=[JobRequirement(name="Power BI", description="BI", is_mandatory=False, importance_weight=1.0)],
        responsibilities=["definir métricas"],
        required_tools=["SQL"],
        required_capabilities=["comunicação"],
        seniority_signals=["senior"],
        adaptive_weights=AREA_WEIGHTS["data"],
        job_completeness_score=0.90,
        confidence="high",
        description_hash="job-hash",
    )


def _candidate_profile(*, with_leadership: bool, with_business_impact: bool) -> CandidateProfile:
    return CandidateProfile(
        detected_level="senior",
        estimated_experience_years=8.0,
        current_role="Analista",
        professional_area="data",
        experiences=[],
        evidenced_skills=[],
        tools_and_systems=["SQL Server", "Power BI"],
        capabilities=[],
        education=[],
        certifications=[],
        leadership_evidence=["Mentoria de time"] if with_leadership else [],
        business_impact_evidence=["Reduziu custo em 20%"] if with_business_impact else [],
        profile_completeness=0.82,
        confidence="high",
        resume_hash="candidate-hash",
    )


def _adaptive_result(*, score: float, confidence: float) -> AdaptiveScoreResult:
    return AdaptiveScoreResult(
        match_score=score,
        confidence_score=confidence,
        recommendation="interview" if score >= 70 else "reject",
        score_breakdown={},
        strengths=["SQL Server", "Power BI"] if score >= 70 else ["SQL Server"],
        gaps=["Liderança formal"] if score < 70 else [],
        risk_points=["leadership_gap"] if score < 70 else [],
        critical_coverage=0.80 if score >= 70 else 0.40,
        desirable_coverage=0.75 if score >= 70 else 0.35,
        area="data",
        target_level="senior",
        detected_level="senior",
    )


def _mapping_high() -> EvidenceMapping:
    return EvidenceMapping(
        job_profile_hash="job-hash",
        candidate_profile_hash="candidate-hash",
        requirement_matches=[
            RequirementMatch(
                requirement="SQL",
                requirement_type="critical",
                match_status="meets",
                match_type="equivalent",
                evidence_quotes=["SQL Server em produção"],
                evidence_strength="high",
                confidence="high",
                score_hint=90.0,
                explanation="Equivalência SQL -> SQL Server",
            ),
            RequirementMatch(
                requirement="Power BI",
                requirement_type="desirable",
                match_status="meets",
                match_type="direct",
                evidence_quotes=["Dashboards em Power BI"],
                evidence_strength="high",
                confidence="high",
                score_hint=88.0,
                explanation="Match direto.",
            ),
            RequirementMatch(
                requirement="Liderança",
                requirement_type="critical",
                match_status="partially_meets",
                match_type="inferred",
                evidence_quotes=["Mentoria de time"],
                evidence_strength="medium",
                confidence="medium",
                score_hint=62.0,
                explanation="Inferência por mentoria.",
            ),
        ],
        overall_evidence_strength="high",
        confidence="medium",
        unmapped_critical_requirements=[],
        candidate_extra_strengths=[],
        risk_points=[],
    )


def _mapping_low() -> EvidenceMapping:
    return EvidenceMapping(
        job_profile_hash="job-hash",
        candidate_profile_hash="candidate-hash",
        requirement_matches=[
            RequirementMatch(
                requirement="SQL",
                requirement_type="critical",
                match_status="partially_meets",
                match_type="inferred",
                evidence_quotes=["Menção genérica a banco de dados"],
                evidence_strength="low",
                confidence="low",
                score_hint=40.0,
                explanation="Inferência fraca.",
            ),
            RequirementMatch(
                requirement="Liderança",
                requirement_type="critical",
                match_status="not_evidenced",
                match_type="absent",
                evidence_quotes=[],
                evidence_strength="none",
                confidence="low",
                score_hint=0.0,
                explanation="Sem evidência.",
            ),
            RequirementMatch(
                requirement="Impacto de negócio",
                requirement_type="critical",
                match_status="not_evidenced",
                match_type="absent",
                evidence_quotes=[],
                evidence_strength="none",
                confidence="low",
                score_hint=0.0,
                explanation="Sem evidência.",
            ),
        ],
        overall_evidence_strength="low",
        confidence="low",
        unmapped_critical_requirements=["Liderança", "Impacto de negócio"],
        candidate_extra_strengths=[],
        risk_points=["candidate_profile_incomplete"],
    )


def test_high_score_explains_upside_and_equivalences() -> None:
    service = CandidateEvaluationInsightService()
    adaptive = service.attach_comparison_context(
        _adaptive_result(score=84.0, confidence=76.0),
        legacy_match_score=55.0,
        adaptive_match_score=84.0,
        delta=29.0,
    )

    insight = service.build(
        _job_profile(),
        _candidate_profile(with_leadership=True, with_business_impact=True),
        _mapping_high(),
        adaptive,
    )

    assert insight.why_score_is_high
    assert any("cobertura de requisitos críticos" in text.lower() for text in insight.why_score_is_high)
    assert insight.equivalent_matches
    assert insight.inferred_matches
    assert any("delta alto" in text.lower() for text in insight.possible_underestimation)


def test_low_score_explains_downside_and_missing_critical_requirements() -> None:
    service = CandidateEvaluationInsightService()
    insight = service.build(
        _job_profile(),
        _candidate_profile(with_leadership=False, with_business_impact=False),
        _mapping_low(),
        _adaptive_result(score=46.0, confidence=42.0),
    )

    assert insight.why_score_is_low
    assert insight.missing_critical_requirements
    assert "Liderança" in insight.missing_critical_requirements
    assert "Impacto de negócio" in insight.missing_critical_requirements
    assert any("confiança baixa" in text.lower() for text in insight.why_score_is_low)


def test_risk_points_generate_interview_questions() -> None:
    service = CandidateEvaluationInsightService()
    insight = service.build(
        _job_profile(),
        _candidate_profile(with_leadership=False, with_business_impact=False),
        _mapping_low(),
        _adaptive_result(score=58.0, confidence=49.0),
    )

    assert insight.risk_points
    assert insight.recommended_interview_questions
    assert any("decisão orientada por dados" in text.lower() for text in insight.recommended_interview_questions)
    assert any("influência técnica" in text.lower() for text in insight.recommended_interview_questions)
