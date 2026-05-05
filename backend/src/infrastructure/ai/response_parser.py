"""
Maps raw AI JSON output → normalized candidate profile data.

IMPORTANTE:
Este arquivo NÃO calcula match com vaga.
Ele apenas:
- extrai JSON
- normaliza formatos antigos/novos
- calcula dados auxiliares do currículo
- gera um score interno de qualidade do perfil, NÃO compatibilidade com vaga

O match final deve ser calculado por outro serviço:
job_profiler + resume_profiler + scoring_service.
"""

import json
import re
import unicodedata
from datetime import UTC, datetime
from typing import Any


# ── JSON extraction ────────────────────────────────────────────────────────────

def extract_json(text: str) -> dict[str, Any]:
    if not text or not text.strip():
        raise ValueError("Empty AI response")

    cleaned = text.strip()

    fence_match = re.search(
        r"```(?:json)?\s*(\{.*?\})\s*```",
        cleaned,
        re.DOTALL | re.IGNORECASE,
    )
    if fence_match:
        return json.loads(fence_match.group(1))

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
        raise ValueError("AI response JSON must be an object")
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
                    parsed = json.loads(cleaned[start : i + 1])
                    if isinstance(parsed, dict):
                        return parsed
                    raise ValueError("Extracted JSON must be an object")

    raise ValueError(f"No valid JSON in AI response: {cleaned[:300]!r}")


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


def _derive_experience_score(total_years: float | None) -> float:
    if total_years is None:
        return 0.0
    if total_years >= 8:
        return 95.0
    if total_years >= 6:
        return 90.0
    if total_years >= 5:
        return 80.0
    if total_years >= 3:
        return 65.0
    if total_years >= 1:
        return 45.0
    return 20.0


def _derive_education_score(level: str | None) -> float:
    table = {
        "none": 0.0,
        "high_school": 35.0,
        "technical": 55.0,
        "bachelor": 75.0,
        "postgraduate": 82.0,
        "master": 88.0,
        "phd": 92.0,
    }
    return table.get((level or "none"), 0.0)


def _derive_technical_score(skills_count: int) -> float:
    if skills_count <= 0:
        return 0.0
    return float(min(100, 40 + skills_count * 15))


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
                "confidence": confidence if confidence in {"high", "medium", "low", "very_high"} else "medium",
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
    if detected_level not in {"intern", "junior", "mid", "senior", "lead", "principal", "undefined"}:
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


def _normalize_legacy_data(data: dict[str, Any]) -> dict[str, Any]:
    experiences = _normalize_experiences(data.get("experiences") or data.get("experience") or [])
    skills = _normalize_skills(data.get("skills") or data.get("evidenced_skills") or [])
    tools = _normalize_tools(
        data.get("tools") or data.get("tools_and_systems") or [],
        data.get("experiences") or [],
    )

    education_level, education = _normalize_education(
        data.get("education_level")
        or data.get("highest_education_level")
        or data.get("education")
        or []
    )

    total_months = (
        _coerce_int(data.get("total_experience_months"))
        or _calculate_total_experience_months(experiences)
        or 0
    )

    leadership_raw = data.get("leadership_indicators") or {}
    leadership_signals = _dedupe_strings(
        data.get("leadership_signals")
        or data.get("leadership_evidence")
        or [
            key
            for key, value in leadership_raw.items()
            if value
        ]
    )

    impact_signals = _dedupe_strings(
        data.get("impact_signals")
        or data.get("business_impact_evidence")
        or []
    )

    canonical = {
        "current_role": normalize_text(data.get("current_role")),
        "professional_area": normalize_text(data.get("professional_area")) or "other",
        "detected_level": _classify_seniority(total_months, leadership_signals),
        "total_experience_months": total_months,
        "total_experience_years": round(total_months / 12, 1) if total_months else None,
        "experiences": experiences,
        "skills": skills,
        "tools": tools,
        "education_level": education_level,
        "education": education,
        "leadership_signals": leadership_signals,
        "impact_signals": impact_signals,
        "profile_completeness": round(_profile_quality_score({
            "current_role": data.get("current_role"),
            "experiences": experiences,
            "skills": skills,
            "tools": tools,
            "education_level": education_level,
            "total_experience_months": total_months,
            "impact_signals": impact_signals,
            "leadership_signals": leadership_signals,
        }) / 100, 2),
        "confidence": normalize_text(data.get("confidence")) or "medium",
    }

    return canonical


def _canonicalize_candidate_profile(data: dict[str, Any]) -> dict[str, Any]:
    if (
        "detected_level" in data
        or "professional_area" in data
        or "evidenced_skills" in data
        or "tools_and_systems" in data
    ):
        return _normalize_resume_profiler_v2(data)

    return _normalize_legacy_data(data)


# ── Main entry ─────────────────────────────────────────────────────────────────

def parse_analysis_response(raw: str) -> dict[str, Any]:
    data = extract_json(raw)
    canonical = _canonicalize_candidate_profile(data)
    personal_info = data.get("personal_info") if isinstance(data.get("personal_info"), dict) else {}

    summary = data.get("candidate_summary")
    strengths = _dedupe_strings(data.get("strengths") or [])
    weaknesses = _dedupe_strings(data.get("weaknesses") or [])
    recommendations = _dedupe_strings(data.get("recommendations") or [])
    explicit_overall = _coerce_float(data.get("overall_score"))

    profile_quality = round(float(canonical.get("profile_completeness") or 0) * 100, 2)
    overall_score = _clamp_score(explicit_overall) if explicit_overall is not None else profile_quality

    communication_score = _coerce_float(data.get("communication_score"))
    communication_quality_payload = data.get("cv_quality_score")
    if communication_score is None and isinstance(communication_quality_payload, dict):
        total_quality = _coerce_float(communication_quality_payload.get("total"))
        if total_quality is None:
            total_quality = sum(
                _coerce_float(communication_quality_payload.get(key)) or 0.0
                for key in ("structure", "clarity", "professionalism", "completeness")
            )
        communication_score = _clamp_score(float(total_quality))

    communication_quality = None
    if communication_score is not None:
        communication_quality = {
            "structure": communication_score,
            "clarity": communication_score,
            "professionalism": communication_score,
            "completeness": communication_score,
        }

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

    technical_score = _coerce_float(data.get("technical_score"))
    if technical_score is None:
        technical_score = _derive_technical_score(len(canonical.get("skills") or []))

    experience_score = _coerce_float(data.get("experience_score"))
    if experience_score is None:
        experience_score = _derive_experience_score(total_exp_years)

    education_score = _coerce_float(data.get("education_score"))
    if education_score is None:
        education_score = _derive_education_score(canonical.get("education_level"))

    extracted_data = dict(canonical)
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
    if communication_quality is not None:
        extracted_data["communication_quality"] = communication_quality

    return {
        # Mantém compatibilidade com campos antigos, mas NÃO é match com vaga.
        "overall_score": overall_score,
        "technical_score": technical_score,
        "experience_score": experience_score,
        "education_score": education_score,
        "communication_score": communication_score,
        "leadership_score": _coerce_float(data.get("leadership_score")),

        "candidate_summary": str(summary).strip() if summary else None,
        "seniority_level": canonical.get("detected_level"),
        "total_experience_years": total_exp_years,
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
