from __future__ import annotations

from src.application.services.adaptive_scorer_service import AdaptiveScorerService
from src.domain.value_objects.adaptive_score_result import AdaptiveScoreResult
from src.domain.value_objects.candidate_profile import (
    CandidateCapability,
    CandidateProfile,
    EducationEntry,
    EvidencedSkill,
    Experience,
)
from src.domain.value_objects.evidence_mapping import EvidenceMapping, RequirementMatch
from src.domain.value_objects.job_profile import AREA_WEIGHTS, JobProfile, JobRequirement


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
    overall_strength: str = "high",
    confidence: str = "high",
    risk_points: list[str] | None = None,
) -> EvidenceMapping:
    return EvidenceMapping(
        job_profile_hash=job_hash,
        candidate_profile_hash=candidate_hash,
        requirement_matches=matches,
        overall_evidence_strength=overall_strength,
        confidence=confidence,
        unmapped_critical_requirements=[],
        candidate_extra_strengths=[],
        risk_points=risk_points or [],
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
    explanation: str = "Evidência direta.",
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
        explanation=explanation,
    )


def test_adaptive_scorer_data_analyst_scores_high_and_is_deterministic() -> None:
    service = AdaptiveScorerService()

    job = _job_profile(
        description_hash="job-data",
        area="data",
        target_level="senior",
        critical_requirements=[
            JobRequirement(
                name="análise de dados",
                description="Transformar dados em insights e relatórios.",
                is_mandatory=True,
                importance_weight=2.0,
            ),
            JobRequirement(
                name="pipelines de dados",
                description="Construir e manter ETL/ELT em produção.",
                is_mandatory=True,
                importance_weight=2.0,
            ),
        ],
        required_tools=["SQL", "Power BI", "ETL"],
        required_capabilities=["comunicação", "autonomia"],
        responsibilities=["definir métricas", "manter pipelines", "apresentar resultados"],
    )

    candidate = _candidate_profile(
        resume_hash="resume-data",
        detected_level="senior",
        professional_area="data",
        experience_years=9.0,
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
        education=[
            EducationEntry(
                level="bachelor",
                field="Estatística",
                institution="Universidade X",
                graduation_year=2018,
                is_completed=True,
            )
        ],
        leadership_evidence=["Mentoria informal de analistas juniores"],
        business_impact_evidence=["Reduziu 30% do tempo de fechamento mensal"],
    )

    mapping = _mapping(
        job.description_hash,
        candidate.resume_hash,
        [
            _match("análise de dados", match_type="direct", evidence_quotes=["dashboards em Power BI"]),
            _match("pipelines de dados", match_type="equivalent", evidence_quotes=["ETL com SSIS", "SQL Server"]),
        ],
    )

    first = service.score(job, candidate, mapping)
    second = service.score(job, candidate, mapping)

    assert isinstance(first, AdaptiveScoreResult)
    assert first.to_dict() == second.to_dict()
    assert first.match_score >= 82
    assert first.recommendation == "strong_match"
    assert first.critical_coverage >= 0.85
    assert first.desirable_coverage == 1.0
    assert "SQL Server" in first.strengths or "SQL" in first.strengths


def test_adaptive_scorer_tech_lead_ai_scores_medium_with_weak_leadership() -> None:
    service = AdaptiveScorerService()

    job = _job_profile(
        description_hash="job-tech-lead",
        area="technology",
        target_level="lead",
        critical_requirements=[
            JobRequirement(
                name="liderança técnica",
                description="Conduzir decisões técnicas e orientar o time.",
                is_mandatory=True,
                importance_weight=2.0,
            ),
            JobRequirement(
                name="arquitetura de IA",
                description="Projetar soluções com LLM/RAG em produção.",
                is_mandatory=True,
                importance_weight=1.8,
            ),
        ],
        required_tools=["Python", "LLM", "RAG"],
        required_capabilities=["liderança", "comunicação"],
        responsibilities=["definir roadmap técnico", "conduzir reviews", "colaborar com produto"],
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
        education=[
            EducationEntry(
                level="master",
                field="Inteligência Artificial",
                institution="Universidade Y",
                graduation_year=2019,
                is_completed=True,
            )
        ],
        leadership_evidence=["Mentoria técnica pontual"],
        business_impact_evidence=[],
    )

    mapping = _mapping(
        job.description_hash,
        candidate.resume_hash,
        [
            _match("liderança técnica", match_type="inferred", evidence_strength="medium", score_hint=48),
            _match("arquitetura de IA", match_type="direct", evidence_quotes=["LLM e RAG em produção"]),
        ],
    )

    result = service.score(job, candidate, mapping)

    assert 80 <= result.match_score < 90
    assert result.recommendation == "interview"
    assert result.critical_coverage < 0.85
    assert any("lideranca" in risk.lower() or "liderança" in risk.lower() for risk in result.risk_points)


