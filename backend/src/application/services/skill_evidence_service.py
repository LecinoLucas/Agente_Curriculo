from __future__ import annotations

from typing import Any

from src.application.services.skill_equivalence_service import SkillEquivalenceService


class SkillEvidenceService:
    def __init__(self) -> None:
        self._equivalence_service = SkillEquivalenceService.for_matching()

    async def resolve_skill_evidence(
        self,
        candidate_skills: list[str],
        required_skill: str,
        context: str | None = None,
    ) -> dict[str, Any]:
        if not str(required_skill or "").strip():
            return self._build_empty_result(
                required_skill=required_skill,
                reason="Skill exigida inválida.",
                context=context,
            )

        cleaned_candidate_skills = [skill for skill in candidate_skills if str(skill or "").strip()]
        if not cleaned_candidate_skills:
            return self._build_empty_result(
                required_skill=required_skill,
                reason="Nenhuma evidência encontrada.",
                context=context,
            )

        best_match: dict[str, Any] | None = None
        best_score = -1.0

        for candidate_skill in cleaned_candidate_skills:
            evidence = self._evaluate_candidate_against_required(
                candidate_skill=candidate_skill,
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

    def _evaluate_candidate_against_required(
        self,
        *,
        candidate_skill: str,
        required_skill: str,
        context: str | None,
    ) -> dict[str, Any]:
        evidence = self._equivalence_service.match_skill(candidate_skill, required_skill, domain=context)
        if not evidence.matched:
            return self._build_empty_result(
                required_skill=required_skill,
                reason="Nenhuma evidência encontrada.",
                context=context,
            )

        return {
            "required_skill": required_skill,
            "required_skill_id": None,
            "matched_skill": candidate_skill,
            "matched_skill_id": None,
            "score": int(round(evidence.score * 100)),
            "match_type": self._equivalence_match_type(evidence.strength),
            "strength": evidence.strength,
            "reason": evidence.reason,
            "context": context,
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
