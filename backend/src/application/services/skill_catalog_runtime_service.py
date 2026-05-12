from __future__ import annotations

from dataclasses import dataclass
from time import monotonic
from typing import Any, Callable

import structlog

from src.application.services.skill_catalog_normalizer import normalize_skill_name
from src.infrastructure.database.models.skill_catalog_model import (
    SkillCatalogModel,
    SkillRelationModel,
)
from src.infrastructure.repositories.sqlalchemy_skill_catalog_repository import (
    SQLAlchemySkillCatalogRepository,
)

logger = structlog.get_logger(__name__)

DEFAULT_SCORE_POLICY: dict[str, float] = {
    "exact": 1.0,
    "strong": 0.85,
    "partial": 0.5,
    "weak": 0.25,
}


@dataclass(frozen=True, slots=True)
class SkillCatalogRuntimeGroup:
    canonical: str
    normalized_canonical: str
    aliases: tuple[str, ...]
    normalized_aliases: tuple[str, ...]
    domains: tuple[str, ...]
    default_strength: str | None
    catalog_type: str | None
    is_active: bool


@dataclass(frozen=True, slots=True)
class SkillCatalogRuntimeRelation:
    source_name: str
    normalized_source_name: str
    target_name: str
    normalized_target_name: str
    relation_type: str | None
    strength: str | None
    score: float | None
    reason: str | None
    source_canonical: str | None
    target_canonical: str | None


@dataclass(frozen=True, slots=True)
class SkillCatalogRuntimeSnapshot:
    groups: tuple[SkillCatalogRuntimeGroup, ...]
    relations: tuple[SkillCatalogRuntimeRelation, ...]
    canonical_to_aliases: dict[str, tuple[str, ...]]
    normalized_canonical_to_aliases: dict[str, tuple[str, ...]]
    total_skills: int
    total_aliases: int
    total_relations: int
    include_inactive: bool


@dataclass(slots=True)
class _CacheEntry:
    expires_at: float
    snapshot: SkillCatalogRuntimeSnapshot


