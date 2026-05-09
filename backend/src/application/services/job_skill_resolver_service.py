from __future__ import annotations

from dataclasses import dataclass, field

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.skill_equivalence_service import SkillEquivalenceService
from src.application.services.skill_text_normalizer import normalize_skill_text
from src.infrastructure.database.models.job_model import SkillModel
from src.interface.api.schemas.job_schemas import BulkImportJobSkillRequest


@dataclass(slots=True)
class ResolvedJobSkill:
    request: BulkImportJobSkillRequest
    skill: SkillModel


@dataclass(slots=True)
class JobSkillResolutionResult:
    resolved: list[ResolvedJobSkill] = field(default_factory=list)
    unresolved: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    resolved_skill_names: list[str] = field(default_factory=list)


class JobSkillResolverService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._catalog_loaded = False
        self._direct: dict[str, SkillModel] = {}

    async def resolve_many(self, skills: list[BulkImportJobSkillRequest]) -> JobSkillResolutionResult:
        await self._ensure_catalog()
        result = JobSkillResolutionResult()
        seen_ids: set[str] = set()
        seen_keys: set[str] = set()

        for raw_skill in skills:
            normalized = normalize_skill_text(raw_skill.name)
            if not normalized:
                result.unresolved.append(raw_skill.name)
                continue

            resolved = self._resolve_one(normalized)
            if resolved is None:
                result.unresolved.append(raw_skill.name)
                continue

            dedupe_key = resolved.normalized_name
            if str(resolved.id) in seen_ids or dedupe_key in seen_keys:
                result.warnings.append(f"Skill duplicada no payload ignorada: {resolved.name}.")
                continue

            seen_ids.add(str(resolved.id))
            seen_keys.add(dedupe_key)
            canonical_request = BulkImportJobSkillRequest(
                name=resolved.name,
                is_mandatory=raw_skill.is_mandatory,
                minimum_level=raw_skill.minimum_level,
                minimum_years=raw_skill.minimum_years,
                weight=raw_skill.weight,
            )
            result.resolved.append(ResolvedJobSkill(request=canonical_request, skill=resolved))
            result.resolved_skill_names.append(resolved.name)

        return result

    async def _ensure_catalog(self) -> None:
        if self._catalog_loaded:
            return

        for group in SkillEquivalenceService().list_groups(limit=500):
            canonical_name = group["canonical"]
            canonical_key = normalize_skill_text(canonical_name)
            canonical_skill = await self._ensure_active_skill(canonical_name, canonical_key)
            self._add_lookup(canonical_name, canonical_skill, self._direct)
            for alias in group["aliases"]:
                self._add_lookup(alias, canonical_skill, self._direct)

        self._catalog_loaded = True

    async def _ensure_active_skill(self, name: str, normalized_name: str) -> SkillModel:
        skill = await self._session.scalar(
            sa.select(SkillModel).where(
                SkillModel.normalized_name == normalized_name,
                SkillModel.deleted_at.is_(None),
            )
        )
        if skill is not None:
            return skill

        skill = SkillModel(name=name, normalized_name=normalized_name)
        self._session.add(skill)
        await self._session.flush()
        await self._session.refresh(skill)
        return skill

    @staticmethod
    def _add_lookup(raw: str | None, skill: SkillModel, target: dict[str, SkillModel]) -> None:
        normalized = normalize_skill_text(raw or "")
        if normalized and normalized not in target:
            target[normalized] = skill

    def _resolve_one(self, normalized: str) -> SkillModel | None:
        return self._direct.get(normalized)
