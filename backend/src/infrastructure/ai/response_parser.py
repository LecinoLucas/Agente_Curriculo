"""
Maps raw AI JSON output → normalized candidate profile data.

IMPORTANTE:
Este arquivo NÃO calcula match com vaga.
Ele apenas:
- extrai JSON
- normaliza payloads de IA
- calcula dados auxiliares do currículo
- gera um score interno de qualidade do perfil, NÃO compatibilidade com vaga

O score oficial publico vem de CandidateJobScore.final_score, exposto como job_fit_score.
"""

import json
import re
import unicodedata
from datetime import UTC, datetime
from typing import Any

from src.core.ai_sensitive_guardrails import sanitize_resume_analysis_result

# ── JSON extraction ────────────────────────────────────────────────────────────


class AIResponseValidationError(ValueError):
    """Structured parser failure that can be persisted without raw payload data."""

    def __init__(self, code: str, message: str, *, fields: list[str] | None = None) -> None:
        self.code = code
        self.fields = fields or []
        detail = f"{code}: {message}"
        if self.fields:
            detail = f"{detail}; fields={','.join(sorted(self.fields))}"
        super().__init__(detail)


def extract_json(text: str) -> dict[str, Any]:
    if not text or not text.strip():
        raise AIResponseValidationError("ai_response_empty", "empty AI response")

    cleaned = text.strip()

    fence_match = re.search(
        r"```(?:json)?\s*(\{.*?\})\s*```",
        cleaned,
        re.DOTALL | re.IGNORECASE,
    )
    if fence_match:
        try:
            parsed = json.loads(fence_match.group(1))
        except json.JSONDecodeError as exc:
            raise AIResponseValidationError(
                "ai_response_invalid_json",
                "fenced AI response is not valid JSON",
            ) from exc
        if isinstance(parsed, dict):
            return parsed
        raise AIResponseValidationError(
            "ai_response_schema_invalid",
            "AI response JSON must be an object",
        )

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
        raise AIResponseValidationError(
            "ai_response_schema_invalid",
            "AI response JSON must be an object",
        )
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    if start != -1:
        depth = 0
        in_string = False
        escape = False

        for i, ch in enumerate(cleaned[start:], start):
            if escape:
                escape = False
                continue

            if ch == "\\":
                escape = True
                continue

            if ch == '"':
                in_string = not in_string
                continue

            if in_string:
                continue

            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        parsed = json.loads(cleaned[start : i + 1])
                    except json.JSONDecodeError as exc:
                        raise AIResponseValidationError(
                            "ai_response_invalid_json",
                            "embedded AI response JSON is invalid",
                        ) from exc
                    if isinstance(parsed, dict):
                        return parsed
                    raise AIResponseValidationError(
                        "ai_response_schema_invalid",
                        "extracted JSON must be an object",
                    )

    raise AIResponseValidationError(
        "ai_response_invalid_json",
        "no valid JSON object in AI response",
    )


# ── Basic normalization ────────────────────────────────────────────────────────

def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_text(value: Any) -> str | None:
    if value is None:
        return None

    text = str(value).strip().lower()
    if not text:
        return None

    text = _strip_accents(text)
    text = re.sub(r"\s+", " ", text)
    return text


def make_id(value: Any) -> str | None:
    text = normalize_text(value)
    if not text:
        return None

    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text or None


def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None

    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _clamp_score(value: float) -> float:
    return max(0.0, min(100.0, value))


