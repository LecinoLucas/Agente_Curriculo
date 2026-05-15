import json

from src.infrastructure.ai.response_parser import parse_analysis_response


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


def test_parse_analysis_response_v2_clamps_invalid_or_null_quality_values():
    payload = _build_v2_payload(
        {
            "structure": None,
            "clarity": "abc",
            "professionalism": 80,
            "completeness": 70,
            "total": 999,
        }
    )

    parsed = parse_analysis_response(json.dumps(payload))

    assert parsed["communication_score"] == 100.0
    assert parsed["extracted_data"]["communication_quality"] == {
        "structure": 100.0,
        "clarity": 100.0,
        "professionalism": 100.0,
        "completeness": 100.0,
    }


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
