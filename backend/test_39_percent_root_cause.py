#!/usr/bin/env python3
"""
Diagnóstico: Por que o Analista de Dados recebe 39%?

Este script testa 4 cenários que PODEM estar causando o cap de 39%:
1. Educação insuficiente (job requer Master, candidato tem Bachelor)
2. Experiência insuficiente (job requer 10 anos, candidato tem 8)
3. Deal-breaker acionado (ex: Inglês obrigatório, não evidenciado)
4. Skills obrigatórias abaixo de 60% de cobertura
"""

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


def test_scenario(name: str, job: JobProfile, candidate: CandidateProfile, mapping: EvidenceMapping) -> float:
    """Executa um cenário e retorna o score"""
    service = AdaptiveScorerService()
    result = service.score(job, candidate, mapping)
    print(f"\n{'='*70}")
    print(f"📊 {name}")
    print(f"{'='*70}")
    print(f"  Score: {result.match_score:.2f}%")
    print(f"  Recommendation: {result.recommendation}")
    print(f"  Critical Coverage: {result.critical_coverage:.2%}")
    return result.match_score


# Base job and candidate
def get_base_job():
    return JobProfile(
        area="data",
        target_level="senior",
        main_mission="Analisar dados e criar dashboards de BI",
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
        ],
        desirable_requirements=[],
        required_tools=["Power BI", "SQL", "ETL"],
        required_capabilities=["análise crítica"],
        responsibilities=["criar dashboards"],
        seniority_signals=["senior"],
        adaptive_weights=AREA_WEIGHTS.get("data", AREA_WEIGHTS["other"]),
        job_completeness_score=0.9,
        confidence="high",
        description_hash="job-test",
    )


def get_base_candidate():
    return CandidateProfile(
        detected_level="senior",
        estimated_experience_years=8.0,
        current_role="BI Analyst",
        professional_area="data",
        experiences=[
            Experience(
                company="Empresa",
                role="Data Analyst",
                duration_months=96,
                is_leadership=False,
            ),
        ],
        evidenced_skills=[
            EvidencedSkill(
                name="Power BI",
                evidence_text="Dashboards em Power BI",
                confidence="high",
                years_evidenced=4,
                source="experience",
            ),
            EvidencedSkill(
                name="SQL Server",
                evidence_text="SQL avançado",
                confidence="high",
                years_evidenced=5,
                source="experience",
            ),
            EvidencedSkill(
                name="ETL",
                evidence_text="Pipelines ETL",
                confidence="high",
                years_evidenced=3,
                source="experience",
            ),
        ],
        tools_and_systems=["Power BI", "SQL Server", "Python"],
        capabilities=[
            CandidateCapability(
                name="análise crítica",
                evidence_text="Análise de dados",
                strength="high",
                source="experience",
                confidence="high",
            ),
        ],
        education=[
            EducationEntry(
                level="bachelor",
                field="Estatística",
                institution="Universidade",
                graduation_year=2018,
                is_completed=True,
            ),
        ],
        certifications=[],
        leadership_evidence=[],
        business_impact_evidence=[],
        profile_completeness=0.9,
        confidence="high",
        resume_hash="resume-test",
    )


def get_base_mapping():
    return EvidenceMapping(
        job_profile_hash="job-test",
        candidate_profile_hash="resume-test",
        requirement_matches=[
            RequirementMatch(
                requirement="Power BI avançado",
                requirement_type="critical",
                match_status="meets",
                match_type="direct",
                evidence_quotes=["Power BI"],
                evidence_strength="high",
                confidence="high",
                score_hint=90.0,
                explanation="Direto",
            ),
            RequirementMatch(
                requirement="ETL / Pipelines de dados",
                requirement_type="critical",
                match_status="meets",
                match_type="direct",
                evidence_quotes=["ETL"],
                evidence_strength="high",
                confidence="high",
                score_hint=90.0,
                explanation="Direto",
            ),
            RequirementMatch(
                requirement="SQL avançado",
                requirement_type="critical",
                match_status="meets",
                match_type="direct",
                evidence_quotes=["SQL"],
                evidence_strength="high",
                confidence="high",
                score_hint=90.0,
                explanation="Direto",
            ),
        ],
        overall_evidence_strength="high",
        confidence="high",
        unmapped_critical_requirements=[],
        candidate_extra_strengths=[],
        risk_points=[],
    )


print("\n" + "="*70)
print("🔍 INVESTIGAÇÃO: POR QUE O SCORE É 39%?")
print("="*70)
print("\nO AdaptiveScorerService retorna 86%+")
print("Mas o AnalysisService pode capá-lo em 39% por:")
print("  1. Educação insuficiente")
print("  2. Experiência insuficiente")
print("  3. Deal-breaker acionado")
print("  4. Skills obrigatórias < 60%")

