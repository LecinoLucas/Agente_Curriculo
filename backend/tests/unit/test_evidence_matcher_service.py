from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest

from src.application.ports.ai_service import AIAnalysisResponse, AIService
from src.application.services.evidence_matcher_service import (
    EvidenceMatcherService,
    InMemoryEvidenceMappingCache,
    _parse_mapping,
)
from src.domain.value_objects.candidate_profile import (
    CandidateCapability,
    CandidateProfile,
    CertificationEntry,
    EducationEntry,
    EvidencedSkill,
    Experience,
)
from src.domain.value_objects.evidence_mapping import EvidenceMapping, RequirementMatch
from src.domain.value_objects.job_profile import AREA_WEIGHTS, JobProfile, JobRequirement


def _make_ai_response(payload: dict) -> AIAnalysisResponse:
    return AIAnalysisResponse(
        content=json.dumps(payload),
        input_tokens=321,
        output_tokens=123,
        cache_read_tokens=0,
        cache_write_tokens=0,
        processing_time_ms=456,
    )


def _mock_ai(payload: dict) -> AIService:
    ai = AsyncMock(spec=AIService)
    ai.analyze.return_value = _make_ai_response(payload)
    return ai


def _failing_ai() -> AIService:
    ai = AsyncMock(spec=AIService)
    ai.analyze.side_effect = RuntimeError("AI unavailable")
    return ai


def _job_profile(
    *,
    description_hash: str,
    area: str,
    target_level: str,
    job_completeness_score: float = 0.92,
    confidence: str = "high",
    critical_requirements: list[JobRequirement] | None = None,
    desirable_requirements: list[JobRequirement] | None = None,
) -> JobProfile:
    return JobProfile(
        area=area,
        target_level=target_level,
        main_mission="Mapear evidencias com precisão.",
        critical_requirements=critical_requirements or [],
        desirable_requirements=desirable_requirements or [],
        responsibilities=["Executar a operação principal da vaga."],
        required_tools=["SQL", "Power BI", "ETL"],
        required_capabilities=["comunicação", "autonomia"],
        seniority_signals=["Experiência sênior esperada"],
        adaptive_weights=AREA_WEIGHTS.get(area, AREA_WEIGHTS["other"]),
        job_completeness_score=job_completeness_score,
        confidence=confidence,
        description_hash=description_hash,
    )


def _candidate_profile(
    *,
    resume_hash: str,
    detected_level: str,
    professional_area: str,
    profile_completeness: float = 0.9,
    confidence: str = "high",
    experiences: list[Experience] | None = None,
    evidenced_skills: list[EvidencedSkill] | None = None,
    tools_and_systems: list[str] | None = None,
    capabilities: list[CandidateCapability] | None = None,
    education: list[EducationEntry] | None = None,
    certifications: list[CertificationEntry] | None = None,
    leadership_evidence: list[str] | None = None,
    business_impact_evidence: list[str] | None = None,
) -> CandidateProfile:
    return CandidateProfile(
        detected_level=detected_level,
        estimated_experience_years=8.0,
        current_role="Analista",
        professional_area=professional_area,
        experiences=experiences or [],
        evidenced_skills=evidenced_skills or [],
        tools_and_systems=tools_and_systems or [],
        capabilities=capabilities or [],
        education=education or [],
        certifications=certifications or [],
        leadership_evidence=leadership_evidence or [],
        business_impact_evidence=business_impact_evidence or [],
        profile_completeness=profile_completeness,
        confidence=confidence,
        resume_hash=resume_hash,
    )


DATA_ANALYST_PROFILE = _job_profile(
    description_hash="job-data-1234",
    area="data",
    target_level="senior",
    critical_requirements=[
        JobRequirement(
            name="análise de dados",
            description="Transformar dados em insights e relatórios.",
            is_mandatory=True,
            importance_weight=2.0,
            evidence_examples=["analisou indicadores e entregou dashboards"],
        ),
        JobRequirement(
            name="pipelines de dados",
            description="Construir e manter ETL/ELT em produção.",
            is_mandatory=True,
            importance_weight=2.0,
            evidence_examples=["manteve pipelines operacionais"],
        ),
    ],
)

