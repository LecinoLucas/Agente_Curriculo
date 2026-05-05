"""
Testes unitários para JobProfilerService e JobProfile.

Estratégia:
  - MockAIService retorna JSON pré-definido sem chamadas reais à API.
  - Todos os testes são pure unit — sem banco de dados, sem Redis, sem rede.
  - Verifica parsing, cache, fallback e pesos adaptativos por área.

Cenários cobertos:
  1. Vaga de Analista de Dados Sênior   → area=data, target_level=senior
  2. Vaga Tech Lead de IA               → area=technology, target_level=lead
  3. Vaga Assistente Administrativo     → area=administrative
  4. Vaga Analista Contábil             → area=accounting
  5. Vaga com descrição ruim/incompleta → completeness < 0.5, confidence=low
  6. Cache hit — segunda chamada não chama IA novamente
  7. Fallback quando IA falha           → perfil mínimo, nunca levanta exceção
  8. Descrição vazia                    → fallback imediato sem chamar IA
  9. Pesos adaptativos corretos por área
 10. Serialização round-trip (to_dict → from_dict)
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.application.ports.ai_service import AIAnalysisRequest, AIAnalysisResponse, AIService
from src.application.services.job_profiler_service import (
    InMemoryJobProfileCache,
    JobProfilerService,
    JobProfileInput,
    StructuredJobSkill,
    build_job_profile_ai_context,
    _parse_profile,
)
from src.domain.value_objects.job_profile import (
    AREA_WEIGHTS,
    DEFAULT_WEIGHTS,
    JobProfile,
    JobRequirement,
)


# ---------------------------------------------------------------------------
# Fixtures e helpers
# ---------------------------------------------------------------------------

def _make_ai_response(payload: dict) -> AIAnalysisResponse:
    return AIAnalysisResponse(
        content=json.dumps(payload),
        input_tokens=500,
        output_tokens=300,
        cache_read_tokens=400,
        cache_write_tokens=0,
        processing_time_ms=800,
    )


def _mock_ai(payload: dict) -> AIService:
    """Retorna um mock de AIService que responde com o payload fornecido."""
    ai = AsyncMock(spec=AIService)
    ai.analyze.return_value = _make_ai_response(payload)
    return ai


def _failing_ai() -> AIService:
    """AIService que sempre levanta RuntimeError."""
    ai = AsyncMock(spec=AIService)
    ai.analyze.side_effect = RuntimeError("API timeout")
    return ai


# ---------------------------------------------------------------------------
# Payloads de mock por cenário
# ---------------------------------------------------------------------------

ANALISTA_DADOS_SENIOR = {
    "area": "data",
    "target_level": "senior",
    "main_mission": "Liderar projetos de engenharia de dados e garantir qualidade dos pipelines em produção.",
    "critical_requirements": [
        {
            "name": "engenharia de pipelines de dados",
            "description": "Design e manutenção de pipelines ETL/ELT em ambientes de produção",
            "importance_weight": 2.0,
            "evidence_examples": [
                "desenvolveu pipeline de ingestão de dados para 10M registros/dia",
                "manteve pipelines Airflow em produção por 2+ anos",
            ],
        },
        {
            "name": "modelagem de dados analíticos",
            "description": "Criação de modelos dimensionais e star schema para BI",
            "importance_weight": 1.5,
            "evidence_examples": [
                "projetou data warehouse para área financeira",
                "criou camadas raw, trusted e refined no data lake",
            ],
        },
    ],
    "desirable_requirements": [
        {
            "name": "machine learning em produção",
            "description": "Experiência com deploy e monitoramento de modelos de ML",
            "importance_weight": 0.7,
            "evidence_examples": ["fez deploy de modelo de churn usando MLflow"],
        }
    ],
    "responsibilities": [
        "Projetar e manter pipelines de dados em Apache Airflow",
        "Definir padrões de qualidade de dados da squad",
        "Mentorar analistas juniores",
    ],
    "required_tools": ["Python", "Apache Airflow", "dbt", "BigQuery", "Spark"],
    "required_capabilities": ["autonomia técnica", "comunicação com stakeholders", "gestão de prioridades"],
    "seniority_signals": [
        "5+ anos de experiência com dados",
        "Referência técnica da equipe",
        "Capacidade de mentorar",
    ],
    "job_completeness_score": 0.88,
    "confidence": "high",
}

TECH_LEAD_IA = {
    "area": "technology",
    "target_level": "lead",
    "main_mission": "Liderar o time de IA/ML e definir a arquitetura dos produtos de inteligência artificial.",
    "critical_requirements": [
        {
            "name": "liderança técnica de times de IA",
            "description": "Gestão técnica de equipes de engenheiros e cientistas de dados",
            "importance_weight": 2.0,
            "evidence_examples": ["liderou squad de 6 pessoas em projeto de recomendação"],
        },
        {
            "name": "arquitetura de sistemas de ML em produção",
            "description": "Design de sistemas de ML escaláveis e monitoráveis",
            "importance_weight": 1.8,
            "evidence_examples": ["arquitetou plataforma de ML serving com latência < 100ms"],
        },
    ],
    "desirable_requirements": [],
    "responsibilities": [
        "Definir roadmap técnico do time de IA",
        "Conduzir code reviews e decisões de arquitetura",
        "Colaborar com produto para priorização",
    ],
    "required_tools": ["Python", "PyTorch", "Kubernetes", "MLflow", "LLM APIs"],
    "required_capabilities": ["liderança", "visão estratégica", "comunicação executiva"],
    "seniority_signals": ["Tech Lead", "7+ anos", "gestão de squad"],
    "job_completeness_score": 0.80,
    "confidence": "high",
}

ASSISTENTE_ADMINISTRATIVO = {
    "area": "administrative",
    "target_level": "junior",
    "main_mission": "Apoiar as rotinas administrativas do escritório e garantir a organização dos processos internos.",
    "critical_requirements": [
        {
            "name": "rotinas administrativas de escritório",
            "description": "Gestão de agendas, controle de documentos, atendimento interno",
            "importance_weight": 1.5,
            "evidence_examples": [
                "gerenciou agenda de diretores",
                "controlou arquivo físico e digital de documentos",
            ],
        },
    ],
    "desirable_requirements": [
        {
            "name": "domínio de ferramentas Office",
            "description": "Uso avançado de Word, Excel e PowerPoint",
            "importance_weight": 0.8,
            "evidence_examples": ["elaborava relatórios mensais em Excel"],
        }
    ],
    "responsibilities": [
        "Controlar agenda da liderança",
        "Organizar documentos e arquivos",
        "Apoiar na comunicação interna",
    ],
    "required_tools": ["Microsoft Office", "Google Workspace"],
    "required_capabilities": ["organização", "proatividade", "comunicação interpessoal"],
    "seniority_signals": ["1 ano de experiência", "perfil organizado"],
    "job_completeness_score": 0.65,
    "confidence": "medium",
}

ANALISTA_CONTABIL = {
    "area": "accounting",
    "target_level": "mid",
    "main_mission": "Executar as rotinas contábeis e garantir a conformidade fiscal da empresa.",
    "critical_requirements": [
        {
            "name": "escrituração contábil",
            "description": "Lançamentos contábeis, conciliação de contas e fechamento mensal",
            "importance_weight": 2.0,
            "evidence_examples": [
                "realizou fechamento contábil mensal em empresa de médio porte",
                "conciliou contas bancárias diariamente",
            ],
        },
        {
            "name": "obrigações fiscais e acessórias",
            "description": "Elaboração de SPED, ECF, ECD e apuração de impostos",
            "importance_weight": 1.7,
            "evidence_examples": ["transmitiu SPED Fiscal e Contribuições por 3 anos"],
        },
    ],
    "desirable_requirements": [
        {
            "name": "conhecimento em IFRS",
            "description": "Familiaridade com normas internacionais de contabilidade",
            "importance_weight": 0.6,
            "evidence_examples": ["participou de projeto de adoção das IFRS"],
        }
    ],
    "responsibilities": [
        "Realizar fechamento contábil mensal",
        "Apurar impostos federais, estaduais e municipais",
        "Transmitir obrigações acessórias",
    ],
    "required_tools": ["SAP", "TOTVS", "Excel"],
    "required_capabilities": ["atenção a detalhes", "organização", "cumprimento de prazos"],
    "seniority_signals": ["2 a 4 anos de experiência", "CRC ativo ou em formação"],
    "job_completeness_score": 0.82,
    "confidence": "high",
}

VAGA_RUIM = {
    "area": "other",
    "target_level": "undefined",
    "main_mission": "Profissional para área de negócios.",
    "critical_requirements": [],
    "desirable_requirements": [],
    "responsibilities": ["Executar atividades diversas conforme demanda"],
    "required_tools": [],
    "required_capabilities": ["proatividade"],
    "seniority_signals": [],
    "job_completeness_score": 0.15,
    "confidence": "low",
}


# ---------------------------------------------------------------------------
# Cenário 1 — Analista de Dados Sênior
# ---------------------------------------------------------------------------

async def test_analista_dados_senior_area_e_nivel():
    service = JobProfilerService(ai_service=_mock_ai(ANALISTA_DADOS_SENIOR))
    profile = await service.generate_profile("Buscamos Analista de Dados Sênior...")

    assert profile.area == "data"
    assert profile.target_level == "senior"
    assert profile.confidence == "high"
    assert profile.job_completeness_score >= 0.80
    assert profile.is_well_described


async def test_analista_dados_senior_requisitos_criticos():
    service = JobProfilerService(ai_service=_mock_ai(ANALISTA_DADOS_SENIOR))
    profile = await service.generate_profile("Buscamos Analista de Dados Sênior...")

    assert len(profile.critical_requirements) == 2
    nomes = {r.name for r in profile.critical_requirements}
    assert "engenharia de pipelines de dados" in nomes

    req_pipeline = next(r for r in profile.critical_requirements if "pipeline" in r.name)
    assert req_pipeline.is_mandatory is True
    assert req_pipeline.importance_weight == 2.0
    assert len(req_pipeline.evidence_examples) >= 1


async def test_analista_dados_pesos_area_data():
    service = JobProfilerService(ai_service=_mock_ai(ANALISTA_DADOS_SENIOR))
    profile = await service.generate_profile("Buscamos Analista de Dados Sênior...")

    assert profile.adaptive_weights == AREA_WEIGHTS["data"]
    assert abs(sum(profile.adaptive_weights.values()) - 1.0) < 0.001


# ---------------------------------------------------------------------------
# Cenário 2 — Tech Lead de IA
# ---------------------------------------------------------------------------

async def test_tech_lead_ia_area_e_nivel():
    service = JobProfilerService(ai_service=_mock_ai(TECH_LEAD_IA))
    profile = await service.generate_profile("Procuramos Tech Lead de IA...")

    assert profile.area == "technology"
    assert profile.target_level == "lead"
    assert len(profile.critical_requirements) == 2


async def test_tech_lead_pesos_area_technology():
    service = JobProfilerService(ai_service=_mock_ai(TECH_LEAD_IA))
    profile = await service.generate_profile("Procuramos Tech Lead de IA...")

    assert profile.adaptive_weights == AREA_WEIGHTS["technology"]


# ---------------------------------------------------------------------------
# Cenário 3 — Assistente Administrativo
# ---------------------------------------------------------------------------

async def test_administrativo_area_correta():
    service = JobProfilerService(ai_service=_mock_ai(ASSISTENTE_ADMINISTRATIVO))
    profile = await service.generate_profile("Assistente Administrativo...")

    assert profile.area == "administrative"
    assert profile.target_level == "junior"
    assert profile.adaptive_weights == AREA_WEIGHTS["administrative"]


async def test_administrativo_completeness_razoavel():
    service = JobProfilerService(ai_service=_mock_ai(ASSISTENTE_ADMINISTRATIVO))
    profile = await service.generate_profile("Assistente Administrativo...")

    assert 0.50 <= profile.job_completeness_score <= 0.80


# ---------------------------------------------------------------------------
# Cenário 4 — Analista Contábil
# ---------------------------------------------------------------------------

async def test_contabil_area_e_requisitos():
    service = JobProfilerService(ai_service=_mock_ai(ANALISTA_CONTABIL))
    profile = await service.generate_profile("Analista Contábil Pleno...")

    assert profile.area == "accounting"
    assert profile.target_level == "mid"
    assert any("escrituração" in r.name for r in profile.critical_requirements)
    assert len(profile.required_tools) >= 1


async def test_contabil_pesos_area_accounting():
    service = JobProfilerService(ai_service=_mock_ai(ANALISTA_CONTABIL))
    profile = await service.generate_profile("Analista Contábil Pleno...")

    weights = profile.adaptive_weights
    # Para accounting, experiência prática deve ter o maior peso
    assert weights.get("practical_experience", 0) >= 0.30
    assert abs(sum(weights.values()) - 1.0) < 0.001


# ---------------------------------------------------------------------------
# Cenário 5 — Vaga com descrição ruim/incompleta
# ---------------------------------------------------------------------------

async def test_vaga_ruim_sinalizacao_correta():
    service = JobProfilerService(ai_service=_mock_ai(VAGA_RUIM))
    profile = await service.generate_profile("Profissional para área de negócios.")

    assert profile.job_completeness_score < 0.50
    assert profile.confidence == "low"
    assert profile.is_well_described is False


async def test_vaga_ruim_requisitos_vazios():
    service = JobProfilerService(ai_service=_mock_ai(VAGA_RUIM))
    profile = await service.generate_profile("Profissional para área de negócios.")

    assert profile.mandatory_count == 0
    assert profile.critical_requirements == []


# ---------------------------------------------------------------------------
# Cenário 6 — Cache hit (segunda chamada não chama IA)
# ---------------------------------------------------------------------------

async def test_cache_hit_segunda_chamada_nao_chama_ai():
    ai = _mock_ai(ANALISTA_DADOS_SENIOR)
    service = JobProfilerService(ai_service=ai)
    description = "Buscamos Analista de Dados Sênior com experiência em pipelines."

    profile1 = await service.generate_profile(description)
    profile2 = await service.generate_profile(description)

    # IA deve ter sido chamada apenas uma vez
    assert ai.analyze.call_count == 1
    assert profile1.area == profile2.area
    assert profile1.description_hash == profile2.description_hash


async def test_cache_miss_descricao_diferente():
    ai = _mock_ai(ANALISTA_DADOS_SENIOR)
    service = JobProfilerService(ai_service=ai)

    await service.generate_profile("Vaga A: Analista de Dados")
    await service.generate_profile("Vaga B: Tech Lead de IA")  # descrição diferente

    assert ai.analyze.call_count == 2


async def test_invalidate_forca_nova_chamada():
    ai = _mock_ai(ANALISTA_DADOS_SENIOR)
    service = JobProfilerService(ai_service=ai)
    description = "Buscamos Analista de Dados Sênior."

    await service.generate_profile(description)
    assert ai.analyze.call_count == 1

    service.invalidate(description)
    await service.generate_profile(description)
    assert ai.analyze.call_count == 2


# ---------------------------------------------------------------------------
# Cenário 7 — Fallback quando IA falha
# ---------------------------------------------------------------------------

async def test_fallback_quando_ai_falha_nao_levanta_excecao():
    service = JobProfilerService(ai_service=_failing_ai())
    # Não deve levantar exceção
    profile = await service.generate_profile("Vaga Engenheiro de Software Sênior")

    assert isinstance(profile, JobProfile)
    assert profile.confidence == "low"
    assert profile.job_completeness_score > 0.0
    assert profile.area == "technology"


async def test_fallback_sistema_continua_funcionando():
    service = JobProfilerService(ai_service=_failing_ai())
    profile = await service.generate_profile("Qualquer vaga")

    # Perfil de fallback é serializável (para o sistema antigo continuar)
    d = profile.to_dict()
    assert "area" in d
    assert "adaptive_weights" in d
    assert d["adaptive_weights"] == DEFAULT_WEIGHTS


# ---------------------------------------------------------------------------
# Cenário 8 — Descrição vazia
# ---------------------------------------------------------------------------

async def test_descricao_vazia_retorna_fallback_sem_chamar_ai():
    ai = _mock_ai(ANALISTA_DADOS_SENIOR)
    service = JobProfilerService(ai_service=ai)

    profile = await service.generate_profile("")

    assert ai.analyze.call_count == 0
    assert profile.confidence == "low"
    assert profile.job_completeness_score == 0.0


async def test_descricao_apenas_espacos_e_fallback():
    ai = _mock_ai(ANALISTA_DADOS_SENIOR)
    service = JobProfilerService(ai_service=ai)

    profile = await service.generate_profile("    \n\t  ")

    assert ai.analyze.call_count == 0
    assert profile.confidence == "low"


# ---------------------------------------------------------------------------
# Cenário 9 — Pesos adaptativos corretos por área
# ---------------------------------------------------------------------------

def test_todos_areas_tem_pesos_somando_1():
    for area, weights in AREA_WEIGHTS.items():
        total = sum(weights.values())
        assert abs(total - 1.0) < 0.001, f"Pesos da área '{area}' somam {total}, não 1.0"


def test_area_invalida_usa_pesos_padrao():
    raw = {**ANALISTA_DADOS_SENIOR, "area": "area_inexistente"}
    profile = _parse_profile(raw, "abc123")

    assert profile.area == "other"
    assert profile.adaptive_weights == AREA_WEIGHTS["other"]


def test_tech_lead_pesos_maior_peso_eh_technical_ou_leadership():
    weights = AREA_WEIGHTS["technology"]
    # Para technology: technical_competencies (0.35) deve ser o maior ou empatado
    max_weight = max(weights.values())
    assert weights["technical_competencies"] == max_weight


# ---------------------------------------------------------------------------
# Cenário 10 — Serialização round-trip
# ---------------------------------------------------------------------------

def test_round_trip_to_dict_from_dict():
    profile = JobProfile(
        area="data",
        target_level="senior",
        main_mission="Liderar projetos de dados",
        critical_requirements=[
            JobRequirement(
                name="engenharia de dados",
                description="Pipelines ETL em produção",
                is_mandatory=True,
                importance_weight=1.8,
                evidence_examples=["manteve Airflow por 2 anos"],
            )
        ],
        desirable_requirements=[],
        responsibilities=["Projetar pipelines", "Mentorar"],
        required_tools=["Python", "Airflow"],
        required_capabilities=["autonomia"],
        seniority_signals=["5+ anos"],
        adaptive_weights=AREA_WEIGHTS["data"],
        job_completeness_score=0.85,
        confidence="high",
        description_hash="abc12345",
    )

    serialized = profile.to_dict()
    recovered = JobProfile.from_dict(serialized)

    assert recovered.area == profile.area
    assert recovered.target_level == profile.target_level
    assert recovered.job_completeness_score == profile.job_completeness_score
    assert recovered.confidence == profile.confidence
    assert len(recovered.critical_requirements) == 1
    assert recovered.critical_requirements[0].name == "engenharia de dados"
    assert recovered.critical_requirements[0].importance_weight == 1.8


def test_from_dict_com_dados_faltantes_usa_defaults():
    profile = JobProfile.from_dict({"area": "data"})

    assert profile.area == "data"
    assert profile.target_level == "undefined"
    assert profile.confidence == "medium"
    assert profile.critical_requirements == []
    assert profile.adaptive_weights == AREA_WEIGHTS["data"]


# ---------------------------------------------------------------------------
# Testes adicionais de robustez
# ---------------------------------------------------------------------------

def test_importance_weight_clampado_acima_de_2():
    raw = {
        **ANALISTA_DADOS_SENIOR,
        "critical_requirements": [
            {
                "name": "competência x",
                "description": "desc",
                "importance_weight": 99.9,  # inválido — acima do máximo
                "evidence_examples": [],
            }
        ],
    }
    profile = _parse_profile(raw, "hash")
    assert profile.critical_requirements[0].importance_weight == 2.0


def test_job_completeness_clampado_acima_de_1():
    raw = {**ANALISTA_DADOS_SENIOR, "job_completeness_score": 5.0}
    profile = _parse_profile(raw, "hash")
    assert profile.job_completeness_score == 1.0


def test_job_completeness_clampado_abaixo_de_0():
    raw = {**ANALISTA_DADOS_SENIOR, "job_completeness_score": -1.0}
    profile = _parse_profile(raw, "hash")
    assert profile.job_completeness_score == 0.0


def test_requisito_sem_nome_e_ignorado():
    raw = {
        **ANALISTA_DADOS_SENIOR,
        "critical_requirements": [
            {"name": "", "description": "sem nome", "importance_weight": 1.0},
            {"name": "  ", "description": "espaços", "importance_weight": 1.0},
            {"name": "competência válida", "description": "ok", "importance_weight": 1.2},
        ],
    }
    profile = _parse_profile(raw, "hash")
    assert len(profile.critical_requirements) == 1
    assert profile.critical_requirements[0].name == "competência válida"


async def test_cache_isolado_entre_instancias():
    """Cada instância de InMemoryJobProfileCache é independente."""
    cache_a = InMemoryJobProfileCache()
    cache_b = InMemoryJobProfileCache()

    service_a = JobProfilerService(ai_service=_mock_ai(ANALISTA_DADOS_SENIOR), cache=cache_a)
    service_b = JobProfilerService(ai_service=_mock_ai(ANALISTA_DADOS_SENIOR), cache=cache_b)

    desc = "Analista de Dados"
    await service_a.generate_profile(desc)

    # Cache de B está vazio — deve chamar IA
    await service_b.generate_profile(desc)

    assert len(cache_a) == 1
    assert len(cache_b) == 1


async def test_manual_skill_sql_vira_requisito_forte_sem_duplicar_texto():
    service = JobProfilerService(ai_service=None)

    profile = await service.generate_profile(
        "Precisamos de alguém para consultas complexas em SQL e dashboards.",
        title="Analista de Dados",
        requirements="SQL; dashboards; Power BI",
        seniority_level="senior",
        linked_skills=[
            StructuredJobSkill(
                name="SQL",
                normalized_name="sql",
                category="data",
                aliases=["SQL Server"],
                is_mandatory=True,
                weight=1.5,
            )
        ],
    )

    critical_names = [item.name for item in profile.critical_requirements]
    assert critical_names.count("SQL") == 1
    assert "SQL" in critical_names
    assert profile.target_level == "senior"


async def test_vaga_texto_fraco_com_skill_manual_ainda_gera_perfil_util():
    service = JobProfilerService(ai_service=None)

    profile = await service.generate_profile(
        "Boa oportunidade.",
        title="Vaga BI",
        linked_skills=[
            StructuredJobSkill(
                name="Power BI",
                normalized_name="power bi",
                category="data",
                aliases=["BI"],
                is_mandatory=True,
                weight=1.4,
            )
        ],
    )

    assert profile.area == "data"
    assert any(req.name == "Power BI" for req in profile.critical_requirements)
    assert profile.job_completeness_score >= 0.4


async def test_vaga_sem_skills_manuais_continua_funcionando_por_texto():
    service = JobProfilerService(ai_service=None)

    profile = await service.generate_profile(
        "Atuar com rotinas contábeis, fechamento mensal e SPED.",
        title="Analista Contábil",
        requirements="Experiência com obrigações fiscais",
    )

    assert profile.area == "accounting"
    assert profile.critical_requirements


async def test_campos_estruturados_entram_no_job_profile_deterministico():
    service = JobProfilerService(ai_service=None)

    profile = await service.generate_profile(
        "Boa vaga para analista.",
        title="Analista de Dados",
        requirements="SQL e Power BI",
        job_area="Dados",
        responsibilities="Construir dashboards, acompanhar métricas e apoiar a tomada de decisão.",
        experience_context="Experiência em analytics, BI e ambientes com operação orientada a indicadores.",
        behavioral_requirements=["Comunicação", "Autonomia"],
        priority="urgent",
    )

    assert profile.area == "data"
    assert "Construir dashboards, acompanhar métricas e apoiar a tomada de decisão" in profile.responsibilities[0]
    assert "comunicação" in [item.casefold() for item in profile.required_capabilities]
    assert "autonomia" in [item.casefold() for item in profile.required_capabilities]
    assert profile.job_completeness_score >= 0.65


async def test_job_profiler_envia_contexto_compacto_para_ia():
    ai = _mock_ai(ANALISTA_DADOS_SENIOR)
    service = JobProfilerService(ai_service=ai)

    job_description = "Texto grande da vaga. " * 120
    linked_skills = [
        StructuredJobSkill(
            name="SQL",
            normalized_name="sql",
            is_mandatory=True,
            weight=1.5,
        ),
        StructuredJobSkill(
            name="Power BI",
            normalized_name="power bi",
            is_mandatory=False,
            weight=1.0,
        ),
    ]

    await service.generate_profile(
        job_description,
        title="Analista de Dados",
        requirements="SQL, Power BI e comunicação",
        seniority_level="senior",
        minimum_years_experience=4,
        minimum_education_level="bachelor",
        job_area="data",
        linked_skills=linked_skills,
    )

    request = ai.analyze.await_args.args[0]
    expected_context = build_job_profile_ai_context(
        JobProfileInput(
            title="Analista de Dados",
            description=job_description,
            requirements="SQL, Power BI e comunicação",
            seniority_level="senior",
            minimum_years_experience=4.0,
            minimum_education_level="bachelor",
            job_area="data",
            linked_skills=tuple(linked_skills),
        )
    )

    assert expected_context in request.prompt_template
    assert len(expected_context) < len(job_description)
    assert "skills_obrigatorias: SQL" in request.prompt_template


async def test_job_profiler_recovers_required_skills_from_text_when_ai_returns_empty_lists():
    service = JobProfilerService(
        ai_service=_mock_ai(
            {
                "area": "data",
                "target_level": "senior",
                "main_mission": "Analisar dados de supply chain",
                "critical_requirements": [],
                "desirable_requirements": [],
                "responsibilities": [],
                "required_tools": [],
                "required_capabilities": [],
                "seniority_signals": ["senior"],
                "job_completeness_score": 0.8,
                "confidence": "medium",
            }
        )
    )

    profile = await service.generate_profile(
        """
        Experiência com análise de dados, noções de estatística aplicada e modelagem de dados.
        Domínio de Excel avançado.
        Conhecimento em ferramentas de BI (Power BI, Tableau ou similares), ERP SAP – Módulo MM,
        vivência com KPIs de Supply Chain.
        Conhecimento em BPMN, utilizando Bizagi Modeler ou similares.
        Habilidade em SQL para extração de dados.
        """,
        title="Analista de Dados Senior",
        requirements="""
        SQL, Power BI, Excel avançado, SAP MM, BPMN, KPIs de Supply Chain, Tableau.
        """,
        seniority_level="senior",
    )

    critical_names = {item.name for item in profile.critical_requirements}
    optional_names = {item.name for item in profile.desirable_requirements}

    assert critical_names
    assert {"SQL", "Power BI", "Excel"} <= critical_names
    assert "SAP MM" not in critical_names
    assert "BPMN" not in critical_names
    assert "KPIs Supply Chain" not in critical_names
    assert {"SAP MM", "BPMN", "KPIs Supply Chain", "Tableau"} <= optional_names


async def test_job_profiler_replaces_unstructured_requirement_phrases_with_skill_names():
    service = JobProfilerService(
        ai_service=_mock_ai(
            {
                "area": "data",
                "target_level": "senior",
                "main_mission": "Analisar dados de supply chain",
                "critical_requirements": [
                    {
                        "name": "Domínio de Excel avançado",
                        "description": "Frase longa vinda da IA",
                        "is_mandatory": True,
                        "importance_weight": 1.0,
                    },
                    {
                        "name": "Conhecimento em BPMN, utilizando Bizagi Modeler ou similares",
                        "description": "Frase longa vinda da IA",
                        "is_mandatory": True,
                        "importance_weight": 1.0,
                    },
                ],
                "desirable_requirements": [],
                "responsibilities": [],
                "required_tools": [],
                "required_capabilities": [],
                "seniority_signals": ["senior"],
                "job_completeness_score": 0.8,
                "confidence": "medium",
            }
        )
    )

    profile = await service.generate_profile(
        "Domínio de Excel avançado. Conhecimento em BPMN, utilizando Bizagi Modeler ou similares. Habilidade em SQL para extração de dados.",
        title="Analista de Dados Senior",
        requirements="SQL, Excel avançado, BPMN",
        seniority_level="senior",
    )

    critical_names = {item.name for item in profile.critical_requirements}
    optional_names = {item.name for item in profile.desirable_requirements}

    assert "Excel" in critical_names
    assert "SQL" in critical_names
    assert "BPMN" in optional_names
    assert "Domínio de Excel avançado" not in critical_names
    assert "Conhecimento em BPMN, utilizando Bizagi Modeler ou similares" not in critical_names
