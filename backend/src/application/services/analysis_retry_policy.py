"""Shared retry/cooldown policy for resume analyses.

Centralises the rule that an analysis which failed (or is scheduled to retry)
because of a provider rate-limit/quota must respect a cooldown window before it
can be retried again — whether the retry comes from the manual endpoint, the
bulk-retry endpoint or smart refresh.

Why this lives in `application` and is pure (no DB/ORM): both the API routers
(`interface`) and the smart-refresh use case (`application`) need the exact same
decision. Keeping it as a free function over plain fields avoids duplicating the
window logic and avoids an interface→application import inversion.

A `failed` analysis does NOT keep `next_retry_at` (the worker clears it when it
gives up), so for that state we derive the window from `failed_at` plus
``RATE_LIMIT_FAILED_COOLDOWN_SECONDS``. This mirrors the worker's largest
backoff step so a manual/bulk/smart-refresh retry cannot immediately reopen
provider attempts and re-burn quota.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

# Mirrors the worker's largest backoff step (RETRY_BACKOFF_SCHEDULE_SECONDS[4]).
# Applied to analyses that FAILED by rate-limit/quota, measured from failed_at.
RATE_LIMIT_FAILED_COOLDOWN_SECONDS = 300

# provider_error_type values that mean "the provider throttled / quota'd us".
RATE_LIMITED_ERROR_TYPES = frozenset(
    {"rate_limited", "rate_limit", "quota", "quota_exceeded"}
)


@dataclass(frozen=True)
class RateLimitCooldown:
    blocked: bool
    retry_after_seconds: int | None
    blocked_until: datetime | None


def is_rate_limited_error(
    provider_error_type: str | None,
    provider_status_code: int | None,
) -> bool:
    """True when the persisted failure looks like a provider rate-limit/quota."""
    normalized = (provider_error_type or "").strip().lower()
    if normalized in RATE_LIMITED_ERROR_TYPES:
        return True
    return provider_status_code == 429


def rate_limit_cooldown(
    *,
    status: str | None,
    provider_error_type: str | None,
    provider_status_code: int | None,
    next_retry_at: datetime | None,
    failed_at: datetime | None,
    updated_at: datetime | None = None,
    now: datetime | None = None,
) -> RateLimitCooldown:
    """Decide whether a rate-limited analysis is still inside its cooldown.

    Covers both ``retry_scheduled`` (explicit ``next_retry_at``) and ``failed``
    (derived from ``failed_at`` + cooldown). Any other status, or a non
    rate-limit failure, is never blocked here.
    """
    if not is_rate_limited_error(provider_error_type, provider_status_code):
        return RateLimitCooldown(False, None, None)

    current = now or datetime.now(UTC)

    if status == "retry_scheduled":
        blocked_until = next_retry_at
    elif status == "failed":
        anchor = failed_at or updated_at
        blocked_until = (
            anchor + timedelta(seconds=RATE_LIMIT_FAILED_COOLDOWN_SECONDS)
            if anchor is not None
            else None
        )
    else:
        return RateLimitCooldown(False, None, None)

    if blocked_until is None or blocked_until <= current:
        return RateLimitCooldown(False, None, None)

    retry_after = int((blocked_until - current).total_seconds() + 0.999)
    return RateLimitCooldown(True, retry_after, blocked_until)


def rate_limit_cooldown_for_analysis(analysis, *, now: datetime | None = None) -> RateLimitCooldown:
    """Convenience wrapper over an ORM/DTO object exposing the standard fields."""
    return rate_limit_cooldown(
        status=getattr(analysis, "status", None),
        provider_error_type=getattr(analysis, "provider_error_type", None),
        provider_status_code=getattr(analysis, "provider_status_code", None),
        next_retry_at=getattr(analysis, "next_retry_at", None),
        failed_at=getattr(analysis, "failed_at", None),
        updated_at=getattr(analysis, "updated_at", None),
        now=now,
    )
