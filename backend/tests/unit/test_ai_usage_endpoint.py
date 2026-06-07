from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from src.domain.entities.user import User, UserRole, UserStatus
from src.interface.api.dependencies import get_current_user, get_db
from src.interface.api.main import app

_fastapi_app = app.app if hasattr(app, "app") else app
_ENDPOINT = "/api/v1/ai/usage/summary"


def _user(role: UserRole) -> User:
    now = datetime.now(timezone.utc)
    return User(
        id=uuid4(),
        email=f"{role.value}@test.com",
        password_hash="x",
        role=role,
        status=UserStatus.ACTIVE,
        full_name="Test User",
        created_at=now,
        updated_at=now,
    )


class _ScalarResult:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def all(self) -> list[object]:
        return self._rows


class _ExecuteResult:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def scalars(self) -> _ScalarResult:
        return _ScalarResult(self._rows)


class _FakeDb:
    async def execute(self, *_args, **_kwargs) -> _ExecuteResult:
        now = datetime.now(timezone.utc)
        return _ExecuteResult(
            [
                SimpleNamespace(
                    operation="rag_synthesis",
                    provider="gemini",
                    model="gemini-2.5-flash",
                    input_tokens=10,
                    output_tokens=5,
                    total_tokens=15,
                    status="success",
                    created_at=now,
                ),
                SimpleNamespace(
                    operation="job_ai_draft",
                    provider="mock",
                    model="draft-model",
                    input_tokens=7,
                    output_tokens=3,
                    total_tokens=10,
                    status="error",
                    created_at=now,
                ),
            ]
        )


async def _override_db():
    return _FakeDb()


def _clear_overrides() -> None:
    _fastapi_app.dependency_overrides.pop(get_current_user, None)
    _fastapi_app.dependency_overrides.pop(get_db, None)


async def test_ai_usage_summary_requires_authentication() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get(_ENDPOINT)

    assert resp.status_code == 401


async def test_ai_usage_summary_blocks_non_admin_and_candidate() -> None:
    for role in (UserRole.VIEWER, UserRole.CANDIDATE):
        _fastapi_app.dependency_overrides[get_current_user] = lambda role=role: _user(role)
        _fastapi_app.dependency_overrides[get_db] = _override_db
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get(_ENDPOINT)
        finally:
            _clear_overrides()

        assert resp.status_code == 403


async def test_ai_usage_summary_admin_gets_safe_payload() -> None:
    _fastapi_app.dependency_overrides[get_current_user] = lambda: _user(UserRole.ADMIN)
    _fastapi_app.dependency_overrides[get_db] = _override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(_ENDPOINT)
    finally:
        _clear_overrides()

    assert resp.status_code == 200
    body = resp.json()
    serialized = str(body)
    assert body["ok"] is True
    assert body["period"] == "today"
    assert isinstance(body["status"]["gemini_api_key_configured"], bool)
    assert body["totals"]["requests"] == 2
    assert body["totals"]["total_tokens"] == 25
    assert body["totals"]["errors"] == 1
    assert {item["feature"] for item in body["by_feature"]} == {"rag_synthesis", "job_ai_draft"}
    assert len(body["recent"]) == 2
    assert "GEMINI_API_KEY" not in serialized
    assert "GOOGLE_API_KEY" not in serialized
    assert "AIza" not in serialized
    assert "prompt" not in serialized.lower()
    assert "resposta" not in serialized.lower()
    assert "payload_json" not in serialized
    assert "vector_json" not in serialized
    assert "content_hash" not in serialized
    assert "embeddings" not in serialized
