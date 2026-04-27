from __future__ import annotations

import re
from typing import Any

_CPF_BASIC_PATTERN = re.compile(r"^\d{3}\.\d{3}\.\d{3}-\d{2}$")
_NULLABLE_FIELDS = ("nome", "cpf", "data_nascimento", "documento_numero")


def validate_structured_data(data: dict[str, Any]) -> dict[str, Any]:
    reasons: list[str] = []

    nome = data.get("nome")
    if not isinstance(nome, str) or not nome.strip():
        reasons.append("nome_empty")

    cpf = data.get("cpf")
    if cpf is not None:
        if not isinstance(cpf, str) or not _CPF_BASIC_PATTERN.fullmatch(cpf.strip()):
            reasons.append("cpf_invalid_format")

    confidence = data.get("confidence")
    try:
        confidence_value = float(confidence)
    except (TypeError, ValueError):
        confidence_value = 0.0
        reasons.append("confidence_invalid")

    if confidence_value < 0.5:
        reasons.append("confidence_below_threshold")

    null_fields = sum(1 for field in _NULLABLE_FIELDS if data.get(field) is None)
    if null_fields > 2:
        reasons.append("too_many_null_fields")

    return {
        "valid": len(reasons) == 0,
        "reasons": reasons,
    }

