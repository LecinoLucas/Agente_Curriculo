"""Skill equivalence service for scoring partial matches without AI."""

from __future__ import annotations

import json
import functools
from dataclasses import dataclass
from pathlib import Path

from src.application.services.skill_normalizer_service import (
    candidate_satisfies_job_requirement,
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

    def __init__(self) -> None:
        self._catalog = self._load_catalog()

    @staticmethod
    @functools.lru_cache(maxsize=1)
    def _load_catalog() -> dict:
        """Load the skill equivalences catalog (cached once)."""
        catalog_path = Path(__file__).parent.parent.parent / "domain" / "catalogs" / "skill_equivalences.json"
        try:
            with open(catalog_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            return {"version": "2026-05-v1", "groups": [], "relations": []}

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
        4. Check legacy binary match via candidate_satisfies_job_requirement
        5. No match

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
        for relation in self._catalog.get("relations", []):
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
            return SkillMatchEvidence(
                matched=True,
                strength="strong",
                score=0.85,
                reason=f'Ambas são do grupo "{group_name}".',
                source="group",
            )

        # 4. Check legacy binary match (for backward compatibility with existing normalizer rules)
        if candidate_satisfies_job_requirement(candidate_skill, required_skill):
            return SkillMatchEvidence(
                matched=True,
                strength="strong",
                score=0.85,
                reason=f'"{candidate_skill}" satisfaz "{required_skill}" (match por regra legacy).',
                source="relation",
            )

        # 5. No match
        return SkillMatchEvidence(
            matched=False,
            strength="none",
            score=0.0,
            reason=f'"{candidate_skill}" não corresponde a "{required_skill}".',
            source="none",
        )

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
