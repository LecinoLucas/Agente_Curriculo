from __future__ import annotations

import pytest

from src.application.services.eligibility_engine_service import EligibilityEngineService


class StubSkillEvidenceService:
    def __init__(self, evidences_by_skill: dict[str, dict]) -> None:
        self._evidences_by_skill = evidences_by_skill
        self.calls: list[dict[str, object]] = []

    async def resolve_job_skill_evidences(
        self,
        *,
        candidate_skills: list[str],
        required_skills: list[str],
        context: str | None = None,
    ) -> list[dict]:
        self.calls.append(
            {
                "candidate_skills": list(candidate_skills),
                "required_skills": list(required_skills),
                "context": context,
            }
        )
        return [self._evidences_by_skill[skill] for skill in required_skills]


def _evidence(
    required_skill: str,
    score: int,
    *,
    reason: str | None = None,
    match_type: str = "exact",
    strength: str = "exact",
    matched_skill: str | None = None,
    context: str | None = None,
) -> dict:
    return {
        "required_skill": required_skill,
        "required_skill_id": f"id-{required_skill}",
        "matched_skill": matched_skill or required_skill,
        "matched_skill_id": f"matched-{required_skill}" if score > 0 else None,
        "score": score,
        "match_type": match_type if score > 0 else "none",
        "strength": strength if score > 0 else "none",
        "reason": reason or f"reason-{required_skill}",
        "context": context,
    }


@pytest.mark.asyncio
async def test_eligibility_pass_when_critical_and_core_are_strong() -> None:
    stub = StubSkillEvidenceService(
        {
            "SQL": _evidence("SQL", 100),
            "Power BI": _evidence("Power BI", 80),
            "Python": _evidence("Python", 75),
            "ETL": _evidence("ETL", 70),
        }
    )
    service = EligibilityEngineService(evidence_service=stub)

    result = await service.evaluate_eligibility(
        candidate_skills=["SQL", "Power BI", "Python", "ETL"],
        skill_requirements={
            "critical_required": ["SQL"],
            "core_required": ["Power BI", "Python", "ETL"],
        },
    )

    assert result["status"] == "PASS"
    assert result["critical_score"] == 100.0
    assert result["core_score"] == 75.0
    assert result["missing_critical"] == []
    assert result["missing_core"] == []


@pytest.mark.asyncio
async def test_eligibility_fails_when_critical_skill_is_below_70() -> None:
    stub = StubSkillEvidenceService(
        {
            "SAP MM": _evidence("SAP MM", 20, match_type="weak_equivalence", strength="weak"),
            "Power BI": _evidence("Power BI", 90),
        }
    )
    service = EligibilityEngineService(evidence_service=stub)

    result = await service.evaluate_eligibility(
        candidate_skills=["Protheus", "Power BI"],
        skill_requirements={
            "critical_required": ["SAP MM"],
            "core_required": ["Power BI"],
        },
    )

    assert result["status"] == "FAIL"
    assert result["missing_critical"] == ["SAP MM"]
    assert "Critical skill SAP MM não atendida: score 20 abaixo do mínimo 70." in result["reasons"]


@pytest.mark.asyncio
async def test_eligibility_reviews_when_core_score_between_50_and_70() -> None:
    stub = StubSkillEvidenceService(
        {
            "SQL": _evidence("SQL", 100),
            "Power BI": _evidence("Power BI", 60),
            "Python": _evidence("Python", 65),
        }
    )
    service = EligibilityEngineService(evidence_service=stub)

    result = await service.evaluate_eligibility(
        candidate_skills=["SQL", "Power BI", "Python"],
        skill_requirements={
            "critical_required": ["SQL"],
            "core_required": ["Power BI", "Python"],
        },
    )

    assert result["status"] == "REVIEW"
    assert result["core_score"] == 62.5
    assert "Core score 62.50 exige revisão." in result["reasons"]


@pytest.mark.asyncio
async def test_eligibility_reviews_when_more_than_two_core_are_missing_but_score_is_at_least_50() -> None:
    stub = StubSkillEvidenceService(
        {
            "SQL": _evidence("SQL", 100),
            "Power BI": _evidence("Power BI", 49),
            "Python": _evidence("Python", 49),
            "ETL": _evidence("ETL", 49),
            "DAX": _evidence("DAX", 100),
            "PostgreSQL": _evidence("PostgreSQL", 100),
            "SQL Server": _evidence("SQL Server", 100),
        }
    )
    service = EligibilityEngineService(evidence_service=stub)

    result = await service.evaluate_eligibility(
        candidate_skills=["SQL", "DAX", "PostgreSQL", "SQL Server"],
        skill_requirements={
            "critical_required": ["SQL"],
            "core_required": ["Power BI", "Python", "ETL", "DAX", "PostgreSQL", "SQL Server"],
        },
    )

    assert result["status"] == "REVIEW"
    assert result["core_score"] == 74.5
    assert result["missing_core"] == ["Power BI", "Python", "ETL"]
    assert "Mais de 2 core skills ausentes; candidato deve ser revisado." in result["reasons"]


