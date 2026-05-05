from src.application.services.extraction_fallbacks import (
    enrich_analysis_result_fields,
    infer_job_nice_to_have_skills,
    infer_job_required_skills,
)


HIAGO_RESUME = """
Contato Hiago Dantas
www.linkedin.com/in/hiago-dantas
Especialista em Dados | Power BI | Dax | Python | ETL | DBA (SQL Server, PostgreSql) | Data Science | IA | BI Analyst | Data Analyst | BI Consultant | SSIS | Predictive Analytics

Experiência
Marajó Postos de Serviços S/A
Analista de dados sênior
março de 2016 - Present (10 anos 2 meses)

Atualmente, atuo como DBA e especialista em dados, garantindo a integridade, performance e segurança do banco de dados SQL Server (5TB+), além de desenvolver e otimizar procedimentos armazenados, ETL e automação de rotinas.
Minha expertise se estende ao ERP Protheus.
Paralelamente, sou especialista em Power BI, desenvolvendo dashboards dinâmicos e interativos.

Formação acadêmica
UNOPAR - Universidade Norte do Paraná
Bacharelado em Análise e Desenvolvimento de Sistemas (2019 - 2022)
"""


JOB_TEXT = """
O profissional será responsável por analisar dados estratégicos da cadeia de suprimentos.
Experiência em automação de relatórios e dashboards.
Conhecimento em programação (Python ou R) voltado à análise de dados.
Experiência com análise de dados, noções de estatística aplicada e modelagem de dados.
Domínio de Excel avançado.
Conhecimento em ferramentas de BI (Power BI, Tableau ou similares), ERP SAP – Módulo MM,
vivência com KPIs de Supply Chain (estoque, lead time, savings, etc.).
Conhecimento em BPMN, utilizando Bizagi Modeler ou similares.
Habilidade em SQL para extração de dados.
"""


def test_enrich_analysis_result_fields_recovers_hiago_resume_signals() -> None:
    raw = {
        "overall_score": 90.0,
        "technical_score": 100.0,
        "experience_score": 0.0,
        "education_score": 0.0,
        "communication_score": None,
        "leadership_score": None,
        "candidate_summary": None,
        "seniority_level": "senior",
        "total_experience_years": None,
        "highest_education_level": "none",
        "highest_education_field": None,
        "strengths": [],
        "weaknesses": [],
        "recommendations": [],
        "keywords": ["Power BI", "SQL", "Python", "ETL"],
        "extracted_data": {
            "skills": [
                {"id": "power_bi", "name": "Power BI"},
                {"id": "sql", "name": "SQL"},
                {"id": "python", "name": "Python"},
                {"id": "etl", "name": "ETL"},
            ],
            "education_level": "none",
            "total_experience_years": None,
        },
    }

    enriched = enrich_analysis_result_fields(raw, HIAGO_RESUME)

    assert enriched["highest_education_level"] == "bachelor"
    assert enriched["total_experience_years"] >= 10.0
    assert enriched["extracted_data"]["current_role"] == "Analista de dados sênior"

    skill_names = [item["name"] for item in enriched["extracted_data"]["skills"]]
    assert "PostgreSQL" in skill_names
    assert "SQL Server" in skill_names
    assert "DAX" in skill_names
    assert "BI Analyst" in skill_names
    assert "DBA" in skill_names
    assert "dashboards" in skill_names
    assert "ERP Protheus" in skill_names


def test_infer_job_required_skills_never_returns_empty_for_structured_data_job() -> None:
    required = infer_job_required_skills(
        title="Analista de Dados Senior",
        description=JOB_TEXT,
        requirements=JOB_TEXT,
        responsibilities=None,
        experience_context=None,
    )
    optional = infer_job_nice_to_have_skills(
        title="Analista de Dados Senior",
        description=JOB_TEXT,
        requirements=JOB_TEXT,
        responsibilities=None,
        experience_context=None,
    )

    assert required
    assert "SQL" in required
    assert "Power BI" in required
    assert "Excel" in required
    assert "SAP MM" not in required
    assert "BPMN" not in required
    assert "KPIs Supply Chain" not in required
    assert "SAP MM" in optional
    assert "BPMN" in optional
    assert "KPIs Supply Chain" in optional
    assert "Tableau" in optional


def test_enrich_analysis_result_fields_ignores_negated_skill_mentions() -> None:
    raw = {
        "overall_score": 70.0,
        "technical_score": 70.0,
        "experience_score": 0.0,
        "education_score": 0.0,
        "communication_score": None,
        "leadership_score": None,
        "candidate_summary": None,
        "seniority_level": "junior",
        "total_experience_years": 2.0,
        "highest_education_level": "bachelor",
        "highest_education_field": None,
        "strengths": [],
        "weaknesses": [],
        "recommendations": [],
        "keywords": ["Python", "JavaScript"],
        "extracted_data": {
            "skills": [
                {"id": "python", "name": "Python"},
                {"id": "javascript", "name": "JavaScript"},
            ],
        },
    }

    enriched = enrich_analysis_result_fields(
        raw,
        "Perfil com Python e JavaScript, mas no evidence of SQL, Node.js e AWS depth.",
    )

    skill_names = [item["name"] for item in enriched["extracted_data"]["skills"]]
    assert "SQL" not in skill_names
