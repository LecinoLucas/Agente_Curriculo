import json

import pytest

from src.infrastructure.ai.response_parser import (
    AIResponseValidationError,
    parse_analysis_response,
)


def _build_v2_payload(cv_quality_score: dict):
    return {
        "personal_info": {
            "name": "Ana",
            "email": "ana@example.com",
            "phone": None,
            "location": "Sao Paulo",
        },
        "experience": [
            {
                "company": "Acme",
                "role_title": "Backend Engineer",
                "start_date": "2022-01",
                "end_date": "2024-01",
                "is_current": False,
                "duration_months": 24,
                "description": "Python e APIs",
            }
        ],
        "skills": [{"name": "Python", "proficiency": "advanced"}],
        "leadership": {
            "has_management": False,
            "has_project_lead": False,
            "has_mentoring": False,
            "has_cross_team": False,
        },
        "education": [
            {
                "degree": "bachelor",
                "field": "Computer Science",
                "institution": "USP",
                "start_date": "2018-01",
                "end_date": "2021-12",
            }
        ],
        "languages": [{"language": "English", "level": "advanced"}],
        "employment_gaps": [],
        "cv_quality_score": cv_quality_score,
    }


def _build_minimal_payload():
    return {
        "professional_area": "technology",
        "seniority_level": "senior",
        "skills": ["Python", "SQL"],
        "experiences": [
            {"role": "Backend Engineer", "duration_months": 36},
            {"role": "Tech Lead", "duration_months": 24},
        ],
        "education": [{"level": "bachelor", "field": "Computação"}],
        "total_experience_months": 60,
    }


def test_parse_analysis_response_v2_uses_total_quality_score_when_present():
    payload = _build_v2_payload(
        {
            "structure": 10,
            "clarity": 12,
            "professionalism": 13,
            "completeness": 9,
            "total": 86,
        }
    )

    parsed = parse_analysis_response(json.dumps(payload))

    assert parsed["communication_score"] == 86.0
    assert parsed["extracted_data"]["communication_quality"] == {
        "structure": 86.0,
        "clarity": 86.0,
        "professionalism": 86.0,
        "completeness": 86.0,
    }


def test_parse_analysis_response_v2_sums_quality_parts_when_total_missing():
    payload = _build_v2_payload(
        {
            "structure": 20,
            "clarity": 22,
            "professionalism": 23,
            "completeness": 21,
        }
    )

    parsed = parse_analysis_response(json.dumps(payload))

    assert parsed["communication_score"] == 86.0
    assert parsed["extracted_data"]["communication_quality"]["structure"] == 86.0


def test_parse_analysis_response_v2_rejects_quality_score_outside_range():
    payload = _build_v2_payload(
        {
            "structure": None,
            "clarity": "abc",
            "professionalism": 80,
            "completeness": 70,
            "total": 999,
        }
    )

    with pytest.raises(AIResponseValidationError) as exc_info:
        parse_analysis_response(json.dumps(payload))

    assert exc_info.value.code == "ai_response_schema_invalid"
    assert "cv_quality_score.total" in exc_info.value.fields


def test_parse_analysis_response_v2_keywords_use_only_explicit_values_and_skills():
    payload = _build_v2_payload({"total": 80})
    payload["skills"] = [
        {"name": "Python", "proficiency": "advanced"},
        {"name": "python", "proficiency": "basic"},
        {"name": "FastAPI", "proficiency": "advanced"},
        {"name": "", "proficiency": "basic"},
        {"name": None, "proficiency": "basic"},
    ]
    payload["keywords"] = ["Backend", "backend", "", None, " APIs "]

    parsed = parse_analysis_response(json.dumps(payload))

    assert parsed["keywords"] == ["Backend", "APIs", "Python", "FastAPI"]
    assert "Acme" not in parsed["keywords"]
    assert "Backend Engineer" not in parsed["keywords"]


def test_parse_analysis_response_rejects_invalid_json():
    with pytest.raises(AIResponseValidationError) as exc_info:
        parse_analysis_response("{invalid-json")

    assert exc_info.value.code == "ai_response_invalid_json"


