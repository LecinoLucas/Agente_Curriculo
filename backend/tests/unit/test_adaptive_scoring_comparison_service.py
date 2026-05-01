from __future__ import annotations

from unittest.mock import Mock

import pytest

from src.application.services.adaptive_scoring_comparison_service import (
    AdaptiveScoringComparisonService,
)
from src.application.services.adaptive_scorer_service import AdaptiveScorerService
from src.domain.services.job_compatibility_calculator import CompatibilityResult
from src.domain.value_objects.candidate_profile import (
    CandidateCapability,
    CandidateProfile,
    EducationEntry,
    EvidencedSkill,
    Experience,
)
from src.domain.value_objects.evidence_mapping import EvidenceMapping, RequirementMatch
from src.domain.value_objects.job_profile import AREA_WEIGHTS, JobProfile, JobRequirement
from src.domain.value_objects.score import Score


def _job_profile(
    *,
    description_hash: str,
    area: str,
    target_level: str,
    critical_requirements: list[JobRequirement] | None = None,
    desirable_requirements: list[JobRequirement] | None = None,
    required_tools: list[str] | None = None,
    required_capabilities: list[str] | None = None,
    responsibilities: list[str] | None = None,
    completeness: float = 0.9,
) -> JobProfile:
    return JobProfile(
        area=area,
        target_level=target_level,
        main_mission="Missão da vaga.",
        critical_requirements=critical_requirements or [],
        desirable_requirements=desirable_requirements or [],
        responsibilities=responsibilities or [],
        required_tools=required_tools or [],
        required_capabilities=required_capabilities or [],
        seniority_signals=["sinal de senioridade"],
        adaptive_weights=AREA_WEIGHTS.get(area, AREA_WEIGHTS["other"]),
        job_completeness_score=completeness,
        confidence="high" if completeness >= 0.5 else "low",
        description_hash=description_hash,
    )


def _candidate_profile(
    *,
    resume_hash: str,
    detected_level: str,
    professional_area: str,
    experience_years: float = 8.0,
    profile_completeness: float = 0.9,
    experiences: list[Experience] | None = None,
    evidenced_skills: list[EvidencedSkill] | None = None,
    tools_and_systems: list[str] | None = None,
    capabilities: list[CandidateCapability] | None = None,
    education: list[EducationEntry] | None = None,
    leadership_evidence: list[str] | None = None,
    business_impact_evidence: list[str] | None = None,
) -> CandidateProfile:
    return CandidateProfile(
        detected_level=detected_level,
        estimated_experience_years=experience_years,
        current_role="Analista",
        professional_area=professional_area,
        experiences=experiences or [],
        evidenced_skills=evidenced_skills or [],
        tools_and_systems=tools_and_systems or [],
        capabilities=capabilities or [],
        education=education or [],
        certifications=[],
        leadership_evidence=leadership_evidence or [],
        business_impact_evidence=business_impact_evidence or [],
        profile_completeness=profile_completeness,
        confidence="high" if profile_completeness >= 0.5 else "low",
        resume_hash=resume_hash,
    )


def _mapping(
    job_hash: str,
    candidate_hash: str,
    matches: list[RequirementMatch],
    *,
    confidence: str = "high",
) -> EvidenceMapping:
    return EvidenceMapping(
        job_profile_hash=job_hash,
        candidate_profile_hash=candidate_hash,
        requirement_matches=matches,
        overall_evidence_strength="high",
        confidence=confidence,
        unmapped_critical_requirements=[],
        candidate_extra_strengths=[],
        risk_points=[],
    )


def _match(
    requirement: str,
    *,
    requirement_type: str = "critical",
    match_status: str = "meets",
    match_type: str = "direct",
    evidence_quotes: list[str] | None = None,
    evidence_strength: str = "high",
    confidence: str = "high",
    score_hint: float = 90.0,
) -> RequirementMatch:
    return RequirementMatch(
        requirement=requirement,
        requirement_type=requirement_type,
        match_status=match_status,
        match_type=match_type,
        evidence_quotes=evidence_quotes or [requirement],
        evidence_strength=evidence_strength,
        confidence=confidence,
        score_hint=score_hint,
        explanation="Evidência estruturada.",
    )


