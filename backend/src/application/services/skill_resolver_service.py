from __future__ import annotations

from typing import Any

from src.application.services.skill_text_normalizer import (
    normalize_skill_name,
    normalize_skill_text,
)
from src.infrastructure.repositories.sqlalchemy_skill_repository import SQLAlchemySkillRepository


class SkillResolverService:
    def __init__(self, repository: SQLAlchemySkillRepository) -> None:
        self._repository = repository

    async def resolve_skill(self, raw_skill: str | None) -> dict[str, Any] | None:
        raw_value = raw_skill or ""
        normalized_value = normalize_skill_name(raw_value)
        if not normalized_value:
            return None

        exact = await self._find_exact_match(raw_value, normalized_value)
        if exact is not None:
            return {
                "skill_id": exact.id,
                "canonical_name": exact.name,
                "matched_by": "exact",
                "raw_value": raw_value,
                "normalized_value": normalized_value,
            }

        alias = await self._repository.find_active_by_alias_normalized_name(normalized_value)
        if alias is not None:
            return {
                "skill_id": alias.id,
                "canonical_name": alias.name,
                "matched_by": "alias",
                "raw_value": raw_value,
                "normalized_value": normalized_value,
            }

        return None

    async def resolve_many(self, raw_skills: list[str]) -> list[dict[str, Any]]:
        resolved_items: list[dict[str, Any]] = []
        seen_skill_ids: set[str] = set()

        for raw_skill in raw_skills:
            result = await self.resolve_skill(raw_skill)
            if result is None:
                continue

            skill_id = str(result["skill_id"])
            if skill_id in seen_skill_ids:
                continue

            seen_skill_ids.add(skill_id)
            resolved_items.append(result)

        return resolved_items

    async def _find_exact_match(self, raw_value: str, normalized_value: str):
        candidates = [
            normalized_value,
            normalize_skill_text(raw_value),
            normalized_value.replace(" ", "-"),
            normalized_value.replace(" ", "_"),
        ]

        seen: set[str] = set()
        for candidate in candidates:
            if not candidate or candidate in seen:
                continue
            seen.add(candidate)

            exact = await self._repository.find_active_by_normalized_name(candidate)
            if exact is not None:
                return exact

        return None
