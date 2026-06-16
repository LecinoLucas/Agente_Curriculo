"""Skill equivalence service for scoring partial matches without AI."""

from __future__ import annotations

import asyncio
import json
import functools
import threading
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile
from time import monotonic, perf_counter
from typing import Any

import structlog

from src.application.services.skill_catalog_comparison_service import (
    SkillCatalogComparisonService,
)
from src.application.services.skill_catalog_runtime_service import (
    SkillCatalogRuntimeService,
)
from src.application.services.skill_normalizer_service import (
    normalize_skill_text,
)
from src.core.settings import settings
from src.infrastructure.database.connection import create_celery_async_sessionmaker
from src.infrastructure.repositories.sqlalchemy_skill_catalog_repository import (
    SQLAlchemySkillCatalogRepository,
)

logger = structlog.get_logger(__name__)

# Process-wide singletons — intentionally shared across all SkillEquivalenceService
# instances (DB catalog cache + observability counters). Kept at module level to make
# the shared nature explicit and prevent accidental per-instance shadowing.
_DB_CACHE_TTL_SECONDS: int = 300
_db_cache_entry: "tuple[float, dict[str, Any], tuple[int, int, int]] | None" = None
_source_usage_totals: "dict[str, int]" = {
    "json": 0,
    "database": 0,
    "database_failed_fallback_json": 0,
}
_fallback_total: int = 0
_counter_lock = threading.Lock()


@dataclass(frozen=True, slots=True)
class SkillMatchEvidence:
    """Evidence of a skill match with strength and score."""

    matched: bool
    strength: str  # "exact" | "strong" | "partial" | "none"
    score: float  # 1.0 | 0.85-0.90 | 0.40-0.50 | 0.0
    reason: str
    source: str  # "exact" | "relation" | "group" | "none"


@dataclass(frozen=True, slots=True)
class _CatalogLoadResult:
    catalog: dict[str, Any]
    source: str
    skills_count: int
    aliases_count: int
    relations_count: int
    cache_used: bool
    duration_ms: float


