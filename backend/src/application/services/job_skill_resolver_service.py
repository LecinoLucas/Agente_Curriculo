from __future__ import annotations

from dataclasses import dataclass, field

from src.application.services.skill_text_normalizer import normalize_skill_text
from src.infrastructure.database.models.job_model import SkillModel
from src.infrastructure.repositories.sqlalchemy_skill_repository import SQLAlchemySkillRepository
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
    _CONTROLLED_EQUIVALENCES = {
        "postgresql": "sql",
        "postgres": "sql",
        "mysql": "sql",
        "sql server": "sql",
        "mssql": "sql",
        "t sql": "sql",
        "t-sql": "sql",
        "apis rest": "api rest",
        "api rest": "api rest",
        "rest api": "api rest",
        "rest apis": "api rest",
        "ci cd": "ci/cd",
        "cicd": "ci/cd",
    }

    def __init__(self, repository: SQLAlchemySkillRepository) -> None:
        self._repository = repository
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

        skills = await self._repository.list_all_active()
        for skill in skills:
            self._add_lookup(skill.normalized_name, skill, self._direct)
            self._add_lookup(skill.name, skill, self._direct)
            for alias in skill.aliases or []:
                self._add_lookup(alias, skill, self._direct)

        self._catalog_loaded = True

    @staticmethod
    def _add_lookup(raw: str | None, skill: SkillModel, target: dict[str, SkillModel]) -> None:
        normalized = normalize_skill_text(raw or "")
        if normalized and normalized not in target:
            target[normalized] = skill

    def _resolve_one(self, normalized: str) -> SkillModel | None:
        direct = self._direct.get(normalized)
        if direct is not None:
            return direct

        normalized_key = " ".join(normalized.replace("(", " ").replace(")", " ").split())
        equivalent_key = self._CONTROLLED_EQUIVALENCES.get(normalized_key)
        if equivalent_key is None:
            return None

        return self._direct.get(equivalent_key)