def _legacy_result(
    *,
    score: float,
    recommendation: str,
    coverage: float = 100.0,
) -> CompatibilityResult:
    return CompatibilityResult(
        match_score=Score.of(score),
        mandatory_skills_score=Score.of(score),
        optional_skills_score=Score.of(score),
        seniority_score=Score.of(score),
        experience_score=Score.of(score),
        education_score=Score.of(score),
        mandatory_skills_coverage=coverage,
        recommendation=recommendation,
        matched_skills=[],
        missing_mandatory_skills=[],
        missing_optional_skills=[],
        bonus_skills=[],
        exceeds_skills=[],
        match_summary="Resultado legado simulado para comparação.",
        skill_details=[],
    )


def test_data_analyst_legacy_low_and_adaptive_high() -> None:
    service = AdaptiveScoringComparisonService()

    job = _job_profile(
        description_hash="job-data",
        area="data",
        target_level="senior",
        critical_requirements=[
            JobRequirement(name="SQL", description="SQL em produção.", is_mandatory=True, importance_weight=2.0),
            JobRequirement(name="BI", description="Dashboards e relatórios.", is_mandatory=True, importance_weight=2.0),
            JobRequirement(name="pipelines", description="ETL/ELT em produção.", is_mandatory=True, importance_weight=2.0),
        ],
        required_tools=["SQL", "BI", "pipelines"],
        required_capabilities=["comunicação", "autonomia"],
        responsibilities=["definir métricas", "manter pipelines", "apresentar resultados"],
    )

    candidate = _candidate_profile(
        resume_hash="resume-data",
        detected_level="senior",
        professional_area="data",
        evidenced_skills=[
            EvidencedSkill(
                name="SQL Server",
                evidence_text="Experiência com SQL Server.",
                confidence="high",
                years_evidenced=5,
                source="experience",
            ),
            EvidencedSkill(
                name="Power BI",
                evidence_text="Dashboards executivos em Power BI.",
                confidence="high",
                years_evidenced=4,
                source="experience",
            ),
            EvidencedSkill(
                name="ETL",
                evidence_text="ETL com SSIS.",
                confidence="high",
                years_evidenced=4,
                source="experience",
            ),
        ],
        tools_and_systems=["SQL Server", "Power BI", "SSIS"],
        capabilities=[
            CandidateCapability(
                name="comunicação",
                evidence_text="Apresentou resultados a stakeholders.",
                strength="high",
                source="summary",
                confidence="high",
            ),
            CandidateCapability(
                name="autonomia",
                evidence_text="Conduziu entregas end-to-end.",
                strength="high",
                source="experience",
                confidence="high",
            ),
        ],
        education=[EducationEntry(level="bachelor", field="Estatística", institution="X", graduation_year=2018, is_completed=True)],
        leadership_evidence=["Mentoria informal de analistas juniores"],
        business_impact_evidence=["Reduziu 30% do tempo de fechamento mensal"],
    )

    comparison = service.compare(
        job,
        candidate,
        _mapping(
            job.description_hash,
            candidate.resume_hash,
            [
                _match("SQL"),
                _match("BI", match_type="equivalent", evidence_quotes=["Power BI"]),
                _match("pipelines", match_type="equivalent", evidence_quotes=["ETL com SSIS"]),
            ],
        ),
    )

    assert comparison.legacy_match_score < comparison.adaptive_match_score
    assert comparison.adaptive_match_score >= 80
    assert comparison.delta >= 25
    assert comparison.should_review_manually is True
    assert "equival" in comparison.explanation.lower()


