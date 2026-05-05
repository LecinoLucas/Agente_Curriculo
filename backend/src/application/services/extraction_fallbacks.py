from __future__ import annotations

import re
import unicodedata
from datetime import date
from typing import Any

from src.application.services.skill_normalizer_service import normalize_skill_text

_ROLE_KEYWORDS = (
    "analista",
    "analyst",
    "engineer",
    "engenheiro",
    "developer",
    "desenvolvedor",
    "consultant",
    "consultor",
    "dba",
    "scientist",
    "coordinator",
    "coordenador",
    "specialist",
    "especialista",
)

_RESUME_SKILL_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\bpower\s*bi\b", "Power BI"),
    (r"\bdax\b", "DAX"),
    (r"\bpython\b", "Python"),
    (r"\betl\b", "ETL"),
    (r"\bssis\b", "SSIS"),
    (r"\bmicrosoft\s+sql\s+server\b|\bsql\s*server\b|\bmssql\b", "SQL Server"),
    (r"\bpostgres(?:ql)?\b", "PostgreSQL"),
    (r"\bsql\b", "SQL"),
    (r"\bbi\s+analyst\b", "BI Analyst"),
    (r"\bdata\s+analyst\b", "Data Analyst"),
    (r"\bbi\s+consultant\b", "BI Consultant"),
    (r"\bdba\b", "DBA"),
    (r"\bdashboards?\b", "dashboards"),
    (r"\berp\s+protheus\b|\bprotheus\b", "ERP Protheus"),
)

_JOB_REQUIRED_SKILL_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\bsql\b", "SQL"),
    (r"\bpower\s*bi\b", "Power BI"),
    (r"\bexcel(?:\s+avancado|\s+avançado)?\b", "Excel"),
    (r"\bsap\b.{0,10}\bmm\b|\bsap\s*-\s*modulo\s*mm\b|\bsap\s*mm\b", "SAP MM"),
    (r"\bbpmn\b|\bbizagi\b", "BPMN"),
    (r"\bkpis?\b.{0,40}\bsupply\s+chain\b|\bsupply\s+chain\b.{0,40}\bkpis?\b", "KPIs Supply Chain"),
)

_JOB_OPTIONAL_SKILL_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\btableau\b", "Tableau"),
    (r"\bpython\b", "Python"),
    (r"\br\b", "R"),
    (r"\bdashboards?\b", "dashboards"),
)

_CORE_REQUIRED_JOB_SKILLS = {
    normalize_skill_text("SQL"),
    normalize_skill_text("Power BI"),
    normalize_skill_text("Excel"),
}

_DEFAULT_IMPORTANT_JOB_SKILLS = {
    normalize_skill_text("SAP MM"),
    normalize_skill_text("BPMN"),
    normalize_skill_text("KPIs Supply Chain"),
}

_MANDATORY_CONTEXT_MARKERS = (
    "obrigatorio",
    "obrigatória",
    "obrigatorio",
    "imprescindivel",
    "imprescindível",
    "must have",
    "required",
    "necessario",
    "necessária",
    "necessario",
    "dominio de",
    "domínio de",
    "habilidade em",
    "proficiencia em",
    "proficiência em",
)

_OPTIONAL_CONTEXT_MARKERS = (
    "desejavel",
    "desejável",
    "diferencial",
    "nice to have",
    "plus",
    "vivencia com",
    "vivência com",
    "conhecimento em",
    "nocoes de",
    "noções de",
    "ou similares",
    "sera um diferencial",
    "será um diferencial",
    "certificacao",
    "certificação",
)

_MONTH_NAMES = {
    "janeiro": 1,
    "fevereiro": 2,
    "marco": 3,
    "março": 3,
    "abril": 4,
    "maio": 5,
    "junho": 6,
    "julho": 7,
    "agosto": 8,
    "setembro": 9,
    "outubro": 10,
    "novembro": 11,
    "dezembro": 12,
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}