DATA_ANALYST_CANDIDATE = _candidate_profile(
    resume_hash="resume-data-1234",
    detected_level="senior",
    professional_area="data",
    evidenced_skills=[
        EvidencedSkill(
            name="SQL Server",
            evidence_text="Experiência com SQL Server em relatórios e extração de dados.",
            confidence="high",
            years_evidenced=5,
            source="experience",
        ),
        EvidencedSkill(
            name="Power BI",
            evidence_text="Construção de dashboards executivos em Power BI.",
            confidence="high",
            years_evidenced=4,
            source="experience",
        ),
        EvidencedSkill(
            name="ETL",
            evidence_text="ETL com SSIS e rotinas de carga.",
            confidence="high",
            years_evidenced=4,
            source="experience",
        ),
    ],
    tools_and_systems=["SQL Server", "Power BI", "SSIS"],
    leadership_evidence=["Mentoria informal de analistas juniores"],
    business_impact_evidence=["Reduziu 30% do tempo de fechamento mensal"],
)

TECH_LEAD_PROFILE = _job_profile(
    description_hash="job-tech-lead-1234",
    area="technology",
    target_level="lead",
    critical_requirements=[
        JobRequirement(
            name="liderança técnica",
            description="Conduzir decisões técnicas e orientar o time.",
            is_mandatory=True,
            importance_weight=2.0,
            evidence_examples=["liderou squad com 6 pessoas"],
        ),
        JobRequirement(
            name="arquitetura de IA",
            description="Projetar soluções com LLM/RAG em produção.",
            is_mandatory=True,
            importance_weight=1.8,
            evidence_examples=["arquitetou plataforma de IA"],
        ),
    ],
)

TECH_LEAD_CANDIDATE = _candidate_profile(
    resume_hash="resume-tech-1234",
    detected_level="senior",
    professional_area="technology",
    evidenced_skills=[
        EvidencedSkill(
            name="LLM",
            evidence_text="Implementou soluções com LLM e RAG.",
            confidence="high",
            years_evidenced=2,
            source="experience",
        ),
        EvidencedSkill(
            name="IA aplicada",
            evidence_text="Trabalhou com produtos de IA em produção.",
            confidence="high",
            years_evidenced=3,
            source="experience",
        ),
    ],
    tools_and_systems=["RAG", "LLM", "Python"],
    capabilities=[CandidateCapability(name="comunicação", evidence_text="Apresentou resultados para stakeholders.", strength="medium", source="summary", confidence="medium")],
    leadership_evidence=["Mentoria técnica pontual"],
    business_impact_evidence=[],
)

ADMIN_PROFILE = _job_profile(
    description_hash="job-admin-1234",
    area="administrative",
    target_level="junior",
    critical_requirements=[
        JobRequirement(
            name="rotinas administrativas",
            description="Apoio ao escritório e organização interna.",
            is_mandatory=True,
            importance_weight=1.6,
            evidence_examples=["controlou agenda e documentos"],
        )
    ],
)

