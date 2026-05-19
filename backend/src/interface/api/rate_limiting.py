"""Rate limiting dependencies for FastAPI endpoints.

Storage selection:
- Dev/test: in-process MemoryStorage. This is NOT suitable for multi-worker
  production deployments (gunicorn/uvicorn with workers > 1): each worker
  process holds its own counter, so a single IP/user can exceed the limit by
  a factor of `n_workers`. Use Redis in production.
- Production (``settings.is_production``): if ``settings.REDIS_URL`` is set,
  use the async Redis backend so all workers share counters. Otherwise we
  fall back to MemoryStorage; multi-worker deployments must configure
  ``REDIS_URL`` to get correct enforcement.

Rate limit keys:
- Public endpoints (login, public candidate apply): keyed by client IP.
- Authenticated endpoints (analysis request, analysis retry): keyed by
  ``current_user.id``. If for any reason the current user is unavailable
  (e.g., missing auth), the dependency falls back to the client IP.

Toggle: ``settings.RATE_LIMIT_ENABLED``. When False, every dependency
short-circuits and the request proceeds without any check (used by the
test suite via an autouse fixture).
"""
from fastapi import Depends, HTTPException, Request, status
from limits import parse as parse_limit
from limits.aio import strategies
from limits.aio.storage import MemoryStorage, RedisStorage, Storage

from src.core.settings import settings
from src.domain.entities.user import User
from src.interface.api.dependencies import get_current_user


def _build_storage() -> Storage:
    if settings.is_production and settings.REDIS_URL:
        uri = settings.REDIS_URL
        # `limits.aio.storage.RedisStorage` expects an `async+redis://...` URI.
        if not uri.startswith("async+"):
            uri = "async+" + uri
        try:
            return RedisStorage(uri, implementation="redispy")
        except Exception:
            # Configuration error → degrade to memory, but log so ops sees it.
            import structlog
            structlog.get_logger(__name__).warning(
                "rate_limit.redis_unavailable_falling_back_to_memory",
                redis_url=settings.REDIS_URL,
            )
    return MemoryStorage()


_storage: Storage = _build_storage()
_limiter = strategies.MovingWindowRateLimiter(_storage)

_login_item = parse_limit(settings.RATE_LIMIT_AUTH_LOGIN)
_apply_item = parse_limit(settings.RATE_LIMIT_PUBLIC_APPLY)
_analysis_item = parse_limit(settings.RATE_LIMIT_ANALYSIS_REQUEST)
_retry_item = parse_limit(settings.RATE_LIMIT_ANALYSIS_RETRY)


async def _check(item, *keys: str, message: str) -> None:
    if not settings.RATE_LIMIT_ENABLED:
        return
    allowed = await _limiter.hit(item, *keys)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=message,
        )


def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


# ── IP-keyed (public endpoints) ──────────────────────────────────────────────


async def rate_limit_login(request: Request) -> None:
    """Login: IP-based. Protects against brute-force from a single source."""
    await _check(
        _login_item,
        _ip(request),
        "auth:login",
        message="Muitas tentativas de login. Aguarde 1 minuto e tente novamente.",
    )


async def rate_limit_public_apply(request: Request) -> None:
    """Public candidate apply: IP-based. Caller is unauthenticated."""
    await _check(
        _apply_item,
        _ip(request),
        "public:apply",
        message="Muitas candidaturas enviadas. Aguarde 1 minuto e tente novamente.",
    )


# ── User-keyed (authenticated endpoints) ─────────────────────────────────────


async def rate_limit_analysis_request(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> None:
    """Analysis request: keyed by user_id. Two users on the same IP are
    independent; one cannot exhaust the other's quota.

    Falls back to IP if ``current_user`` is unavailable for any reason.
    """
    key = str(current_user.id) if current_user is not None else _ip(request)
    await _check(
        _analysis_item,
        key,
        "analyses:request",
        message="Limite de solicitações de análise atingido. Aguarde 1 minuto e tente novamente.",
    )


async def rate_limit_analysis_retry(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> None:
    """Analysis retry: keyed by user_id with IP fallback."""
    key = str(current_user.id) if current_user is not None else _ip(request)
    await _check(
        _retry_item,
        key,
        "analyses:retry",
        message="Limite de reprocessamentos atingido. Aguarde 1 minuto e tente novamente.",
    )


async def reset_rate_limit_storage() -> None:
    """Reset all counters. For use in tests only."""
    await _storage.reset()
