from __future__ import annotations

from typing import Any, Literal

JobSkillPriorityLevel = Literal["priority", "complementary", "eliminatory"]

JOB_SKILL_PRIORITY_LEVELS: tuple[JobSkillPriorityLevel, ...] = (
    "priority",
    "complementary",
    "eliminatory",
)


def normalize_job_skill_priority_level(value: Any) -> JobSkillPriorityLevel:
    normalized = str(value or "").strip().lower()
    if normalized in JOB_SKILL_PRIORITY_LEVELS:
        return normalized  # type: ignore[return-value]
    raise ValueError(
        "priority_level must be one of: priority, complementary, eliminatory"
    )


def is_priority_skill(value: Any) -> bool:
    return normalize_job_skill_priority_level(value) == "priority"


def is_complementary_skill(value: Any) -> bool:
    return normalize_job_skill_priority_level(value) == "complementary"


def is_eliminatory_skill(value: Any) -> bool:
    return normalize_job_skill_priority_level(value) == "eliminatory"