ADMIN_CANDIDATE = _candidate_profile(
    resume_hash="resume-admin-1234",
    detected_level="mid",
    professional_area="administrative",
    evidenced_skills=[
        EvidencedSkill(
            name="ERP",
            evidence_text="Uso de ERP para rotinas administrativas e financeiras.",
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
    capabilities=[CandidateCapability(name="organização", evidence_text="Geriu rotinas com alto volume de documentos.", strength="high", source="experience", confidence="high")],
)

ACCOUNTING_PROFILE = _job_profile(
    description_hash="job-accounting-1234",
    area="accounting",
    target_level="mid",
    critical_requirements=[
        JobRequirement(
            name="obrigações fiscais",
            description="SPED, ECD, ECF e apuração de impostos.",
            is_mandatory=True,
            importance_weight=2.0,
            evidence_examples=["transmissão de SPED"],
        )
    ],
)

ACCOUNTING_CANDIDATE = _candidate_profile(
    resume_hash="resume-accounting-1234",
    detected_level="mid",
    professional_area="accounting",
    evidenced_skills=[
        EvidencedSkill(
            name="SPED",
            evidence_text="Rotinas de SPED Fiscal e Contribuições.",
            confidence="high",
            years_evidenced=3,
            source="experience",
        ),
        EvidencedSkill(
            name="DRE",
            evidence_text="Elaboração de DRE e fechamento contábil.",
            confidence="high",
            years_evidenced=4,
            source="experience",
        ),
    ],
    tools_and_systems=["ERP fiscal", "Excel"],
    education=[EducationEntry(level="bachelor", field="Contabilidade", institution="Universidade X", graduation_year=2019, is_completed=True)],
)

INCOMPLETE_JOB_PROFILE = _job_profile(
    description_hash="job-incomplete-1234",
    area="other",
    target_level="undefined",
    job_completeness_score=0.18,
    confidence="low",
)

INCOMPLETE_CANDIDATE_PROFILE = _candidate_profile(
    resume_hash="resume-incomplete-1234",
    detected_level="undefined",
    professional_area="other",
    profile_completeness=0.12,
    confidence="low",
)


DATA_ANALYST_RESPONSE = {
    "job_profile_hash": DATA_ANALYST_PROFILE.description_hash,
    "candidate_profile_hash": DATA_ANALYST_CANDIDATE.resume_hash,
    "requirement_matches": [
        {
            "requirement": "análise de dados",
            "requirement_type": "critical",
            "match_status": "meets",
            "match_type": "direct",
            "evidence_quotes": ["Dashboards executivos em Power BI"],
            "evidence_strength": "high",
            "confidence": "high",
            "score_hint": 92,
            "explanation": "O candidato demonstra análise e visualização de dados diretamente.",
        },
        {
            "requirement": "pipelines de dados",
            "requirement_type": "critical",
            "match_status": "meets",
            "match_type": "equivalent",
            "evidence_quotes": ["ETL com SSIS", "SQL Server"],
            "evidence_strength": "high",
            "confidence": "high",
            "score_hint": 88,
            "explanation": "ETL e rotinas de carga cobrem o requisito de pipelines.",
        },
        {
            "requirement": "mentoria",
            "requirement_type": "capability",
            "match_status": "partially_meets",
            "match_type": "inferred",
            "evidence_quotes": ["Mentoria informal de analistas juniores"],
            "evidence_strength": "medium",
            "confidence": "medium",
            "score_hint": 55,
            "explanation": "Há sinal de apoio técnico, mas não gestão formal.",
        },
    ],
    "overall_evidence_strength": "high",
    "confidence": "high",
    "unmapped_critical_requirements": [],
    "candidate_extra_strengths": ["SQL Server", "Power BI", "ETL"],
    "risk_points": ["Liderança formal não evidenciada"],
}

TECH_LEAD_RESPONSE = {
    "job_profile_hash": TECH_LEAD_PROFILE.description_hash,
    "candidate_profile_hash": TECH_LEAD_CANDIDATE.resume_hash,
    "requirement_matches": [
        {
            "requirement": "liderança técnica",
            "requirement_type": "critical",
            "match_status": "partially_meets",
            "match_type": "inferred",
            "evidence_quotes": ["Mentoria técnica pontual"],
            "evidence_strength": "medium",
            "confidence": "medium",
            "score_hint": 58,
            "explanation": "Há sinal de orientação técnica, mas a liderança formal é limitada.",
        },
        {
            "requirement": "arquitetura de IA",
            "requirement_type": "critical",
            "match_status": "meets",
            "match_type": "direct",
            "evidence_quotes": ["Implementou soluções com LLM e RAG"],
            "evidence_strength": "high",
            "confidence": "high",
            "score_hint": 86,
            "explanation": "A experiência com LLM/RAG atende diretamente ao requisito.",
        },
    ],
    "overall_evidence_strength": "medium",
    "confidence": "medium",
    "unmapped_critical_requirements": [],
    "candidate_extra_strengths": ["LLM", "RAG", "IA aplicada"],
    "risk_points": ["Baixa evidência de gestão formal de pessoas"],
}

ADMIN_RESPONSE = {
    "job_profile_hash": ADMIN_PROFILE.description_hash,
    "candidate_profile_hash": ADMIN_CANDIDATE.resume_hash,
    "requirement_matches": [
        {
            "requirement": "rotinas administrativas",
            "requirement_type": "critical",
            "match_status": "meets",
            "match_type": "equivalent",
            "evidence_quotes": ["Uso de ERP", "Planilhas e relatórios em Excel"],
            "evidence_strength": "high",
            "confidence": "high",
            "score_hint": 84,
            "explanation": "ERP e rotinas de escritório cobrem o contexto administrativo.",
        }
    ],
    "overall_evidence_strength": "high",
    "confidence": "high",
    "unmapped_critical_requirements": [],
    "candidate_extra_strengths": ["ERP", "Excel"],
    "risk_points": [],
}

ACCOUNTING_RESPONSE = {
    "job_profile_hash": ACCOUNTING_PROFILE.description_hash,
    "candidate_profile_hash": ACCOUNTING_CANDIDATE.resume_hash,
    "requirement_matches": [
        {
            "requirement": "obrigações fiscais",
            "requirement_type": "critical",
            "match_status": "meets",
            "match_type": "direct",
            "evidence_quotes": ["Rotinas de SPED Fiscal e Contribuições"],
            "evidence_strength": "high",
            "confidence": "high",
            "score_hint": 90,
            "explanation": "A experiência com SPED e fechamento contábil atende ao requisito.",
        }
    ],
    "overall_evidence_strength": "high",
    "confidence": "high",
    "unmapped_critical_requirements": [],
    "candidate_extra_strengths": ["SPED", "DRE"],
    "risk_points": ["Nenhum risco crítico adicional identificado"],
}


def _find_match(mapping: EvidenceMapping, requirement: str) -> RequirementMatch:
    for match in mapping.requirement_matches:
        if match.requirement == requirement:
            return match
    raise AssertionError(f"Requirement not found: {requirement}")


@pytest.mark.asyncio
async def test_generate_mapping_parses_data_analyst_equivalences() -> None:
    service = EvidenceMatcherService(ai_service=_mock_ai(DATA_ANALYST_RESPONSE))

    mapping = await service.generate_mapping(DATA_ANALYST_PROFILE, DATA_ANALYST_CANDIDATE)

    assert mapping.job_profile_hash == DATA_ANALYST_PROFILE.description_hash
    assert mapping.candidate_profile_hash == DATA_ANALYST_CANDIDATE.resume_hash
    assert mapping.overall_evidence_strength == "high"
    assert mapping.confidence == "high"
    assert mapping.unmapped_critical_requirements == []
    assert "SQL Server" in mapping.candidate_extra_strengths

    sql_match = _find_match(mapping, "análise de dados")
    assert sql_match.match_status == "meets"
    assert sql_match.match_type == "direct"
    assert sql_match.evidence_quotes == ["Dashboards executivos em Power BI"]

    etl_match = _find_match(mapping, "pipelines de dados")
    assert etl_match.match_type == "equivalent"
    assert "ETL com SSIS" in etl_match.evidence_quotes


@pytest.mark.asyncio
async def test_generate_mapping_cache_hit_returns_same_result_without_second_ai_call() -> None:
    cache = InMemoryEvidenceMappingCache()
    ai = _mock_ai(DATA_ANALYST_RESPONSE)
    service = EvidenceMatcherService(ai_service=ai, cache=cache)

    first = await service.generate_mapping(DATA_ANALYST_PROFILE, DATA_ANALYST_CANDIDATE)
    second = await service.generate_mapping(DATA_ANALYST_PROFILE, DATA_ANALYST_CANDIDATE)

    assert first == second
    assert ai.analyze.await_count == 1


@pytest.mark.asyncio
async def test_generate_mapping_falls_back_to_empty_low_confidence_mapping() -> None:
    service = EvidenceMatcherService(ai_service=_failing_ai())

    mapping = await service.generate_mapping(DATA_ANALYST_PROFILE, DATA_ANALYST_CANDIDATE)

    assert mapping == EvidenceMapping(
        job_profile_hash=DATA_ANALYST_PROFILE.description_hash,
        candidate_profile_hash=DATA_ANALYST_CANDIDATE.resume_hash,
        requirement_matches=[],
        overall_evidence_strength="none",
        confidence="low",
        unmapped_critical_requirements=[],
        candidate_extra_strengths=[],
        risk_points=[],
    )


@pytest.mark.parametrize(
    ("job_profile", "candidate_profile", "payload", "requirement", "expected_type", "expected_fragment"),
    [
        (TECH_LEAD_PROFILE, TECH_LEAD_CANDIDATE, TECH_LEAD_RESPONSE, "liderança técnica", "inferred", "liderança formal"),
        (ADMIN_PROFILE, ADMIN_CANDIDATE, ADMIN_RESPONSE, "rotinas administrativas", "equivalent", "ERP"),
        (ACCOUNTING_PROFILE, ACCOUNTING_CANDIDATE, ACCOUNTING_RESPONSE, "obrigações fiscais", "direct", "SPED"),
    ],
)
@pytest.mark.asyncio
async def test_generate_mapping_handles_real_world_profiles(
    job_profile: JobProfile,
    candidate_profile: CandidateProfile,
    payload: dict,
    requirement: str,
    expected_type: str,
    expected_fragment: str,
) -> None:
    service = EvidenceMatcherService(ai_service=_mock_ai(payload))

    mapping = await service.generate_mapping(job_profile, candidate_profile)
    match = _find_match(mapping, requirement)

    assert match.match_type == expected_type
    assert any(expected_fragment.lower() in text.lower() for text in [*match.evidence_quotes, match.explanation, *mapping.risk_points])
    assert mapping.requirement_matches


def test_parse_mapping_does_not_invent_evidence_when_requirement_is_not_evidenced() -> None:
    raw = {
        "job_profile_hash": "job-x",
        "candidate_profile_hash": "cand-x",
        "requirement_matches": [
            {
                "requirement": "SQL",
                "requirement_type": "tool",
                "match_status": "not_evidenced",
                "match_type": "absent",
                "evidence_quotes": ["SQL Server", "Consultas"],
                "evidence_strength": "high",
                "confidence": "high",
                "score_hint": 91,
                "explanation": "Sem evidência suficiente.",
            }
        ],
        "overall_evidence_strength": "low",
        "confidence": "low",
        "unmapped_critical_requirements": [],
        "candidate_extra_strengths": [],
        "risk_points": [],
    }

    mapping = _parse_mapping(raw, "job-x", "cand-x")

    match = _find_match(mapping, "SQL")
    assert match.evidence_quotes == []
    assert match.evidence_strength == "none"
    assert match.score_hint == 0.0


def test_prompt_uses_only_profiles_and_contains_equivalence_rules() -> None:
    service = EvidenceMatcherService(ai_service=_mock_ai(DATA_ANALYST_RESPONSE))
    incomplete_job = _job_profile(
        description_hash=INCOMPLETE_JOB_PROFILE.description_hash,
        area=INCOMPLETE_JOB_PROFILE.area,
        target_level=INCOMPLETE_JOB_PROFILE.target_level,
        job_completeness_score=INCOMPLETE_JOB_PROFILE.job_completeness_score,
        confidence=INCOMPLETE_JOB_PROFILE.confidence,
    )

    request = service._build_request(incomplete_job, INCOMPLETE_CANDIDATE_PROFILE)

    assert "SQL Server pode atender SQL" in request.system_prompt
    assert "Power BI pode atender BI/dashboard" in request.system_prompt
    assert "ETL pode atender pipelines de dados" in request.system_prompt
    assert '"profile_completeness": 0.12' in request.prompt_template
    assert '"job_completeness_score": 0.18' in request.prompt_template
    assert INCOMPLETE_JOB_PROFILE.description_hash in request.prompt_template
    assert INCOMPLETE_CANDIDATE_PROFILE.resume_hash in request.prompt_template


def test_mapping_round_trip_serialization() -> None:
    mapping = EvidenceMapping.from_dict(DATA_ANALYST_RESPONSE)
    restored = EvidenceMapping.from_dict(mapping.to_dict())

    assert restored == mapping
