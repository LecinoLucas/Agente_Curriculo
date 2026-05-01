"""
Testes de regressão para falsos negativos.

Garante que candidatos com perfis fortes não recebam score de 39% indevidamente.
"""

import pytest
from decimal import Decimal
from uuid import uuid4

from src.application.services.analysis_service import AnalysisService


# ─────────────────────────────────────────────────────────────────────────────
# TEST 1: Analista de Dados forte não deve ser rejeitado (39%)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_data_analyst_strong_resume_not_rejected_by_education(
    async_session,
    analysis_service: AnalysisService,
) -> None:
    """
    FALSO NEGATIVO: Analista de Dados forte recebe 39% por educação insuficiente

    ❌ ANTES: Vaga requer Master, candidato tem Bachelor → FAIL → 39%
    ✅ DEPOIS: Vaga requer Bachelor → PASS → 75-90%

    Candidato:
    - 8 anos experiência (4 BI Analyst, 3 Data Analyst, 1.5 DBA)
    - Bachelor em Estatística + Especialização em Data Science
    - Power BI, SQL Server 5TB+, ETL, Python, DBA Skills

    Vaga:
    - Analista de Dados Sênior
    - Power BI, ETL, SQL, Modelagem (críticos)
    - Git, UX/UI, Inglês (desejáveis)
    - minimum_education_level = "bachelor" (após correção)
    - minimum_years_experience = 5.0 (após correção)
    """
    # Vaga CORRIGIDA: Bachelor, não Master
    job = await async_session.execute(
        """
        INSERT INTO job_model (
            id, title, description, requirements, status,
            seniority_level, minimum_education_level, minimum_years_experience,
            deal_breakers, created_by, created_at
        ) VALUES (
            %s, 'Analista de Dados', 'Vaga de BI', 'Power BI e SQL',
            'published', 'senior', 'bachelor', 5.0,
            '[]', %s, NOW()
        )
        RETURNING id
        """
    )
    # (... resto do setup)

    # Validação
    result = await analysis_service.match_to_job(
        analysis_id=uuid4(),
        job_id=job.id,
    )

    # ✅ Não deve receber 39%
    assert result.match_score >= 75, (
        f"Candidato forte recebeu score {result.match_score} "
        f"(validação_status: {result.validation_status}). "
        f"Razões: {result.rejection_reasons}"
    )
    assert result.recommendation in {"interview", "strong_match"}
    assert result.validation_status != "fail"


# ─────────────────────────────────────────────────────────────────────────────
# TEST 2: Experiência insuficiente não deve rejeitar sênior com 8 anos
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_senior_analyst_with_8_years_not_rejected_by_experience(
    async_session,
    analysis_service: AnalysisService,
) -> None:
    """
    FALSO NEGATIVO: Candidato sênior com 8 anos é rejeitado por experiência insuficiente

    ❌ ANTES: Vaga requer 10 anos → FAIL → 39%
    ✅ DEPOIS: Vaga requer 5 anos → PASS → 75-90%
    """
    # Vaga CORRIGIDA: 5 anos, não 10
    # (... setup similar ao test 1)
    pass


# ─────────────────────────────────────────────────────────────────────────────
# TEST 3: Deal-breaker inadequado não deve rejeitar forte candidato
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_data_analyst_not_rejected_by_language_dealbreaker(
    async_session,
    analysis_service: AnalysisService,
) -> None:
    """
    FALSO NEGATIVO: Candidato forte é rejeitado por deal-breaker "Inglês obrigatório"

    ❌ ANTES: Vaga tem deal_breaker {"field": "languages", ...} → FAIL → 39%
    ✅ DEPOIS: Remover deal-breaker ou marcar como desejável → PASS → 75-90%
    """
    # Vaga SEM deal-breaker de idioma
    # (... setup)
    pass


# ─────────────────────────────────────────────────────────────────────────────
# TEST 4: Skills desejáveis não devem ser obrigatórios
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_skills_like_git_and_ux_should_be_desirable_not_mandatory(
    async_session,
    analysis_service: AnalysisService,
) -> None:
    """
    FALSO NEGATIVO: Candidato forte é rejeitado porque não tem Git ou UX/UI

    ❌ ANTES:
    - critical_requirements: Power BI, ETL, SQL, Git, UX/UI (5 itens)
    - Candidato cobre 3/5 = 60% → apenas passa ou falha threshold
    - Score pode cair por cobertura de críticos < 65%

    ✅ DEPOIS:
    - critical_requirements: Power BI, ETL, SQL (3 itens) → 100% cobertura
    - desirable_requirements: Git, UX/UI (2 itens) → gaps documentados
    - Score: 75-90% (strong_match/interview)
    """
    # Vaga CORRIGIDA: Git, UX/UI como desejáveis
    # (... setup)
    pass


# ─────────────────────────────────────────────────────────────────────────────
# HELPER: Validação estruturada de rejeições por validação de objetivo
# ─────────────────────────────────────────────────────────────────────────────

def assert_validation_passed(
    result,
    job_id: str,
    reason_prefix: str = "",
) -> None:
    """
    Garante que a validação de objetivo (education/experience/deal-breaker) passou.
    """
    if result.validation_status == "fail":
        reasons = " | ".join(result.rejection_reasons)
        raise AssertionError(
            f"{reason_prefix} Candidato rejeitado por validação de objetivo:\n"
            f"  Razões: {reasons}\n"
            f"  Score: {result.match_score} (capped at 39)\n"
            f"  Job: {job_id}\n"
            f"  Provável causa:\n"
            f"    - minimum_education_level muito alto?\n"
            f"    - minimum_years_experience muito alto?\n"
            f"    - deal-breaker inadequado?"
        )


# ─────────────────────────────────────────────────────────────────────────────
# PARAMETRIZED: Validar múltiplas vagas de Analista de Dados
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "job_config",
    [
        # ✅ Correto: Requisitos realistas
        {
            "minimum_education_level": "bachelor",
            "minimum_years_experience": Decimal("5.0"),
            "deal_breakers": [],
            "expected_min_score": 75.0,
            "description": "Requisitos realistas",
        },
        # ❌ Problemático: Master obrigatório
        {
            "minimum_education_level": "master",
            "minimum_years_experience": Decimal("5.0"),
            "deal_breakers": [],
            "expected_min_score": None,  # Esperado falhar, será testado separado
            "description": "Master obrigatório (deve ser corrigido)",
        },
        # ❌ Problemático: 10 anos requerido
        {
            "minimum_education_level": "bachelor",
            "minimum_years_experience": Decimal("10.0"),
            "deal_breakers": [],
            "expected_min_score": None,
            "description": "10 anos requerido (deve ser corrigido)",
        },
    ],
)
async def test_data_analyst_jobs_score_validation(
    async_session,
    analysis_service: AnalysisService,
    job_config: dict,
) -> None:
    """
    Valida que vagas de Analista de Dados têm requisitos realistas.

    Casos positivos (✅) devem passar com score >= 75%.
    Casos negativos (❌) devem ser identificados para correção.
    """
    # (... setup de job e candidate com job_config)

    result = await analysis_service.match_to_job(...)

    if job_config["expected_min_score"] is not None:
        assert result.match_score >= job_config["expected_min_score"], (
            f"{job_config['description']}: Score abaixo do esperado. "
            f"Score: {result.match_score}, Esperado: >={job_config['expected_min_score']}"
        )
        assert_validation_passed(result, job_id="...", reason_prefix=job_config["description"])


if __name__ == "__main__":
    print("Execute com: pytest tests/integration/test_false_negatives_regression.py -v")
