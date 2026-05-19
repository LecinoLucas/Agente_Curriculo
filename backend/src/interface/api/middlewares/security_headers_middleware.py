"""P0.5 — Security headers for every HTTP response.

Adds the OWASP-recommended baseline so the browser denies framing, MIME-sniffing,
implicit referrer leakage and excessive permission grants. The Content-Security-Policy
is intentionally minimal (``default-src 'self'; frame-ancestors 'none'``); broader
directives can be added later if the frontend ever needs to load third-party assets.

Controlled by settings:
- ``SECURITY_HEADERS_ENABLED``: master toggle (defaults True).
- ``HSTS_ENABLED``: emit ``Strict-Transport-Security``. Defaults False in dev/test,
  True in production via ``settings.hsts_enabled_effective``.
- ``CONTENT_SECURITY_POLICY_ENABLED``: emit ``Content-Security-Policy``.

Does not alter CORS (CSP's ``frame-ancestors 'none'`` is unrelated to cross-origin
fetches; CORS headers come from the outer ``CORSMiddleware`` wrap in main.py).
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.core.settings import settings


_REFERRER_POLICY = "strict-origin-when-cross-origin"
_PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=()"
_CSP = "default-src 'self'; frame-ancestors 'none'"
_HSTS = "max-age=31536000; includeSubDomains"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        response: Response = await call_next(request)

        if not settings.SECURITY_HEADERS_ENABLED:
            return response

        # Only set if not already present, so a route can override (e.g., a
        # public OAuth callback that needs different framing rules).
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", _REFERRER_POLICY)
        response.headers.setdefault("Permissions-Policy", _PERMISSIONS_POLICY)

        if settings.CONTENT_SECURITY_POLICY_ENABLED:
            response.headers.setdefault("Content-Security-Policy", _CSP)

        if settings.hsts_enabled_effective:
            response.headers.setdefault("Strict-Transport-Security", _HSTS)

        return response
