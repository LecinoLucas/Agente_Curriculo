from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from src.application.services import candidate_ranking_service as ranking_service_module
from src.application.services import strict_payload as strict_payload_module
from src.application.services.candidate_ranking_service import (
    CandidateRankingService,
    _apply_eliminatory_skill_guardrails,
    _apply_deal_breaker_guardrails,
    _apply_validation_guardrails,
    _build_score_factors,
    _compute_breakdown,
    _has_canonical_skill_evidence,
    _has_valid_persisted_ranking_row,
    _normalize_score_breakdown,
    _render_score_explanation,
    _serialize_breakdown,
)
from src.application.services.candidate_ranking_score_store import CandidateRankingScoreStore
from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel


def _skill_row(name: str, *, priority_level: str = "priority") -> SimpleNamespace:
    return SimpleNamespace(
        skill_name=name,
        JobRequiredSkillModel=SimpleNamespace(
            priority_level=priority_level,
        ),
    )


def test_canonical_skill_evidence_requires_component_evidence():
    assert _has_canonical_skill_evidence({"skill_evidence_breakdown": None}) is False
    assert _has_canonical_skill_evidence({"skill_evidence_breakdown": {}}) is False
    assert (
        _has_canonical_skill_evidence(
            {"skill_evidence_breakdown": {"priority_score_weighted": 67.55}}
        )
        is True
    )


def test_persisted_ranking_row_contract_rejects_legacy_shapes():
    assert _has_valid_persisted_ranking_row({"final_score": 10}) is False
    assert (
        _has_valid_persisted_ranking_row(
            {
                "final_score": 10,
                "breakdown": {},
                "reason_codes": [],
                "computed_at": datetime.now(UTC),
                "match_updated_at": datetime.now(UTC),
            }
        )
        is True
    )


def test_serialize_breakdown_maps_final_score_to_public_job_fit_score() -> None:
    serialized = _serialize_breakdown(
        {
            "final_score": Decimal("82.50"),
            "priority_score_weighted": Decimal("90.00"),
        }
    )

    assert serialized["final_score"] == 82.5
    assert serialized["job_fit_score"] == 82.5
    assert serialized["priority_score_weighted"] == 90.0


def test_normalize_score_breakdown_uses_public_job_fit_score_without_warning(monkeypatch) -> None:
    warning = Mock()
    monkeypatch.setattr(ranking_service_module.logger, "warning", warning)

    breakdown = _normalize_score_breakdown(
        {
            "skill_match_score": 80,
            "experience_match_score": 75,
            "seniority_match_score": 70,
            "education_score": 85,
            "confidence_score": 90,
            "penalty_score": 0,
            "validation_penalty_score": 0,
            "priority_score_weighted": 100,
            "complementary_score_weighted": 25,
            "score_source": "candidate_job_match_evidence",
        },
        public_job_fit_score=Decimal("82.50"),
    )

    assert breakdown["job_fit_score"] == Decimal("82.50")
    assert breakdown["priority_score_weighted"] == Decimal("100.00")
    assert breakdown["complementary_score_weighted"] == Decimal("25.00")
    assert breakdown["score_source"] == "candidate_job_match_evidence"
    assert "final_score" not in breakdown
    warning.assert_not_called()


def test_optional_str_reads_score_model_version_as_string_without_warning(monkeypatch) -> None:
    warning = Mock()
    monkeypatch.setattr(strict_payload_module.logger, "warning", warning)

    assert strict_payload_module.optional_str(
        {"score_model_version": "ranking-v2"},
        "score_model_version",
    ) == "ranking-v2"
    warning.assert_not_called()


def test_postgres_skill_evidence_filter_checks_json_object_and_required_key():
    session = SimpleNamespace(bind=SimpleNamespace(dialect=postgresql.dialect()))
    service = CandidateRankingService(session)  # type: ignore[arg-type]

    shape_sql = str(
        service._json_shape_filter(
            CandidateJobMatchModel.skill_evidence_breakdown,
            "object",
        ).compile(dialect=postgresql.dialect())
    )
    key_sql = str(
        service._json_key_exists_filter(
            CandidateJobMatchModel.skill_evidence_breakdown,
            "priority_score_weighted",
        ).compile(dialect=postgresql.dialect())
    )

    assert "jsonb_typeof" in shape_sql
    assert "?" in key_sql
    assert "->>" in key_sql


