from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from src.domain.exceptions import ValidationException

_NON_NUMERIC_RE = re.compile(r"[^\d,.\-]")


def normalize_salary_expectation(value: str | Decimal | float | int | None) -> str | None:
    if value is None:
        return None

    if isinstance(value, Decimal):
        amount = value
    else:
        raw_value = str(value).strip()
        if not raw_value:
            return None
        amount = _parse_salary_amount(raw_value)

    if amount <= 0:
        raise ValidationException("Informe uma pretensão salarial válida.")

    normalized = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"{normalized:.2f}"


def require_salary_expectation(value: str | Decimal | float | int | None) -> str:
    normalized = normalize_salary_expectation(value)
    if normalized is None:
        raise ValidationException("Informe sua pretensão salarial.")
    return normalized


def has_salary_expectation(value: str | None) -> bool:
    return bool(value and value.strip())


def _parse_salary_amount(raw_value: str) -> Decimal:
    cleaned = _NON_NUMERIC_RE.sub("", raw_value)
    if not cleaned:
        raise ValidationException("Informe uma pretensão salarial válida.")

    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif cleaned.count(".") > 1:
        parts = cleaned.split(".")
        cleaned = "".join(parts[:-1]) + "." + parts[-1]

    try:
        return Decimal(cleaned)
    except InvalidOperation as exc:
        raise ValidationException("Informe uma pretensão salarial válida.") from exc
