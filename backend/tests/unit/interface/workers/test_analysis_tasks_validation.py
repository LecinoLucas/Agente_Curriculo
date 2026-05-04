import pytest

from src.interface.workers.analysis_tasks import _validate_result_fields


def _valid_result_fields() -> dict:
    return {
        "overall_score": 80,
        "technical_score": 80,
        "experience_score": 80,
        "education_score": 80,
        "communication_score": 80,
        "leadership_score": 80,
        "candidate_summary": "Resumo",
        "seniority_level": "mid",
        "total_experience_years": 5,
        "highest_education_level": "bachelor",
        "highest_education_field": "computer science",
        "strengths": ["python"],
        "weaknesses": ["none"],
        "recommendations": ["avaliar"],
        "keywords": ["python"],
        "extracted_data": {},
    }


def test_validate_result_fields_accepts_complete_schema() -> None:
    _validate_result_fields(_valid_result_fields())


def test_validate_result_fields_raises_clear_error_when_required_field_missing() -> None:
    result = _valid_result_fields()
    result.pop("overall_score")

    with pytest.raises(RuntimeError, match="missing required fields"):
        _validate_result_fields(result)