def _score_store_for_sql(session: object) -> CandidateRankingScoreStore:
    return CandidateRankingScoreStore(
        session,  # type: ignore[arg-type]
        explainability_version="v1",
        validate_score_factors=lambda factors: None,
        summarize_score_factors=lambda factors: {},
        derive_delta_summary=lambda **kwargs: {},
        render_score_explanation=lambda **kwargs: "",
        empty_delta_summary=lambda **kwargs: {},
        coerce_utc_datetime=lambda value: value,
        logger=Mock(),
    )


def test_persisted_scores_latest_match_filters_job_inside_subquery() -> None:
    session = SimpleNamespace(bind=SimpleNamespace(dialect=postgresql.dialect()))
    store = _score_store_for_sql(session)

    sql = str(
        store._persisted_scores_query(uuid4(), uuid4()).compile(
            dialect=postgresql.dialect(),
        )
    )
    latest_match_sql = sql.split("AS latest_match", 1)[0]

    assert "candidate_job_match.job_id =" in latest_match_sql


@pytest.mark.asyncio
async def test_get_ranking_is_read_only_by_default_and_paginates_at_store() -> None:
    service = CandidateRankingService(SimpleNamespace(bind=None))  # type: ignore[arg-type]
    version = SimpleNamespace(id=uuid4(), version="v-test", thresholds={"high": 70, "low": 45})
    service._context_loader = SimpleNamespace(
        assert_job_exists=AsyncMock(),
        load_active_version=AsyncMock(return_value=version),
    )
    service.repair_missing_current_scores = AsyncMock()  # type: ignore[method-assign]
    service._score_store = SimpleNamespace(
        fetch_persisted_scores=AsyncMock(
            return_value=[
                {
                    "candidate_id": uuid4(),
                    "final_score": Decimal("88.00"),
                    "breakdown": {},
                    "reason_codes": [],
                    "computed_at": datetime.now(UTC),
                    "match_updated_at": datetime.now(UTC),
                }
            ]
        ),
        calculate_data_quality_stats=AsyncMock(return_value=None),
        count_persisted_scores=AsyncMock(return_value=3),
    )
    service._public_builder = SimpleNamespace(
        build_entry=lambda *, row, rank, version: {
            "rank": rank,
            "candidate_id": row["candidate_id"],
        },
        build_ranking_response=lambda **kwargs: kwargs,
    )

    job_id = uuid4()
    result = await service.get_ranking(job_id, page=2, page_size=1)

    service.repair_missing_current_scores.assert_not_awaited()
    service._score_store.fetch_persisted_scores.assert_awaited_once_with(
        job_id,
        version.id,
        limit=1,
        offset=1,
    )
    service._score_store.count_persisted_scores.assert_awaited_once_with(job_id, version.id)
    assert result["entries"][0]["rank"] == 2
    assert result["total_pages"] == 3


def test_missing_eliminatory_skill_caps_final_score() -> None:
    job = SimpleNamespace(skill_requirements={"priority": [], "complementary": [], "eliminatory": ["Python"]})
    job_skill_rows = [_skill_row("Python", priority_level="eliminatory")]
    row = {"missing_skills": ["Python"]}
    bd = {
        "final_score": Decimal("88.00"),
        "missing_eliminatory_skills": ["Python"],
        "cap_applied": False,
    }

    _apply_eliminatory_skill_guardrails(row=row, job=job, job_skill_rows=job_skill_rows, bd=bd)
    assert bd["final_score"] == Decimal("49.00")
    assert bd["cap_applied"] is True
    assert bd["cap_reason"] == "missing_eliminatory_skills"
    assert bd["eligibility_status"] == "FAIL"


def test_missing_priority_skill_without_eliminatory_requirement_does_not_cap_final_score() -> None:
    job = SimpleNamespace(skill_requirements={"priority": ["Python"], "complementary": [], "eliminatory": []})
    job_skill_rows = [_skill_row("Python", priority_level="priority")]
    row = {"missing_skills": ["Python"]}
    bd = {
        "final_score": Decimal("88.00"),
        "missing_required_skills": ["Python"],
        "cap_applied": False,
    }

    _apply_eliminatory_skill_guardrails(row=row, job=job, job_skill_rows=job_skill_rows, bd=bd)
    assert bd["final_score"] == Decimal("88.00")
    assert bd["cap_applied"] is False


