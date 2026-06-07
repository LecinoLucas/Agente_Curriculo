from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from src.domain.entities.user import User, UserRole, UserStatus
from src.interface.api.dependencies import get_current_user, get_db
from src.interface.api.main import app

_fastapi_app = app.app if hasattr(app, "app") else app
_ENDPOINT = "/api/v1/ai/status"


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


class _DummyDb:
    async def execute(self, *_args, **_kwargs):
        raise AssertionError("pgvector check should be patched in status endpoint tests")


async def _override_db():
    return _DummyDb()


def _clear_overrides() -> None:
    _fastapi_app.dependency_overrides.pop(get_current_user, None)
    _fastapi_app.dependency_overrides.pop(get_db, None)


class TestAiStatusEndpointAuth:
    async def test_requires_authentication(self) -> None:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(_ENDPOINT)

        assert resp.status_code == 401

    async def test_candidate_cannot_access(self) -> None:
        _fastapi_app.dependency_overrides[get_current_user] = lambda: _user(UserRole.CANDIDATE)
        _fastapi_app.dependency_overrides[get_db] = _override_db
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get(_ENDPOINT)
        finally:
            _clear_overrides()

        assert resp.status_code == 403

    async def test_viewer_cannot_access_sensitive_status(self) -> None:
        _fastapi_app.dependency_overrides[get_current_user] = lambda: _user(UserRole.VIEWER)
        _fastapi_app.dependency_overrides[get_db] = _override_db
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get(_ENDPOINT)
        finally:
            _clear_overrides()

        assert resp.status_code == 403


class TestAiStatusEndpointPayload:
    async def test_admin_gets_read_only_status_without_secrets(self) -> None:
        _fastapi_app.dependency_overrides[get_current_user] = lambda: _user(UserRole.ADMIN)
        _fastapi_app.dependency_overrides[get_db] = _override_db
        try:
            with (
                patch(
                    "src.interface.api.routers.ai_assistant.is_pgvector_available",
                    new_callable=AsyncMock,
                    return_value=False,
                ),
                patch("src.interface.api.routers.ai_assistant.settings.GOOGLE_API_KEY_1", "AIza-test-secret"),
                patch("src.interface.api.routers.ai_assistant.settings.PROTHEUS_REAL_SEND_ENABLED", False),
                patch("src.interface.api.routers.ai_assistant.settings.ERP_ALLOW_REAL_SEND", False),
            ):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.get(_ENDPOINT)
        finally:
            _clear_overrides()

        assert resp.status_code == 200
        body = resp.json()
        body_str = str(body)
        assert body["ok"] is True
        assert body["assistant"]["read_only"] is True
        assert body["assistant"]["free_text_enabled"] is False
        assert body["rag"]["vector_storage_mode"] == "json_fallback"
        assert body["rag"]["pgvector_available"] is False
        assert isinstance(body["providers"]["gemini_api_key_configured"], bool)
        assert body["providers"]["gemini_api_key_configured"] is True
        assert body["protheus"]["real_send_enabled"] is False
        assert body["protheus"]["erp_allow_real_send"] is False
        assert "GEMINI_API_KEY" not in body_str
        assert "GOOGLE_API_KEY" not in body_str
        assert "AIza-test-secret" not in body_str

    async def test_returns_rag_assistant_and_protheus_flags(self) -> None:
        _fastapi_app.dependency_overrides[get_current_user] = lambda: _user(UserRole.ADMIN)
        _fastapi_app.dependency_overrides[get_db] = _override_db
        try:
            with patch(
                "src.interface.api.routers.ai_assistant.is_pgvector_available",
                new_callable=AsyncMock,
                return_value=True,
            ):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.get(_ENDPOINT)
        finally:
            _clear_overrides()

        assert resp.status_code == 200
        body = resp.json()
        assert set(body["assistant"].keys()) == {"enabled", "read_only", "free_text_enabled"}
        assert "embedding_provider" in body["rag"]
        assert "synthesis_enabled" in body["rag"]
        assert "synthesis_model" in body["rag"]
        assert "real_send_enabled" in body["protheus"]
        assert "erp_allow_real_send" in body["protheus"]

    async def test_status_does_not_call_gemini(self) -> None:
        _fastapi_app.dependency_overrides[get_current_user] = lambda: _user(UserRole.ADMIN)
        _fastapi_app.dependency_overrides[get_db] = _override_db
        try:
            with (
                patch(
                    "src.interface.api.routers.ai_assistant.is_pgvector_available",
                    new_callable=AsyncMock,
                    return_value=False,
                ),
                patch("httpx.AsyncClient.post", new_callable=AsyncMock) as post_mock,
            ):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.get(_ENDPOINT)
        finally:
            _clear_overrides()

        assert resp.status_code == 200
        post_mock.assert_not_called()
