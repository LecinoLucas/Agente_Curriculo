#!/usr/bin/env python3
"""
Diagnóstico e teste de regressão para o falso negativo:
Analista de Dados com Power BI recebe 39% (deve ser 75-90%).

Este script reproduz o cenário e loga o breaking completo.
"""

import asyncio
from decimal import Decimal
from uuid import uuid4

import structlog

from src.application.services.adaptive_scorer_service import AdaptiveScorerService
from src.domain.value_objects.candidate_profile import (
    CandidateCapability,
    CandidateProfile,
    EducationEntry,
    EvidencedSkill,
    Experience,
)
from src.domain.value_objects.evidence_mapping import EvidenceMapping, RequirementMatch
from src.domain.value_objects.job_profile import AREA_WEIGHTS, JobProfile, JobRequirement

logger = structlog.get_logger(__name__)


def _log_diagnostic(title: str, data: dict) -> None:
    """Log structured diagnostic data"""
    print(f"\n{'='*70}")
    print(f"📊 {title}")
    print(f"{'='*70}")
    for key, value in data.items():
        if isinstance(value, list):
            print(f"  {key}:")
            for item in value:
                print(f"    • {item}")
        elif isinstance(value, dict):
            print(f"  {key}:")
            for k, v in item.items():
                print(f"    {k}: {v}")
        else:
            print(f"  {key}: {value}")