def enrich_analysis_result_fields(result_fields: dict[str, Any], resume_text: str) -> dict[str, Any]:
    enriched = dict(result_fields)
    extracted = dict(enriched.get("extracted_data") or {})
    raw_skill_payload = extracted.get("skills") if isinstance(extracted.get("skills"), list) else []

    inferred_education = infer_education_level(resume_text)
    inferred_years = infer_experience_years(resume_text)
    inferred_role = infer_current_role(resume_text)
    inferred_level = infer_role_seniority(resume_text, inferred_role)
    merged_skills = merge_skill_names(
        _extract_skill_names(raw_skill_payload),
        list(enriched.get("keywords") or []),
        infer_resume_skills(resume_text),
    )

    if inferred_education and _is_missing_education(enriched.get("highest_education_level")):
        enriched["highest_education_level"] = inferred_education
    if inferred_years is not None and enriched.get("total_experience_years") is None:
        enriched["total_experience_years"] = inferred_years
    if inferred_level and _is_missing_level(enriched.get("seniority_level")):
        enriched["seniority_level"] = inferred_level

    if inferred_role and not extracted.get("current_role"):
        extracted["current_role"] = inferred_role
    if inferred_education and _is_missing_education(extracted.get("education_level")):
        extracted["education_level"] = inferred_education
    if inferred_years is not None and extracted.get("total_experience_years") is None:
        extracted["total_experience_years"] = inferred_years
        extracted["total_experience_months"] = int(round(inferred_years * 12))
    if inferred_level and _is_missing_level(extracted.get("detected_level")):
        extracted["detected_level"] = inferred_level
    if merged_skills:
        extracted["skills"] = _build_skill_payload(raw_skill_payload, merged_skills)
        enriched["keywords"] = merged_skills[:15]

    if enriched.get("education_score") in {None, 0, 0.0} and enriched.get("highest_education_level"):
        enriched["education_score"] = _derive_education_score(str(enriched["highest_education_level"]))
    if enriched.get("experience_score") in {None, 0, 0.0} and enriched.get("total_experience_years") is not None:
        enriched["experience_score"] = _derive_experience_score(float(enriched["total_experience_years"]))

    enriched["extracted_data"] = extracted
    return enriched


def infer_education_level(text: str) -> str | None:
    normalized = _normalize_text(text)
    if not normalized:
        return None
    if any(marker in normalized for marker in ("doutorado", "phd", "doctorate")):
        return "phd"
    if any(marker in normalized for marker in ("mestrado", "master of", "master ", "mestre")):
        return "master"
    if any(marker in normalized for marker in ("mba", "pos graduacao", "pós graduação", "especializacao", "especialização", "postgraduate")):
        return "postgraduate"
    if any(marker in normalized for marker in ("bacharelado", "bachelor", "graduacao", "graduação", "ensino superior")):
        return "bachelor"
    if any(marker in normalized for marker in ("tecnico", "técnico", "tecnologo", "tecnólogo")):
        return "technical"
    if any(marker in normalized for marker in ("ensino medio", "ensino médio", "high school")):
        return "high_school"
    return None


def infer_experience_years(text: str, *, today: date | None = None) -> float | None:
    normalized = text or ""
    duration_years = _extract_duration_years(normalized)
    if duration_years is not None:
        return duration_years
    estimated = _estimate_years_from_ranges(normalized, today=today)
    if estimated is not None:
        return estimated
    return None


def infer_current_role(text: str) -> str | None:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    in_experience = False
    for line in lines:
        normalized = _normalize_text(line)
        if any(marker in normalized for marker in ("experiencia", "experiência", "experience")):
            in_experience = True
            continue
        if in_experience and _looks_like_role(line):
            return line
    for line in lines[:12]:
        if _looks_like_role(line):
            return line
    return None


def infer_role_seniority(text: str, current_role: str | None = None) -> str | None:
    normalized = _normalize_text(f"{current_role or ''} {text or ''}")
    if re.search(r"\bprincipal\b", normalized):
        return "principal"
    if re.search(r"\blead\b|\btech lead\b|\bcoordenador\b|\bgerente\b", normalized):
        return "lead"
    if re.search(r"\bsenior\b|\bseniora\b|\bsênior\b", normalized):
        return "senior"
    if re.search(r"\bpleno\b|\bmid\b", normalized):
        return "mid"
    if re.search(r"\bjunior\b|\bjúnior\b", normalized):
        return "junior"
    if re.search(r"\bestagio\b|\bestágio\b|\bintern\b", normalized):
        return "intern"
    return None


def infer_resume_skills(text: str) -> list[str]:
    return _collect_pattern_hits(text, _RESUME_SKILL_PATTERNS)


def infer_job_required_skills(*, title: str | None, description: str | None, requirements: str | None, responsibilities: str | None, experience_context: str | None) -> list[str]:
    required, _ = _infer_job_skill_buckets(
        title=title,
        description=description,
        requirements=requirements,
        responsibilities=responsibilities,
        experience_context=experience_context,
    )
    return required


def infer_job_nice_to_have_skills(*, title: str | None, description: str | None, requirements: str | None, responsibilities: str | None, experience_context: str | None) -> list[str]:
    _, optional = _infer_job_skill_buckets(
        title=title,
        description=description,
        requirements=requirements,
        responsibilities=responsibilities,
        experience_context=experience_context,
    )
    return optional