def _dedupe_strings(values: list[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    for value in values:
        text = normalize_text(value)
        if not text or text in seen:
            continue

        seen.add(text)
        result.append(text)

    return result


def _dedupe_preserve_case(values: list[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if not text:
            continue
        key = normalize_text(text)
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(text)

    return result


# ── Strict AI payload schema ───────────────────────────────────────────────────

_MINIMAL_REQUIRED_FIELDS = {
    "professional_area",
    "seniority_level",
    "skills",
    "experiences",
    "education",
    "total_experience_months",
}
_MINIMAL_OPTIONAL_FIELDS = {
    "candidate_summary",
    "summary",
    "strengths",
    "weaknesses",
    "recommendations",
    "keywords",
    "cv_quality_score",
    "communication_quality",
    "personal_info",
    "location",
    "work_model",
}
_FULL_REQUIRED_FIELDS = {
    "summary",
    "total_experience_months",
    "experiences",
    "education",
    "highest_education_level",
    "skills",
    "communication_quality",
    "strengths",
    "weaknesses",
    "recommendations",
    "keywords",
}
_LEGACY_PROFILE_REQUIRED_FIELDS = {
    "experiences",
    "skills",
    "education",
    "cv_quality_score",
}
_FULL_OPTIONAL_FIELDS = {
    "candidate",
    "personal_info",
    "experience",
    "employment_gaps",
    "education_field_relevance",
    "certifications",
    "skill_categories",
    "languages",
    "leadership_indicators",
    "leadership",
    "candidate_summary",
    "cv_quality_score",
    "location",
    "work_model",
}
_ALLOWED_RESPONSE_FIELDS = (
    _MINIMAL_REQUIRED_FIELDS
    | _MINIMAL_OPTIONAL_FIELDS
    | _FULL_REQUIRED_FIELDS
    | _FULL_OPTIONAL_FIELDS
)
_VALID_SENIORITY_LEVELS = {
    "intern",
    "junior",
    "mid",
    "senior",
    "lead",
    "principal",
    "undefined",
}
_VALID_EDUCATION_LEVELS = {
    "none",
    "high_school",
    "technical",
    "bachelor",
    "postgraduate",
    "master",
    "phd",
}
_QUALITY_SCORE_FIELDS = ("structure", "clarity", "professionalism", "completeness", "total")


def _require_list(data: dict[str, Any], field: str, errors: list[str]) -> None:
    if not isinstance(data.get(field), list):
        errors.append(field)


def _require_non_negative_int(data: dict[str, Any], field: str, errors: list[str]) -> None:
    parsed = _coerce_int(data.get(field))
    if parsed is None or parsed < 0:
        errors.append(field)


def _require_string_or_null(data: dict[str, Any], field: str, errors: list[str]) -> None:
    value = data.get(field)
    if value is not None and not isinstance(value, str):
        errors.append(field)


def _validate_score_range(value: Any, field: str, errors: list[str]) -> None:
    score = _coerce_float(value)
    if score is None or not 0 <= score <= 100:
        errors.append(field)


def _validate_quality_scores(raw: Any, field: str, errors: list[str]) -> None:
    if raw is None:
        return
    if not isinstance(raw, dict):
        errors.append(field)
        return
    for key, value in raw.items():
        if key not in _QUALITY_SCORE_FIELDS:
            errors.append(f"{field}.{key}")
            continue
        if value is not None:
            _validate_score_range(value, f"{field}.{key}", errors)


def _validate_reason_codes(raw: Any, errors: list[str]) -> None:
    if raw is None:
        return
    if not isinstance(raw, list):
        errors.append("reason_codes")
        return
    for index, item in enumerate(raw):
        if isinstance(item, str):
            if not make_id(item):
                errors.append(f"reason_codes[{index}]")
            continue
        if isinstance(item, dict):
            code = item.get("code") or item.get("reason_code")
            if not isinstance(code, str) or not make_id(code):
                errors.append(f"reason_codes[{index}].code")
            continue
        errors.append(f"reason_codes[{index}]")


def _validate_breakdown(raw: Any, errors: list[str]) -> None:
    if raw is None:
        return
    if not isinstance(raw, dict):
        errors.append("breakdown")
        return
    for key, value in raw.items():
        if isinstance(value, int | float):
            if not 0 <= float(value) <= 100:
                errors.append(f"breakdown.{key}")
            continue
        if isinstance(value, str | list | dict) or value is None:
            continue
        errors.append(f"breakdown.{key}")


def _validate_minimal_skills(raw: Any, errors: list[str]) -> None:
    if not isinstance(raw, list):
        errors.append("skills")
        return
    for index, item in enumerate(raw):
        if isinstance(item, str):
            continue
        if isinstance(item, dict):
            name = item.get("name")
            if name is None or (isinstance(name, str) and not name.strip()):
                continue
            if not isinstance(name, str):
                errors.append(f"skills[{index}].name")
            continue
        errors.append(f"skills[{index}]")


def _validate_experiences(raw: Any, errors: list[str]) -> None:
    if not isinstance(raw, list):
        errors.append("experiences")
        return
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            errors.append(f"experiences[{index}]")
            continue
        role = item.get("role") or item.get("role_title") or item.get("title")
        if role is not None and not isinstance(role, str):
            errors.append(f"experiences[{index}].role")
        duration = item.get("duration_months")
        if duration is not None:
            parsed = _coerce_int(duration)
            if parsed is None or parsed < 0:
                errors.append(f"experiences[{index}].duration_months")


def _validate_education(raw: Any, errors: list[str]) -> None:
    if not isinstance(raw, list):
        errors.append("education")
        return
    for index, item in enumerate(raw):
        if isinstance(item, str):
            if _normalize_degree(item) not in _VALID_EDUCATION_LEVELS:
                errors.append(f"education[{index}]")
            continue
        if not isinstance(item, dict):
            errors.append(f"education[{index}]")
            continue
        raw_level = item.get("level") or item.get("degree")
        if raw_level is not None and _normalize_degree(raw_level) not in _VALID_EDUCATION_LEVELS:
            errors.append(f"education[{index}].level")


def _validate_minimal_payload(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    _require_string_or_null(data, "professional_area", errors)
    seniority = normalize_text(data.get("seniority_level"))
    if seniority not in _VALID_SENIORITY_LEVELS:
        errors.append("seniority_level")
    _validate_minimal_skills(data.get("skills"), errors)
    _validate_experiences(data.get("experiences"), errors)
    _validate_education(data.get("education"), errors)
    _require_non_negative_int(data, "total_experience_months", errors)
    return errors


def _validate_full_payload(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    _require_string_or_null(data, "summary", errors)
    _require_non_negative_int(data, "total_experience_months", errors)
    _validate_experiences(data.get("experiences"), errors)
    _validate_education(data.get("education"), errors)
    education_level = _normalize_degree(data.get("highest_education_level"))
    if education_level not in _VALID_EDUCATION_LEVELS:
        errors.append("highest_education_level")
    _validate_minimal_skills(data.get("skills"), errors)
    _validate_quality_scores(data.get("communication_quality"), "communication_quality", errors)
    _require_list(data, "strengths", errors)
    _require_list(data, "weaknesses", errors)
    _require_list(data, "recommendations", errors)
    _require_list(data, "keywords", errors)
    return errors


def _validate_legacy_profile_payload(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    _validate_experiences(data.get("experiences"), errors)
    _validate_minimal_skills(data.get("skills"), errors)
    _validate_education(data.get("education"), errors)
    _validate_quality_scores(data.get("cv_quality_score"), "cv_quality_score", errors)
    return errors


def validate_original_analysis_payload(data: dict[str, Any]) -> None:
    """Validate raw AI JSON before compatibility normalization."""
    if not data:
        raise AIResponseValidationError("ai_response_empty", "empty AI response object")

    unknown_fields = sorted(set(data) - _ALLOWED_RESPONSE_FIELDS - {"reason_codes", "breakdown"})
    if unknown_fields:
        raise AIResponseValidationError(
            "ai_response_schema_invalid",
            "AI response contains unsupported fields",
            fields=unknown_fields,
        )

    missing_minimal = sorted(_MINIMAL_REQUIRED_FIELDS - set(data))
    missing_full = sorted(_FULL_REQUIRED_FIELDS - set(data))
    missing_legacy = sorted(_LEGACY_PROFILE_REQUIRED_FIELDS - set(data))
    is_minimal_candidate = not missing_minimal
    is_full_candidate = not missing_full
    is_legacy_candidate = not missing_legacy

    if not is_minimal_candidate and not is_full_candidate and not is_legacy_candidate:
        expected = min(
            (missing_minimal, missing_full, missing_legacy),
            key=len,
        )
        raise AIResponseValidationError(
            "ai_response_missing_required_fields",
            "AI response does not satisfy a known resume analysis schema",
            fields=expected,
        )

    if is_minimal_candidate:
        errors = _validate_minimal_payload(data)
    elif is_full_candidate:
        errors = _validate_full_payload(data)
    else:
        errors = _validate_legacy_profile_payload(data)
    _validate_quality_scores(data.get("cv_quality_score"), "cv_quality_score", errors)
    _validate_reason_codes(data.get("reason_codes"), errors)
    _validate_breakdown(data.get("breakdown"), errors)

    if errors:
        raise AIResponseValidationError(
            "ai_response_schema_invalid",
            "AI response fields failed strict validation",
            fields=errors,
        )


# ── Date / duration helpers ────────────────────────────────────────────────────

def _parse_yyyy_mm(value: Any) -> tuple[int, int] | None:
    if value is None:
        return None

    text = str(value).strip()

    if re.fullmatch(r"\d{4}", text):
        return int(text), 1

    if not re.fullmatch(r"\d{4}-\d{2}", text):
        return None

    year, month = text.split("-")
    y = int(year)
    m = int(month)

    if not 1 <= m <= 12:
        return None

    return y, m


def _month_index(year: int, month: int) -> int:
    return year * 12 + (month - 1)


def _months_between(start: Any, end: Any) -> int | None:
    parsed_start = _parse_yyyy_mm(start)
    parsed_end = _parse_yyyy_mm(end)

    if parsed_start is None or parsed_end is None:
        return None

    start_idx = _month_index(*parsed_start)
    end_idx = _month_index(*parsed_end)

    if end_idx < start_idx:
        return None

    return end_idx - start_idx


def _merge_month_ranges(ranges: list[tuple[int, int]]) -> int:
    if not ranges:
        return 0

    sorted_ranges = sorted(ranges)
    current_start, current_end = sorted_ranges[0]
    total = 0

    for start, end in sorted_ranges[1:]:
        if start <= current_end:
            current_end = max(current_end, end)
            continue

        total += current_end - current_start
        current_start, current_end = start, end

    total += current_end - current_start
    return total


def _calculate_total_experience_months(experiences: list[dict[str, Any]]) -> int:
    now = datetime.now(UTC)
    current_month = f"{now.year:04d}-{now.month:02d}"

    ranges: list[tuple[int, int]] = []
    undated_months = 0

    for exp in experiences:
        start_date = exp.get("start_date")
        end_date = current_month if exp.get("is_current") and start_date else exp.get("end_date")

        parsed_start = _parse_yyyy_mm(start_date)
        parsed_end = _parse_yyyy_mm(end_date)

        if parsed_start and parsed_end:
            start_idx = _month_index(*parsed_start)
            end_idx = _month_index(*parsed_end)

            if end_idx >= start_idx:
                ranges.append((start_idx, end_idx))
                continue

        duration = _coerce_int(exp.get("duration_months"))
        if duration is not None and duration > 0 and not start_date and not exp.get("end_date"):
            undated_months += duration

    return _merge_month_ranges(ranges) + undated_months


# ── Education ──────────────────────────────────────────────────────────────────

_EDUCATION_LEVEL_ORDER = {
    "none": 0,
    "high_school": 1,
    "technical": 2,
    "bachelor": 3,
    "postgraduate": 4,
    "master": 5,
    "phd": 6,
}

_DEGREE_ALIASES = {
    "ensino medio": "high_school",
    "high school": "high_school",
    "tecnico": "technical",
    "technical": "technical",
    "tecnologo": "technical",
    "technologist": "technical",
    "bachelor": "bachelor",
    "bacharelado": "bachelor",
    "graduacao": "bachelor",
    "undergraduate": "bachelor",
    "postgraduate": "postgraduate",
    "post graduate": "postgraduate",
    "pos graduacao": "postgraduate",
    "mba": "postgraduate",
    "master": "master",
    "mestrado": "master",
    "msc": "master",
    "phd": "phd",
    "doctorate": "phd",
    "doutorado": "phd",
}


def _normalize_degree(value: Any) -> str | None:
    text = normalize_text(value)
    if not text:
        return None

    if text in _EDUCATION_LEVEL_ORDER:
        return text

    return _DEGREE_ALIASES.get(text)


def _highest_education_level(education: list[dict[str, Any]]) -> str:
    levels = [
        item.get("level") or item.get("degree")
        for item in education
        if item.get("level") or item.get("degree")
    ]

    normalized = [_normalize_degree(level) for level in levels]
    normalized = [level for level in normalized if level]

    if not normalized:
        return "none"

    return max(
        normalized,
        key=lambda level: _EDUCATION_LEVEL_ORDER.get(level, -1),
    )


# ── Seniority / profile quality ────────────────────────────────────────────────

def _classify_seniority(months: int, leadership_signals: list[str]) -> str:
    has_leadership = bool(leadership_signals)

    if months >= 120 and has_leadership:
        return "principal"

    if months >= 84 and has_leadership:
        return "lead"

    if months >= 60:
        return "senior"

    if months >= 36:
        return "mid"

    if months >= 12:
        return "junior"

    if months > 0:
        return "intern"

    return "undefined"


def _profile_quality_score(canonical: dict[str, Any]) -> float:
    """
    Score auxiliar de completude do perfil.
    NÃO é match com vaga.
    """
    score = 0.0

    if canonical.get("current_role"):
        score += 10

    if canonical.get("experiences"):
        score += 25

    if canonical.get("skills"):
        score += 25

    if canonical.get("tools"):
        score += 10

    if canonical.get("education_level") and canonical.get("education_level") != "none":
        score += 10

    if canonical.get("total_experience_months"):
        score += 10

    if canonical.get("impact_signals"):
        score += 5

    if canonical.get("leadership_signals"):
        score += 5

    return _clamp_score(score)


# ── Normalizers ────────────────────────────────────────────────────────────────

def _normalize_experiences(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    experiences: list[dict[str, Any]] = []

    for item in raw:
        if isinstance(item, str):
            role = item
            company = None
            duration = None
            key_activities: list[Any] = []
            start_date = None
            end_date = None
            is_current = False
        elif isinstance(item, dict):
            role = item.get("role") or item.get("role_title") or item.get("title")
            company = item.get("company")
            duration = item.get("duration_months")
            start_date = item.get("start_date")
            end_date = item.get("end_date")
            is_current = bool(item.get("is_current"))
            key_activities = (
                item.get("key_activities")
                or item.get("activities")
                or item.get("responsibilities")
                or []
            )
        else:
            continue

        if duration is None:
            duration = _months_between(start_date, end_date)

        experiences.append(
            {
                "role": normalize_text(role),
                "company": normalize_text(company),
                "start_date": start_date,
                "end_date": end_date,
                "duration_months": _coerce_int(duration),
                "is_current": is_current,
                "activities": _dedupe_strings(key_activities),
            }
        )

    return experiences


def _normalize_skills(raw: list[Any]) -> list[dict[str, Any]]:
    skills: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in raw:
        if isinstance(item, str):
            name = item
            evidence = []
            confidence = "medium"
            source = "skill_mention"
        else:
            name = item.get("name")
            evidence_raw = item.get("evidence") or item.get("evidence_text") or []
            evidence = evidence_raw if isinstance(evidence_raw, list) else [evidence_raw]
            confidence = normalize_text(item.get("confidence")) or "medium"
            source = normalize_text(item.get("source")) or "skill_mention"

        skill_id = make_id(name)
        skill_name = normalize_text(name)
        display_name = str(name).strip() if name is not None else None

        if not skill_id or not skill_name or not display_name or skill_id in seen:
            continue

        seen.add(skill_id)

        skills.append(
            {
                "id": skill_id,
                "name": display_name,
                "confidence": (
                    confidence
                    if confidence in {"high", "medium", "low", "very_high"}
                    else "medium"
                ),
                "evidence": _dedupe_strings(evidence),
                "source": source,
            }
        )

    return skills


def _normalize_tools(raw_tools: list[Any], raw_skills: list[Any] | None = None) -> list[str]:
    values: list[Any] = list(raw_tools or [])

    for item in raw_skills or []:
        if isinstance(item, dict):
            values.extend(item.get("technologies_used") or [])
            values.extend(item.get("tools") or [])

    return _dedupe_strings(values)


def _normalize_education(raw: Any) -> tuple[str, list[dict[str, Any]]]:
    if isinstance(raw, str):
        level = _normalize_degree(raw) or "none"
        return level, []

    education_list = raw or []
    normalized: list[dict[str, Any]] = []

    for item in education_list:
        if isinstance(item, str):
            level = _normalize_degree(item) or "none"
            normalized.append(
                {
                    "level": level,
                    "field": None,
                    "institution": None,
                    "graduation_year": None,
                    "is_completed": False,
                }
            )
            continue

        if not isinstance(item, dict):
            continue

        level = (
            _normalize_degree(item.get("level"))
            or _normalize_degree(item.get("degree"))
            or "none"
        )

        normalized.append(
            {
                "level": level,
                "field": normalize_text(item.get("field")),
                "institution": normalize_text(item.get("institution")),
                "graduation_year": _coerce_int(item.get("graduation_year")),
                "is_completed": bool(item.get("is_completed")),
            }
        )

    return _highest_education_level(normalized), normalized


def _normalize_resume_profiler_v2(data: dict[str, Any]) -> dict[str, Any]:
    experiences = _normalize_experiences(data.get("experiences") or [])
    skills = _normalize_skills(data.get("skills") or data.get("evidenced_skills") or [])
    tools = _normalize_tools(data.get("tools") or data.get("tools_and_systems") or [])
    education_level, education = _normalize_education(
        data.get("education_level") or data.get("education") or []
    )

    total_months = _calculate_total_experience_months(experiences)
    if not total_months:
        total_months = _coerce_int(data.get("total_experience_months")) or 0

    leadership_signals = _dedupe_strings(
        data.get("leadership_signals") or data.get("leadership_evidence") or []
    )
    impact_signals = _dedupe_strings(
        data.get("impact_signals") or data.get("business_impact_evidence") or []
    )

    detected_level = normalize_text(
        data.get("detected_level") or data.get("seniority_level")
    )
    if detected_level not in {
        "intern",
        "junior",
        "mid",
        "senior",
        "lead",
        "principal",
        "undefined",
    }:
        detected_level = _classify_seniority(total_months, leadership_signals)

    canonical = {
        "current_role": normalize_text(data.get("current_role")),
        "professional_area": normalize_text(data.get("professional_area")) or "other",
        "detected_level": detected_level,
        "total_experience_months": total_months,
        "total_experience_years": round(total_months / 12, 1) if total_months else None,
        "experiences": experiences,
        "skills": skills,
        "tools": tools,
        "education_level": education_level,
        "education": education,
        "leadership_signals": leadership_signals,
        "impact_signals": impact_signals,
        "profile_completeness": _coerce_float(data.get("profile_completeness")),
        "confidence": normalize_text(data.get("confidence")) or "medium",
    }

    if canonical["profile_completeness"] is None:
        canonical["profile_completeness"] = round(_profile_quality_score(canonical) / 100, 2)

    return canonical


def _canonicalize_candidate_profile(data: dict[str, Any]) -> dict[str, Any]:
    return _normalize_resume_profiler_v2(data)


# ── CV quality score ───────────────────────────────────────────────────────────

def _parse_cv_quality_score(cv_quality: Any) -> tuple[float, dict[str, float]]:
    if not isinstance(cv_quality, dict):
        return 0.0, {}

    total = _coerce_float(cv_quality.get("total"))
    if total is not None:
        score = _clamp_score(total)
    else:
        part_keys = ("structure", "clarity", "professionalism", "completeness")
        parts = [_coerce_float(cv_quality.get(k)) for k in part_keys]
        valid = [p for p in parts if p is not None]
        score = _clamp_score(sum(valid)) if valid else 0.0

    quality = {k: score for k in ("structure", "clarity", "professionalism", "completeness")}
    return score, quality


# ── Main entry ─────────────────────────────────────────────────────────────────

def parse_analysis_response(raw: str) -> dict[str, Any]:
    data = extract_json(raw)
    if "experiences" not in data and isinstance(data.get("experience"), list):
        data = {**data, "experiences": data["experience"]}
    validate_original_analysis_payload(data)
    if "personal_info" not in data and isinstance(data.get("candidate"), dict):
        data = {**data, "personal_info": data["candidate"]}
    if "cv_quality_score" not in data and isinstance(data.get("communication_quality"), dict):
        data = {**data, "cv_quality_score": data["communication_quality"]}

    canonical = _canonicalize_candidate_profile(data)
    personal_info = data.get("personal_info") if isinstance(data.get("personal_info"), dict) else {}

    summary = data.get("candidate_summary") or data.get("summary")
    strengths = _dedupe_strings(data.get("strengths") or [])
    weaknesses = _dedupe_strings(data.get("weaknesses") or [])
    recommendations = _dedupe_strings(data.get("recommendations") or [])
    explicit_keywords = _dedupe_preserve_case(data.get("keywords") or [])
    raw_skill_names = _dedupe_preserve_case(
        [
            (item.get("name") if isinstance(item, dict) else item)
            for item in (data.get("skills") or data.get("evidenced_skills") or [])
        ]
    )
    keywords = _dedupe_preserve_case([*explicit_keywords, *raw_skill_names])[:15]

    total_exp_years = _coerce_float(data.get("total_experience_years"))
    if total_exp_years is None:
        total_exp_years = canonical.get("total_experience_years")

    communication_score, communication_quality = _parse_cv_quality_score(
        data.get("cv_quality_score")
    )

    extracted_data = dict(canonical)
    if communication_quality:
        extracted_data["communication_quality"] = communication_quality
    parsed_location = normalize_text(
        data.get("location")
        or personal_info.get("location")
    )
    parsed_work_model = normalize_text(
        data.get("work_model")
        or personal_info.get("work_model")
    )
    if parsed_location is not None:
        extracted_data["location"] = parsed_location
    if parsed_work_model is not None:
        extracted_data["work_model"] = parsed_work_model

    result = {
        "candidate_summary": str(summary).strip() if summary else None,
        "seniority_level": canonical.get("detected_level"),
        "total_experience_years": total_exp_years,
        "communication_score": communication_score,
        "highest_education_level": canonical.get("education_level"),
        "highest_education_field": (
            canonical.get("education", [{}])[0].get("field")
            if canonical.get("education")
            else None
        ),

        "strengths": strengths,
        "weaknesses": weaknesses,
        "recommendations": recommendations,

        "keywords": keywords,

        "extracted_data": extracted_data,
    }
    return sanitize_resume_analysis_result(result)
