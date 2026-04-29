"""
Maps raw Claude JSON output → AnalysisResultModel field values.

Scoring weights:
  technical   30%  — skill depth/breadth
  experience  25%  — total months worked
  education   15%  — highest degree
  communication 15% — resume quality signals
  leadership  15%  — management/project indicators
"""

import json
import re
from datetime import UTC, datetime
from typing import Any


# ── JSON extraction ────────────────────────────────────────────────────────────

def extract_json(text: str) -> dict[str, Any]:
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        return json.loads(match.group(1))

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    if start != -1:
        depth = 0
        for i, ch in enumerate(text[start:], start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return json.loads(text[start : i + 1])

    raise ValueError(f"No valid JSON in Claude response: {text[:300]!r}")


# ── Individual scorers ─────────────────────────────────────────────────────────

def _education_score(level: str | None) -> float:
    return {
        "phd": 100, "master": 90, "postgraduate": 85,
        "bachelor": 75, "technical": 60, "high_school": 40, "none": 20,
    }.get(level or "none", 50)


def _communication_score(comm: dict[str, Any]) -> float:
    if not comm:
        return 60.0
    vals = [
        comm.get("structure", 60),
        comm.get("clarity", 60),
        comm.get("professionalism", 60),
        comm.get("completeness", 60),
    ]
    return sum(float(v) for v in vals) / len(vals)


def _clamp_score(value: float) -> float:
    return max(0.0, min(100.0, value))


def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _dedupe_keywords(values: list[Any]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()

    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if not text:
            continue
        lowered = text.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(text)

    return deduped


def _leadership_score(indicators: dict[str, Any]) -> float:
    if not indicators:
        return 0.0
    score = 0.0
    if indicators.get("has_management"):
        score += 40
    if indicators.get("has_project_lead"):
        score += 30
    if indicators.get("has_mentoring"):
        score += 20
    if indicators.get("has_cross_team"):
        score += 10
    return score


def _technical_score(skills: list[dict[str, Any]]) -> float:
    if not skills:
        return 50.0
    level_w = {"expert": 4, "advanced": 3, "intermediate": 2, "basic": 1}
    target = [s for s in skills if s.get("is_primary")] or skills[:12]
    total = sum(level_w.get(s.get("proficiency_level", "basic"), 1) for s in target)
    max_possible = len(target) * 4
    return round(min(100.0, total / max_possible * 100) if max_possible else 50.0, 2)


def _experience_score(months: int) -> float:
    if months >= 120:
        return 100.0
    if months >= 84:
        return 90.0
    if months >= 60:
        return 80.0
    if months >= 36:
        return 65.0
    if months >= 12:
        return 45.0
    if months > 0:
        return 25.0
    return 10.0


def _classify_seniority(months: int, has_leadership: bool) -> str:
    if months >= 120 or (months >= 84 and has_leadership):
        return "principal" if has_leadership else "senior"
    if months >= 72 and has_leadership:
        return "lead"
    if months >= 60:
        return "senior"
    if months >= 36:
        return "mid"
    if months >= 12:
        return "junior"
    return "intern"


_EDUCATION_LEVEL_ORDER = {
    "none": 0,
    "high_school": 1,
    "technical": 2,
    "bachelor": 3,
    "postgraduate": 4,
    "master": 5,
    "phd": 6,
}


def _normalize_degree(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text:
        return None

    aliases = {
        "ensino medio": "high_school",
        "ensino médio": "high_school",
        "high school": "high_school",
        "tecnico": "technical",
        "técnico": "technical",
        "technical": "technical",
        "tecnologo": "technical",
        "tecnólogo": "technical",
        "technologist": "technical",
        "bachelor": "bachelor",
        "bacharelado": "bachelor",
        "graduacao": "bachelor",
        "graduação": "bachelor",
        "undergraduate": "bachelor",
        "postgraduate": "postgraduate",
        "post-graduate": "postgraduate",
        "pos-graduacao": "postgraduate",
        "pós-graduação": "postgraduate",
        "mba": "postgraduate",
        "master": "master",
        "mestrado": "master",
        "msc": "master",
        "phd": "phd",
        "doctorate": "phd",
        "doutorado": "phd",
    }

    if text in _EDUCATION_LEVEL_ORDER:
        return text
    return aliases.get(text)


def _parse_yyyy_mm(value: Any) -> tuple[int, int] | None:
    if value is None:
        return None
    text = str(value).strip()
    if not re.fullmatch(r"\d{4}-\d{2}", text):
        return None
    year, month = text.split("-")
    y = int(year)
    m = int(month)
    if m < 1 or m > 12:
        return None
    return y, m


def _months_between(start: str | None, end: str | None) -> int | None:
    parsed_start = _parse_yyyy_mm(start)
    parsed_end = _parse_yyyy_mm(end)
    if parsed_start is None or parsed_end is None:
        return None
    start_year, start_month = parsed_start
    end_year, end_month = parsed_end
    months = (end_year - start_year) * 12 + (end_month - start_month)
    return months if months >= 0 else None


def _month_index(year: int, month: int) -> int:
    return year * 12 + (month - 1)


def _merge_month_ranges(ranges: list[tuple[int, int]]) -> int:
    if not ranges:
        return 0

    merged_months = 0
    current_start, current_end = sorted(ranges)[0]

    for start, end in sorted(ranges)[1:]:
        if start <= current_end:
            current_end = max(current_end, end)
            continue
        merged_months += current_end - current_start
        current_start, current_end = start, end

    merged_months += current_end - current_start
    return merged_months


def _experience_months_from_v2(raw_experiences: list[dict[str, Any]]) -> int:
    date_ranges: list[tuple[int, int]] = []
    undated_duration_months = 0
    now = datetime.now(UTC)
    current_month = f"{now.year:04d}-{now.month:02d}"

    for item in raw_experiences:
        start_date = item.get("start_date")
        end_date = current_month if item.get("is_current") and start_date else item.get("end_date")
        parsed_start = _parse_yyyy_mm(start_date)
        parsed_end = _parse_yyyy_mm(end_date)

        if parsed_start is not None and parsed_end is not None:
            start_idx = _month_index(*parsed_start)
            end_idx = _month_index(*parsed_end)
            if end_idx >= start_idx:
                date_ranges.append((start_idx, end_idx))
            continue

        # Fall back to explicit durations only when date ranges are absent, not contradictory.
        if start_date is None and item.get("end_date") is None:
            duration = item.get("duration_months")
            if duration is not None:
                try:
                    duration_months = int(duration)
                except (TypeError, ValueError):
                    continue
                if duration_months >= 0:
                    undated_duration_months += duration_months

    return _merge_month_ranges(date_ranges) + undated_duration_months


def _normalize_current_data(data: dict[str, Any]) -> dict[str, Any]:
    experiences = data.get("experiences") or []
    total_experience_months = int(data.get("total_experience_months") or 0)

    if not total_experience_months:
        for experience in experiences:
            duration = experience.get("duration_months")
            if duration is None:
                duration = _months_between(experience.get("start_date"), experience.get("end_date"))
            if duration:
                total_experience_months += int(duration)

    education = data.get("education") or []
    normalized_education = []
    highest_education_level = data.get("highest_education_level")
    if highest_education_level is not None:
        highest_education_level = _normalize_degree(highest_education_level) or str(highest_education_level)

    for item in education:
        degree = _normalize_degree(item.get("degree")) or item.get("degree")
        normalized_education.append(
            {
                "institution": item.get("institution"),
                "degree": degree,
                "field": item.get("field"),
                "graduation_year": item.get("graduation_year"),
                "is_completed": item.get("is_completed"),
            }
        )

    if highest_education_level is None:
        degree_values = [d.get("degree") for d in normalized_education if d.get("degree")]
        highest_education_level = max(
            degree_values,
            key=lambda degree: _EDUCATION_LEVEL_ORDER.get(str(degree), -1),
            default="none",
        )

    return {
        "candidate": data.get("candidate") or {},
        "summary": data.get("summary"),
        "total_experience_months": total_experience_months,
        "experiences": experiences,
        "employment_gaps": data.get("employment_gaps") or [],
        "education": normalized_education,
        "highest_education_level": highest_education_level or "none",
        "education_field_relevance": data.get("education_field_relevance") or "medium",
        "certifications": data.get("certifications") or [],
        "skills": data.get("skills") or [],
        "skill_categories": data.get("skill_categories") or [],
        "languages": data.get("languages") or [],
        "communication_quality": data.get("communication_quality") or {},
        "leadership_indicators": data.get("leadership_indicators") or {},
        "strengths": data.get("strengths") or [],
        "weaknesses": data.get("weaknesses") or [],
        "recommendations": data.get("recommendations") or [],
        "keywords": data.get("keywords") or [],
    }


def _normalize_v2_data(data: dict[str, Any]) -> dict[str, Any]:
    personal_info = data.get("personal_info") or {}
    raw_experiences = data.get("experience") or []
    raw_skills = data.get("skills") or []
    raw_education = data.get("education") or []
    raw_languages = data.get("languages") or []
    raw_gaps = data.get("employment_gaps") or []
    raw_quality = data.get("cv_quality_score") or {}
    raw_leadership = data.get("leadership") or {}
    raw_keywords = data.get("keywords") or []

    experiences: list[dict[str, Any]] = []
    total_experience_months = _experience_months_from_v2(raw_experiences)
    keywords: list[str] = []

    for item in raw_experiences:
        duration = item.get("duration_months")
        if duration is None:
            if item.get("is_current") and item.get("start_date"):
                now = datetime.utcnow()
                duration = _months_between(item.get("start_date"), f"{now.year:04d}-{now.month:02d}")
            else:
                duration = _months_between(item.get("start_date"), item.get("end_date"))
        experiences.append(
            {
                "company": item.get("company"),
                "role": item.get("role_title"),
                "start_date": item.get("start_date"),
                "end_date": item.get("end_date"),
                "is_current": bool(item.get("is_current")),
                "duration_months": int(duration) if duration is not None else None,
                "description": item.get("description"),
                "is_leadership": False,
                "technologies": [],
            }
        )

    education: list[dict[str, Any]] = []
    highest_education_level = "none"
    highest_field: str | None = None
    for item in raw_education:
        degree = _normalize_degree(item.get("degree"))
        if degree and _EDUCATION_LEVEL_ORDER.get(degree, -1) > _EDUCATION_LEVEL_ORDER.get(
            highest_education_level, -1
        ):
            highest_education_level = degree
            highest_field = item.get("field")
        education.append(
            {
                "institution": item.get("institution"),
                "degree": degree or item.get("degree"),
                "field": item.get("field"),
                "graduation_year": None,
                "is_completed": item.get("end_date") is not None,
            }
        )

    skills: list[dict[str, Any]] = []
    for item in raw_skills:
        name = item.get("name")
        if not name:
            continue
        skills.append(
            {
                "name": name,
                "category": "other",
                "proficiency_level": item.get("proficiency") or "basic",
                "years_experience": None,
                "is_primary": False,
            }
        )
        keywords.append(str(name).strip())

    total_quality = _coerce_float(raw_quality.get("total"))
    if total_quality is not None and 0 <= total_quality <= 100:
        normalized_quality_total = _clamp_score(total_quality)
    else:
        normalized_quality_total = _clamp_score(
            sum(
                _coerce_float(raw_quality.get(field)) or 0.0
                for field in ("structure", "clarity", "professionalism", "completeness")
            )
        )

    communication_quality = {
        "structure": normalized_quality_total,
        "clarity": normalized_quality_total,
        "professionalism": normalized_quality_total,
        "completeness": normalized_quality_total,
    }

    employment_gaps = [
        {
            "from_date": gap.get("start_date"),
            "to_date": gap.get("end_date"),
            "duration_months": gap.get("duration_months"),
        }
        for gap in raw_gaps
        if gap.get("start_date") and gap.get("end_date") and gap.get("duration_months") is not None
    ]

    normalized = {
        "candidate": {
            "name": personal_info.get("name"),
            "email": personal_info.get("email"),
            "phone": personal_info.get("phone"),
            "location": personal_info.get("location"),
            "work_model": personal_info.get("work_model"),
            "linkedin_url": None,
            "github_url": None,
        },
        "summary": None,
        "total_experience_months": total_experience_months,
        "experiences": experiences,
        "employment_gaps": employment_gaps,
        "education": education,
        "highest_education_level": highest_education_level,
        "education_field_relevance": "medium",
        "certifications": [],
        "skills": skills,
        "skill_categories": sorted({skill["category"] for skill in skills}),
        "languages": raw_languages,
        "communication_quality": communication_quality,
        "leadership_indicators": {
            "has_management": bool(raw_leadership.get("has_management")),
            "has_project_lead": bool(raw_leadership.get("has_project_lead")),
            "has_mentoring": bool(raw_leadership.get("has_mentoring")),
            "has_cross_team": bool(raw_leadership.get("has_cross_team")),
        },
        "strengths": [],
        "weaknesses": [],
        "recommendations": [],
        "keywords": _dedupe_keywords([*raw_keywords, *keywords])[:15],
    }

    if highest_field and normalized["education"]:
        normalized["education"][0]["field"] = normalized["education"][0].get("field") or highest_field

    return normalized


def _canonicalize_analysis_data(data: dict[str, Any]) -> dict[str, Any]:
    if "personal_info" in data or "experience" in data or "cv_quality_score" in data:
        return _normalize_v2_data(data)
    return _normalize_current_data(data)


# ── Main entry ─────────────────────────────────────────────────────────────────

def parse_analysis_response(raw: str) -> dict[str, Any]:
    data = extract_json(raw)
    canonical = _canonicalize_analysis_data(data)

    months: int = int(canonical.get("total_experience_months") or 0)
    education_level: str | None = canonical.get("highest_education_level")
    skills: list[dict[str, Any]] = canonical.get("skills") or []
    comm: dict[str, Any] = canonical.get("communication_quality") or {}
    leadership: dict[str, Any] = canonical.get("leadership_indicators") or {}

    comm_score = _communication_score(comm)
    lead_score = _leadership_score(leadership)
    tech_score = _technical_score(skills)
    exp_score = _experience_score(months)
    edu_score = _education_score(education_level)

    has_leadership = bool(leadership.get("has_management") or leadership.get("has_project_lead"))
    seniority = _classify_seniority(months, has_leadership)

    overall = round(
        tech_score * 0.30
        + exp_score * 0.25
        + edu_score * 0.15
        + comm_score * 0.15
        + lead_score * 0.15,
        2,
    )

    education_list: list[dict[str, Any]] = canonical.get("education") or []
    highest_field: str | None = (
        education_list[0].get("field") if education_list else None
    )

    return {
        "overall_score": overall,
        "technical_score": round(tech_score, 2),
        "experience_score": round(exp_score, 2),
        "education_score": round(edu_score, 2),
        "communication_score": round(comm_score, 2),
        "leadership_score": round(lead_score, 2),
        "candidate_summary": canonical.get("summary"),
        "seniority_level": seniority,
        "total_experience_years": round(months / 12, 1) if months else None,
        "highest_education_level": education_level,
        "highest_education_field": highest_field,
        "strengths": (canonical.get("strengths") or [])[:5],
        "weaknesses": (canonical.get("weaknesses") or [])[:3],
        "recommendations": (canonical.get("recommendations") or [])[:3],
        "keywords": (canonical.get("keywords") or [])[:15],
        "extracted_data": canonical,
    }
