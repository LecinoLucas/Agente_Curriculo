"""Evaluate deal-breakers against candidate profile data.

Deal-breakers are job-level elimination rules that reject candidates based on
specific criteria. Only active deal-breakers are evaluated.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any


class DealBreakerViolation(Exception):
    """Raised when deal-breaker evaluation fails."""

    pass


def evaluate_deal_breakers(
    deal_breakers: list[dict[str, Any]] | None,
    candidate_row: dict[str, Any],
) -> list[dict[str, Any]]:
    """Evaluate all active deal-breakers against candidate data.

    Args:
        deal_breakers: List of deal-breaker configs from JobModel.deal_breakers
        candidate_row: Candidate data row from ranking query (with analysis results)

    Returns:
        List of violation reason_codes (empty if no violations).
        Each violation includes:
        - type: "deal_breaker"
        - field: deal-breaker field name
        - impact: negative (penalty score)
        - expected: expected value per deal-breaker config
        - actual: actual value from candidate
        - reason: deal-breaker reason text
    """
    violations: list[dict[str, Any]] = []

    if not deal_breakers:
        return violations

    for db in deal_breakers:
        # Only evaluate active deal-breakers
        if not db.get("is_active", True):
            continue

        field = db.get("field", "")
        operator = db.get("operator", "equals")
        value = db.get("value")
        values = db.get("values", [])
        reason = db.get("reason", "Deal-breaker violation")

        # Determine which fields to check
        if field == "location":
            _check_location(violations, candidate_row, operator, value, values, reason)
        elif field == "work_model":
            _check_work_model(violations, candidate_row, operator, value, reason)
        elif field == "education_level":
            _check_education_level(violations, candidate_row, operator, value, reason)
        elif field == "experience_years":
            _check_experience_years(violations, candidate_row, operator, value, reason)
        elif field == "skill":
            _check_skill(violations, candidate_row, operator, value, reason)
        elif field == "language":
            _check_language(violations, candidate_row, operator, value, reason)
        elif field == "availability":
            _check_availability(violations, candidate_row, operator, value, reason)
        elif field == "custom_text":
            _check_custom_text(violations, candidate_row, operator, value, reason)

    return violations


# ---------------------------------------------------------------------------
# Field-specific evaluators
# ---------------------------------------------------------------------------


def _check_location(
    violations: list[dict],
    row: dict,
    operator: str,
    value: str | None,
    values: list[str] | None,
    reason: str,
) -> None:
    """Check location field (equals, not_equals, contains, in)."""
    candidate_location = row.get("location_city") or ""
    if not candidate_location:
        return

    violated = False
    if operator == "equals" and value and candidate_location.lower() != value.lower():
        violated = True
    elif operator == "not_equals" and value and candidate_location.lower() == value.lower():
        violated = True
    elif operator == "contains" and value and value.lower() not in candidate_location.lower():
        violated = True
    elif operator == "in" and values and candidate_location.lower() not in [v.lower() for v in values]:
        violated = True

    if violated:
        violations.append({
            "type": "deal_breaker",
            "field": "location",
            "impact": -100.0,
            "expected": value or f"one of {values}",
            "actual": candidate_location,
            "reason": reason,
        })


def _check_work_model(
    violations: list[dict],
    row: dict,
    operator: str,
    value: str | None,
    reason: str,
) -> None:
    """Check work_model field (equals, not_equals)."""
    # Work model info comes from candidate profile if available, or from job pipeline
    candidate_work_model = row.get("work_model") or ""
    if not candidate_work_model and not value:
        return

    violated = False
    if operator == "equals" and value and candidate_work_model.lower() != value.lower():
        violated = True
    elif operator == "not_equals" and value and candidate_work_model.lower() == value.lower():
        violated = True

    if violated:
        violations.append({
            "type": "deal_breaker",
            "field": "work_model",
            "impact": -100.0,
            "expected": value,
            "actual": candidate_work_model,
            "reason": reason,
        })


def _check_education_level(
    violations: list[dict],
    row: dict,
    operator: str,
    value: str | None,
    reason: str,
) -> None:
    """Check education_level field (equals, >=).

    Hierarchy: none < high_school < technical < bachelor < postgraduate < master < phd
    """
    EDUCATION_HIERARCHY = {
        "none": 0,
        "high_school": 1,
        "technical": 2,
        "bachelor": 3,
        "postgraduate": 4,
        "master": 5,
        "phd": 6,
    }

    candidate_education = row.get("education_level") or ""
    if not candidate_education or not value:
        return

    candidate_level = EDUCATION_HIERARCHY.get(candidate_education.lower(), -1)
    required_level = EDUCATION_HIERARCHY.get(value.lower(), -1)

    violated = False
    if operator == "equals" and candidate_level != required_level:
        violated = True
    elif operator == ">=" and candidate_level < required_level:
        violated = True

    if violated:
        violations.append({
            "type": "deal_breaker",
            "field": "education_level",
            "impact": -100.0,
            "expected": value,
            "actual": candidate_education,
            "reason": reason,
        })


def _check_experience_years(
    violations: list[dict],
    row: dict,
    operator: str,
    value: str | None,
    reason: str,
) -> None:
    """Check experience_years field (>=, <=, equals)."""
    if not value:
        return

    try:
        required_years = Decimal(value)
    except (ValueError, TypeError):
        return

    candidate_years = row.get("total_experience_years")
    if candidate_years is None:
        return

    candidate_years = Decimal(str(candidate_years))
    violated = False

    if operator == "equals" and candidate_years != required_years:
        violated = True
    elif operator == ">=" and candidate_years < required_years:
        violated = True
    elif operator == "<=" and candidate_years > required_years:
        violated = True

    if violated:
        violations.append({
            "type": "deal_breaker",
            "field": "experience_years",
            "impact": -100.0,
            "expected": f"{required_years} years",
            "actual": f"{float(candidate_years):.1f} years",
            "reason": reason,
        })


def _check_skill(
    violations: list[dict],
    row: dict,
    operator: str,
    value: str | None,
    reason: str,
) -> None:
    """Check skill field (contains, not_contains).

    'contains' means candidate must have the skill.
    'not_contains' means candidate must NOT have the skill.
    """
    matched_skills = _coerce_list(row.get("matched_skills", []))
    if not value or not matched_skills:
        if operator == "not_contains" and not matched_skills:
            # No skills to check, so technically doesn't violate
            return

    matched_lower = [s.lower() for s in matched_skills]
    value_lower = value.lower() if value else ""

    violated = False
    if operator == "contains" and value_lower not in matched_lower:
        violated = True
    elif operator == "not_contains" and value_lower in matched_lower:
        violated = True

    if violated:
        violations.append({
            "type": "deal_breaker",
            "field": "skill",
            "impact": -100.0,
            "expected": f"{operator} {value}",
            "actual": f"matched: {', '.join(matched_skills[:3])}",
            "reason": reason,
        })


def _check_language(
    violations: list[dict],
    row: dict,
    operator: str,
    value: str | None,
    reason: str,
) -> None:
    """Check language field (equals, contains).

    Languages come from candidate analysis or resume extraction.
    For now, we'll check against a simple text field if available.
    """
    # Note: language info would come from resume extraction
    # For MVP, we'll skip if not available
    languages = _coerce_list(row.get("languages", []))
    if not value or not languages:
        return

    languages_lower = [l.lower() for l in languages]
    value_lower = value.lower()

    violated = False
    if operator == "equals" and value_lower not in languages_lower:
        violated = True
    elif operator == "contains" and value_lower not in " ".join(languages_lower):
        violated = True

    if violated:
        violations.append({
            "type": "deal_breaker",
            "field": "language",
            "impact": -100.0,
            "expected": f"{operator} {value}",
            "actual": f"languages: {', '.join(languages)}",
            "reason": reason,
        })


def _check_availability(
    violations: list[dict],
    row: dict,
    operator: str,
    value: str | None,
    reason: str,
) -> None:
    """Check availability field (equals).

    Availability info comes from candidate profile or resume.
    """
    candidate_availability = row.get("availability") or ""
    if not candidate_availability or not value:
        return

    violated = operator == "equals" and candidate_availability.lower() != value.lower()

    if violated:
        violations.append({
            "type": "deal_breaker",
            "field": "availability",
            "impact": -100.0,
            "expected": value,
            "actual": candidate_availability,
            "reason": reason,
        })


def _check_custom_text(
    violations: list[dict],
    row: dict,
    operator: str,
    value: str | None,
    reason: str,
) -> None:
    """Check custom_text field (contains).

    Custom text is searched in candidate name, location, notes, or skills.
    Only applies if text is found in explicit profile field.

    For MVP, searches in:
    - candidate_name
    - location_city
    - internal_notes
    """
    if not value:
        return

    searchable_text = [
        row.get("candidate_name", ""),
        row.get("location_city", ""),
        row.get("internal_notes", ""),
    ]
    combined_text = " ".join(str(s) for s in searchable_text).lower()
    value_lower = value.lower()

    violated = operator == "contains" and value_lower not in combined_text

    if violated:
        violations.append({
            "type": "deal_breaker",
            "field": "custom_text",
            "impact": -100.0,
            "expected": f"contains '{value}'",
            "actual": "text not found in profile",
            "reason": reason,
        })


def _coerce_list(value: Any) -> list:
    """Safely convert value to list."""
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]
