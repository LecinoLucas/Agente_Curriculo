from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.application.services.skill_normalizer_service import normalize_skill_name

SKILL_REQUIREMENT_LEVELS = (
    "critical_required",
    "core_required",
    "important",
    "nice_to_have",
)


def empty_skill_requirements() -> dict[str, list[str]]:
    return {level: [] for level in SKILL_REQUIREMENT_LEVELS}


def validate_skill_requirements(data: Any) -> dict[str, list[str]]:
    if not isinstance(data, dict):
        raise ValueError("skill_requirements must be an object")

    validated = empty_skill_requirements()
    seen: set[str] = set()

    for level in SKILL_REQUIREMENT_LEVELS:
        raw_items = data.get(level, [])
        if raw_items is None:
            raw_items = []
        if not isinstance(raw_items, list):
            raise ValueError(f"skill_requirements.{level} must be a list")

        cleaned_items: list[str] = []
        for raw_item in raw_items:
            cleaned = str(raw_item or "").strip()
            normalized = normalize_skill_name(cleaned)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            cleaned_items.append(cleaned)

        validated[level] = cleaned_items

    return validated


@dataclass
class SkillRequirementsProductValidationResult:
    sanitized: dict[str, list[str]]
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


_SOFT_SKILL_NAMES = {
    "comunicacao",
    "communication",
    "lideranca",
    "leadership",
    "teamwork",
    "trabalho em equipe",
    "colaboracao",
    "collaboration",
    "proatividade",
    "adaptabilidade",
    "organizacao",
    "organization",
    "resiliencia",
    "criatividade",
    "ownership",
    "empatia",
}

_DATA_CRITICAL_ERP_MARKERS = {
    "sap",
    "sap mm",
    "protheus",
    "totvs",
    "erp",
}


def validate_skill_requirements_product_rules(
    data: Any,
    *,
    job_area: str | None = None,
    check_raw_duplicates: bool = False,
) -> SkillRequirementsProductValidationResult:
    sanitized = validate_skill_requirements(data)
    errors: list[str] = []

    if check_raw_duplicates:
        duplicates = _find_cross_level_duplicates(data)
        for normalized_name, levels in duplicates:
            skill_label = _display_skill_name(data, normalized_name)
            levels_label = ", ".join(levels)
            errors.append(
                f"{skill_label} não pode aparecer em mais de um nível ({levels_label})."
            )

    critical_required = list(sanitized["critical_required"])
    core_required = list(sanitized["core_required"])
    important = list(sanitized["important"])
    nice_to_have = list(sanitized["nice_to_have"])
    total_skills = len(critical_required) + len(core_required) + len(important) + len(nice_to_have)

    if len(critical_required) > 3:
        errors.append("critical_required não pode ter mais de 3 skills.")

    if not critical_required and not core_required:
        errors.append("A vaga precisa ter pelo menos 1 skill em core_required ou critical_required.")

    if total_skills > 0 and (len(critical_required) / total_skills) > 0.40:
        errors.append("critical_required não pode representar mais de 40% do total de skills.")

    for skill_name in critical_required:
        normalized = normalize_skill_name(skill_name)
        if normalized in _SOFT_SKILL_NAMES:
            errors.append(f"{skill_name} não pode ser critical_required porque é soft skill.")

    normalized_area = normalize_skill_name(job_area)
    if normalized_area == "data":
        for skill_name in critical_required:
            normalized = normalize_skill_name(skill_name)
            normalized_tokens = set(normalized.split())
            if any(
                marker == normalized
                or marker in normalized_tokens
                or (marker != "erp" and marker in normalized)
                for marker in _DATA_CRITICAL_ERP_MARKERS
            ):
                errors.append(
                    f"{skill_name} não deve ser critical_required em vaga de dados. "
                    "Mova para important ou nice_to_have."
                )

    return SkillRequirementsProductValidationResult(
        sanitized=sanitized,
        errors=list(dict.fromkeys(errors)),
        warnings=[],
    )


def _find_cross_level_duplicates(data: Any) -> list[tuple[str, list[str]]]:
    if not isinstance(data, dict):
        return []

    occurrences: dict[str, list[str]] = {}
    for level in SKILL_REQUIREMENT_LEVELS:
        raw_items = data.get(level, [])
        if not isinstance(raw_items, list):
            continue
        for raw_item in raw_items:
            normalized = normalize_skill_name(str(raw_item or "").strip())
            if not normalized:
                continue
            levels = occurrences.setdefault(normalized, [])
            if level not in levels:
                levels.append(level)

    return [(name, levels) for name, levels in occurrences.items() if len(levels) > 1]


def _display_skill_name(data: Any, normalized_name: str) -> str:
    if not isinstance(data, dict):
        return normalized_name

    for level in SKILL_REQUIREMENT_LEVELS:
        raw_items = data.get(level, [])
        if not isinstance(raw_items, list):
            continue
        for raw_item in raw_items:
            cleaned = str(raw_item or "").strip()
            if normalize_skill_name(cleaned) == normalized_name:
                return cleaned
    return normalized_name
