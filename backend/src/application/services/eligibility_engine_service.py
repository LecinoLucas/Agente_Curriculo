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
        critical_required = list(skill_requirements.get("critical_required") or [])
        core_required = list(skill_requirements.get("core_required") or [])

        critical_evidences = await self._evaluate_group(
            candidate_skills=candidate_skills,
            required_skills=critical_required,
            context=context,
        )
        core_evidences = await self._evaluate_group(
            candidate_skills=candidate_skills,
            required_skills=core_required,
            context=context,
        )

        critical_score = self._average_score(critical_evidences, default=100.0)
        core_score = self._average_score(core_evidences, default=100.0)

        missing_critical = [
            evidence["required_skill"] for evidence in critical_evidences if float(evidence["score"]) < 70
        ]
        missing_core = [
            evidence["required_skill"] for evidence in core_evidences if float(evidence["score"]) < 50
        ]

        reasons: list[str] = []
        for evidence in critical_evidences:
            if float(evidence["score"]) >= 70:
                reasons.append(
                    f"Critical skill {evidence['required_skill']} atendida com score {int(evidence['score'])}."
                )
            else:
                reasons.append(
                    f"Critical skill {evidence['required_skill']} não atendida: score {int(evidence['score'])} abaixo do mínimo 70."
                )

        status = "PASS"
        if missing_critical:
            status = "FAIL"
        elif core_score < 50:
            status = "FAIL"
            reasons.append(f"Core score {self._format_score(core_score)} abaixo de 50.")
        elif 50 <= core_score < 70:
            status = "REVIEW"
            reasons.append(f"Core score {self._format_score(core_score)} exige revisão.")
        elif len(missing_core) > 2:
            status = "REVIEW"
            reasons.append("Mais de 2 core skills ausentes; candidato deve ser revisado.")

        if status == "PASS":
            reasons.append(f"Core score {self._format_score(core_score)} aprovado.")

        return {
            "status": status,
            "critical_score": critical_score,
            "core_score": core_score,
            "missing_critical": missing_critical,
            "missing_core": missing_core,
            "reasons": reasons,
            "critical_evidences": critical_evidences,
            "core_evidences": core_evidences,
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
