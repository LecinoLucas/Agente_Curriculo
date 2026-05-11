from __future__ import annotations

from typing import Any

from src.application.services.skill_evidence_service import SkillEvidenceService


class EligibilityEngineService:
    def __init__(
        self,
        evidence_service: SkillEvidenceService | None = None,
    ) -> None:
        self._evidence_service = evidence_service or SkillEvidenceService()

    async def evaluate_eligibility(
        self,
        candidate_skills: list[str],
        skill_requirements: dict,
        context: str | None = None,
    ) -> dict[str, Any]:
        eliminatory_skills = list(skill_requirements.get("eliminatory") or [])
        priority_skills = list(skill_requirements.get("priority") or [])

        eliminatory_evidences = await self._evaluate_group(
            candidate_skills=candidate_skills,
            required_skills=eliminatory_skills,
            context=context,
        )
        priority_evidences = await self._evaluate_group(
            candidate_skills=candidate_skills,
            required_skills=priority_skills,
            context=context,
        )

        eliminatory_score = self._average_score(eliminatory_evidences, default=100.0)
        priority_score = self._average_score(priority_evidences, default=100.0)

        missing_eliminatory = [
            evidence["required_skill"] for evidence in eliminatory_evidences if float(evidence["score"]) < 70
        ]
        missing_priority = [
            evidence["required_skill"] for evidence in priority_evidences if float(evidence["score"]) < 50
        ]

        reasons: list[str] = []
        for evidence in eliminatory_evidences:
            if float(evidence["score"]) >= 70:
                reasons.append(
                    f"Skill eliminatória {evidence['required_skill']} atendida com score {int(evidence['score'])}."
                )
            else:
                reasons.append(
                    f"Skill eliminatória {evidence['required_skill']} não atendida: score {int(evidence['score'])} abaixo do mínimo 70."
                )

        status = "PASS"
        if missing_eliminatory:
            status = "FAIL"
        elif priority_score < 50:
            status = "FAIL"
            reasons.append(f"Score de skills essenciais {self._format_score(priority_score)} abaixo de 50.")
        elif 50 <= priority_score < 70:
            status = "REVIEW"
            reasons.append(f"Score de skills essenciais {self._format_score(priority_score)} exige revisão.")
        elif len(missing_priority) > 2:
            status = "REVIEW"
            reasons.append("Mais de 2 skills essenciais ausentes; candidato deve ser revisado.")

        if status == "PASS":
            reasons.append(f"Score de skills essenciais {self._format_score(priority_score)} aprovado.")

        return {
            "status": status,
            "eliminatory_score": eliminatory_score,
            "priority_score": priority_score,
            "missing_eliminatory": missing_eliminatory,
            "missing_priority": missing_priority,
            "reasons": reasons,
            "eliminatory_evidences": eliminatory_evidences,
            "priority_evidences": priority_evidences,
        }

    async def _evaluate_group(
        self,
        *,
        candidate_skills: list[str],
        required_skills: list[str],
        context: str | None,
    ) -> list[dict[str, Any]]:
        if not required_skills:
            return []

        return await self._evidence_service.resolve_job_skill_evidences(
            candidate_skills=candidate_skills,
            required_skills=required_skills,
            context=context,
        )

    @staticmethod
    def _average_score(evidences: list[dict[str, Any]], *, default: float) -> float:
        if not evidences:
            return default
        total = sum(float(evidence["score"]) for evidence in evidences)
        return round(total / len(evidences), 2)

    @staticmethod
    def _format_score(score: float) -> str:
        if score.is_integer():
            return str(int(score))
        return f"{score:.2f}"
