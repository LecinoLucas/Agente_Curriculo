from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from src.application.services.skill_catalog_runtime_service import (
    SkillCatalogRuntimeSnapshot,
)
from src.application.services.skill_catalog_normalizer import normalize_skill_name

INVALID_LEGACY_ALIAS_RULES: dict[tuple[str, str], str] = {
    (".net", "js"): (
        "O alias legado mistura duas stacks sem equivalência semântica confiável."
    ),
}

ALIAS_INVERTED_RULES: dict[tuple[str, str], str] = {
    ("gcp", "google cloud platform"): (
        "O legado parece ter invertido canônica e alias; o termo extenso representa melhor a canônica."
    ),
}

RELATION_ALIAS_RULES: dict[tuple[str, str], str] = {
    ("spring boot", "spring"): (
        "Spring Boot é uma especialização técnica relacionada a Spring, não um alias textual puro."
    ),
}


@dataclass(frozen=True, slots=True)
class CatalogGroupSnapshot:
    canonical: str
    normalized_canonical: str
    aliases_by_normalized: dict[str, str]
    domains: tuple[str, ...]
    default_strength: str | None
    catalog_type: str | None


@dataclass(frozen=True, slots=True)
class CatalogRelationSnapshot:
    source_name: str
    normalized_source_name: str
    target_name: str
    normalized_target_name: str
    relation_type: str | None
    strength: str | None
    score: float | None
    reason: str | None


@dataclass(frozen=True, slots=True)
class AliasConflict:
    type: str
    alias: str
    json_canonical: str
    db_canonical: str
    impact: str
    suggestion: str
    resolution: str | None = None


@dataclass(frozen=True, slots=True)
class AliasDifference:
    alias: str
    canonical: str
    classification: str = "missing_alias"
    db_owner: str | None = None
    related_skill: str | None = None
    suggestion: str | None = None


@dataclass(frozen=True, slots=True)
class MetadataGap:
    gap_type: str
    canonical: str
    field: str
    json_value: Any
    db_value: Any


@dataclass(frozen=True, slots=True)
class SkillCatalogComparisonReport:
    summary: dict[str, Any]
    missing_skills: tuple[str, ...]
    extra_skills: tuple[str, ...]
    missing_aliases: tuple[AliasDifference, ...]
    extra_aliases: tuple[AliasDifference, ...]
    conflicts: tuple[AliasConflict, ...]
    metadata_gaps: tuple[MetadataGap, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "summary": self.summary,
            "missing_skills": list(self.missing_skills),
            "extra_skills": list(self.extra_skills),
            "missing_aliases": [asdict(item) for item in self.missing_aliases],
            "extra_aliases": [asdict(item) for item in self.extra_aliases],
            "conflicts": [asdict(item) for item in self.conflicts],
            "metadata_gaps": [asdict(item) for item in self.metadata_gaps],
        }


