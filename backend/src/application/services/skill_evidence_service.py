from __future__ import annotations

from typing import Any

from src.application.services.skill_resolver_service import SkillResolverService
from src.infrastructure.repositories.sqlalchemy_skill_repository import SQLAlchemySkillRepository


class SkillEvidenceService:
    def __init__(self, repository: SQLAlchemySkillRepository) -> None:
        self._repository = repository
        self._resolver = SkillResolverService(repository)

    async def resolve_skill_evidence(
        self,
        candidate_skills: list[str],
        required_skill: str,
        context: str | None = None,
    ) -> dict[str, Any]:
        required_resolution = await self._resolver.resolve_skill(required_skill)
        if required_resolution is None:
            return self._build_empty_result(
                required_skill=required_skill,
                reason="Skill exigida não encontrada no catálogo.",
                context=context,
            )

        candidate_resolutions = await self._resolver.resolve_many(candidate_skills)
        if not candidate_resolutions:
            return self._build_empty_result(
                required_skill=required_skill,
                required_skill_id=required_resolution["skill_id"],
                reason="Nenhuma evidência encontrada.",
                context=context,
            )

        best_match: dict[str, Any] | None = None
        best_score = -1

        for candidate_resolution in candidate_resolutions:
            evidence = await self._evaluate_candidate_against_required(
                candidate_resolution=candidate_resolution,
                required_resolution=required_resolution,
                required_skill=required_skill,
                context=context,
            )
            if evidence["score"] > best_score:
                best_match = evidence
                best_score = evidence["score"]

        if best_match is not None:
            return best_match

        return self._build_empty_result(
            required_skill=required_skill,
            required_skill_id=required_resolution["skill_id"],
            reason="Nenhuma evidência encontrada.",
            context=context,
        )

    async def resolve_job_skill_evidences(
        self,
        candidate_skills: list[str],
        required_skills: list[str],
        context: str | None = None,
    ) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for required_skill in required_skills:
            results.append(
                await self.resolve_skill_evidence(
                    candidate_skills=candidate_skills,
                    required_skill=required_skill,
                    context=context,
                )
            )
        return results

    async def _evaluate_candidate_against_required(
        self,
        *,
        candidate_resolution: dict[str, Any],
        required_resolution: dict[str, Any],
        required_skill: str,
        context: str | None,
    ) -> dict[str, Any]:
        candidate_skill_id = candidate_resolution["skill_id"]
        required_skill_id = required_resolution["skill_id"]

        if candidate_skill_id == required_skill_id:
            if candidate_resolution["matched_by"] == "alias":
                return {
                    "required_skill": required_skill,
                    "required_skill_id": required_skill_id,
                    "matched_skill": candidate_resolution["raw_value"],
                    "matched_skill_id": candidate_skill_id,
                    "score": 95,
                    "match_type": "alias",
                    "strength": "exact",
                    "reason": "Skill encontrada por alias.",
                    "context": context,
                }

            return {
                "required_skill": required_skill,
                "required_skill_id": required_skill_id,
                "matched_skill": candidate_resolution["raw_value"],
                "matched_skill_id": candidate_skill_id,
                "score": 100,
                "match_type": "exact",
                "strength": "exact",
                "reason": "Skill encontrada por match exato.",
                "context": context,
            }

        equivalence = await self._repository.find_equivalence(
            source_skill_id=candidate_skill_id,
            target_skill_id=required_skill_id,
            context=context,
        )
        if equivalence is None:
            return self._build_empty_result(
                required_skill=required_skill,
                required_skill_id=required_skill_id,
                reason="Nenhuma evidência encontrada.",
                context=context,
            )

        strength = str(equivalence.strength)
        canonical_required = str(required_resolution["canonical_name"])
        matched_skill = str(candidate_resolution["raw_value"])
        reason = f"{matched_skill} possui equivalência {strength} com {canonical_required}."
        extra_reason = str(equivalence.reason or "").strip()
        if extra_reason:
            reason = f"{reason} {extra_reason}"

        return {
            "required_skill": required_skill,
            "required_skill_id": required_skill_id,
            "matched_skill": matched_skill,
            "matched_skill_id": candidate_skill_id,
            "score": int(equivalence.score),
            "match_type": self._equivalence_match_type(strength),
            "strength": strength,
            "reason": reason,
            "context": equivalence.context,
        }

    @staticmethod
    def _equivalence_match_type(strength: str) -> str:
        if strength == "strong":
            return "strong_equivalence"
        if strength == "partial":
            return "partial_equivalence"
        if strength == "weak":
            return "weak_equivalence"
        return "strong_equivalence"

    @staticmethod
    def _build_empty_result(
        *,
        required_skill: str,
        reason: str,
        context: str | None,
        required_skill_id=None,
    ) -> dict[str, Any]:
        return {
            "required_skill": required_skill,
            "required_skill_id": required_skill_id,
            "matched_skill": None,
            "matched_skill_id": None,
            "score": 0,
            "match_type": "none",
            "strength": "none",
            "reason": reason,
            "context": context,
        }