def test_tech_lead_ai_technical_strong_but_leadership_weak() -> None:
    service = AdaptiveScoringComparisonService()

    job = _job_profile(
        description_hash="job-tech-lead",
        area="technology",
        target_level="lead",
        critical_requirements=[
            JobRequirement(name="liderança técnica", description="Conduzir o time.", is_mandatory=True, importance_weight=2.0),
            JobRequirement(name="arquitetura de IA", description="LLM/RAG em produção.", is_mandatory=True, importance_weight=1.8),
        ],
        required_tools=["Python", "LLM", "RAG"],
        required_capabilities=["liderança", "comunicação"],
        responsibilities=["definir roadmap técnico", "conduzir reviews"],
    )

    candidate = _candidate_profile(
        resume_hash="resume-tech",
        detected_level="senior",
        professional_area="technology",
        experience_years=8.0,
        evidenced_skills=[
            EvidencedSkill(
                name="LLM",
                evidence_text="Implementou soluções com LLM e RAG.",
                confidence="high",
                years_evidenced=3,
                source="experience",
            ),
            EvidencedSkill(
                name="RAG",
                evidence_text="Aplicou RAG em produção.",
                confidence="high",
                years_evidenced=2,
                source="experience",
            ),
        ],
        tools_and_systems=["Python", "LLM", "RAG"],
        capabilities=[
            CandidateCapability(
                name="comunicação",
                evidence_text="Apresentou resultados para stakeholders.",
                strength="medium",
                source="summary",
                confidence="medium",
            )
        ],
        education=[EducationEntry(level="master", field="IA", institution="Y", graduation_year=2019, is_completed=True)],
        leadership_evidence=["Mentoria técnica pontual"],
    )

    comparison = service.compare(
        job,
        candidate,
        _mapping(
            job.description_hash,
            candidate.resume_hash,
            [
                _match("liderança técnica", match_type="inferred", evidence_strength="medium", score_hint=48),
                _match("arquitetura de IA", evidence_quotes=["LLM e RAG em produção"]),
            ],
        ),
    )

    assert comparison.adaptive_recommendation in {"interview", "strong_match"}
    assert comparison.legacy_recommendation in {"good_match", "potential", "not_recommended"}
    assert comparison.should_review_manually is True
    assert any("lideranca" in diff.lower() or "liderança" in diff.lower() for diff in comparison.major_differences)


def test_administrative_equivalence_excel_erp_rotinas() -> None:
    service = AdaptiveScoringComparisonService()

    job = _job_profile(
        description_hash="job-admin",
        area="administrative",
        target_level="junior",
        critical_requirements=[
            JobRequirement(name="rotinas administrativas", description="Apoio ao escritório.", is_mandatory=True, importance_weight=1.6)
        ],
        required_tools=["Excel", "ERP"],
        required_capabilities=["organização", "comunicação"],
        responsibilities=["organizar documentos", "apoiar comunicação interna"],
    )

    candidate = _candidate_profile(
        resume_hash="resume-admin",
        detected_level="mid",
        professional_area="administrative",
        experience_years=6.0,
        evidenced_skills=[
            EvidencedSkill(
                name="ERP",
                evidence_text="Uso de ERP para rotinas administrativas.",
                confidence="high",
                years_evidenced=4,
                source="experience",
            ),
            EvidencedSkill(
                name="Excel",
                evidence_text="Planilhas e relatórios em Excel.",
                confidence="high",
                years_evidenced=5,
                source="experience",
            ),
        ],
        tools_and_systems=["ERP", "Excel"],
        capabilities=[
            CandidateCapability(
                name="organização",
                evidence_text="Geriu rotinas com alto volume.",
                strength="high",
                source="experience",
                confidence="high",
            ),
            CandidateCapability(
                name="comunicação",
                evidence_text="Apoio interno e atendimento.",
                strength="medium",
                source="experience",
                confidence="medium",
            ),
        ],
        education=[EducationEntry(level="bachelor", field="Administração", institution="Z", graduation_year=2017, is_completed=True)],
        business_impact_evidence=["Reduziu retrabalho com padronização de documentos"],
    )

    comparison = service.compare(
        job,
        candidate,
        _mapping(job.description_hash, candidate.resume_hash, [_match("rotinas administrativas")]),
    )

    assert comparison.adaptive_match_score >= comparison.legacy_match_score
    assert comparison.should_review_manually is True
    assert comparison.delta >= 25
    assert comparison.adaptive_recommendation in {"strong_match", "interview", "maybe"}
    assert any("equival" in diff.lower() for diff in comparison.major_differences)


def test_incomplete_resume_marks_manual_review() -> None:
    service = AdaptiveScoringComparisonService()

    job = _job_profile(
        description_hash="job-incomplete-resume",
        area="data",
        target_level="senior",
        critical_requirements=[JobRequirement(name="SQL", description="SQL.", is_mandatory=True, importance_weight=2.0)],
        required_tools=["SQL"],
        required_capabilities=["comunicação"],
    )

    candidate = _candidate_profile(
        resume_hash="resume-incomplete",
        detected_level="undefined",
        professional_area="other",
        experience_years=1.0,
        profile_completeness=0.12,
    )

    comparison = service.compare(job, candidate, _mapping(job.description_hash, candidate.resume_hash, [], confidence="low"))

    assert comparison.adaptive_recommendation == "insufficient_data"
    assert comparison.should_review_manually is True
    assert comparison.confidence_score < 60


