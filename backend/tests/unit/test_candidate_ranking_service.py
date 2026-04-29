from decimal import Decimal

from src.application.services.candidate_ranking_service import (
    _normalize_reason_codes,
    _normalize_score_breakdown,
)


def test_normalize_score_breakdown_fills_missing_validation_penalty_score() -> None:
    breakdown = _normalize_score_breakdown(
        {
            "skill_match_score": "82.5",
            "experience_match_score": 71,
            "seniority_match_score": 64.25,
            "education_score": 50,
            "ai_confidence_score": 90,
            "penalty_score": 7,
            "final_score": 71.5,
        }
    )

    assert breakdown["validation_penalty_score"] == Decimal("0.00")
    assert breakdown["final_score"] == Decimal("71.50")


def test_normalize_reason_codes_preserves_match_metadata() -> None:
    reason_codes = _normalize_reason_codes(
        [
            {
                "type": "deal_breaker",
                "field": "location",
                "impact": -100,
                "description": "Vaga requer São Paulo",
                "expected": "São Paulo",
                "actual": "Rio de Janeiro",
                "reason": "Falha na regra da vaga",
            }
        ]
    )

    assert reason_codes[0]["type"] == "deal_breaker"
    assert reason_codes[0]["impact"] == -100.0
    assert reason_codes[0]["expected"] == "São Paulo"
    assert reason_codes[0]["actual"] == "Rio de Janeiro"
    assert reason_codes[0]["reason"] == "Falha na regra da vaga"