def test_cap_factor_mentions_same_eliminatory_guardrail_used_in_score() -> None:
    job = SimpleNamespace(
        minimum_years_experience=None,
        minimum_education_level=None,
        seniority_level="mid",
        skill_requirements={"priority": [], "complementary": [], "eliminatory": ["Python"]},
    )
    job_skill_rows = [_skill_row("Python", priority_level="eliminatory")]
    row = {
        "skill_evidence_breakdown": {"partial_matches": []},
        "total_experience_years": 6,
        "seniority_level": "mid",
        "education_level": "bachelor",
    }
    bd = {
        "final_score": Decimal("49.00"),
        "raw_score": Decimal("88.00"),
        "cap_applied": True,
        "cap_reason": "missing_eliminatory_skills",
        "failed_rule": "missing_eliminatory_skills",
        "failed_dimension": "skills",
            "validation_reason": "missing eliminatory skill",
        "experience_match_score": Decimal("100.00"),
        "seniority_match_score": Decimal("100.00"),
        "education_score": Decimal("100.00"),
        "confidence_score": Decimal("90.00"),
        "deal_breaker_penalty_score": Decimal("0.00"),
    }

    factors = _build_score_factors(
        row=row,
        job=job,
        job_skill_rows=job_skill_rows,
        bd=bd,
        matched=[],
        missing=["Python"],
        deal_breaker_violations=[],
    )
    cap_factor = next((item for item in factors if item["factor_type"] == "eligibility_cap"), None)
    assert cap_factor is not None
    assert cap_factor["factor_key"] == "missing_eliminatory_skills"


def test_ranking_recomputes_unknown_penalty_from_match_evidence() -> None:
    job = SimpleNamespace(
        minimum_years_experience=Decimal("5.0"),
        minimum_education_level="bachelor",
        seniority_level="mid",
    )
    job_skill_rows = [
        _skill_row("JavaScript", priority_level="priority"),
        _skill_row("Node.js", priority_level="priority"),
    ]
    row = {
        "matched_skills": ["Node.js"],
        "missing_skills": [],
        "candidate_skills": ["Node.js", "TypeScript"],
        "total_experience_years": None,
        "education_level": "none",
        "seniority_level": "mid",
        "skill_evidence_breakdown": {
            "priority_score_weighted": 0.0,
            "complementary_score_weighted": 0.0,
            "optional_score_raw_weighted": 0.0,
            "validation_reasons": ["Dados insuficientes"],
            "missing_required_skills": [],
            "partial_matches": [
                {"required": "JavaScript", "candidate": "TypeScript", "score": 0.765}
            ],
        },
    }

    breakdown = _compute_breakdown(row=row, job=job, job_skill_rows=job_skill_rows)
    _apply_validation_guardrails(row, breakdown)

    assert breakdown["final_score"] == Decimal("22.22")
    assert breakdown["validation_penalty_score"] == Decimal("0.00")
    assert breakdown["score_source"] == "candidate_job_match_evidence"


def test_breakdown_uses_persisted_experience_detected_when_row_years_is_missing() -> None:
    job = SimpleNamespace(
        minimum_years_experience=Decimal("5.0"),
        minimum_education_level="bachelor",
        seniority_level="mid",
    )
    job_skill_rows = [
        _skill_row("Node.js", priority_level="priority"),
    ]
    row = {
        "matched_skills": ["Node.js"],
        "missing_skills": [],
        "candidate_skills": ["Node.js"],
        "total_experience_years": None,
        "education_level": "none",
        "seniority_level": "mid",
        "skill_evidence_breakdown": {
            "priority_score_weighted": 100.0,
            "complementary_score_weighted": 0.0,
            "optional_score_raw_weighted": 0.0,
            "experience_detected": 5.6,
            "priority_component_impact": 39.21,
            "complementary_component_impact": 9.7,
            "experience_component_impact": 20.0,
            "seniority_component_impact": 11.11,
            "matched_required_skills": ["Node.js"],
            "missing_required_skills": [],
            "matched_complementary_skills": [],
            "missing_complementary_skills": [],
            "priority_skills_matched": 1,
            "priority_skills_total": 1,
            "complementary_skills_matched": 0,
            "complementary_skills_total": 0,
        },
    }

    breakdown = _compute_breakdown(row=row, job=job, job_skill_rows=job_skill_rows)

    assert breakdown["experience_detected"] == 5.6
    assert breakdown["experience_match_score"] == Decimal("90.00")


