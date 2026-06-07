"""P0.5 — Security headers on every HTTP response."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from src.core.settings import settings


@pytest.mark.asyncio
async def test_health_returns_x_content_type_options(client: AsyncClient) -> None:
    r = await client.get("/health")
    assert r.status_code in (200, 503)
    assert r.headers.get("X-Content-Type-Options") == "nosniff"


@pytest.mark.asyncio
async def test_health_returns_x_frame_options_deny(client: AsyncClient) -> None:
    r = await client.get("/health")
    assert r.headers.get("X-Frame-Options") == "DENY"


@pytest.mark.asyncio
async def test_health_returns_referrer_policy(client: AsyncClient) -> None:
    r = await client.get("/health")
    assert r.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


@pytest.mark.asyncio
async def test_health_returns_permissions_policy(client: AsyncClient) -> None:
    r = await client.get("/health")
    policy = r.headers.get("Permissions-Policy")
    assert policy is not None
    assert "camera=()" in policy
    assert "microphone=()" in policy
    assert "geolocation=()" in policy


@pytest.mark.asyncio
async def test_health_returns_csp_when_enabled(client: AsyncClient) -> None:
    r = await client.get("/health")
    csp = r.headers.get("Content-Security-Policy")
    assert csp is not None
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp


@pytest.mark.asyncio
async def test_hsts_absent_in_test_environment_by_default(client: AsyncClient) -> None:
    """Tests run with APP_ENV != production and HSTS_ENABLED False → no HSTS."""
    r = await client.get("/health")
    assert "Strict-Transport-Security" not in r.headers


@pytest.mark.asyncio
async def test_hsts_present_when_explicitly_enabled(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "HSTS_ENABLED", True)
    r = await client.get("/health")
    hsts = r.headers.get("Strict-Transport-Security")
    assert hsts is not None
    assert "max-age=31536000" in hsts
    assert "includeSubDomains" in hsts


@pytest.mark.asyncio
async def test_csp_absent_when_disabled(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "CONTENT_SECURITY_POLICY_ENABLED", False)
    r = await client.get("/health")
    assert "Content-Security-Policy" not in r.headers
    # Other baseline headers must still be present.
    assert r.headers.get("X-Content-Type-Options") == "nosniff"


@pytest.mark.asyncio
async def test_master_toggle_off_strips_all_headers(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "SECURITY_HEADERS_ENABLED", False)
    r = await client.get("/health")
    for header in (
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Content-Security-Policy",
        "Strict-Transport-Security",
    ):
        assert header not in r.headers, f"{header} should not be set when disabled"


@pytest.mark.asyncio
async def test_cors_preflight_still_works(client: AsyncClient) -> None:
    """Adding the security middleware must not break CORS for browser preflights."""
    r = await client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    # The exact status depends on CORS middleware (200 or 204) — what matters
    # is the CORS reply header is present.
    assert r.headers.get("access-control-allow-origin") is not None


@pytest.mark.asyncio
async def test_headers_applied_to_error_responses(client: AsyncClient) -> None:
    """An auth-required endpoint hit without a token returns 401; the security
    headers should still be on that response."""
    r = await client.get("/api/v1/admin/health/overview")
    assert r.status_code in (401, 403)
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"
