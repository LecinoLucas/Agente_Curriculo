from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import structlog

from src.application.services.skill_catalog_normalizer import normalize_skill_name
from src.infrastructure.database.models.skill_catalog_model import (
    SkillAliasModel,
    SkillCatalogModel,
    SkillRelationModel,
)
from src.infrastructure.repositories.sqlalchemy_skill_catalog_repository import (
    SQLAlchemySkillCatalogRepository,
)

logger = structlog.get_logger(__name__)

MANUAL_ALIAS_REASSIGNMENTS: dict[tuple[str, str], str] = {
    ("gcp", "google cloud platform"): "gcp",
    ("typescript", "ts"): "typescript",
    ("monitoring", "monitoramento"): "monitoring",
}

MANUAL_RELATION_RESOLUTION_RULES: tuple[dict[str, object], ...] = (
    {
        "source": "Backend",
        "target": "Python",
        "strength": "strong",
        "score": 0.9,
        "reason": "Python representa uma skill específica frequentemente associada ao domínio Backend.",
    },
    {
        "source": "Data Science",
        "target": "Machine Learning",
        "strength": "strong",
        "score": 0.9,
        "reason": "Machine Learning representa uma especialização recorrente dentro de Data Science.",
    },
    {
        "source": "Frontend",
        "target": "JavaScript",
        "strength": "strong",
        "score": 0.9,
        "reason": "JavaScript representa uma skill base frequentemente associada ao domínio Frontend.",
    },
    {
        "source": "Spring Boot",
        "target": "Spring",
        "strength": "strong",
        "score": 0.8,
        "reason": "Spring Boot representa uma especialização técnica relacionada ao ecossistema Spring.",
    },
)


@dataclass(frozen=True, slots=True)
class SkillCatalogSyncConflict:
    type: str
    canonical: str | None
    alias: str | None
    db_skill: str | None
    detail: str
    suggestion: str | None = None


@dataclass(frozen=True, slots=True)
class SkillCatalogSyncResult:
    skills_created: int
    skills_updated: int
    skills_skipped: int
    aliases_created: int
    aliases_existing: int
    aliases_skipped: int
    relations_created: int
    relations_updated: int
    relations_skipped: int
    conflicts: tuple[SkillCatalogSyncConflict, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "skills_created": self.skills_created,
            "skills_updated": self.skills_updated,
            "skills_skipped": self.skills_skipped,
            "aliases_created": self.aliases_created,
            "aliases_existing": self.aliases_existing,
            "aliases_skipped": self.aliases_skipped,
            "relations_created": self.relations_created,
            "relations_updated": self.relations_updated,
            "relations_skipped": self.relations_skipped,
            "conflicts": [asdict(item) for item in self.conflicts],
        }