class SkillCatalogComparisonService:
    def load_legacy_catalog(self, path: Path) -> dict[str, Any]:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)

    def write_report(self, report: SkillCatalogComparisonReport, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as file:
            json.dump(report.to_json_dict(), file, ensure_ascii=False, indent=2)
            file.write("\n")

    def build_legacy_snapshot(
        self,
        catalog: dict[str, Any],
    ) -> tuple[dict[str, CatalogGroupSnapshot], tuple[CatalogRelationSnapshot, ...]]:
        groups: dict[str, CatalogGroupSnapshot] = {}
        relations: list[CatalogRelationSnapshot] = []

        for raw_group in catalog.get("groups", []) or []:
            canonical = str(raw_group.get("canonical") or "").strip()
            normalized_canonical = normalize_skill_name(canonical)
            if not normalized_canonical:
                continue

            aliases_by_normalized: dict[str, str] = {}
            for raw_alias in raw_group.get("aliases", []) or []:
                alias = str(raw_alias or "").strip()
                normalized_alias = normalize_skill_name(alias)
                if not normalized_alias or normalized_alias == normalized_canonical:
                    continue
                aliases_by_normalized.setdefault(normalized_alias, alias)

            domains = tuple(
                str(item).strip()
                for item in raw_group.get("domain", []) or []
                if str(item).strip()
            )
            default_strength = self._clean_optional_text(raw_group.get("strength"))
            catalog_type = self._clean_optional_text(raw_group.get("type"))

            groups[normalized_canonical] = CatalogGroupSnapshot(
                canonical=canonical,
                normalized_canonical=normalized_canonical,
                aliases_by_normalized=aliases_by_normalized,
                domains=domains,
                default_strength=default_strength,
                catalog_type=catalog_type,
            )

        for raw_relation in catalog.get("relations", []) or []:
            source_name = str(raw_relation.get("from") or "").strip()
            target_name = str(raw_relation.get("to") or "").strip()
            normalized_source_name = normalize_skill_name(source_name)
            normalized_target_name = normalize_skill_name(target_name)
            if not normalized_source_name or not normalized_target_name:
                continue

            relations.append(
                CatalogRelationSnapshot(
                    source_name=source_name,
                    normalized_source_name=normalized_source_name,
                    target_name=target_name,
                    normalized_target_name=normalized_target_name,
                    relation_type=self._clean_optional_text(raw_relation.get("type")),
                    strength=self._clean_optional_text(raw_relation.get("strength")),
                    score=(
                        float(raw_relation["score"])
                        if raw_relation.get("score") is not None
                        else None
                    ),
                    reason=self._clean_optional_text(raw_relation.get("reason")),
                )
            )

        return groups, tuple(relations)

    def build_db_snapshot(
        self,
        snapshot: SkillCatalogRuntimeSnapshot,
    ) -> tuple[dict[str, CatalogGroupSnapshot], tuple[CatalogRelationSnapshot, ...]]:
        groups: dict[str, CatalogGroupSnapshot] = {}
        for group in snapshot.groups:
            aliases_by_normalized = {
                normalized: alias
                for alias, normalized in zip(
                    group.aliases,
                    group.normalized_aliases,
                    strict=True,
                )
            }
            groups[group.normalized_canonical] = CatalogGroupSnapshot(
                canonical=group.canonical,
                normalized_canonical=group.normalized_canonical,
                aliases_by_normalized=aliases_by_normalized,
                domains=group.domains,
                default_strength=group.default_strength,
                catalog_type=group.catalog_type,
            )

        relations = tuple(
            CatalogRelationSnapshot(
                source_name=item.source_name,
                normalized_source_name=item.normalized_source_name,
                target_name=item.target_name,
                normalized_target_name=item.normalized_target_name,
                relation_type=item.relation_type,
                strength=item.strength,
                score=item.score,
                reason=item.reason,
            )
            for item in snapshot.relations
        )
        return groups, relations

    def compare(
        self,
        *,
        legacy_groups: dict[str, CatalogGroupSnapshot],
        db_groups: dict[str, CatalogGroupSnapshot],
        legacy_relations: tuple[CatalogRelationSnapshot, ...] = (),
        db_relations: tuple[CatalogRelationSnapshot, ...] = (),
    ) -> SkillCatalogComparisonReport:
        json_canonical_norms = set(legacy_groups.keys())
        db_canonical_norms = set(db_groups.keys())

        missing_skills = tuple(
            sorted(
                legacy_groups[key].canonical
                for key in (json_canonical_norms - db_canonical_norms)
            )
        )
        extra_skills = tuple(
            sorted(
                db_groups[key].canonical
                for key in (db_canonical_norms - json_canonical_norms)
            )
        )

        db_canonical_lookup = {
            group.normalized_canonical: group.canonical
            for group in db_groups.values()
        }
        db_alias_owner_lookup = {
            normalized_alias: group.canonical
            for group in db_groups.values()
            for normalized_alias in group.aliases_by_normalized
        }
        db_relation_lookup = self._build_relation_lookup(db_relations)
        conflicts: list[AliasConflict] = []
        missing_aliases: list[AliasDifference] = []
        extra_aliases: list[AliasDifference] = []
        metadata_gaps: list[MetadataGap] = []

        for normalized_canonical, legacy_group in legacy_groups.items():
            db_group = db_groups.get(normalized_canonical)
            db_aliases = (
                set(db_group.aliases_by_normalized.keys()) if db_group is not None else set()
            )

            for normalized_alias, alias in legacy_group.aliases_by_normalized.items():
                if normalized_alias in db_aliases:
                    continue
                conflicting_canonical = db_canonical_lookup.get(normalized_alias)
                if (
                    conflicting_canonical is not None
                    and normalize_skill_name(conflicting_canonical) != normalized_canonical
                ):
                    relation_resolution = self._classify_relation_resolution(
                        canonical=legacy_group.canonical,
                        alias=alias,
                        db_relations_lookup=db_relation_lookup,
                    )
                    conflict_type = (
                        "alias_should_be_relation"
                        if relation_resolution is not None
                        else "alias_is_canonical_skill"
                    )
                    conflicts.append(
                        AliasConflict(
                            type=conflict_type,
                            alias=alias,
                            json_canonical=legacy_group.canonical,
                            db_canonical=conflicting_canonical,
                            impact=(
                                relation_resolution
                                if relation_resolution is not None
                                else (
                                    "O termo já é skill canônica no banco e não pode ser adicionado "
                                    "como alias de outro grupo sem ambiguidade."
                                )
                            ),
                            suggestion=(
                                f"Manter {conflicting_canonical} como skill canônica e criar "
                                f"relação {legacy_group.canonical} -> {conflicting_canonical} "
                                "em vez de alias direto."
                            ),
                            resolution=(
                                "resolved_by_relation"
                                if relation_resolution is not None
                                else None
                            ),
                        )
                    )
                    continue
                classification = self._classify_missing_alias(
                    canonical=legacy_group.canonical,
                    alias=alias,
                    db_owner=db_alias_owner_lookup.get(normalized_alias),
                    db_relations_lookup=db_relation_lookup,
                )
                missing_aliases.append(
                    AliasDifference(
                        alias=alias,
                        canonical=legacy_group.canonical,
                        classification=classification["type"],
                        db_owner=classification["db_owner"],
                        related_skill=classification["related_skill"],
                        suggestion=classification["suggestion"],
                    )
                )

            if db_group is None:
                continue
            metadata_gaps.extend(self._compare_group_metadata(legacy_group, db_group))

        for normalized_canonical, db_group in db_groups.items():
            legacy_group = legacy_groups.get(normalized_canonical)
            legacy_aliases = (
                set(legacy_group.aliases_by_normalized.keys())
                if legacy_group is not None
                else set()
            )
            for normalized_alias, alias in db_group.aliases_by_normalized.items():
                if normalized_alias in legacy_aliases:
                    continue
                extra_aliases.append(
                    AliasDifference(alias=alias, canonical=db_group.canonical)
                )

        metadata_gaps.extend(self._compare_relations(legacy_relations, db_relations))

        json_alias_count = sum(
            len(group.aliases_by_normalized) for group in legacy_groups.values()
        )
        db_alias_count = sum(
            len(group.aliases_by_normalized) for group in db_groups.values()
        )
        matched_skills = len(json_canonical_norms & db_canonical_norms)
        matched_aliases = json_alias_count - len(missing_aliases) - len(conflicts)
        denominator = len(legacy_groups) + json_alias_count
        equivalence_percent = (
            round(((matched_skills + matched_aliases) / denominator) * 100, 2)
            if denominator
            else 100.0
        )

        summary = {
            "json_skill_count": len(legacy_groups),
            "db_skill_count": len(db_groups),
            "json_alias_count": json_alias_count,
            "db_alias_count": db_alias_count,
            "json_relation_count": len(legacy_relations),
            "db_relation_count": len(db_relations),
            "missing_skills_count": len(missing_skills),
            "extra_skills_count": len(extra_skills),
            "missing_aliases_count": len(missing_aliases),
            "extra_aliases_count": len(extra_aliases),
            "conflicts_count": len(conflicts),
            "metadata_gaps_count": len(metadata_gaps),
            "equivalence_percent": equivalence_percent,
            "missing_aliases_by_type": self._count_by_type(missing_aliases),
            "conflicts_by_type": self._count_by_type(conflicts),
            "resolved_by_relation_count": sum(
                1 for item in conflicts if item.resolution == "resolved_by_relation"
            ),
        }

        return SkillCatalogComparisonReport(
            summary=summary,
            missing_skills=missing_skills,
            extra_skills=extra_skills,
            missing_aliases=tuple(
                sorted(
                    missing_aliases,
                    key=lambda item: (
                        normalize_skill_name(item.canonical),
                        normalize_skill_name(item.alias),
                    ),
                )
            ),
            extra_aliases=tuple(
                sorted(
                    extra_aliases,
                    key=lambda item: (
                        normalize_skill_name(item.canonical),
                        normalize_skill_name(item.alias),
                    ),
                )
            ),
            conflicts=tuple(
                sorted(
                    conflicts,
                    key=lambda item: (
                        normalize_skill_name(item.json_canonical),
                        normalize_skill_name(item.alias),
                    ),
                )
            ),
            metadata_gaps=tuple(
                sorted(
                    metadata_gaps,
                    key=lambda item: (
                        item.gap_type,
                        normalize_skill_name(item.canonical),
                        item.field,
                    ),
                )
            ),
        )

    @staticmethod
    def _clean_optional_text(value: Any) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None

    def _compare_group_metadata(
        self,
        legacy_group: CatalogGroupSnapshot,
        db_group: CatalogGroupSnapshot,
    ) -> list[MetadataGap]:
        gaps: list[MetadataGap] = []

        if legacy_group.domains != db_group.domains:
            gaps.append(
                MetadataGap(
                    gap_type="group_metadata_mismatch",
                    canonical=legacy_group.canonical,
                    field="domain",
                    json_value=list(legacy_group.domains),
                    db_value=list(db_group.domains),
                )
            )

        if legacy_group.default_strength != db_group.default_strength:
            gaps.append(
                MetadataGap(
                    gap_type="group_metadata_mismatch",
                    canonical=legacy_group.canonical,
                    field="strength",
                    json_value=legacy_group.default_strength,
                    db_value=db_group.default_strength,
                )
            )

        if legacy_group.catalog_type != db_group.catalog_type:
            gaps.append(
                MetadataGap(
                    gap_type="group_metadata_mismatch",
                    canonical=legacy_group.canonical,
                    field="type",
                    json_value=legacy_group.catalog_type,
                    db_value=db_group.catalog_type,
                )
            )

        return gaps

    def _compare_relations(
        self,
        legacy_relations: tuple[CatalogRelationSnapshot, ...],
        db_relations: tuple[CatalogRelationSnapshot, ...],
    ) -> list[MetadataGap]:
        db_relation_map = {
            (
                relation.normalized_source_name,
                relation.normalized_target_name,
                relation.relation_type or "",
            ): relation
            for relation in db_relations
        }
        gaps: list[MetadataGap] = []

        for relation in legacy_relations:
            key = (
                relation.normalized_source_name,
                relation.normalized_target_name,
                relation.relation_type or "",
            )
            db_relation = db_relation_map.get(key)
            if db_relation is None:
                gaps.append(
                    MetadataGap(
                        gap_type="relation_missing",
                        canonical=relation.source_name,
                        field="relation",
                        json_value={
                            "from": relation.source_name,
                            "to": relation.target_name,
                            "type": relation.relation_type,
                            "strength": relation.strength,
                            "score": relation.score,
                            "reason": relation.reason,
                        },
                        db_value=None,
                    )
                )
                continue

            if relation.strength != db_relation.strength or relation.score != db_relation.score:
                gaps.append(
                    MetadataGap(
                        gap_type="relation_metadata_mismatch",
                        canonical=relation.source_name,
                        field="relation_strength_score",
                        json_value={
                            "strength": relation.strength,
                            "score": relation.score,
                        },
                        db_value={
                            "strength": db_relation.strength,
                            "score": db_relation.score,
                        },
                    )
                )

        return gaps

    @staticmethod
    def _build_relation_lookup(
        db_relations: tuple[CatalogRelationSnapshot, ...],
    ) -> set[tuple[str, str]]:
        pairs: set[tuple[str, str]] = set()
        for relation in db_relations:
            pairs.add(
                (relation.normalized_source_name, relation.normalized_target_name)
            )
        return pairs

    def _classify_relation_resolution(
        self,
        *,
        canonical: str,
        alias: str,
        db_relations_lookup: set[tuple[str, str]],
    ) -> str | None:
        normalized_canonical = normalize_skill_name(canonical)
        normalized_alias = normalize_skill_name(alias)
        if (
            (normalized_canonical, normalized_alias) in db_relations_lookup
            or (normalized_alias, normalized_canonical) in db_relations_lookup
            or (normalized_canonical, normalized_alias) in RELATION_ALIAS_RULES
        ):
            return (
                "O legado trata esse termo como alias, mas o catálogo atual o representa "
                "de forma mais segura como relation entre skill ampla e skill específica."
            )
        return None

    def _classify_missing_alias(
        self,
        *,
        canonical: str,
        alias: str,
        db_owner: str | None,
        db_relations_lookup: set[tuple[str, str]],
    ) -> dict[str, str | None]:
        normalized_canonical = normalize_skill_name(canonical)
        normalized_alias = normalize_skill_name(alias)
        rule_key = (normalized_canonical, normalized_alias)

        if rule_key in INVALID_LEGACY_ALIAS_RULES:
            return {
                "type": "invalid_legacy_alias",
                "db_owner": db_owner,
                "related_skill": db_owner,
                "suggestion": INVALID_LEGACY_ALIAS_RULES[rule_key],
            }
        if rule_key in ALIAS_INVERTED_RULES:
            return {
                "type": "alias_inverted",
                "db_owner": db_owner,
                "related_skill": db_owner,
                "suggestion": ALIAS_INVERTED_RULES[rule_key],
            }
        if (
            rule_key in RELATION_ALIAS_RULES
            or (normalized_canonical, normalized_alias) in db_relations_lookup
            or (normalized_alias, normalized_canonical) in db_relations_lookup
        ):
            return {
                "type": "alias_should_be_relation",
                "db_owner": db_owner,
                "related_skill": db_owner or alias,
                "suggestion": RELATION_ALIAS_RULES.get(
                    rule_key,
                    "O termo está melhor representado por relation do que por alias direto.",
                ),
            }
        if db_owner is not None:
            return {
                "type": "duplicate_ownership",
                "db_owner": db_owner,
                "related_skill": db_owner,
                "suggestion": "O alias já pertence a outra skill e exige decisão manual de ownership.",
            }
        return {
            "type": "missing_alias",
            "db_owner": None,
            "related_skill": None,
            "suggestion": None,
        }

    @staticmethod
    def _count_by_type(items: list[Any]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for item in items:
            item_type = getattr(item, "type", None) or getattr(item, "classification", None)
            if item_type is None:
                continue
            counts[item_type] = counts.get(item_type, 0) + 1
        return counts