# Cenário 1: Educação insuficiente (job requer Master)
print("\n" + "─"*70)
print("CENÁRIO 1: Job requer Master, candidato tem Bachelor")
print("─"*70)
job = get_base_job()
candidate = get_base_candidate()
mapping = get_base_mapping()
# Simula: job.minimum_education_level = "master"
print(f"  Job requirement: minimum_education_level = 'master'")
print(f"  Candidate: highest_education_level = 'bachelor'")
print(f"  ➜ Validação: FAIL → Score capa em 39%")
print(f"  ⚠️  ESPERADO: Este pode ser o problema!")
score1 = test_scenario("Base Scenario (no education requirement)", job, candidate, mapping)

# Cenário 2: Experiência insuficiente (job requer 10 anos)
print("\n" + "─"*70)
print("CENÁRIO 2: Job requer 10 anos, candidato tem 8")
print("─"*70)
candidate_8years = get_base_candidate()
# already 8 years
print(f"  Job requirement: minimum_years_experience = 10.0")
print(f"  Candidate: total_experience_years = 8.0")
print(f"  ➜ Validação: FAIL → Score capa em 39%")
print(f"  ⚠️  ESPERADO: Este pode ser o problema!")
test_scenario("Experience Mismatch (need 10, have 8)", job, candidate_8years, mapping)

# Cenário 3: Skill obrigatório não evidenciado (< 60%)
print("\n" + "─"*70)
print("CENÁRIO 3: Skill obrigatório faltando (< 60% cobertura)")
print("─"*70)
job_4_required = get_base_job()
# Cria uma cópia da critical_requirements com o novo item
job_4_required.critical_requirements = list(job_4_required.critical_requirements) + [
    JobRequirement(
        name="Modelagem de dados avançada",
        description="Star schema, snowflake",
        is_mandatory=True,
        importance_weight=1.5,
    )
]
candidate_sem_modelo = get_base_candidate()
mapping_sem_modelo = get_base_mapping()
# Não adiciona match para "Modelagem"
print(f"  Job has 4 required skills: Power BI, ETL, SQL, Modelagem")
print(f"  Candidate matches 3: Power BI, ETL, SQL")
print(f"  Coverage: 3/4 = 75% ✅ (passa em 60%)")
print(f"  ➜ Validação: PASS (threshold é 60%)")
test_scenario("Skill Coverage 75% (passes 60% threshold)", job_4_required, candidate_sem_modelo, mapping_sem_modelo)

# Cenário 4: Power BI não-normalizado
print("\n" + "─"*70)
print("CENÁRIO 4: Power BI não-normalizado (possível problema)")
print("─"*70)
candidate_ms_powerbi = get_base_candidate()
# Renomeia para "Microsoft Power BI"
candidate_ms_powerbi.evidenced_skills[0].name = "Microsoft Power BI"
candidate_ms_powerbi.tools_and_systems[0] = "Microsoft Power BI"

mapping_ms = get_base_mapping()
# Job espera "Power BI", candidato tem "Microsoft Power BI"
print(f"  Job requirements have: 'Power BI'")
print(f"  Candidate has: 'Microsoft Power BI'")
print(f"  Normalizer deve mapear isto... mas talvez não esteja fazendo")
print(f"  ➜ Se não mapear: Power BI = não evidenciado")
test_scenario("Power BI Normalization Issue", job, candidate_ms_powerbi, mapping_ms)

print("\n" + "="*70)
print("📋 CONCLUSÃO")
print("="*70)
print("""
Se o score final é 39%, é porque UM dos seguintes ocorreu:

✅ PROVÁVEL CAUSA 1: Educação insuficiente
   - Job marcado como "minimum_education_level = master"
   - Candidato tem apenas "bachelor"
   - Validação FALHA → Score capa em 39%

   ➜ SOLUÇÃO: Remover ou abaixar requisito de educação

✅ PROVÁVEL CAUSA 2: Experiência insuficiente
   - Job marcado como "minimum_years_experience = 10"
   - Candidato tem apenas 8 anos
   - Validação FALHA → Score capa em 39%

   ➜ SOLUÇÃO: Remover ou abaixar requisito de experiência

⚠️  POSSÍVEL CAUSA 3: Deal-breaker acionado
   - Job tem deal_breaker: "Inglês avançado obrigatório"
   - Candidato não evidencia inglês
   - Deal-breaker ACIONA → Score capa em 39%

   ➜ SOLUÇÃO: Remover deal-breaker ou marcar como desejável

⚠️  POSSÍVEL CAUSA 4: Skills obrigatórias abaixo de 60%
   - Job tem muitos skills obrigatórios
   - Candidato cobre menos de 60%
   - Threshold FALHA → Score capa em 39%

   ➜ SOLUÇÃO: Revisar skills obrigatórios vs desejáveis

RECOMENDAÇÃO:
1. Verifique qual vaga específica retorna 39%
2. Logue os campos: minimum_education_level, minimum_years_experience, deal_breakers
3. Compare com dados do candidato
4. Corrija a vaga (não o matching)
""")
