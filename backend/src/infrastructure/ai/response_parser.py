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


# ── Main entry ─────────────────────────────────────────────────────────────────

def parse_analysis_response(raw: str) -> dict[str, Any]:
    data = extract_json(raw)

    months: int = int(data.get("total_experience_months") or 0)
    education_level: str | None = data.get("highest_education_level")
    skills: list[dict[str, Any]] = data.get("skills") or []
    comm: dict[str, Any] = data.get("communication_quality") or {}
    leadership: dict[str, Any] = data.get("leadership_indicators") or {}

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

    education_list: list[dict[str, Any]] = data.get("education") or []
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
        "candidate_summary": data.get("summary"),
        "seniority_level": seniority,
        "total_experience_years": round(months / 12, 1) if months else None,
        "highest_education_level": education_level,
        "highest_education_field": highest_field,
        "strengths": (data.get("strengths") or [])[:5],
        "weaknesses": (data.get("weaknesses") or [])[:3],
        "recommendations": (data.get("recommendations") or [])[:3],
        "keywords": (data.get("keywords") or [])[:15],
        "extracted_data": data,
    }