def test_active_deal_breaker_guardrail_zeroes_score() -> None:
    bd = {
        "final_score": Decimal("82.00"),
        "deal_breaker_penalty_score": Decimal("0.00"),
    }

    _apply_deal_breaker_guardrails(
        bd,
        [{"field": "location", "description": "Presencial obrigatório"}],
    )

    assert bd["final_score"] == Decimal("0.00")
    assert bd["deal_breaker_penalty_score"] == Decimal("82.00")


def test_breakdown_preserves_separate_required_and_optional_impacts() -> None:
    job = SimpleNamespace(
        minimum_years_experience=Decimal("5.0"),
        minimum_education_level="bachelor",
        seniority_level="mid",
    )
    job_skill_rows = [
        _skill_row("Python", priority_level="priority"),
        _skill_row("Node.js", priority_level="priority"),
        _skill_row("React", priority_level="complementary"),
        _skill_row("Docker", priority_level="complementary"),
        _skill_row("Kubernetes", priority_level="complementary"),
        _skill_row("CI/CD", priority_level="complementary"),
        _skill_row("PostgreSQL", priority_level="complementary"),
        _skill_row("Redis", priority_level="complementary"),
    ]
    row = {
        "matched_skills": ["Python", "Node.js", "React", "Docker"],
        "missing_skills": [],
        "candidate_skills": ["Python", "Node.js", "React", "Docker"],
        "total_experience_years": 6,
        "education_level": "bachelor",
        "seniority_level": "mid",
        "skill_evidence_breakdown": {
            "validation_reasons": [],
            "priority_score_weighted": 100.0,
            "complementary_score_weighted": 40.0,
            "complementary_score_raw_weighted": 33.33,
            "priority_component_impact": 50.0,
            "complementary_component_impact": 6.67,
            "experience_component_impact": 22.22,
            "seniority_component_impact": 11.11,
            "matched_required_skills": ["Python", "Node.js"],
            "missing_required_skills": [],
            "matched_complementary_skills": ["React", "Docker"],
            "missing_complementary_skills": ["Kubernetes", "CI/CD", "PostgreSQL", "Redis"],
            "priority_skills_matched": 2,
            "priority_skills_total": 2,
            "complementary_skills_matched": 2,
            "complementary_skills_total": 6,
            "complementary_bonus_cap_slots": 5,
        },
    }

    breakdown = _compute_breakdown(row=row, job=job, job_skill_rows=job_skill_rows)

    assert breakdown["priority_skills_matched"] == 2
    assert breakdown["priority_skills_total"] == 2
    assert breakdown["complementary_skills_matched"] == 2
    assert breakdown["complementary_skills_total"] == 6
    assert breakdown["matched_complementary_skills"] == ["React", "Docker"]
    assert breakdown["missing_complementary_skills"] == ["Kubernetes", "CI/CD", "PostgreSQL", "Redis"]
    assert breakdown["complementary_score_weighted"] == Decimal("40.00")
    assert breakdown["complementary_score_raw_weighted"] == Decimal("33.33")
    assert breakdown["complementary_component_impact"] == Decimal("6.67")


def test_score_explanation_separates_required_optional_and_deal_breakers() -> None:
    explanation = _render_score_explanation(
        final_score=Decimal("78.40"),
        decision="review",
        factor_summary={
            "positive": [
                {"factor_type": "required_skill_match", "factor_label": "Skill obrigatória atendida: Python"},
                {"factor_type": "complementary_skill_bonus", "factor_label": "Skills desejáveis: 2/16 atendidas, bônus de 6.67 pts"},
            ],
            "negative": [
                {"factor_type": "deal_breaker_violation", "factor_label": "Critério eliminatório violado"},
            ],
            "contextual": [],
        },
        delta_summary=None,
        breakdown={
            "priority_skills_matched": 5,
            "priority_skills_total": 6,
            "missing_required_skills": ["SQL"],
            "priority_component_impact": 41.25,
            "complementary_skills_matched": 2,
            "complementary_skills_total": 16,
            "missing_complementary_skills": [f"Skill {i}" for i in range(14)],
            "complementary_component_impact": 6.67,
            "complementary_bonus_cap_slots": 5,
        },
    )

    assert "Essenciais: 5/6 atendidas, 1 ausente" in explanation
    assert "Diferenciais: 2/16 encontrados, 14 ausentes, bônus 6.7 pts (cap em 5 skills)." in explanation
    assert "Critério eliminatório violado" in explanation
