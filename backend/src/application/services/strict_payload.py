from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


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


# Tolerant versions for auxiliary fields (legacy data, non-critical fields)


def optional_dict(data: dict[str, Any], key: str, default: dict[str, Any] | None = None) -> dict[str, Any]:
    """Extract dict or return empty dict if missing/invalid. Logs warning on malformed data."""
    if key not in data:
        return default or {}
    value = data[key]
    if not isinstance(value, dict):
        logger.warning("strict_payload.optional_dict_invalid", key=key, type=type(value).__name__)
        return default or {}
    return value


def optional_list(data: dict[str, Any], key: str, default: list[Any] | None = None) -> list[Any]:
    """Extract list or return empty list if missing/invalid. Logs warning on malformed data."""
    if key not in data:
        return default or []
    value = data[key]
    if not isinstance(value, list):
        logger.warning("strict_payload.optional_list_invalid", key=key, type=type(value).__name__)
        return default or []
    return value