def test_analyst_dados_39_percent_false_negative() -> None:
    """
    Reproduz o cenário real: Analista de Dados forte recebendo 39%.

    VAGA: Analista de Dados
    - Power BI avançado, DAX, Power Query, ETL, modelagem, SQL, Git, UX/UI/Figma, inglês

    CURRÍCULO:
    - ETL, Python, Microsoft Power BI, SQL Server, PostgreSQL, DBA, Data Science, IA
    - BI Analyst, Data Analyst, BI Consultant
    - SQL Server 5TB+, 500M+ registros, query tuning, índices, particionamento
    """

    print("\n" + "="*70)
    print("🔍 DIAGNÓSTICO: Falso Negativo 39% em Analista de Dados")
    print("="*70)

    service = AdaptiveScorerService()

    # VAGA: Analista de Dados com requisitos diversos
    job = JobProfile(
        area="data",
        target_level="senior",
        main_mission="Analisar dados e criar dashboards de BI",
        # CRÍTICOS: Power BI, ETL, SQL, Modelagem
        critical_requirements=[
            JobRequirement(
                name="Power BI avançado",
                description="Dashboards, DAX, Power Query",
                is_mandatory=True,
                importance_weight=2.0,
            ),
            JobRequirement(
                name="ETL / Pipelines de dados",
                description="Extrair, transformar e carregar dados",
                is_mandatory=True,
                importance_weight=2.0,
            ),
            JobRequirement(
                name="SQL avançado",
                description="Queries complexas, tuning, índices",
                is_mandatory=True,
                importance_weight=1.8,
            ),
            JobRequirement(
                name="Modelagem de dados",
                description="Desenho de modelos dimensionais",
                is_mandatory=True,
                importance_weight=1.6,
            ),
        ],
        # OPCIONAIS: Git, UX/UI, Inglês avançado (não deveriam ser rejeição)
        desirable_requirements=[
            JobRequirement(
                name="Git / Versionamento",
                description="Controle de versão",
                is_mandatory=False,
                importance_weight=1.0,
            ),
            JobRequirement(
                name="UX/UI / Figma",
                description="Design de interfaces",
                is_mandatory=False,
                importance_weight=0.8,
            ),
            JobRequirement(
                name="Inglês avançado",
                description="Comunicação técnica internacional",
                is_mandatory=False,
                importance_weight=0.8,
            ),
        ],
        required_tools=["Power BI", "SQL", "ETL"],
        required_capabilities=["análise crítica", "comunicação"],
        responsibilities=["criar dashboards", "otimizar queries", "manter pipelines"],
        seniority_signals=["senior", "analista sênior"],
        adaptive_weights=AREA_WEIGHTS.get("data", AREA_WEIGHTS["other"]),
        job_completeness_score=0.9,
        confidence="high",
        description_hash="job-analyst-dados",
    )

    # CURRÍCULO: Muito forte em dados
    candidate = CandidateProfile(
        detected_level="senior",
        estimated_experience_years=8.0,
        current_role="BI Analyst / Data Analyst",
        professional_area="data",
        experiences=[
            Experience(
                company="Empresa A",
                role="BI Analyst",
                duration_months=48,
                is_current=False,
                is_leadership=False,
                key_activities=["Desenvolveu dashboards", "Pipelines ETL"],
                technologies_used=["Power BI", "SQL", "Python"],
            ),
            Experience(
                company="Empresa B",
                role="Data Analyst",
                duration_months=36,
                is_current=True,
                is_leadership=False,
                key_activities=["Query tuning", "Análise de planos", "Otimizações"],
                technologies_used=["SQL Server", "PostgreSQL", "Python"],
            ),
            Experience(
                company="Empresa C",
                role="DBA/Data Engineer",
                duration_months=18,
                is_current=False,
                is_leadership=False,
                key_activities=["Particionamento", "Índices", "Automação"],
                technologies_used=["SQL Server", "SSIS"],
            ),
        ],
        evidenced_skills=[
            EvidencedSkill(
                name="Microsoft Power BI",
                evidence_text="Dashboards executivos, DAX avançado",
                confidence="high",
                years_evidenced=4,
                source="experience",
            ),
            EvidencedSkill(
                name="SQL Server",
                evidence_text="5TB+ databases, query tuning, índices, particionamento",
                confidence="high",
                years_evidenced=5,
                source="experience",
            ),
            EvidencedSkill(
                name="PostgreSQL",
                evidence_text="Queries complexas, análise de planos de execução",
                confidence="high",
                years_evidenced=2,
                source="experience",
            ),
            EvidencedSkill(
                name="ETL / Data Pipeline",
                evidence_text="Python, automação, SSIS, processamento batch",
                confidence="high",
                years_evidenced=4,
                source="experience",
            ),
            EvidencedSkill(
                name="Data Science",
                evidence_text="Machine Learning, análise preditiva",
                confidence="high",
                years_evidenced=2,
                source="experience",
            ),
            EvidencedSkill(
                name="IA / LLM",
                evidence_text="Inteligência artificial e chatbots",
                confidence="high",
                years_evidenced=1,
                source="experience",
            ),
        ],
        tools_and_systems=[
            "Microsoft Power BI",
            "SQL Server",
            "PostgreSQL",
            "Python",
            "SSIS",
            "Excel",
            "Jupyter",
        ],
        capabilities=[
            CandidateCapability(
                name="análise crítica",
                evidence_text="Identificou padrões em 5TB de dados",
                strength="high",
                source="experience",
                confidence="high",
            ),
            CandidateCapability(
                name="comunicação",
                evidence_text="Apresentava insights para executivos",
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
            ),
            EducationEntry(
                level="postgraduate",
                field="Especialização em Data Science",
                institution="Universidade Y",
                graduation_year=2021,
                is_completed=True,
            ),
        ],
        certifications=[],
        leadership_evidence=["Mentoria de analistas juniores"],
        business_impact_evidence=[
            "Reduziu 40% do tempo de fechamento mensal",
            "Economizou 2M/ano com otimizações de query",
        ],
        profile_completeness=0.95,
        confidence="high",
        resume_hash="resume-strong-data-analyst",
    )

    # MAPPING: Evidência direta para todos os skills críticos
    mapping = EvidenceMapping(
        job_profile_hash=job.description_hash,
        candidate_profile_hash=candidate.resume_hash,
        requirement_matches=[
            RequirementMatch(
                requirement="Power BI avançado",
                requirement_type="critical",
                match_status="exceeds",
                match_type="direct",
                evidence_quotes=["Dashboards executivos, DAX avançado"],
                evidence_strength="very_high",
                confidence="high",
                score_hint=100.0,
                explanation="Evidência direta: 4 anos desenvolvendo dashboards em Power BI.",
            ),
            RequirementMatch(
                requirement="ETL / Pipelines de dados",
                requirement_type="critical",
                match_status="exceeds",
                match_type="direct",
                evidence_quotes=["Python, automação, SSIS, processamento batch"],
                evidence_strength="very_high",
                confidence="high",
                score_hint=100.0,
                explanation="Evidência direta: 4 anos com ETL e pipelines.",
            ),
            RequirementMatch(
                requirement="SQL avançado",
                requirement_type="critical",
                match_status="exceeds",
                match_type="direct",
                evidence_quotes=["5TB+ databases, query tuning, índices, particionamento"],
                evidence_strength="very_high",
                confidence="high",
                score_hint=100.0,
                explanation="Evidência direta: 5 anos SQL Server com otimizações avançadas.",
            ),
            RequirementMatch(
                requirement="Modelagem de dados",
                requirement_type="critical",
                match_status="meets",
                match_type="equivalent",
                evidence_quotes=["Desenho de modelos dimensionais"],
                evidence_strength="high",
                confidence="high",
                score_hint=90.0,
                explanation="Equivalente: Experiência com Data Science e análise implica modelagem.",
            ),
            RequirementMatch(
                requirement="Git / Versionamento",
                requirement_type="desirable",
                match_status="not_evidenced",
                match_type="absent",
                evidence_quotes=[],
                evidence_strength="none",
                confidence="low",
                score_hint=0.0,
                explanation="Não evidenciado: Sem menção de Git no currículo.",
            ),
            RequirementMatch(
                requirement="UX/UI / Figma",
                requirement_type="desirable",
                match_status="not_evidenced",
                match_type="absent",
                evidence_quotes=[],
                evidence_strength="none",
                confidence="low",
                score_hint=0.0,
                explanation="Não evidenciado: UX/UI não é foco de Data Analyst.",
            ),
            RequirementMatch(
                requirement="Inglês avançado",
                requirement_type="desirable",
                match_status="not_evidenced",
                match_type="absent",
                evidence_quotes=[],
                evidence_strength="none",
                confidence="low",
                score_hint=0.0,
                explanation="Não evidenciado: Nenhuma certificação ou prova de inglês.",
            ),
        ],
        overall_evidence_strength="high",
        confidence="high",
        unmapped_critical_requirements=[],
        candidate_extra_strengths=["Data Science", "IA/LLM", "DBA Skills"],
        risk_points=[],
    )

    # ─────────────────────────────────────────────────────────────────────
    # LOGA INPUTS ANTES DE SCORING
    # ─────────────────────────────────────────────────────────────────────
    _log_diagnostic(
        "JOB PROFILE",
        {
            "area": job.area,
            "target_level": job.target_level,
            "critical_requirements": [r.name for r in job.critical_requirements],
            "desirable_requirements": [r.name for r in job.desirable_requirements],
            "required_tools": job.required_tools,
            "job_completeness_score": job.job_completeness_score,
        }
    )

    _log_diagnostic(
        "CANDIDATE PROFILE",
        {
            "detected_level": candidate.detected_level,
            "professional_area": candidate.professional_area,
            "estimated_experience_years": candidate.estimated_experience_years,
            "evidenced_skills": [s.name for s in candidate.evidenced_skills],
            "tools_and_systems": candidate.tools_and_systems,
            "education": [e.level for e in candidate.education],
            "profile_completeness": candidate.profile_completeness,
        }
    )

    _log_diagnostic(
        "EVIDENCE MAPPING",
        {
            "total_matches": len(mapping.requirement_matches),
            "critical_matches": sum(1 for m in mapping.requirement_matches if m.requirement_type == "critical"),
            "direct_matches": sum(1 for m in mapping.requirement_matches if m.match_type == "direct"),
            "extra_strengths": mapping.candidate_extra_strengths,
        }
    )

    # ─────────────────────────────────────────────────────────────────────
    # EXECUTA SCORING
    # ─────────────────────────────────────────────────────────────────────
    result = service.score(job, candidate, mapping)

    # ─────────────────────────────────────────────────────────────────────
    # LOGA RESULTADO FINAL
    # ─────────────────────────────────────────────────────────────────────
    _log_diagnostic(
        "⚠️  RESULTADO FINAL",
        {
            "match_score": f"{result.match_score:.2f}%",
            "recommendation": result.recommendation,
            "confidence_score": f"{result.confidence_score:.2f}%",
            "critical_coverage": f"{result.critical_coverage:.2%}",
            "desirable_coverage": f"{result.desirable_coverage:.2%}",
        }
    )

    # Breakdown de dimensões
    dimensions = result.score_breakdown.get("dimensions", {})
    print("\n📈 DIMENSÕES DE SCORE:")
    print("-" * 70)
    for dim, data in dimensions.items():
        print(f"  {dim:30s}: {data['score']:6.2f} (weight: {data['weight']:.2f})")

    # Breakdown de items
    items = result.score_breakdown.get("items", [])
    print("\n📋 ITENS DE REQUISITO:")
    print("-" * 70)
    for item in items:
        status_icon = "✅" if item["score"] >= 80 else "⚠️ " if item["score"] >= 60 else "❌"
        print(
            f"  {status_icon} {item['name']:30s} {item['score']:6.2f} "
            f"(type: {item['match_type']}, status: {item['status']})"
        )

    # Strengths e gaps
    print("\n💪 STRENGTHS:")
    for s in result.strengths[:5]:
        print(f"  • {s}")

    print("\n⚠️  GAPS:")
    for g in result.gaps[:5]:
        print(f"  • {g}")

    print("\n🎯 RISK POINTS:")
    for r in result.risk_points:
        print(f"  • {r}")

    # ─────────────────────────────────────────────────────────────────────
    # ASSERTIONS: Validação de regressão
    # ─────────────────────────────────────────────────────────────────────
    print("\n" + "="*70)
    print("✅ VALIDAÇÃO DE REGRESSÃO")
    print("="*70)

    assert result.match_score >= 75, (
        f"❌ Score esperado >= 75%, obtido {result.match_score:.2f}%. "
        "Este é o falso negativo!"
    )

    assert result.recommendation in {"strong_match", "interview"}, (
        f"❌ Recomendação esperada 'strong_match' ou 'interview', obtida '{result.recommendation}'"
    )

    assert result.critical_coverage >= 0.85, (
        f"❌ Critical coverage esperado >= 0.85, obtido {result.critical_coverage:.4f}"
    )

    print("✅ Todos os assertions passaram!")
    print(f"✅ Score final: {result.match_score:.2f}% ({result.recommendation})")
    print()


if __name__ == "__main__":
    test_analyst_dados_39_percent_false_negative()