class SkillCatalogRuntimeService:
    """Read the DB-backed skill catalog in a matching-friendly format.

    This service is intentionally read-only for now. It does not replace the
    legacy JSON catalog in runtime matching yet.
    """

    def __init__(
        self,
        repository: SQLAlchemySkillCatalogRepository,
        *,
        ttl_seconds: int = 300,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self._repository = repository
        self._ttl_seconds = ttl_seconds
        self._clock = clock or monotonic
        self._cache: dict[bool, _CacheEntry] = {}

    async def get_runtime_snapshot(
        self,
        *,
        include_inactive: bool = False,
    ) -> SkillCatalogRuntimeSnapshot:
        now = self._clock()
        cached = self._cache.get(include_inactive)
        if cached is not None and cached.expires_at > now:
            return cached.snapshot

        snapshot = await self._load_snapshot(include_inactive=include_inactive)
        self._cache[include_inactive] = _CacheEntry(
            expires_at=now + self._ttl_seconds,
            snapshot=snapshot,
        )
        return snapshot

    async def get_skill_equivalence_map_from_db(
        self,
        *,
        include_inactive: bool = False,
    ) -> dict[str, list[str]]:
        snapshot = await self.get_runtime_snapshot(include_inactive=include_inactive)
        return {
            canonical: list(aliases)
            for canonical, aliases in snapshot.canonical_to_aliases.items()
        }

    async def get_legacy_compatible_catalog(
        self,
        *,
        include_inactive: bool = False,
    ) -> dict[str, Any]:
        snapshot = await self.get_runtime_snapshot(include_inactive=include_inactive)
        return {
            "version": "db-runtime-preview-v1",
            "description": (
                "Catálogo derivado do banco para futura migração do matching. "
                "Serve apenas como preview do catálogo persistido; o matching oficial "
                "continua usando o JSON legado."
            ),
            "score_policy": dict(DEFAULT_SCORE_POLICY),
            "groups": [
                {
                    "canonical": group.canonical,
                    "aliases": list(group.aliases),
                    "domain": list(group.domains),
                    "type": group.catalog_type or "skill",
                    "strength": group.default_strength or "partial",
                }
                for group in snapshot.groups
            ],
            "relations": [
                {
                    "from": relation.source_name,
                    "to": relation.target_name,
                    "type": relation.relation_type,
                    "strength": relation.strength,
                    "score": relation.score,
                    "reason": relation.reason,
                }
                for relation in snapshot.relations
            ],
        }

    def invalidate_skill_catalog_cache(self) -> None:
        self._cache.clear()
        logger.info("skill_catalog_runtime_cache_invalidated")

    async def refresh_skill_catalog_cache(
        self,
        *,
        include_inactive: bool = False,
    ) -> SkillCatalogRuntimeSnapshot:
        self._cache.pop(include_inactive, None)
        snapshot = await self.get_runtime_snapshot(include_inactive=include_inactive)
        logger.info(
            "skill_catalog_runtime_cache_refreshed",
            include_inactive=include_inactive,
            total_skills=snapshot.total_skills,
            total_aliases=snapshot.total_aliases,
            total_relations=snapshot.total_relations,
        )
        return snapshot

    async def _load_snapshot(
        self,
        *,
        include_inactive: bool,
    ) -> SkillCatalogRuntimeSnapshot:
        skills = await self._repository.list_runtime_skills(
            include_inactive=include_inactive,
        )
        relation_models = await self._repository.list_runtime_relations()
        groups: list[SkillCatalogRuntimeGroup] = []
        canonical_to_aliases: dict[str, tuple[str, ...]] = {}
        normalized_canonical_to_aliases: dict[str, tuple[str, ...]] = {}

        for skill in skills:
            group = self._build_group(skill)
            groups.append(group)
            canonical_to_aliases[group.canonical] = group.aliases
            normalized_canonical_to_aliases[group.normalized_canonical] = (
                group.normalized_aliases
            )

        relations = [
            self._build_relation(relation_model)
            for relation_model in relation_models
        ]

        snapshot = SkillCatalogRuntimeSnapshot(
            groups=tuple(
                sorted(groups, key=lambda item: item.normalized_canonical)
            ),
            relations=tuple(
                sorted(
                    relations,
                    key=lambda item: (
                        item.normalized_source_name,
                        item.normalized_target_name,
                        item.relation_type or "",
                    ),
                )
            ),
            canonical_to_aliases=canonical_to_aliases,
            normalized_canonical_to_aliases=normalized_canonical_to_aliases,
            total_skills=len(groups),
            total_aliases=sum(len(group.aliases) for group in groups),
            total_relations=len(relations),
            include_inactive=include_inactive,
        )
        logger.info(
            "skill_catalog_runtime_loaded_from_db",
            include_inactive=include_inactive,
            total_skills=snapshot.total_skills,
            total_aliases=snapshot.total_aliases,
            total_relations=snapshot.total_relations,
        )
        return snapshot

    @staticmethod
    def _build_group(skill: SkillCatalogModel) -> SkillCatalogRuntimeGroup:
        seen_aliases: set[str] = set()
        alias_pairs: list[tuple[str, str]] = []

        canonical = skill.name.strip()
        normalized_canonical = normalize_skill_name(canonical)

        for alias in skill.aliases:
            raw_alias = alias.alias.strip()
            normalized_alias = normalize_skill_name(raw_alias)
            if not raw_alias or not normalized_alias:
                continue
            if normalized_alias == normalized_canonical:
                continue
            if normalized_alias in seen_aliases:
                continue
            seen_aliases.add(normalized_alias)
            alias_pairs.append((raw_alias, normalized_alias))

        alias_pairs.sort(key=lambda item: item[1])
        return SkillCatalogRuntimeGroup(
            canonical=canonical,
            normalized_canonical=normalized_canonical,
            aliases=tuple(alias for alias, _ in alias_pairs),
            normalized_aliases=tuple(normalized for _, normalized in alias_pairs),
            domains=tuple(str(item).strip() for item in (skill.domains or []) if str(item).strip()),
            default_strength=(skill.default_strength.strip() if skill.default_strength else None),
            catalog_type=(skill.catalog_type.strip() if skill.catalog_type else None),
            is_active=skill.is_active,
        )

    @staticmethod
    def _build_relation(relation: SkillRelationModel) -> SkillCatalogRuntimeRelation:
        return SkillCatalogRuntimeRelation(
            source_name=relation.source_name,
            normalized_source_name=relation.normalized_source_name,
            target_name=relation.target_name,
            normalized_target_name=relation.normalized_target_name,
            relation_type=relation.relation_type,
            strength=relation.strength,
            score=relation.score,
            reason=relation.reason,
            source_canonical=(
                relation.source_skill.name.strip()
                if relation.source_skill is not None
                else None
            ),
            target_canonical=(
                relation.target_skill.name.strip()
                if relation.target_skill is not None
                else None
            ),
        )