def merge_skill_names(*skill_lists: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for skills in skill_lists:
        for skill in skills:
            text = str(skill).strip()
            key = normalize_skill_text(text)
            if not text or not key or key in seen:
                continue
            seen.add(key)
            merged.append(text)
    return merged


def _extract_skill_names(payload: list[Any]) -> list[str]:
    names: list[str] = []
    for item in payload:
        if isinstance(item, dict) and item.get("name"):
            names.append(str(item.get("name")).strip())
        elif isinstance(item, str):
            names.append(item.strip())
    return [item for item in names if item]


def _build_skill_payload(existing_payload: list[Any], merged_skill_names: list[str]) -> list[dict[str, Any]]:
    existing_by_name: dict[str, dict[str, Any]] = {}
    for item in existing_payload:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        existing_by_name[normalize_skill_text(name)] = dict(item)

    payload: list[dict[str, Any]] = []
    for name in merged_skill_names:
        key = normalize_skill_text(name)
        base = existing_by_name.get(key, {})
        payload.append(
            {
                "id": base.get("id") or _skill_id_from_name(name),
                "name": name,
                "source": base.get("source") or "skill_mention",
                "evidence": list(base.get("evidence") or []),
                "confidence": base.get("confidence") or "medium",
            }
        )
    return payload


def _skill_id_from_name(name: str) -> str:
    key = normalize_skill_text(name)
    key = re.sub(r"[^\w]+", "_", key).strip("_")
    return key or "skill"


def _derive_education_score(level: str) -> float:
    mapping = {
        "none": 0.0,
        "high_school": 30.0,
        "technical": 55.0,
        "bachelor": 80.0,
        "postgraduate": 88.0,
        "master": 94.0,
        "phd": 100.0,
    }
    return mapping.get(level, 0.0)


def _derive_experience_score(years: float) -> float:
    if years >= 10:
        return 100.0
    if years >= 7:
        return 90.0
    if years >= 5:
        return 80.0
    if years >= 3:
        return 65.0
    if years >= 1:
        return 50.0
    return 30.0


def _is_missing_education(value: Any) -> bool:
    return value is None or str(value).strip().lower() in {"", "none", "null"}


def _is_missing_level(value: Any) -> bool:
    return value is None or str(value).strip().lower() in {"", "undefined", "null"}


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_only = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", ascii_only).strip().lower()


def _looks_like_role(line: str) -> bool:
    normalized = _normalize_text(line)
    if not normalized or len(line) > 120:
        return False
    if "linkedin" in normalized or "@" in line or "page " in normalized:
        return False
    if re.search(r"\b(19|20)\d{2}\b", normalized):
        return False
    return any(keyword in normalized for keyword in _ROLE_KEYWORDS)


def _extract_duration_years(text: str) -> float | None:
    values: list[float] = []
    for years, months in re.findall(r"(\d{1,2})\s+anos?(?:\s+(\d{1,2})\s+mes(?:es)?)?", _normalize_text(text)):
        value = float(years) + (float(months) / 12.0 if months else 0.0)
        if 0 < value <= 50:
            values.append(round(value, 1))
    return max(values) if values else None


def _estimate_years_from_ranges(text: str, *, today: date | None = None) -> float | None:
    today = today or date.today()
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    active = False
    durations: list[float] = []
    for line in lines:
        normalized = _normalize_text(line)
        if any(marker in normalized for marker in ("experiencia", "experiência", "experience")):
            active = True
            continue
        if not active:
            continue
        duration = _duration_from_line(line, today=today)
        if duration is not None:
            durations.append(duration)
        if len(durations) >= 6:
            break
    return max(durations) if durations else None


def _duration_from_line(line: str, *, today: date) -> float | None:
    normalized = _normalize_text(line)
    year_matches = re.findall(r"\b(19|20)\d{2}\b", normalized)
    if len(year_matches) >= 2:
        years = [int(match) for match in re.findall(r"\b((?:19|20)\d{2})\b", normalized)]
        start_year, end_year = years[0], years[1]
        if end_year < start_year:
            return None
        return round((end_year - start_year) + 0.5, 1)

    match = re.search(
        r"(?P<month>[a-zçãé]+)?\s*(?:de\s+)?(?P<year>(?:19|20)\d{2})\s*-\s*(?P<end>present|current|atual|presente)",
        normalized,
    )
    if match:
        month = _MONTH_NAMES.get(match.group("month") or "", 1)
        year = int(match.group("year"))
        months = (today.year - year) * 12 + (today.month - month)
        if months > 0:
            return round(months / 12.0, 1)
    return None


def _collect_pattern_hits(text: str, patterns: tuple[tuple[str, str], ...]) -> list[str]:
    normalized = _normalize_text(text)
    hits: list[str] = []
    seen: set[str] = set()
    for pattern, canonical in patterns:
        key = normalize_skill_text(canonical)
        if key in seen:
            continue
        for match in re.finditer(pattern, normalized, re.IGNORECASE):
            if _is_negated_skill_mention(normalized, match.start()):
                continue
            hits.append(canonical)
            seen.add(key)
            break
    return hits


def _infer_job_skill_buckets(
    *,
    title: str | None,
    description: str | None,
    requirements: str | None,
    responsibilities: str | None,
    experience_context: str | None,
) -> tuple[list[str], list[str]]:
    sections = [
        ("title", title or ""),
        ("description", description or ""),
        ("requirements", requirements or ""),
        ("responsibilities", responsibilities or ""),
        ("experience_context", experience_context or ""),
    ]

    required_candidates = _collect_job_skill_contexts(sections, _JOB_REQUIRED_SKILL_PATTERNS)
    optional_candidates = _collect_job_skill_contexts(sections, _JOB_OPTIONAL_SKILL_PATTERNS)

    required: list[str] = []
    optional: list[str] = []
    optional_keys: set[str] = set()
    required_keys: set[str] = set()

    for skill_name, contexts in required_candidates.items():
        bucket = _classify_job_skill_bucket(skill_name, contexts)
        key = normalize_skill_text(skill_name)
        if bucket == "required":
            required.append(skill_name)
            required_keys.add(key)
        else:
            optional.append(skill_name)
            optional_keys.add(key)

    for skill_name in optional_candidates:
        key = normalize_skill_text(skill_name)
        if key in required_keys or key in optional_keys:
            continue
        optional.append(skill_name)
        optional_keys.add(key)

    if not required:
        promoted = _promote_required_fallback(required_candidates, optional_candidates)
        if promoted is not None:
            promoted_key = normalize_skill_text(promoted)
            required.append(promoted)
            required_keys.add(promoted_key)
            optional = [item for item in optional if normalize_skill_text(item) != promoted_key]

    return required, optional


def _collect_job_skill_contexts(
    sections: list[tuple[str, str]],
    patterns: tuple[tuple[str, str], ...],
) -> dict[str, list[tuple[str, str]]]:
    hits: dict[str, list[tuple[str, str]]] = {}
    seen_by_section: set[tuple[str, str]] = set()
    for section_name, text in sections:
        normalized = _normalize_text(text)
        if not normalized:
            continue
        for pattern, canonical in patterns:
            key = normalize_skill_text(canonical)
            if (section_name, key) in seen_by_section:
                continue
            for match in re.finditer(pattern, normalized, re.IGNORECASE):
                if _is_negated_skill_mention(normalized, match.start()):
                    continue
                context = normalized[max(0, match.start() - 96):min(len(normalized), match.end() + 96)]
                hits.setdefault(canonical, []).append((section_name, context))
                seen_by_section.add((section_name, key))
                break
    return hits


def _classify_job_skill_bucket(skill_name: str, contexts: list[tuple[str, str]]) -> str:
    key = normalize_skill_text(skill_name)
    has_requirements_section = any(section == "requirements" for section, _ in contexts)
    has_title_section = any(section == "title" for section, _ in contexts)
    has_mandatory_marker = any(
        any(marker in context for marker in _MANDATORY_CONTEXT_MARKERS)
        for _, context in contexts
    )
    has_optional_marker = any(
        any(marker in context for marker in _OPTIONAL_CONTEXT_MARKERS)
        for _, context in contexts
    )

    if key in _CORE_REQUIRED_JOB_SKILLS and (has_requirements_section or has_title_section or has_mandatory_marker):
        return "required"
    if has_mandatory_marker and not has_optional_marker:
        return "required"
    if key in _DEFAULT_IMPORTANT_JOB_SKILLS:
        return "optional"
    if has_optional_marker:
        return "optional"
    if has_requirements_section:
        return "required"
    return "optional"


def _promote_required_fallback(
    required_candidates: dict[str, list[tuple[str, str]]],
    optional_candidates: dict[str, list[tuple[str, str]]],
) -> str | None:
    for skill_name in required_candidates:
        if normalize_skill_text(skill_name) in _CORE_REQUIRED_JOB_SKILLS:
            return skill_name
    if required_candidates:
        return next(iter(required_candidates))
    if optional_candidates:
        return next(iter(optional_candidates))
    return None


def _is_negated_skill_mention(normalized_text: str, match_start: int) -> bool:
    prefix = normalized_text[max(0, match_start - 48):match_start].strip()
    if not prefix:
        return False

    negation_patterns = (
        r"(?:no evidence of|without|lack of|lacks?|missing|sem|nao|not)(?:\s+\w+){0,5}\s*$",
        r"(?:sem experiencia com|nao possui|nao tem|not experienced with)(?:\s+\w+){0,5}\s*$",
        r"(?:ausencia de|falta de)(?:\s+\w+){0,5}\s*$",
    )
    return any(re.search(pattern, prefix) for pattern in negation_patterns)
