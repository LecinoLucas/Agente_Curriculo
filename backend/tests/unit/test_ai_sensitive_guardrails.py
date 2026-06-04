from __future__ import annotations

from src.core.ai_sensitive_guardrails import (
    SENSITIVE_TEXT_REPLACEMENT,
    sanitize_ranking_payload,
)


def test_sanitize_ranking_payload_removes_sensitive_reason_codes_and_explanation() -> None:
    payload = {
        "breakdown": {
            "skills_score": 90,
            "age_gap": "Candidato com idade acima do esperado",
            "professional_note": "Python e SQL aderentes",
        },
        "reason_codes": [
            {
                "type": "age_gap",
                "field": "idade",
                "impact": -20,
                "description": "Idade elevada para a função",
            },
            {
                "type": "skill_match",
                "field": "python",
                "impact": 15,
                "description": "Skill essencial atendida: Python",
            },
        ],
        "factor_summary_json": {
            "negative": [
                {"factor_label": "Mora longe no bairro Central"},
                {"factor_label": "Experiência abaixo do esperado"},
            ],
        },
        "delta_summary_json": {},
        "factors": [
            {"factor_type": "age_gap", "factor_label": "Idade elevada"},
            {"factor_type": "required_skill_match", "factor_label": "Python"},
        ],
        "explanation_text": (
            "Aderência baixa porque mora longe e tem idade elevada. "
            "Skill essencial atendida: Python."
        ),
    }

    sanitized = sanitize_ranking_payload(payload)
    serialized = str(sanitized).lower()

    assert "idade" not in serialized
    assert "age_gap" not in serialized
    assert "mora longe" not in serialized
    assert "bairro central" not in serialized
    assert sanitized["breakdown"] == {
        "skills_score": 90,
        "professional_note": "Python e SQL aderentes",
    }
    assert sanitized["reason_codes"] == [
        {
            "type": "skill_match",
            "field": "python",
            "impact": 15,
            "description": "Skill essencial atendida: Python",
        }
    ]
    assert sanitized["factors"] == [
        {"factor_type": "required_skill_match", "factor_label": "Python"}
    ]
    assert SENSITIVE_TEXT_REPLACEMENT in sanitized["explanation_text"]


def test_sanitize_ranking_payload_keeps_professional_score_fields() -> None:
    payload = {
        "breakdown": {"skills_score": 88, "experience_match_score": 76},
        "reason_codes": [
            {
                "type": "experience",
                "field": "experience",
                "impact": 8,
                "description": "Experiência atende o esperado",
            }
        ],
        "factor_summary_json": {},
        "delta_summary_json": {},
        "factors": [],
        "explanation_text": "Aderência profissional por experiência e Python.",
    }

    sanitized = sanitize_ranking_payload(payload)

    assert sanitized["breakdown"] == payload["breakdown"]
    assert sanitized["reason_codes"] == payload["reason_codes"]
    assert sanitized["explanation_text"] == payload["explanation_text"]