@pytest.mark.asyncio
async def test_eligibility_fails_when_core_score_is_below_50() -> None:
    stub = StubSkillEvidenceService(
        {
            "SQL": _evidence("SQL", 100),
            "Power BI": _evidence("Power BI", 40),
            "Python": _evidence("Python", 45),
        }
    )
    service = EligibilityEngineService(evidence_service=stub)

    result = await service.evaluate_eligibility(
        candidate_skills=["SQL"],
        skill_requirements={
            "critical_required": ["SQL"],
            "core_required": ["Power BI", "Python"],
        },
    )

    assert result["status"] == "FAIL"
    assert result["core_score"] == 42.5
    assert "Core score 42.50 abaixo de 50." in result["reasons"]


@pytest.mark.asyncio
async def test_eligibility_without_critical_does_not_fail_on_critical() -> None:
    stub = StubSkillEvidenceService(
        {
            "Power BI": _evidence("Power BI", 80),
        }
    )
    service = EligibilityEngineService(evidence_service=stub)

    result = await service.evaluate_eligibility(
        candidate_skills=["Power BI"],
        skill_requirements={
            "critical_required": [],
            "core_required": ["Power BI"],
        },
    )

    assert result["status"] == "PASS"
    assert result["critical_score"] == 100.0
    assert result["missing_critical"] == []


@pytest.mark.asyncio
async def test_eligibility_without_core_sets_core_score_to_100() -> None:
    stub = StubSkillEvidenceService(
        {
            "SQL": _evidence("SQL", 100),
        }
    )
    service = EligibilityEngineService(evidence_service=stub)

    result = await service.evaluate_eligibility(
        candidate_skills=["SQL"],
        skill_requirements={
            "critical_required": ["SQL"],
            "core_required": [],
        },
    )

    assert result["status"] == "PASS"
    assert result["core_score"] == 100.0
    assert result["core_evidences"] == []


@pytest.mark.asyncio
async def test_eligibility_ignores_important_and_nice_to_have() -> None:
    stub = StubSkillEvidenceService(
        {
            "SQL": _evidence("SQL", 100),
            "Power BI": _evidence("Power BI", 80),
        }
    )
    service = EligibilityEngineService(evidence_service=stub)

    result = await service.evaluate_eligibility(
        candidate_skills=["SQL", "Power BI"],
        skill_requirements={
            "critical_required": ["SQL"],
            "core_required": ["Power BI"],
            "important": ["DAX", "ETL"],
            "nice_to_have": ["SAP"],
        },
    )

    assert result["status"] == "PASS"
    assert len(stub.calls) == 2
    assert stub.calls[0]["required_skills"] == ["SQL"]
    assert stub.calls[1]["required_skills"] == ["Power BI"]


@pytest.mark.asyncio
async def test_eligibility_repasses_context_to_evidence_service() -> None:
    stub = StubSkillEvidenceService(
        {
            "SQL": _evidence("SQL", 100, context="data"),
            "Power BI": _evidence("Power BI", 80, context="data"),
        }
    )
    service = EligibilityEngineService(evidence_service=stub)

    result = await service.evaluate_eligibility(
        candidate_skills=["SQL", "Power BI"],
        skill_requirements={
            "critical_required": ["SQL"],
            "core_required": ["Power BI"],
        },
        context="data",
    )

    assert result["status"] == "PASS"
    assert stub.calls[0]["context"] == "data"
    assert stub.calls[1]["context"] == "data"


@pytest.mark.asyncio
async def test_eligibility_returns_auditable_evidences() -> None:
    sql_evidence = _evidence("SQL", 100, reason="Skill encontrada por match exato.")
    bi_evidence = _evidence("Power BI", 65, reason="Power BI possui evidência parcial.")
    stub = StubSkillEvidenceService(
        {
            "SQL": sql_evidence,
            "Power BI": bi_evidence,
        }
    )
    service = EligibilityEngineService(evidence_service=stub)

    result = await service.evaluate_eligibility(
        candidate_skills=["SQL", "Power BI"],
        skill_requirements={
            "critical_required": ["SQL"],
            "core_required": ["Power BI"],
        },
    )

    assert result["critical_evidences"] == [sql_evidence]
    assert result["core_evidences"] == [bi_evidence]
    assert result["reasons"][0] == "Critical skill SQL atendida com score 100."