def test_incomplete_job_reduces_confidence() -> None:
    service = AdaptiveScoringComparisonService()

    job = _job_profile(
        description_hash="job-incomplete",
        area="other",
        target_level="undefined",
        completeness=0.18,
    )
    candidate = _candidate_profile(
        resume_hash="resume-complete",
        detected_level="senior",
        professional_area="technology",
        tools_and_systems=["Python"],
        capabilities=[CandidateCapability(name="comunicação", evidence_text="Boa comunicação.", strength="high", source="summary", confidence="high")],
        education=[EducationEntry(level="master", field="Engenharia", institution="Q", graduation_year=2017, is_completed=True)],
        business_impact_evidence=["Entregas críticas em produção"],
    )

    comparison = service.compare(job, candidate, _mapping(job.description_hash, candidate.resume_hash, []))

    assert comparison.should_review_manually is True
    assert comparison.confidence_score < 70


def test_high_delta_triggers_manual_review() -> None:
    service = AdaptiveScoringComparisonService()

    job = _job_profile(
        description_hash="job-high-delta",
        area="technology",
        target_level="lead",
        critical_requirements=[JobRequirement(name="liderança técnica", description="Conduzir time.", is_mandatory=True, importance_weight=2.0)],
        required_tools=["Python"],
        required_capabilities=["liderança"],
    )
    candidate = _candidate_profile(
        resume_hash="resume-high-delta",
        detected_level="junior",
        professional_area="technology",
        experience_years=1.0,
        tools_and_systems=["Python"],
        capabilities=[],
        education=[EducationEntry(level="high_school", field=None, institution=None, graduation_year=None, is_completed=True)],
    )

    comparison = service.compare(job, candidate, _mapping(job.description_hash, candidate.resume_hash, []))

    assert comparison.delta >= 25
    assert comparison.should_review_manually is True


def test_low_delta_does_not_force_manual_review() -> None:
    service = AdaptiveScoringComparisonService()

    job = _job_profile(
        description_hash="job-low-delta",
        area="data",
        target_level="senior",
        critical_requirements=[JobRequirement(name="SQL", description="SQL.", is_mandatory=True, importance_weight=2.0)],
        required_tools=["SQL"],
        required_capabilities=["comunicação"],
    )
    candidate = _candidate_profile(
        resume_hash="resume-low-delta",
        detected_level="senior",
        professional_area="data",
        tools_and_systems=["SQL"],
        capabilities=[CandidateCapability(name="comunicação", evidence_text="Boa comunicação.", strength="high", source="summary", confidence="high")],
        education=[EducationEntry(level="bachelor", field="Dados", institution="A", graduation_year=2020, is_completed=True)],
    )

    mapping = _mapping(
        job.description_hash,
        candidate.resume_hash,
        [_match("SQL"), _match("comunicação", requirement_type="capability")],
    )

    comparison = service.compare(
        job,
        candidate,
        mapping,
        legacy_result=_legacy_result(score=82, recommendation="good_match", coverage=96.0),
    )

    assert comparison.delta < 25
    assert comparison.should_review_manually is False


def test_adaptive_failure_keeps_legacy_result() -> None:
    adaptive = Mock(spec=AdaptiveScorerService)
    adaptive.score.side_effect = RuntimeError("adaptive failure")
    service = AdaptiveScoringComparisonService(adaptive_scorer=adaptive)

    job = _job_profile(
        description_hash="job-failure",
        area="data",
        target_level="senior",
        critical_requirements=[JobRequirement(name="SQL", description="SQL.", is_mandatory=True, importance_weight=2.0)],
        required_tools=["SQL"],
        required_capabilities=["comunicação"],
    )
    candidate = _candidate_profile(
        resume_hash="resume-failure",
        detected_level="senior",
        professional_area="data",
        tools_and_systems=["SQL"],
        capabilities=[CandidateCapability(name="comunicação", evidence_text="Boa comunicação.", strength="high", source="summary", confidence="high")],
        education=[EducationEntry(level="bachelor", field="Dados", institution="A", graduation_year=2020, is_completed=True)],
    )

    comparison = service.compare(
        job,
        candidate,
        _mapping(job.description_hash, candidate.resume_hash, [_match("SQL")]),
    )

    assert comparison.legacy_match_score > 0
    assert comparison.adaptive_match_score == 0
    assert comparison.should_review_manually is True
