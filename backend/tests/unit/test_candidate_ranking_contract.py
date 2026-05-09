from datetime import UTC, datetime
from types import SimpleNamespace

from sqlalchemy.dialects import postgresql

from src.application.services.candidate_ranking_service import (
    CandidateRankingService,
    _has_canonical_skill_evidence,
    _has_valid_persisted_ranking_row,
)
from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel


def test_canonical_skill_evidence_requires_final_score_after_cap():
    assert _has_canonical_skill_evidence({"skill_evidence_breakdown": None}) is False
    assert _has_canonical_skill_evidence({"skill_evidence_breakdown": {}}) is False
    assert (
        _has_canonical_skill_evidence(
            {"skill_evidence_breakdown": {"final_score_after_cap": 67.55}}
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
            "final_score_after_cap",
        ).compile(dialect=postgresql.dialect())
    )

    assert "jsonb_typeof" in shape_sql
    assert "?" in key_sql
    assert "->>" in key_sql
