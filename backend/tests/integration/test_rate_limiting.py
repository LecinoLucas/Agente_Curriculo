"""Integration tests for rate limiting on protected endpoints.

Each test:
1. Resets the rate limit storage (via reset_rate_limit_storage).
2. Enables RATE_LIMIT_ENABLED via monkeypatch.
3. Fires requests up to and beyond the configured limit.
4. Asserts the last request returns 429 with a PT-BR message.
5. Asserts that with RATE_LIMIT_ENABLED=False, no 429 is returned.
"""
from __future__ import annotations

import io
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.interface.api.rate_limiting import reset_rate_limit_storage


_MINIMAL_PDF = (
    b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
    b"xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n9\n%%EOF"
)


# ── helpers ──────────────────────────────────────────────────────────────────


def _pdf_file() -> tuple[str, io.BytesIO, str]:
    return ("resume.pdf", io.BytesIO(_MINIMAL_PDF), "application/pdf")


def _apply_form(**overrides) -> dict:
    base = {
        "full_name": "Fulano de Tal",
        "cpf": str(uuid4().int)[:11],
        "email": f"rl_{uuid4().hex[:8]}@example.com",
        "phone": "11999998888",
        "city": "São Paulo",
        "state": "SP",
        "salary_expectation": "4500.00",
        "desired_contract_type": "CLT",
        "works_at_marajo_group": "false",
        "lgpd_consent": "true",
        "password": "Senha12345",
        "confirm_password": "Senha12345",
    }
    base.update(overrides)
    return base


async def _create_user_and_get_token(
    client: AsyncClient,
    db_session: AsyncSession,
    email: str = "ratelimit@example.com",
    password: str = "Password123",
) -> str:
    from src.domain.entities.user import UserRole
    from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
    from src.infrastructure.security.password_service import hash_password
    from src.domain.entities.user import User

    repo = SQLAlchemyUserRepository(db_session)
    user = User.create(
        email=email,
        password_hash=hash_password(password),
        full_name="Rate Limit Tester",
        role=UserRole.RECRUITER,
        is_active=True,
    )
    await repo.save(user)
    await db_session.commit()

    r = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


# ── tests: login ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_rate_limit_blocks_after_limit(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """6th login attempt in 1 minute from same IP → 429."""
    from src.core.settings import settings

    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_AUTH_LOGIN", "5/minute")

    payload = {"email": "any@example.com", "password": "wrongpassword"}
    responses = []
    for _ in range(6):
        r = await client.post("/api/v1/auth/login", json=payload)
        responses.append(r.status_code)

    # First 5 should not 429 (they 401 due to wrong credentials)
    assert all(s != 429 for s in responses[:5]), f"Unexpected 429 in first 5: {responses}"
    # 6th must be 429
    assert responses[5] == 429, f"Expected 429 on 6th attempt, got {responses[5]}"

    last = await client.post("/api/v1/auth/login", json=payload)
    body = last.json()
    assert last.status_code == 429
    assert "1 minuto" in body.get("detail", "").lower() or "aguarde" in body.get("detail", "").lower()