class SkillEquivalenceService:
    """Service for evaluating skill equivalence with scoring."""

    def __init__(
        self,
        catalog_path: Path | None = None,
        *,
        catalog: dict[str, Any] | None = None,
        source: str = "json",
    ) -> None:
        self._catalog_path = catalog_path or self._default_catalog_path()
        self._catalog = catalog if catalog is not None else self._load_catalog(self._catalog_path)
        self._source = source

    @staticmethod
    def _default_catalog_path() -> Path:
        return Path(__file__).parent.parent.parent / "domain" / "catalogs" / "skill_equivalences.json"

    @staticmethod
    @functools.lru_cache(maxsize=1)
    def _load_catalog(catalog_path: Path) -> dict[str, Any]:
        """Load the skill equivalences catalog (cached once)."""
        try:
            with open(catalog_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            return {"version": "2026-05-v1", "groups": [], "relations": []}

    @classmethod
    def clear_catalog_cache(cls) -> None:
        global _db_cache_entry
        cls._load_catalog.cache_clear()
        _db_cache_entry = None

    @classmethod
    def reset_observability_counters(cls) -> None:
        global _source_usage_totals, _fallback_total
        with _counter_lock:
            _source_usage_totals = {
                "json": 0,
                "database": 0,
                "database_failed_fallback_json": 0,
            }
            _fallback_total = 0

    @classmethod
    def for_matching(cls, catalog_path: Path | None = None) -> "SkillEquivalenceService":
        source = settings.SKILL_CATALOG_SOURCE
        json_result = cls._load_json_catalog_with_stats(catalog_path)

        if source == "json":
            cls._maybe_log_catalog_comparison(json_result, catalog_path)
            cls._log_catalog_source(json_result)
            return cls(catalog_path, catalog=json_result.catalog, source=json_result.source)

        try:
            db_result = cls._load_database_catalog_with_stats()
            cls._maybe_log_catalog_comparison(json_result, catalog_path, db_result=db_result)
            cls._log_catalog_source(db_result)
            return cls(catalog_path, catalog=db_result.catalog, source=db_result.source)
        except Exception as exc:
            context = structlog.contextvars.get_contextvars()
            logger.warning(
                "skill_catalog.source=database_failed_fallback_json",
                requested_source="database",
                fallback_source="json",
                error=str(exc),
                exception_class=exc.__class__.__name__,
                correlation_id=context.get("correlation_id"),
                request_id=context.get("request_id"),
                operation="skill_catalog_load_for_matching",
                fallback_count=cls._peek_fallback_total() + 1,
                exc_info=True,
            )
            cls._maybe_log_catalog_comparison(json_result, catalog_path)
            fallback_result = _CatalogLoadResult(
                catalog=json_result.catalog,
                source="database_failed_fallback_json",
                skills_count=json_result.skills_count,
                aliases_count=json_result.aliases_count,
                relations_count=json_result.relations_count,
                cache_used=json_result.cache_used,
                duration_ms=json_result.duration_ms,
            )
            cls._log_catalog_source(fallback_result)
            return cls(catalog_path, catalog=json_result.catalog, source=fallback_result.source)

    @classmethod
    def _load_json_catalog_with_stats(
        cls,
        catalog_path: Path | None = None,
    ) -> _CatalogLoadResult:
        resolved_path = catalog_path or cls._default_catalog_path()
        before = cls._load_catalog.cache_info()
        started_at = perf_counter()
        catalog = cls._load_catalog(resolved_path)
        duration_ms = round((perf_counter() - started_at) * 1000, 2)
        after = cls._load_catalog.cache_info()
        skills_count, aliases_count, relations_count = cls._catalog_counts(catalog)
        return _CatalogLoadResult(
            catalog=catalog,
            source="json",
            skills_count=skills_count,
            aliases_count=aliases_count,
            relations_count=relations_count,
            cache_used=after.hits > before.hits,
            duration_ms=duration_ms,
        )

    @classmethod
    def _load_database_catalog_with_stats(cls) -> _CatalogLoadResult:
        global _db_cache_entry
        started_at = perf_counter()
        now = monotonic()
        cached = _db_cache_entry
        if cached is not None and cached[0] > now:
            catalog = cached[1]
            skills_count, aliases_count, relations_count = cached[2]
            return _CatalogLoadResult(
                catalog=catalog,
                source="database",
                skills_count=skills_count,
                aliases_count=aliases_count,
                relations_count=relations_count,
                cache_used=True,
                duration_ms=round((perf_counter() - started_at) * 1000, 2),
            )

        catalog, counts = cls._run_async_sync(cls._fetch_catalog_from_database())
        _db_cache_entry = (
            now + _DB_CACHE_TTL_SECONDS,
            catalog,
            counts,
        )
        return _CatalogLoadResult(
            catalog=catalog,
            source="database",
            skills_count=counts[0],
            aliases_count=counts[1],
            relations_count=counts[2],
            cache_used=False,
            duration_ms=round((perf_counter() - started_at) * 1000, 2),
        )

    @classmethod
    async def _fetch_catalog_from_database(
        cls,
    ) -> tuple[dict[str, Any], tuple[int, int, int]]:
        engine, session_factory = await create_celery_async_sessionmaker()
        try:
            async with session_factory() as session:
                repository = SQLAlchemySkillCatalogRepository(session)
                runtime_service = SkillCatalogRuntimeService(repository, ttl_seconds=300)
                snapshot = await runtime_service.get_runtime_snapshot(include_inactive=False)
                catalog = await runtime_service.get_legacy_compatible_catalog(include_inactive=False)
                return (
                    catalog,
                    (
                        snapshot.total_skills,
                        snapshot.total_aliases,
                        snapshot.total_relations,
                    ),
                )
        finally:
            await engine.dispose()

    @classmethod
    def _run_async_sync(cls, coro):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(coro)

        result: dict[str, Any] = {}
        error: dict[str, BaseException] = {}

        def _runner() -> None:
            try:
                result["value"] = asyncio.run(coro)
            except BaseException as exc:  # pragma: no cover - defensive thread boundary
                error["value"] = exc

        thread = threading.Thread(target=_runner, daemon=True)
        thread.start()
        thread.join()
        if "value" in error:
            raise error["value"]
        return result["value"]

    @classmethod
    def _maybe_log_catalog_comparison(
        cls,
        json_result: _CatalogLoadResult,
        catalog_path: Path | None = None,
        *,
        db_result: _CatalogLoadResult | None = None,
    ) -> None:
        if not settings.SKILL_CATALOG_COMPARE_ON_MATCH:
            return

        try:
            effective_db_result = db_result or cls._load_database_catalog_with_stats()
            comparison_service = SkillCatalogComparisonService()
            json_groups, json_relations = comparison_service.build_legacy_snapshot(
                json_result.catalog
            )
            db_groups, db_relations = comparison_service.build_legacy_snapshot(
                effective_db_result.catalog
            )
            report = comparison_service.compare(
                legacy_groups=json_groups,
                db_groups=db_groups,
                legacy_relations=json_relations,
                db_relations=db_relations,
            )
            logger.info(
                "skill_catalog.compare_on_match",
                requested_source=settings.SKILL_CATALOG_SOURCE,
                json_skills=json_result.skills_count,
                db_skills=effective_db_result.skills_count,
                missing_skills=report.summary["missing_skills_count"],
                extra_skills=report.summary["extra_skills_count"],
                missing_aliases=report.summary["missing_aliases_count"],
                extra_aliases=report.summary["extra_aliases_count"],
                conflicts=report.summary["conflicts_count"],
                metadata_gaps=report.summary["metadata_gaps_count"],
                equivalence_percent=report.summary["equivalence_percent"],
            )
        except Exception as exc:
            logger.exception(
                "skill_catalog.compare_on_match_failed",
                requested_source=settings.SKILL_CATALOG_SOURCE,
                catalog_path=str(catalog_path or cls._default_catalog_path()),
                error=str(exc),
            )

    @staticmethod
    def _catalog_counts(catalog: dict[str, Any]) -> tuple[int, int, int]:
        groups = list(catalog.get("groups", []) or [])
        relations = list(catalog.get("relations", []) or [])
        alias_count = 0
        for group in groups:
            canonical_norm = normalize_skill_text(group.get("canonical", ""))
            seen_aliases: set[str] = set()
            for alias in group.get("aliases", []) or []:
                normalized_alias = normalize_skill_text(alias)
                if not normalized_alias or normalized_alias == canonical_norm:
                    continue
                if normalized_alias in seen_aliases:
                    continue
                seen_aliases.add(normalized_alias)
            alias_count += len(seen_aliases)
        return len(groups), alias_count, len(relations)

    @staticmethod
    def _log_catalog_source(result: _CatalogLoadResult) -> None:
        usage_count, usage_totals, fallback_total = SkillEquivalenceService._register_source_usage(
            result.source
        )
        logger.info(
            f"skill_catalog.source={result.source}",
            source=result.source,
            skills_count=result.skills_count,
            aliases_count=result.aliases_count,
            relations_count=result.relations_count,
            cache_used=result.cache_used,
            load_duration_ms=result.duration_ms,
            usage_count=usage_count,
            source_usage_totals=usage_totals,
            fallback_total=fallback_total,
        )

    @classmethod
    def _register_source_usage(cls, source: str) -> tuple[int, dict[str, int], int]:
        global _fallback_total
        with _counter_lock:
            current = _source_usage_totals.get(source, 0) + 1
            _source_usage_totals[source] = current
            if source == "database_failed_fallback_json":
                _fallback_total += 1
            return current, dict(_source_usage_totals), _fallback_total

    @classmethod
    def _peek_fallback_total(cls) -> int:
        with _counter_lock:
            return _fallback_total

    def match_skill(
        self,
        candidate_skill: str,
        required_skill: str,
        domain: str | None = None,
    ) -> SkillMatchEvidence:
        """
        Evaluate how well a candidate skill matches a job requirement.

        Lookup order:
        1. Check exact string match (no normalization)
        2. Check relations in catalog (specific pairs with scored equivalences)
        3. Check groups in catalog (domain membership)
        4. No match

        Args:
            candidate_skill: The skill the candidate has
            required_skill: The skill the job requires
            domain: Optional domain context (not used yet, for future filtering)

        Returns:
            SkillMatchEvidence with matched status, strength, score, reason, and source
        """
        candidate_norm = normalize_skill_text(candidate_skill)
        required_norm = normalize_skill_text(required_skill)

        if not candidate_norm or not required_norm:
            return SkillMatchEvidence(
                matched=False,
                strength="none",
                score=0.0,
                reason="Invalid skill names (empty after normalization).",
                source="none",
            )

        # 1. Check strict exact match (identical after normalization)
        if candidate_norm == required_norm:
            return SkillMatchEvidence(
                matched=True,
                strength="exact",
                score=1.0,
                reason=f'"{candidate_skill}" = "{required_skill}" (match exato).',
                source="exact",
            )

        # 2. Check relations in catalog (explicit pairs with scores)
        for relation in self._catalog.get("relations", []) or []:
            from_norm = normalize_skill_text(relation.get("from", ""))
            to_norm = normalize_skill_text(relation.get("to", ""))

            if from_norm == candidate_norm and to_norm == required_norm:
                score = float(relation.get("score", 0.0))
                strength = relation.get("strength", "none")
                reason = relation.get("reason", "")
                return SkillMatchEvidence(
                    matched=score > 0.0,
                    strength=strength,
                    score=score,
                    reason=reason or f'"{candidate_skill}" → "{required_skill}" (score {score:.2f})',
                    source="relation",
                )

        # 3. Check groups (candidate and required both in same group)
        candidate_groups = self._find_skill_in_groups(candidate_skill)
        required_groups = self._find_skill_in_groups(required_skill)
        common_groups = candidate_groups & required_groups

        if common_groups:
            group_name = list(common_groups)[0]
            group = self._find_group_by_canonical(group_name)
            strength = self._resolve_group_match_strength_for_pair(
                group,
                candidate_norm=candidate_norm,
                required_norm=required_norm,
            )
            score = self._score_for_strength(strength)
            return SkillMatchEvidence(
                matched=True,
                strength=strength,
                score=score,
                reason=self._build_group_match_reason(
                    group_name,
                    candidate_norm=candidate_norm,
                    required_norm=required_norm,
                    strength=strength,
                    group=group,
                ),
                source="group",
            )

        return SkillMatchEvidence(
            matched=False,
            strength="none",
            score=0.0,
            reason=f'"{candidate_skill}" não corresponde a "{required_skill}".',
            source="none",
        )

    def _resolve_group_match_strength(self, group: dict[str, Any] | None) -> str:
        if not group:
            return "partial"
        raw_strength = str(group.get("strength") or "partial").strip().lower()
        group_type = normalize_skill_text(group.get("type") or "") or ""
        if group_type in {"area", "macro_area", "domain"}:
            return "weak"
        if group_type in {"category", "ecosystem"} and raw_strength == "strong":
            return "partial"
        return raw_strength

    def _resolve_group_match_strength_for_pair(
        self,
        group: dict[str, Any] | None,
        *,
        candidate_norm: str,
        required_norm: str,
    ) -> str:
        base_strength = self._resolve_group_match_strength(group)
        if not group:
            return base_strength

        canonical_norm = normalize_skill_text(group.get("canonical", ""))
        if not canonical_norm:
            return base_strength

        candidate_is_canonical = candidate_norm == canonical_norm
        required_is_canonical = required_norm == canonical_norm

        # Candidate with concrete specialization can satisfy a broad canonical
        # requirement with the group's base strength.
        if required_is_canonical and not candidate_is_canonical:
            return base_strength

        # Broad generic candidate skill must not satisfy a specific requirement
        # with the same weight as a direct specialization match.
        if candidate_is_canonical and not required_is_canonical:
            return self._downgrade_strength(base_strength)

        # Different siblings inside the same broad family should not match as
        # strong peers unless an explicit relation says so.
        if not candidate_is_canonical and not required_is_canonical:
            return self._downgrade_strength(base_strength)

        return base_strength

    @staticmethod
    def _downgrade_strength(strength: str) -> str:
        downgrade_map = {
            "exact": "strong",
            "strong": "partial",
            "partial": "weak",
            "weak": "weak",
            "none": "none",
        }
        return downgrade_map.get(strength, "partial")

    def _build_group_match_reason(
        self,
        group_name: str,
        *,
        candidate_norm: str,
        required_norm: str,
        strength: str,
        group: dict[str, Any] | None,
    ) -> str:
        canonical_norm = normalize_skill_text(group.get("canonical", "")) if group else ""
        candidate_is_canonical = candidate_norm == canonical_norm
        required_is_canonical = required_norm == canonical_norm

        if candidate_is_canonical and not required_is_canonical:
            return (
                f'Grupo "{group_name}": skill genérica não comprova a especialização '
                f'com força alta ({strength}).'
            )
        if not candidate_is_canonical and not required_is_canonical:
            return (
                f'Grupo "{group_name}": skills irmãs no mesmo grupo recebem match '
                f'reduzido sem relação explícita ({strength}).'
            )
        return f'Ambas são do grupo "{group_name}".'

    def _find_skill_in_groups(self, skill_name: str) -> set[str]:
        """Find which groups (canonical names) contain this skill."""
        skill_norm = normalize_skill_text(skill_name)
        groups = set()

        for group in self._catalog.get("groups", []):
            canonical_norm = normalize_skill_text(group.get("canonical", ""))
            if skill_norm == canonical_norm:
                groups.add(group.get("canonical", ""))
                continue

            aliases_norm = {
                normalize_skill_text(alias) for alias in group.get("aliases", []) if alias
            }
            if skill_norm in aliases_norm:
                groups.add(group.get("canonical", ""))

        return groups

    def list_groups(
        self,
        search: str | None = None,
        domain: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        search_norm = normalize_skill_text(search or "")
        domain_norm = normalize_skill_text(domain or "")
        groups = []

        for group in self._catalog.get("groups", []) or []:
            response = self._group_response(group)
            searchable = " ".join(
                [
                    response["canonical"],
                    response.get("type") or "",
                    " ".join(response["aliases"]),
                    " ".join(response["domains"]),
                ]
            )
            if search_norm and search_norm not in normalize_skill_text(searchable):
                continue
            if domain_norm and domain_norm not in {normalize_skill_text(item) for item in response["domains"]}:
                continue
            groups.append(response)

        return sorted(groups, key=lambda item: normalize_skill_text(item["canonical"]))[:limit]

    def get_group(self, group_id: str) -> dict[str, Any]:
        group = self._find_group_by_id(group_id)
        if group is None:
            raise SkillEquivalenceGroupNotFoundError
        return self._group_response(group)

    def create_group(self, payload: dict[str, Any]) -> dict[str, Any]:
        catalog = self._read_catalog_uncached()
        group = self._clean_group_payload(payload)
        groups = list(catalog.get("groups", []) or [])
        new_id = self._group_id(group["canonical"])
        if any(self._group_id(item.get("canonical", "")) == new_id for item in groups):
            raise SkillEquivalenceGroupConflictError

        groups.append(group)
        catalog["groups"] = groups
        self._write_catalog(catalog)
        return self._group_response(group)

    def update_group(self, group_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        catalog = self._read_catalog_uncached()
        groups = list(catalog.get("groups", []) or [])
        index = self._find_group_index(groups, group_id)
        if index is None:
            raise SkillEquivalenceGroupNotFoundError

        current = groups[index]
        old_terms = self._group_terms(current)
        merged = {
            "canonical": payload.get("canonical", current.get("canonical")),
            "aliases": payload.get("aliases", current.get("aliases", [])),
            "domain": payload.get("domains", current.get("domain", [])),
            "type": payload.get("type", current.get("type")),
            "strength": payload.get("strength", current.get("strength", "partial")),
        }
        updated = self._clean_group_payload(merged)
        updated_id = self._group_id(updated["canonical"])
        if any(i != index and self._group_id(item.get("canonical", "")) == updated_id for i, item in enumerate(groups)):
            raise SkillEquivalenceGroupConflictError

        groups[index] = updated
        catalog["groups"] = groups
        self._prune_removed_group_relations(catalog, old_terms, self._group_terms(updated))
        self._sync_same_group_relations(catalog, updated)
        self._write_catalog(catalog)
        return self._group_response(updated)

    def delete_group(self, group_id: str) -> None:
        catalog = self._read_catalog_uncached()
        groups = list(catalog.get("groups", []) or [])
        index = self._find_group_index(groups, group_id)
        if index is None:
            raise SkillEquivalenceGroupNotFoundError

        removed_terms = self._group_terms(groups[index])
        del groups[index]
        catalog["groups"] = groups
        catalog["relations"] = [
            relation
            for relation in catalog.get("relations", []) or []
            if normalize_skill_text(relation.get("from", "")) not in removed_terms
            and normalize_skill_text(relation.get("to", "")) not in removed_terms
        ]
        self._write_catalog(catalog)

    def _read_catalog_uncached(self) -> dict[str, Any]:
        try:
            with open(self._catalog_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            return {"version": "2026-05-v1", "description": "", "score_policy": {}, "groups": [], "relations": []}

    def _write_catalog(self, catalog: dict[str, Any]) -> None:
        self._catalog_path.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile("w", encoding="utf-8", dir=self._catalog_path.parent, delete=False) as tmp:
            json.dump(catalog, tmp, ensure_ascii=False, indent=2)
            tmp.write("\n")
            tmp_path = Path(tmp.name)
        tmp_path.replace(self._catalog_path)
        self.clear_catalog_cache()
        self._catalog = self._load_catalog(self._catalog_path)

    def _find_group_by_canonical(self, canonical: str) -> dict[str, Any] | None:
        canonical_id = self._group_id(canonical)
        for group in self._catalog.get("groups", []) or []:
            if self._group_id(group.get("canonical", "")) == canonical_id:
                return group
        return None

    def _find_group_by_id(self, group_id: str) -> dict[str, Any] | None:
        for group in self._catalog.get("groups", []) or []:
            if self._group_id(group.get("canonical", "")) == self._group_id(group_id):
                return group
        return None

    def _find_group_index(self, groups: list[dict[str, Any]], group_id: str) -> int | None:
        normalized_id = self._group_id(group_id)
        for index, group in enumerate(groups):
            if self._group_id(group.get("canonical", "")) == normalized_id:
                return index
        return None

    def _score_for_strength(self, strength: str) -> float:
        policy = self._catalog.get("score_policy", {}) or {}
        return self._score_for_strength_from_policy(policy, strength)

    @staticmethod
    def _score_for_strength_from_policy(policy: dict[str, Any], strength: str) -> float:
        default_scores = {
            "exact": 1.0,
            "strong": 0.85,
            "partial": 0.50,
            "weak": 0.25,
        }
        return float(policy.get(strength, default_scores.get(strength, 0.50)))

    @classmethod
    def _group_terms(cls, group: dict[str, Any]) -> set[str]:
        return {
            normalize_skill_text(value)
            for value in [group.get("canonical", ""), *cls._clean_text_list(group.get("aliases", []))]
            if normalize_skill_text(value)
        }

    @classmethod
    def _prune_removed_group_relations(
        cls,
        catalog: dict[str, Any],
        old_terms: set[str],
        new_terms: set[str],
    ) -> None:
        removed_terms = old_terms - new_terms
        if not removed_terms:
            return
        catalog["relations"] = [
            relation
            for relation in catalog.get("relations", []) or []
            if normalize_skill_text(relation.get("from", "")) not in removed_terms
            and normalize_skill_text(relation.get("to", "")) not in removed_terms
        ]

    @classmethod
    def _sync_same_group_relations(cls, catalog: dict[str, Any], group: dict[str, Any]) -> None:
        terms = cls._group_terms(group)
        if not terms:
            return

        strength = str(group.get("strength") or "partial")
        score = cls._score_for_strength_from_policy(catalog.get("score_policy", {}) or {}, strength)
        for relation in catalog.get("relations", []) or []:
            from_norm = normalize_skill_text(relation.get("from", ""))
            to_norm = normalize_skill_text(relation.get("to", ""))
            if from_norm in terms and to_norm in terms:
                relation["strength"] = strength
                relation["score"] = score

    @classmethod
    def _group_response(cls, group: dict[str, Any]) -> dict[str, Any]:
        canonical = str(group.get("canonical") or "").strip()
        return {
            "id": cls._group_id(canonical),
            "canonical": canonical,
            "aliases": cls._clean_text_list(group.get("aliases", [])),
            "domains": cls._clean_text_list(group.get("domain", [])),
            "type": str(group.get("type") or "").strip() or None,
            "strength": str(group.get("strength") or "partial").strip() or "partial",
        }

    @classmethod
    def _clean_group_payload(cls, payload: dict[str, Any]) -> dict[str, Any]:
        canonical = str(payload.get("canonical") or "").strip()
        if not canonical:
            raise InvalidSkillEquivalenceGroupError

        strength = str(payload.get("strength") or "partial").strip()
        if strength not in {"exact", "strong", "partial", "weak"}:
            raise InvalidSkillEquivalenceGroupError

        group_type = str(payload.get("type") or "").strip() or "skill"
        return {
            "canonical": canonical,
            "aliases": cls._clean_text_list(payload.get("aliases", [])),
            "domain": cls._clean_text_list(payload.get("domains", payload.get("domain", []))),
            "type": group_type,
            "strength": strength,
        }

    @staticmethod
    def _clean_text_list(values: Any) -> list[str]:
        if not isinstance(values, list):
            return []

        seen: set[str] = set()
        cleaned: list[str] = []
        for value in values:
            text = str(value or "").strip()
            key = normalize_skill_text(text)
            if not text or not key or key in seen:
                continue
            seen.add(key)
            cleaned.append(text)
        return cleaned

    @staticmethod
    def _group_id(value: str) -> str:
        return normalize_skill_text(value)


class SkillEquivalenceGroupNotFoundError(Exception):
    pass


class SkillEquivalenceGroupConflictError(Exception):
    pass


class InvalidSkillEquivalenceGroupError(Exception):
    pass