class SkillCatalogSyncService:
    def __init__(self, repository: SQLAlchemySkillCatalogRepository) -> None:
        self._repository = repository

    def load_catalog(self, path: Path) -> dict[str, Any]:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)

    async def sync_catalog(self, catalog: dict[str, Any]) -> SkillCatalogSyncResult:
        conflicts: list[SkillCatalogSyncConflict] = []
        skills_created = 0
        skills_updated = 0
        skills_skipped = 0
        aliases_created = 0
        aliases_existing = 0
        aliases_skipped = 0
        relations_created = 0
        relations_updated = 0
        relations_skipped = 0

        groups = list(catalog.get("groups", []) or [])
        relations = list(catalog.get("relations", []) or [])
        group_index = self._build_group_index(groups)
        canonical_index = self._build_canonical_index(groups)

        for raw_group in groups:
            canonical = str(raw_group.get("canonical") or "").strip()
            normalized_canonical = normalize_skill_name(canonical)
            if not normalized_canonical:
                continue

            skill, created, updated, skill_conflicts = await self._sync_group(raw_group)
            conflicts.extend(skill_conflicts)
            if skill is None:
                skills_skipped += 1
                continue
            if created:
                skills_created += 1
            elif updated:
                skills_updated += 1

            group_aliases_created, group_aliases_existing, group_aliases_skipped, alias_conflicts = (
                await self._sync_aliases(skill, raw_group, canonical_index=canonical_index)
            )
            aliases_created += group_aliases_created
            aliases_existing += group_aliases_existing
            aliases_skipped += group_aliases_skipped
            conflicts.extend(alias_conflicts)

        for raw_relation in relations:
            created, updated, skipped, relation_conflicts = await self._sync_relation(
                raw_relation,
                group_index=group_index,
            )
            relations_created += int(created)
            relations_updated += int(updated)
            relations_skipped += int(skipped)
            conflicts.extend(relation_conflicts)

        for relation_rule in MANUAL_RELATION_RESOLUTION_RULES:
            if not self._should_apply_manual_relation_rule(
                relation_rule=relation_rule,
                group_index=group_index,
            ):
                continue
            created, updated, skipped = await self._ensure_relation(
                source_name=str(relation_rule["source"]),
                target_name=str(relation_rule["target"]),
                relation_type=None,
                strength=self._clean_optional_text(relation_rule.get("strength")),
                score=(
                    float(relation_rule["score"])
                    if relation_rule.get("score") is not None
                    else None
                ),
                reason=self._clean_optional_text(relation_rule.get("reason")),
            )
            relations_created += int(created)
            relations_updated += int(updated)
            relations_skipped += int(skipped)

        logger.info(
            "skill_catalog_sync_completed",
            skills_created=skills_created,
            skills_updated=skills_updated,
            aliases_created=aliases_created,
            relations_created=relations_created,
            conflicts=len(conflicts),
        )

        return SkillCatalogSyncResult(
            skills_created=skills_created,
            skills_updated=skills_updated,
            skills_skipped=skills_skipped,
            aliases_created=aliases_created,
            aliases_existing=aliases_existing,
            aliases_skipped=aliases_skipped,
            relations_created=relations_created,
            relations_updated=relations_updated,
            relations_skipped=relations_skipped,
            conflicts=tuple(conflicts),
        )

    async def _sync_group(
        self,
        raw_group: dict[str, Any],
    ) -> tuple[SkillCatalogModel | None, bool, bool, list[SkillCatalogSyncConflict]]:
        conflicts: list[SkillCatalogSyncConflict] = []
        canonical = str(raw_group.get("canonical") or "").strip()
        normalized_canonical = normalize_skill_name(canonical)
        existing_skill = await self._repository.find_by_normalized_name(normalized_canonical)

        if existing_skill is None:
            existing_alias = await self._repository.find_by_normalized_alias(
                normalized_canonical
            )
            if existing_alias is not None:
                conflicts.append(
                    SkillCatalogSyncConflict(
                        type="canonical_is_existing_alias",
                        canonical=canonical,
                        alias=canonical,
                        db_skill=existing_alias.skill.name if existing_alias.skill else None,
                        detail=(
                            "A skill canônica do JSON já existe como alias em outra skill do banco. "
                            "A skill canônica será criada sem remover o alias legado."
                        ),
                        suggestion=(
                            f"Revisar manualmente a relação entre {canonical} e "
                            f"{existing_alias.skill.name if existing_alias.skill else 'a skill de origem'} "
                            "para decidir se o alias legado deve virar relation."
                        ),
                    )
                )

            skill = SkillCatalogModel(
                name=canonical,
                normalized_name=normalized_canonical,
                domains=self._clean_domains(raw_group.get("domain", [])),
                default_strength=self._clean_optional_text(raw_group.get("strength")),
                catalog_type=self._clean_optional_text(raw_group.get("type")),
                is_active=True,
            )
            created = await self._repository.create_skill_with_aliases(skill, [])
            return created, True, False, conflicts

        updated = self._apply_safe_group_metadata_updates(
            existing_skill,
            raw_group,
            conflicts,
        )
        if updated:
            existing_skill = await self._repository.update_skill(existing_skill)
        return existing_skill, False, updated, conflicts

    async def _sync_aliases(
        self,
        skill: SkillCatalogModel,
        raw_group: dict[str, Any],
        *,
        canonical_index: dict[str, str],
    ) -> tuple[int, int, int, list[SkillCatalogSyncConflict]]:
        created = 0
        existing = 0
        skipped = 0
        conflicts: list[SkillCatalogSyncConflict] = []

        normalized_canonical = skill.normalized_name
        aliases = raw_group.get("aliases", []) or []
        for raw_alias in aliases:
            alias = str(raw_alias or "").strip()
            normalized_alias = normalize_skill_name(alias)
            if not normalized_alias or normalized_alias == normalized_canonical:
                continue
            canonical_conflict = canonical_index.get(normalized_alias)
            if canonical_conflict is not None and canonical_conflict != skill.name:
                skipped += 1
                conflicts.append(
                    SkillCatalogSyncConflict(
                        type="alias_is_legacy_canonical_skill",
                        canonical=skill.name,
                        alias=alias,
                        db_skill=canonical_conflict,
                        detail="O alias do JSON também é skill canônica em outro grupo legado.",
                        suggestion=(
                            f"Manter {canonical_conflict} como skill canônica e representar "
                            f"a ligação com {skill.name} por relation, não por alias."
                        ),
                    )
                )
                continue

            conflict_skill = await self._repository.find_by_normalized_name(normalized_alias)
            if conflict_skill is not None and conflict_skill.id != skill.id:
                skipped += 1
                conflicts.append(
                    SkillCatalogSyncConflict(
                        type="alias_is_canonical_skill",
                        canonical=skill.name,
                        alias=alias,
                        db_skill=conflict_skill.name,
                        detail="O alias do JSON já é skill canônica no banco.",
                        suggestion=(
                            f"Manter {conflict_skill.name} como skill canônica e representar "
                            f"a ligação com {skill.name} por relation, não por alias."
                        ),
                    )
                )
                continue

            conflict_alias = await self._repository.find_by_normalized_alias(normalized_alias)
            if conflict_alias is not None:
                if self._should_reassign_alias(
                    canonical=skill.name,
                    alias=alias,
                    current_owner=(
                        conflict_alias.skill.name if conflict_alias.skill is not None else None
                    ),
                ):
                    await self._repository.reassign_alias(conflict_alias, skill)
                    existing += 1
                    continue
                if conflict_alias.skill_id == skill.id:
                    existing += 1
                else:
                    skipped += 1
                    conflicts.append(
                        SkillCatalogSyncConflict(
                            type="alias_exists_in_other_skill",
                            canonical=skill.name,
                            alias=alias,
                            db_skill=(
                                conflict_alias.skill.name if conflict_alias.skill is not None else None
                            ),
                            detail="O alias já pertence a outra skill do banco.",
                            suggestion="Revisar manualmente antes de mover o alias.",
                        )
                    )
                continue

            await self._repository.create_skill_with_aliases(
                skill,
                [
                    SkillAliasModel(
                        skill_id=skill.id,
                        alias=alias,
                        normalized_alias=normalized_alias,
                    )
                ],
            )
            created += 1

        return created, existing, skipped, conflicts

    async def _sync_relation(
        self,
        raw_relation: dict[str, Any],
        *,
        group_index: dict[str, dict[str, Any]],
    ) -> tuple[bool, bool, bool, list[SkillCatalogSyncConflict]]:
        conflicts: list[SkillCatalogSyncConflict] = []
        source_name = str(raw_relation.get("from") or "").strip()
        target_name = str(raw_relation.get("to") or "").strip()
        relation_type = self._clean_optional_text(raw_relation.get("type"))
        normalized_source_name = normalize_skill_name(source_name)
        normalized_target_name = normalize_skill_name(target_name)
        if not normalized_source_name or not normalized_target_name:
            return False, False, True, conflicts

        source_group = self._resolve_group_for_term(normalized_source_name, group_index)
        source_skill = None
        if source_group is not None:
            source_skill = await self._repository.find_by_normalized_name(
                source_group["normalized_canonical"]
            )
        if source_group is None:
            conflicts.append(
                SkillCatalogSyncConflict(
                    type="relation_source_unresolved",
                    canonical=source_name,
                    alias=None,
                    db_skill=None,
                    detail=(
                        "Não foi possível determinar a skill de origem da relation no legado. "
                        "A relation será persistida apenas com o nome textual."
                    ),
                    suggestion="Revisar manualmente se o termo de origem deveria virar skill canônica.",
                )
            )
        elif source_skill is None:
            conflicts.append(
                SkillCatalogSyncConflict(
                    type="relation_source_skill_missing",
                    canonical=source_group["canonical"],
                    alias=source_name,
                    db_skill=None,
                    detail=(
                        "A relation referencia uma skill de origem que não existe no banco. "
                        "A relation será persistida sem vínculo de source_skill_id."
                    ),
                    suggestion="Executar sync novamente após resolver a skill canônica ausente, se necessário.",
                )
            )

        target_group = self._resolve_group_for_term(normalized_target_name, group_index)
        target_skill = None
        if target_group is not None:
            target_skill = await self._repository.find_by_normalized_name(
                target_group["normalized_canonical"]
            )
        if target_skill is None:
            target_skill = await self._repository.find_by_normalized_name(
                normalized_target_name
            )

        relation = await self._repository.find_relation(
            normalized_source_name=normalized_source_name,
            normalized_target_name=normalized_target_name,
            relation_type=relation_type,
        )
        if relation is None:
            await self._repository.create_relation(
                SkillRelationModel(
                    source_skill_id=source_skill.id if source_skill is not None else None,
                    source_name=source_name,
                    normalized_source_name=normalized_source_name,
                    target_skill_id=target_skill.id if target_skill is not None else None,
                    target_name=target_name,
                    normalized_target_name=normalized_target_name,
                    relation_type=relation_type,
                    strength=self._clean_optional_text(raw_relation.get("strength")),
                    score=(
                        float(raw_relation["score"])
                        if raw_relation.get("score") is not None
                        else None
                    ),
                    reason=self._clean_optional_text(raw_relation.get("reason")),
                )
            )
            return True, False, False, conflicts

        updated = False
        if relation.source_skill_id is None and source_skill is not None:
            relation.source_skill_id = source_skill.id
            updated = True
        if relation.target_skill_id is None and target_skill is not None:
            relation.target_skill_id = target_skill.id
            updated = True
        updated |= self._fill_if_missing(relation, "strength", raw_relation.get("strength"))
        updated |= self._fill_if_missing(relation, "reason", raw_relation.get("reason"))
        if relation.score is None and raw_relation.get("score") is not None:
            relation.score = float(raw_relation["score"])
            updated = True
        if updated:
            await self._repository.update_relation(relation)
        return False, updated, False, conflicts

    async def _ensure_relation(
        self,
        *,
        source_name: str,
        target_name: str,
        relation_type: str | None,
        strength: str | None,
        score: float | None,
        reason: str | None,
    ) -> tuple[bool, bool, bool]:
        normalized_source_name = normalize_skill_name(source_name)
        normalized_target_name = normalize_skill_name(target_name)
        relation = await self._repository.find_relation(
            normalized_source_name=normalized_source_name,
            normalized_target_name=normalized_target_name,
            relation_type=relation_type,
        )
        source_skill = await self._repository.find_by_normalized_name(normalized_source_name)
        target_skill = await self._repository.find_by_normalized_name(normalized_target_name)

        if relation is None:
            await self._repository.create_relation(
                SkillRelationModel(
                    source_skill_id=source_skill.id if source_skill is not None else None,
                    source_name=source_name,
                    normalized_source_name=normalized_source_name,
                    target_skill_id=target_skill.id if target_skill is not None else None,
                    target_name=target_name,
                    normalized_target_name=normalized_target_name,
                    relation_type=relation_type,
                    strength=strength,
                    score=score,
                    reason=reason,
                )
            )
            return True, False, False

        updated = False
        if relation.source_skill_id is None and source_skill is not None:
            relation.source_skill_id = source_skill.id
            updated = True
        if relation.target_skill_id is None and target_skill is not None:
            relation.target_skill_id = target_skill.id
            updated = True
        if relation.strength is None and strength is not None:
            relation.strength = strength
            updated = True
        if relation.score is None and score is not None:
            relation.score = score
            updated = True
        if relation.reason is None and reason is not None:
            relation.reason = reason
            updated = True
        if updated:
            await self._repository.update_relation(relation)
            return False, True, False
        return False, False, True

    @staticmethod
    def _build_group_index(groups: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        index: dict[str, dict[str, Any]] = {}
        alias_index: dict[str, dict[str, Any]] = {}
        for raw_group in groups:
            canonical = str(raw_group.get("canonical") or "").strip()
            normalized_canonical = normalize_skill_name(canonical)
            if not normalized_canonical:
                continue
            payload = {
                "canonical": canonical,
                "normalized_canonical": normalized_canonical,
            }
            index[normalized_canonical] = payload
            for raw_alias in raw_group.get("aliases", []) or []:
                alias = str(raw_alias or "").strip()
                normalized_alias = normalize_skill_name(alias)
                if not normalized_alias:
                    continue
                alias_index.setdefault(normalized_alias, payload)
        return {**alias_index, **index}

    @staticmethod
    def _build_canonical_index(groups: list[dict[str, Any]]) -> dict[str, str]:
        canonical_index: dict[str, str] = {}
        for raw_group in groups:
            canonical = str(raw_group.get("canonical") or "").strip()
            normalized_canonical = normalize_skill_name(canonical)
            if normalized_canonical:
                canonical_index[normalized_canonical] = canonical
        return canonical_index

    @staticmethod
    def _should_reassign_alias(
        *,
        canonical: str,
        alias: str,
        current_owner: str | None,
    ) -> bool:
        expected_owner = MANUAL_ALIAS_REASSIGNMENTS.get(
            (normalize_skill_name(canonical), normalize_skill_name(alias))
        )
        if expected_owner is None:
            return False
        return normalize_skill_name(canonical) == expected_owner

    @staticmethod
    def _should_apply_manual_relation_rule(
        *,
        relation_rule: dict[str, object],
        group_index: dict[str, dict[str, Any]],
    ) -> bool:
        normalized_source = normalize_skill_name(str(relation_rule["source"]))
        normalized_target = normalize_skill_name(str(relation_rule["target"]))
        return normalized_source in group_index and normalized_target in group_index

    @staticmethod
    def _resolve_group_for_term(
        normalized_term: str,
        group_index: dict[str, dict[str, Any]],
    ) -> dict[str, Any] | None:
        return group_index.get(normalized_term)

    def _apply_safe_group_metadata_updates(
        self,
        skill: SkillCatalogModel,
        raw_group: dict[str, Any],
        conflicts: list[SkillCatalogSyncConflict],
    ) -> bool:
        updated = False
        desired_domains = self._clean_domains(raw_group.get("domain", []))
        desired_strength = self._clean_optional_text(raw_group.get("strength"))
        desired_type = self._clean_optional_text(raw_group.get("type"))

        if not skill.domains and desired_domains:
            skill.domains = desired_domains
            updated = True
        elif skill.domains and desired_domains and list(skill.domains) != desired_domains:
            conflicts.append(
                SkillCatalogSyncConflict(
                    type="metadata_preserved_manual",
                    canonical=skill.name,
                    alias=None,
                    db_skill=skill.name,
                    detail="Domains no banco diferem do legado e foram preservados.",
                    suggestion="Revisar manualmente se o domínio legado deve substituir o valor atual.",
                )
            )

        if skill.default_strength is None and desired_strength is not None:
            skill.default_strength = desired_strength
            updated = True
        elif (
            skill.default_strength is not None
            and desired_strength is not None
            and skill.default_strength != desired_strength
        ):
            conflicts.append(
                SkillCatalogSyncConflict(
                    type="metadata_preserved_manual",
                    canonical=skill.name,
                    alias=None,
                    db_skill=skill.name,
                    detail="Strength no banco difere do legado e foi preservado.",
                    suggestion="Revisar manualmente se o strength legado deve substituir o valor atual.",
                )
            )

        if skill.catalog_type is None and desired_type is not None:
            skill.catalog_type = desired_type
            updated = True
        elif (
            skill.catalog_type is not None
            and desired_type is not None
            and skill.catalog_type != desired_type
        ):
            conflicts.append(
                SkillCatalogSyncConflict(
                    type="metadata_preserved_manual",
                    canonical=skill.name,
                    alias=None,
                    db_skill=skill.name,
                    detail="Type no banco difere do legado e foi preservado.",
                    suggestion="Revisar manualmente se o type legado deve substituir o valor atual.",
                )
            )

        return updated

    @staticmethod
    def _fill_if_missing(model: Any, field_name: str, raw_value: Any) -> bool:
        cleaned = SkillCatalogSyncService._clean_optional_text(raw_value)
        if getattr(model, field_name) is None and cleaned is not None:
            setattr(model, field_name, cleaned)
            return True
        return False

    @staticmethod
    def _clean_domains(raw_domains: Any) -> list[str]:
        if not isinstance(raw_domains, list):
            return []
        seen: set[str] = set()
        domains: list[str] = []
        for item in raw_domains:
            value = str(item or "").strip()
            normalized = normalize_skill_name(value)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            domains.append(value)
        return domains

    @staticmethod
    def _clean_optional_text(value: Any) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None
