from src.infrastructure.ai.response_parser import (
    AIResponseValidationError,
    parse_analysis_response as _parse_raw_response,
)

__all__ = ["AIResponseValidationError", "parse_and_validate_analysis_response"]

_REQUIRED_RESULT_FIELDS = frozenset({
    "candidate_summary",
    "seniority_level",
    "total_experience_years",
    "highest_education_level",
    "highest_education_field",
    "strengths",
    "weaknesses",
    "recommendations",
    "keywords",
    "extracted_data",
})


def parse_and_validate_analysis_response(content: str) -> dict:
    result_fields = _parse_raw_response(content)
    missing = _REQUIRED_RESULT_FIELDS - set(result_fields.keys())
    if missing:
        raise RuntimeError(
            f"Parsed analysis result missing required fields: {sorted(missing)}"
        )
    return result_fields