@pytest.mark.asyncio
async def test_login_rate_limit_disabled_does_not_block(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With RATE_LIMIT_ENABLED=False, many login attempts never 429."""
    from src.core.settings import settings

    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", False)

    payload = {"email": "any@example.com", "password": "wrongpassword"}
    for _ in range(8):
        r = await client.post("/api/v1/auth/login", json=payload)
        assert r.status_code != 429, f"Should not 429 when disabled, got {r.status_code}"


# ── tests: public apply ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_public_apply_rate_limit_blocks_after_limit(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """11th candidatura from same IP → 429."""
    from src.core.settings import settings

    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_PUBLIC_APPLY", "10/minute")

    statuses = []
    for i in range(11):
        form = _apply_form(
            cpf=str(10000000000 + i),
            email=f"rl_apply_{i}_{uuid4().hex[:6]}@example.com",
        )
        r = await client.post(
            "/api/v1/public/candidates/apply",
            data=form,
            files={"resume_file": _pdf_file()},
        )
        statuses.append(r.status_code)

    assert all(s != 429 for s in statuses[:10]), f"Unexpected 429 in first 10: {statuses}"
    assert statuses[10] == 429, f"Expected 429 on 11th attempt, got {statuses[10]}"

    last = await client.post(
        "/api/v1/public/candidates/apply",
        data=_apply_form(cpf="99999999999", email="last@example.com"),
        files={"resume_file": _pdf_file()},
    )
    assert last.status_code == 429
    assert "aguarde" in last.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_public_apply_rate_limit_disabled_does_not_block(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With RATE_LIMIT_ENABLED=False, many apply attempts never 429."""
    from src.core.settings import settings

    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", False)

    for i in range(12):
        form = _apply_form(
            cpf=str(20000000000 + i),
            email=f"rl_dis_{i}_{uuid4().hex[:6]}@example.com",
        )
        r = await client.post(
            "/api/v1/public/candidates/apply",
            data=form,
            files={"resume_file": _pdf_file()},
        )
        assert r.status_code != 429, f"Should not 429 when disabled, got {r.status_code}"


# ── tests: analysis request ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_analysis_request_rate_limit_blocks_after_limit(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """6th POST /analyses from same IP → 429."""
    from src.core.settings import settings

    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_ANALYSIS_REQUEST", "5/minute")

    token = await _create_user_and_get_token(client, db_session)
    headers = {"Authorization": f"Bearer {token}"}

    statuses = []
    for _ in range(6):
        r = await client.post(
            "/api/v1/analyses",
            params={"resume_version_id": str(uuid4()), "job_id": str(uuid4())},
            headers=headers,
        )
        statuses.append(r.status_code)

    # First 5 hit business logic (404 etc.) — never 429
    assert all(s != 429 for s in statuses[:5]), f"Unexpected 429 in first 5: {statuses}"
    assert statuses[5] == 429, f"Expected 429 on 6th attempt, got {statuses[5]}"

    last = await client.post(
        "/api/v1/analyses",
        params={"resume_version_id": str(uuid4()), "job_id": str(uuid4())},
        headers=headers,
    )
    assert last.status_code == 429
    assert "aguarde" in last.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_analysis_request_rate_limit_disabled_does_not_block(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With RATE_LIMIT_ENABLED=False, many analysis requests never 429."""
    from src.core.settings import settings

    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", False)

    token = await _create_user_and_get_token(
        client, db_session, email="ratelimit2@example.com"
    )
    headers = {"Authorization": f"Bearer {token}"}

    for _ in range(8):
        r = await client.post(
            "/api/v1/analyses",
            params={"resume_version_id": str(uuid4()), "job_id": str(uuid4())},
            headers=headers,
        )
        assert r.status_code != 429, f"Should not 429 when disabled, got {r.status_code}"


@pytest.mark.asyncio
async def test_analysis_request_two_users_same_ip_do_not_share_limit(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two different authenticated users on the same client IP must have
    independent quotas on POST /analyses (limit is per user_id, not per IP)."""
    from src.core.settings import settings

    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_ANALYSIS_REQUEST", "5/minute")

    token_a = await _create_user_and_get_token(client, db_session, email="userA@example.com")
    token_b = await _create_user_and_get_token(client, db_session, email="userB@example.com")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User A exhausts their 5/min quota
    for _ in range(5):
        r = await client.post(
            "/api/v1/analyses",
            params={"resume_version_id": str(uuid4()), "job_id": str(uuid4())},
            headers=headers_a,
        )
        assert r.status_code != 429, f"User A within limit got {r.status_code}"

    # 6th by user A is blocked
    blocked = await client.post(
        "/api/v1/analyses",
        params={"resume_version_id": str(uuid4()), "job_id": str(uuid4())},
        headers=headers_a,
    )
    assert blocked.status_code == 429, "User A should be rate-limited on 6th request"

    # User B (same IP) must NOT be blocked — quota is per-user
    for i in range(5):
        r = await client.post(
            "/api/v1/analyses",
            params={"resume_version_id": str(uuid4()), "job_id": str(uuid4())},
            headers=headers_b,
        )
        assert r.status_code != 429, (
            f"User B request {i+1}/5 unexpectedly got 429 — quota is leaking across users"
        )


@pytest.mark.asyncio
async def test_analysis_retry_rate_limit_blocks_after_limit(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """4th POST /analyses/{id}/retry from same user → 429 (limit 3/minute)."""
    from src.core.settings import settings

    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_ANALYSIS_RETRY", "3/minute")

    token = await _create_user_and_get_token(
        client, db_session, email="retrytest@example.com"
    )
    headers = {"Authorization": f"Bearer {token}"}

    statuses = []
    for _ in range(4):
        r = await client.post(
            f"/api/v1/analyses/{uuid4()}/retry",
            headers=headers,
        )
        statuses.append(r.status_code)

    # First 3 hit business logic (404 — analysis not found) and never 429
    assert all(s != 429 for s in statuses[:3]), f"Unexpected 429 in first 3: {statuses}"
    # 4th must be 429
    assert statuses[3] == 429, f"Expected 429 on 4th retry, got {statuses[3]}"

    last = await client.post(f"/api/v1/analyses/{uuid4()}/retry", headers=headers)
    assert last.status_code == 429
    assert "aguarde" in last.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_analysis_retry_two_users_same_ip_do_not_share_limit(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Retry quota is per user_id, not per IP."""
    from src.core.settings import settings

    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_ANALYSIS_RETRY", "3/minute")

    token_a = await _create_user_and_get_token(client, db_session, email="retryA@example.com")
    token_b = await _create_user_and_get_token(client, db_session, email="retryB@example.com")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Exhaust user A's quota (3) and force a 4th → 429
    for _ in range(3):
        await client.post(f"/api/v1/analyses/{uuid4()}/retry", headers=headers_a)
    blocked = await client.post(f"/api/v1/analyses/{uuid4()}/retry", headers=headers_a)
    assert blocked.status_code == 429, "User A should be rate-limited on 4th retry"

    # User B should still have full quota
    for i in range(3):
        r = await client.post(f"/api/v1/analyses/{uuid4()}/retry", headers=headers_b)
        assert r.status_code != 429, (
            f"User B retry {i+1}/3 unexpectedly got 429 — quota leaking across users"
        )
