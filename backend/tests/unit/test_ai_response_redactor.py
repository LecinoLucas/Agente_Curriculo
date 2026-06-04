from __future__ import annotations

import json

from src.core.ai_response_redactor import redact_ai_response_payload, redact_ai_response_text


def test_redacts_cpf_email_and_phone_from_text() -> None:
    raw = "CPF 529.982.247-25, email ana.silva@example.com, WhatsApp +55 (11) 99999-8888"

    redacted = redact_ai_response_text(raw)

    assert redacted is not None
    assert "529.982.247-25" not in redacted
    assert "ana.silva@example.com" not in redacted
    assert "99999-8888" not in redacted
    assert "[cpf_removido]" in redacted
    assert "[email_removido]" in redacted
    assert "[telefone_removido]" in redacted


def test_redacts_multiple_sensitive_values_without_breaking_json_string() -> None:
    raw = json.dumps(
        {
            "candidate_summary": (
                "RG 12.345.678-9, CEP 74000-000, Data de nascimento 02/01/1990, "
                "Rua das Flores, 123, diagnostico informado"
            ),
            "score": 88,
            "reason_codes": ["skill_match"],
            "breakdown": {"skills": 90},
        },
        ensure_ascii=False,
    )

    redacted = redact_ai_response_text(raw)

    assert redacted is not None
    parsed = json.loads(redacted)
    serialized = json.dumps(parsed, ensure_ascii=False)
    assert "12.345.678-9" not in serialized
    assert "74000-000" not in serialized
    assert "02/01/1990" not in serialized
    assert "Rua das Flores" not in serialized
    assert "diagnostico" not in serialized.lower()
    assert parsed["score"] == 88
    assert parsed["reason_codes"] == ["skill_match"]
    assert parsed["breakdown"] == {"skills": 90}


def test_redacts_recursively_without_masking_technical_keys() -> None:
    payload = {
        "email": "candidato@example.com",
        "breakdown": {"score": 95, "detail": "telefone 11999998888"},
        "items": ["CPF 52998224725"],
    }

    redacted = redact_ai_response_payload(payload)

    assert redacted["email"] == "[email_removido]"
    assert redacted["breakdown"]["score"] == 95
    assert redacted["breakdown"]["detail"] == "[telefone_removido]"
    assert redacted["items"] == ["[cpf_removido]"]
