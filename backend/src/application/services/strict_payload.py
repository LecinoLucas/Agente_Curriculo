from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any


def require_key(data: dict[str, Any], key: str) -> Any:
    if key not in data:
        raise ValueError(f"Missing required key: {key}")
    return data[key]


def require_dict(data: dict[str, Any], key: str) -> dict[str, Any]:
    value = require_key(data, key)
    if not isinstance(value, dict):
        raise ValueError(f"{key} must be dict")
    return value


def require_list(data: dict[str, Any], key: str) -> list[Any]:
    value = require_key(data, key)
    if not isinstance(value, list):
        raise ValueError(f"{key} must be list")
    return value


def require_datetime(data: dict[str, Any], key: str) -> datetime:
    value = require_key(data, key)
    if not isinstance(value, datetime):
        raise ValueError(f"{key} must be datetime")
    return value


def require_non_empty_string(data: dict[str, Any], key: str) -> str:
    value = require_key(data, key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} must be non-empty string")
    return value


def require_decimal(data: dict[str, Any], key: str) -> Decimal:
    value = require_key(data, key)
    if value is None:
        raise ValueError(f"{key} must not be null")
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"{key} must be numeric") from exc