def test_adaptive_scorer_administrative_values_rotines_excel_and_erp() -> None:
    service = AdaptiveScorerService()

    job = _job_profile(
        description_hash="job-admin",
        area="administrative",
        target_level="junior",
        critical_requirements=[
            JobRequirement(
                name="rotinas administrativas",
                description="Apoio ao escritório e organização interna.",
                is_mandatory=True,
                importance_weight=1.6,
            )
        ],
        required_tools=["Excel", "ERP"],
        required_capabilities=["organização", "comunicação"],
        responsibilities=["controlar agenda", "organizar documentos", "apoiar comunicação interna"],
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
        tools_and_systems=["ERP", "Excel", "Word"],
        capabilities=[
            CandidateCapability(
                name="organização",
                evidence_text="Geriu rotinas com alto volume de documentos.",
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
        education=[
            EducationEntry(
                level="bachelor",
                field="Administração",
                institution="Universidade Z",
                graduation_year=2017,
                is_completed=True,
            )
        ],
        business_impact_evidence=["Reduziu retrabalho com padronização de documentos"],
    )

    mapping = _mapping(
        job.description_hash,
        candidate.resume_hash,
        [
            _match("rotinas administrativas", evidence_quotes=["organização interna e documentos"]),
        ],
    )

    result = service.score(job, candidate, mapping)

    assert result.match_score >= 70
    assert result.recommendation in {"strong_match", "interview"}
    assert result.critical_coverage >= 0.85
    assert any("ERP" in strength or "Excel" in strength for strength in result.strengths)


def test_adaptive_scorer_accounting_values_fiscal_and_financial_routines() -> None:
    service = AdaptiveScorerService()

    job = _job_profile(
        description_hash="job-accounting",
        area="accounting",
        target_level="mid",
        critical_requirements=[
            JobRequirement(
                name="obrigações fiscais",
                description="SPED, ECD, ECF e apuração de impostos.",
                is_mandatory=True,
                importance_weight=2.0,
            )
        ],
        required_tools=["ERP fiscal", "Excel"],
        required_capabilities=["atenção a detalhes", "organização"],
        responsibilities=["fechamento contábil", "apuração de impostos", "transmissão de obrigações"],
    )

    candidate = _candidate_profile(
        resume_hash="resume-accounting",
        detected_level="mid",
        professional_area="accounting",
        experience_years=7.0,
        evidenced_skills=[
            EvidencedSkill(
                name="SPED",
                evidence_text="Rotinas de SPED Fiscal e Contribuições.",
                confidence="high",
                years_evidenced=3,
                source="experience",
            ),
            EvidencedSkill(
                name="ERP fiscal",
                evidence_text="Uso de ERP fiscal.",
                confidence="high",
                years_evidenced=4,
                source="experience",
            ),
        ],
        tools_and_systems=["ERP fiscal", "Excel"],
        capabilities=[
            CandidateCapability(
                name="organização",
                evidence_text="Rotinas organizadas com alto volume.",
                strength="high",
                source="experience",
                confidence="high",
            )
        ],
        education=[
            EducationEntry(
                level="bachelor",
                field="Contabilidade",
                institution="Universidade W",
                graduation_year=2016,
                is_completed=True,
            )
        ],
        business_impact_evidence=["Fechamento contábil com redução de pendências"],
    )

    mapping = _mapping(
        job.description_hash,
        candidate.resume_hash,
        [
            _match("obrigações fiscais", evidence_quotes=["SPED Fiscal e Contribuições"]),
        ],
    )

    result = service.score(job, candidate, mapping)

    assert result.match_score >= 72
    assert result.recommendation in {"strong_match", "interview"}
    assert result.critical_coverage >= 0.85
    assert any("SPED" in strength or "ERP" in strength for strength in result.strengths)


def test_adaptive_scorer_returns_insufficient_data_for_incomplete_resume() -> None:
    service = AdaptiveScorerService()

    job = _job_profile(
        description_hash="job-incomplete-resume",
        area="data",
        target_level="senior",
        critical_requirements=[
            JobRequirement(
                name="análise de dados",
                description="Transformar dados em insights e relatórios.",
                is_mandatory=True,
                importance_weight=2.0,
            )
        ],
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

    mapping = _mapping(
        job.description_hash,
        candidate.resume_hash,
        [],
        confidence="low",
    )

    result = service.score(job, candidate, mapping)

    assert result.recommendation == "insufficient_data"
    assert result.confidence_score < 50


def test_adaptive_scorer_incomplete_job_reduces_confidence_not_score() -> None:
    service = AdaptiveScorerService()

    job = _job_profile(
        description_hash="job-incomplete",
        area="other",
        target_level="undefined",
        completeness=0.18,
        critical_requirements=[],
        required_tools=[],
        required_capabilities=[],
        responsibilities=[],
    )

    candidate = _candidate_profile(
        resume_hash="resume-complete",
        detected_level="senior",
        professional_area="technology",
        experience_years=10.0,
        evidenced_skills=[
            EvidencedSkill(
                name="Python",
                evidence_text="Python em produção.",
                confidence="high",
                years_evidenced=6,
                source="experience",
            )
        ],
        tools_and_systems=["Python"],
        capabilities=[
            CandidateCapability(
                name="comunicação",
                evidence_text="Apresentou resultados.",
                strength="high",
                source="summary",
                confidence="high",
            )
        ],
        education=[
            EducationEntry(
                level="master",
                field="Engenharia de Software",
                institution="Universidade Q",
                graduation_year=2017,
                is_completed=True,
            )
        ],
        business_impact_evidence=["Entregas críticas em produção"],
    )

    mapping = _mapping(job.description_hash, candidate.resume_hash, [], confidence="low")

    result = service.score(job, candidate, mapping)

    assert result.match_score > 45
    assert result.confidence_score < 70
    assert result.recommendation in {"maybe", "interview", "strong_match"}


def test_adaptive_scorer_reduces_critical_coverage_when_requirement_is_missing() -> None:
    service = AdaptiveScorerService()

    job = _job_profile(
        description_hash="job-critical-gap",
        area="technology",
        target_level="senior",
        critical_requirements=[
            JobRequirement(
                name="arquitetura de software",
                description="Projetar sistemas escaláveis.",
                is_mandatory=True,
                importance_weight=2.0,
            ),
            JobRequirement(
                name="liderança técnica",
                description="Conduzir decisões técnicas e orientar o time.",
                is_mandatory=True,
                importance_weight=2.0,
            ),
        ],
        required_tools=["Python"],
        required_capabilities=["comunicação"],
        responsibilities=["definir padrões técnicos"],
    )

    candidate = _candidate_profile(
        resume_hash="resume-critical-gap",
        detected_level="senior",
        professional_area="technology",
        experience_years=8.0,
        tools_and_systems=["Python"],
        capabilities=[
            CandidateCapability(
                name="comunicação",
                evidence_text="Apresentações para stakeholders.",
                strength="high",
                source="summary",
                confidence="high",
            )
        ],
        leadership_evidence=["Mentoria pontual"],
        business_impact_evidence=["Arquitetura de produtos em produção"],
    )

    mapping = _mapping(
        job.description_hash,
        candidate.resume_hash,
        [
            _match("arquitetura de software", evidence_quotes=["sistemas escaláveis"]),
        ],
    )

    result = service.score(job, candidate, mapping)

    assert result.critical_coverage < 0.85
    assert "liderança técnica" in result.gaps or "lideranca técnica" in result.gaps or "lideranca técnica" in [gap.lower() for gap in result.gaps]


def test_adaptive_scorer_overqualification_creates_risk_without_rejection() -> None:
    service = AdaptiveScorerService()

    job = _job_profile(
        description_hash="job-junior",
        area="administrative",
        target_level="junior",
        critical_requirements=[
            JobRequirement(
                name="rotinas administrativas",
                description="Apoio ao escritório.",
                is_mandatory=True,
                importance_weight=1.5,
            )
        ],
        required_tools=["Excel"],
        required_capabilities=["organização"],
        responsibilities=["organizar documentos"],
    )

    candidate = _candidate_profile(
        resume_hash="resume-overqualified",
        detected_level="lead",
        professional_area="administrative",
        experience_years=12.0,
        tools_and_systems=["Excel", "ERP"],
        capabilities=[
            CandidateCapability(
                name="organização",
                evidence_text="Rotinas complexas e times.",
                strength="high",
                source="experience",
                confidence="high",
            )
        ],
        leadership_evidence=["Gestão de equipe", "Mentoria"],
        business_impact_evidence=["Redesenho de processos"],
    )

    mapping = _mapping(
        job.description_hash,
        candidate.resume_hash,
        [
            _match("rotinas administrativas", evidence_quotes=["apoio ao escritório"]),
        ],
    )

    result = service.score(job, candidate, mapping)

    assert any("sobrequalificacao" in risk.lower() for risk in result.risk_points)
    assert result.recommendation != "reject"


def test_adaptive_scorer_is_deterministic_for_same_input() -> None:
    service = AdaptiveScorerService()

    job = _job_profile(
        description_hash="job-deterministic",
        area="data",
        target_level="senior",
        critical_requirements=[
            JobRequirement(
                name="análise de dados",
                description="Analisar dados.",
                is_mandatory=True,
                importance_weight=2.0,
            )
        ],
        required_tools=["SQL"],
        required_capabilities=["comunicação"],
    )

    candidate = _candidate_profile(
        resume_hash="resume-deterministic",
        detected_level="senior",
        professional_area="data",
        tools_and_systems=["SQL"],
        capabilities=[
            CandidateCapability(
                name="comunicação",
                evidence_text="Comunicação clara.",
                strength="high",
                source="summary",
                confidence="high",
            )
        ],
        education=[
            EducationEntry(
                level="bachelor",
                field="Dados",
                institution="Universidade A",
                graduation_year=2020,
                is_completed=True,
            )
        ],
    )

    mapping = _mapping(
        job.description_hash,
        candidate.resume_hash,
        [_match("análise de dados")],
    )

    first = service.score(job, candidate, mapping)
    second = service.score(job, candidate, mapping)

    assert first.to_dict() == second.to_dict()
