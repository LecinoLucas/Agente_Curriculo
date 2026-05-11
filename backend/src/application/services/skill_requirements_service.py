from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.application.services.skill_normalizer_service import normalize_skill_name

PRIMARY_SKILL_REQUIREMENT_LEVELS = (
    "priority",
    "complementary",
    "eliminatory",
)

SKILL_REQUIREMENT_LEVELS = PRIMARY_SKILL_REQUIREMENT_LEVELS


def empty_skill_requirements() -> dict[str, list[str]]:
    return {
        "priority": [],
        "complementary": [],
        "eliminatory": [],
    }


def _raw_items_for_level(data: dict[str, Any], level: str) -> list[Any]:
    raw_items = data.get(level, [])
    if raw_items is None:
        return []
    if not isinstance(raw_items, list):
        raise ValueError(f"skill_requirements.{level} must be a list")
    return raw_items


def validate_skill_requirements(data: Any) -> dict[str, list[str]]:
    if not isinstance(data, dict):
        raise ValueError("skill_requirements must be an object")

    unexpected_levels = sorted(set(data.keys()) - set(SKILL_REQUIREMENT_LEVELS))
    if unexpected_levels:
        raise ValueError(
            "skill_requirements contains unsupported levels: "
            + ", ".join(unexpected_levels)
        )

    validated = empty_skill_requirements()
    seen: set[str] = set()
    for public_level in PRIMARY_SKILL_REQUIREMENT_LEVELS:
        cleaned_items: list[str] = []
        for raw_item in _raw_items_for_level(data, public_level):
            cleaned = str(raw_item or "").strip()
            normalized = normalize_skill_name(cleaned)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            cleaned_items.append(cleaned)
        validated[public_level] = cleaned_items

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


def validate_skill_requirements_product_rules(
    data: Any,
    *,
    job_area: str | None = None,
    check_raw_duplicates: bool = False,
) -> SkillRequirementsProductValidationResult:
    del job_area
    sanitized = validate_skill_requirements(data)
    errors: list[str] = []
    warnings: list[str] = []

    if check_raw_duplicates:
        duplicates = _find_cross_level_duplicates(data)
        for normalized_name, levels in duplicates:
            skill_label = _display_skill_name(data, normalized_name)
            levels_label = ", ".join(levels)
            errors.append(
                f"{skill_label} não pode aparecer em mais de um nível ({levels_label})."
            )

    priority_skills = list(sanitized["priority"])
    complementary_skills = list(sanitized["complementary"])
    eliminatory_skills = list(sanitized["eliminatory"])

    if not priority_skills and not eliminatory_skills:
        errors.append("A vaga precisa ter pelo menos 1 skill essencial ou eliminatória.")

    if len(priority_skills) < 2:
        warnings.append("A vaga fica mais precisa com pelo menos 2 skills essenciais.")

    if len(priority_skills) > 5:
        warnings.append(
            "Muitas skills essenciais podem deixar o ranking restritivo. Considere mover algumas para diferenciais."
        )

    if len(eliminatory_skills) > 3:
        errors.append("Critérios eliminatórios de skill não podem ter mais de 3 itens.")

    for skill_name in eliminatory_skills:
        normalized = normalize_skill_name(skill_name)
        if normalized in _SOFT_SKILL_NAMES:
            errors.append(f"{skill_name} não pode ser eliminatória porque é soft skill.")

    return SkillRequirementsProductValidationResult(
        sanitized=sanitized,
        errors=list(dict.fromkeys(errors)),
        warnings=list(dict.fromkeys(warnings)),
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
