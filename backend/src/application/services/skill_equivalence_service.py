"""Skill equivalence service for scoring partial matches without AI."""

from __future__ import annotations

import json
import functools
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from src.application.services.skill_normalizer_service import (
    normalize_skill_text,
)


@dataclass(frozen=True, slots=True)
class SkillMatchEvidence:
    """Evidence of a skill match with strength and score."""

    matched: bool
    strength: str  # "exact" | "strong" | "partial" | "none"
    score: float  # 1.0 | 0.85-0.90 | 0.40-0.50 | 0.0
    reason: str
    source: str  # "exact" | "relation" | "group" | "none"


class SkillEquivalenceService:
    """Service for evaluating skill equivalence with scoring."""

    def __init__(self, catalog_path: Path | None = None) -> None:
        self._catalog_path = catalog_path or self._default_catalog_path()
        self._catalog = self._load_catalog(self._catalog_path)

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
        cls._load_catalog.cache_clear()

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