def test_parse_analysis_response_rejects_empty_response():
    with pytest.raises(AIResponseValidationError) as exc_info:
        parse_analysis_response(" ")

    assert exc_info.value.code == "ai_response_empty"


def test_parse_analysis_response_rejects_missing_required_fields():
    payload = {
        "professional_area": "technology",
        "seniority_level": "senior",
        "skills": ["Python"],
    }

    with pytest.raises(AIResponseValidationError) as exc_info:
        parse_analysis_response(json.dumps(payload))

    assert exc_info.value.code == "ai_response_missing_required_fields"
    assert "experiences" in exc_info.value.fields
    assert "education" in exc_info.value.fields


def test_parse_analysis_response_rejects_invalid_reason_codes():
    payload = _build_minimal_payload()
    payload["reason_codes"] = {"code": "professional_fit"}

    with pytest.raises(AIResponseValidationError) as exc_info:
        parse_analysis_response(json.dumps(payload))

    assert exc_info.value.code == "ai_response_schema_invalid"
    assert "reason_codes" in exc_info.value.fields


def test_parse_analysis_response_accepts_optional_fields_absent_for_minimal_payload():
    parsed = parse_analysis_response(json.dumps(_build_minimal_payload()))

    assert parsed["candidate_summary"] is None
    assert parsed["strengths"] == []
    assert parsed["weaknesses"] == []
    assert parsed["recommendations"] == []
    assert parsed["total_experience_years"] == 5.0


def test_parse_analysis_response_redacts_age_and_birth_date_from_textual_output():
    payload = _build_v2_payload({"total": 80})
    payload["candidate_summary"] = "Candidata tem 45 anos e data de nascimento 02/01/1980."
    payload["strengths"] = ["Python avançado", "Boa energia apesar da idade"]
    payload["skills"] = [{"name": "Python", "proficiency": "advanced"}]

    parsed = parse_analysis_response(json.dumps(payload, ensure_ascii=False))
    serialized = json.dumps(parsed, ensure_ascii=False)

    assert "45 anos" not in serialized
    assert "02/01/1980" not in serialized
    assert "idade" not in serialized.lower()
    assert parsed["strengths"] == ["python avancado"]
    assert parsed["keywords"] == ["Python"]


def test_parse_analysis_response_removes_family_and_clinical_gaps():
    payload = _build_v2_payload({"total": 80})
    payload["weaknesses"] = [
        "Estado civil casada pode limitar disponibilidade",
        "Experiência recente em FastAPI pouco detalhada",
    ]
    payload["recommendations"] = [
        "Investigar diagnóstico mencionado no currículo",
        "Validar experiência profissional em APIs",
    ]
    payload["skills"] = [
        {"name": "FastAPI", "proficiency": "advanced"},
        {"name": "estado civil", "proficiency": "advanced"},
    ]

    parsed = parse_analysis_response(json.dumps(payload, ensure_ascii=False))
    serialized = json.dumps(parsed, ensure_ascii=False).lower()

    assert "estado civil" not in serialized
    assert "casada" not in serialized
    assert "diagnostico" not in serialized
    assert "diagnóstico" not in serialized
    assert parsed["weaknesses"] == ["experiencia recente em fastapi pouco detalhada"]
    assert parsed["recommendations"] == ["validar experiencia profissional em apis"]
    assert [skill["name"] for skill in parsed["extracted_data"]["skills"]] == ["FastAPI"]


def test_parse_analysis_response_removes_address_or_distance_as_rejection_proxy():
    payload = _build_v2_payload({"total": 80})
    payload["weaknesses"] = [
        "Mora longe no bairro Central e pode ter problema de deslocamento",
        "Pouca evidência de SQL",
    ]
    payload["keywords"] = ["Bairro Central", "SQL"]
    payload["skills"] = [{"name": "SQL", "proficiency": "advanced"}]

    parsed = parse_analysis_response(json.dumps(payload, ensure_ascii=False))
    serialized = json.dumps(parsed, ensure_ascii=False).lower()

    assert "bairro" not in serialized
    assert "mora longe" not in serialized
    assert parsed["weaknesses"] == ["pouca evidencia de sql"]
    assert parsed["keywords"] == ["SQL"]
