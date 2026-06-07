"""Unit tests — AI Assistant read-only endpoint (AI-ASSISTANT-2).

Cobre os critérios:
 1. Endpoint exige autenticação.
 2. Endpoint com intent conhecida chama AssistantRouter e retorna ok=True.
 3. Endpoint com intent desconhecida retorna UNKNOWN_INTENT.
 4. Payload com tool_name direto é ignorado pelo schema.
 5. ToolExecutionContext é criado com read_only=True.
 6. Usuário sem permissão recebe PERMISSION_DENIED.
 7. Service ausente, se simulado, retorna MISSING_SERVICE.
 8. Erro interno retorna INTERNAL_ERROR controlado (sem stack trace).
 9. Endpoint não chama LLM.
10. Endpoint não cria/edita dados — ToolRuntime criado com read_only=True.
11. Endpoint não aceita texto livre como substituto de intent.
12. Cobertura por domínio: job, candidate, pipeline, admission, protheus.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.ai_orchestration.assistant.assistant_response import AssistantResponse
from src.ai_orchestration.core.tool_execution_context import ToolExecutionContext
from src.domain.entities.user import User, UserRole, UserStatus
from src.interface.api.dependencies import get_current_user
from src.interface.api.main import app

# app is wrapped by CORSMiddleware — dependency_overrides lives on the inner FastAPI instance
_fastapi_app = app.app if hasattr(app, "app") else app

_ENDPOINT = "/api/v1/ai/assistant/read-only"


# ── Helpers ───────────────────────────────────────────────────────────────────


def _user(role: UserRole = UserRole.RECRUITER) -> User:
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


def _ok_response(
    intent: str = "job.summary",
    tool_name: str = "get_job_summary",
) -> AssistantResponse:
    return AssistantResponse(ok=True, intent=intent, tool_name=tool_name, data={"mocked": True})


# ── Test 1: Autenticação obrigatória ──────────────────────────────────────────


class TestAuthentication:
    async def test_unauthenticated_request_returns_401(self) -> None:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(_ENDPOINT, json={"intent": "job.summary"})
        assert resp.status_code == 401


# ── Test 2: Intent conhecida → AssistantRouter chamado, ok=True ───────────────


class TestKnownIntentReturnsOk:
    async def test_known_intent_calls_router_and_returns_ok(self) -> None:
        user = _user(UserRole.RECRUITER)
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user
        try:
            with (
                patch(
                    "src.interface.api.routers.ai_assistant.AssistantRouter.handle",
                    new_callable=AsyncMock,
                    return_value=_ok_response("job.summary", "get_job_summary"),
                ),
                patch("src.interface.api.routers.ai_assistant._build_services", return_value={}),
            ):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post(
                        _ENDPOINT,
                        json={"intent": "job.summary", "arguments": {"job_id": str(uuid4())}},
                    )
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["intent"] == "job.summary"
        assert body["tool_name"] == "get_job_summary"


# ── Test 3: Intent desconhecida → UNKNOWN_INTENT ──────────────────────────────


class TestUnknownIntent:
    async def test_unknown_intent_returns_unknown_intent_code(self) -> None:
        user = _user(UserRole.RECRUITER)
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.interface.api.routers.ai_assistant._build_services", return_value={}):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post(_ENDPOINT, json={"intent": "definitely.not.an.intent"})
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is False
        assert body["error_code"] == "UNKNOWN_INTENT"
        assert body["tool_name"] is None


# ── Test 4: tool_name direto no payload é ignorado ────────────────────────────


class TestToolNameIgnored:
    async def test_extra_tool_name_field_is_ignored_schema_uses_intent(self) -> None:
        user = _user(UserRole.RECRUITER)
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user
        captured: list[dict[str, Any]] = []

        async def _capture_handle(request, execution_context):  # type: ignore[override]
            captured.append({"intent": request.intent})
            return _ok_response(request.intent)

        try:
            with (
                patch(
                    "src.interface.api.routers.ai_assistant.AssistantRouter.handle",
                    side_effect=_capture_handle,
                ),
                patch("src.interface.api.routers.ai_assistant._build_services", return_value={}),
            ):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post(
                        _ENDPOINT,
                        json={
                            "intent": "job.summary",
                            "tool_name": "get_candidate_summary",  # campo extra — deve ser ignorado
                        },
                    )
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        assert resp.status_code == 200
        assert len(captured) == 1
        # O router recebeu o intent original, não o tool_name do payload
        assert captured[0]["intent"] == "job.summary"


# ── Test 5: ToolExecutionContext criado com read_only=True ────────────────────


class TestExecutionContextReadOnly:
    async def test_execution_context_has_read_only_true(self) -> None:
        user = _user(UserRole.RECRUITER)
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user
        captured_ctx: list[ToolExecutionContext] = []

        async def _capture_ctx(request, execution_context):  # type: ignore[override]
            captured_ctx.append(execution_context)
            return _ok_response(request.intent)

        try:
            with (
                patch(
                    "src.interface.api.routers.ai_assistant.AssistantRouter.handle",
                    side_effect=_capture_ctx,
                ),
                patch("src.interface.api.routers.ai_assistant._build_services", return_value={}),
            ):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    await c.post(_ENDPOINT, json={"intent": "job.summary"})
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        assert len(captured_ctx) == 1
        assert captured_ctx[0].read_only is True


# ── Test 6: Usuário sem permissão → PERMISSION_DENIED ─────────────────────────


class TestPermissionDenied:
    async def test_hr_user_cannot_access_job_domain_intent(self) -> None:
        """HR não tem can_view_jobs → job.summary retorna PERMISSION_DENIED."""
        user = _user(UserRole.HR)
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.interface.api.routers.ai_assistant._build_services", return_value={}):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post(
                        _ENDPOINT,
                        json={"intent": "job.summary", "arguments": {"job_id": str(uuid4())}},
                    )
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is False
        assert body["error_code"] == "PERMISSION_DENIED"

    async def test_viewer_user_cannot_access_knowledge_domain_intent(self) -> None:
        """VIEWER não tem can_use_assistant → knowledge.search retorna PERMISSION_DENIED."""
        user = _user(UserRole.VIEWER)
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.interface.api.routers.ai_assistant._build_services", return_value={}):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post(
                        _ENDPOINT,
                        json={"intent": "knowledge.search", "arguments": {"query": "test"}},
                    )
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is False
        assert body["error_code"] == "PERMISSION_DENIED"


# ── Test 7: Service ausente → MISSING_SERVICE ────────────────────────────────


class TestMissingService:
    async def test_empty_services_dict_returns_missing_service(self) -> None:
        """Recruiter tem can_view_jobs mas sem services → ToolRuntime retorna MISSING_SERVICE."""
        user = _user(UserRole.RECRUITER)
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.interface.api.routers.ai_assistant._build_services", return_value={}):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post(
                        _ENDPOINT,
                        json={"intent": "job.summary", "arguments": {"job_id": str(uuid4())}},
                    )
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is False
        assert body["error_code"] == "MISSING_SERVICE"


# ── Test 8: Erro interno → INTERNAL_ERROR controlado, sem stack trace ─────────


class TestInternalErrorControlled:
    async def test_service_crash_returns_internal_error_not_stack_trace(self) -> None:
        """Se o service lança exceção, a tool captura e retorna INTERNAL_ERROR controlado."""
        user = _user(UserRole.RECRUITER)
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user

        mock_job_service = MagicMock()
        mock_job_service.get = AsyncMock(side_effect=RuntimeError("simulated db crash"))
        services = {"job_service": mock_job_service}

        try:
            with patch("src.interface.api.routers.ai_assistant._build_services", return_value=services):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post(
                        _ENDPOINT,
                        json={"intent": "job.summary", "arguments": {"job_id": str(uuid4())}},
                    )
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is False
        assert body["error_code"] == "INTERNAL_ERROR"
        # Garante que stack trace não está exposto
        body_str = str(body)
        assert "Traceback" not in body_str
        assert "simulated db crash" not in body_str


class TestCandidateSummaryPayloadSanitization:
    async def test_candidate_summary_endpoint_does_not_return_phone(self) -> None:
        user = _user(UserRole.RECRUITER)
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user

        candidate_id = uuid4()
        mock_candidate_service = MagicMock()
        mock_candidate_service.get = AsyncMock()
        mock_candidate_service.get.return_value = MagicMock(
            id=candidate_id,
            full_name="Ana Souza",
            email="ana@example.com",
            phone="+55 11 99999-0000",
            cpf="123.456.789-00",
            salary_expectation="8000.00",
            internal_notes="nota sigilosa",
            location_city="Sao Paulo",
            location_state="SP",
            location_country="BR",
            tags=["Python"],
            application_source="manual",
            data_quality_status="valid",
            created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
            updated_at=datetime(2024, 1, 2, tzinfo=timezone.utc),
        )

        try:
            with patch(
                "src.interface.api.routers.ai_assistant._build_services",
                return_value={"candidate_service": mock_candidate_service},
            ):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post(
                        _ENDPOINT,
                        json={"intent": "candidate.summary", "arguments": {"candidate_id": str(candidate_id)}},
                    )
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["tool_name"] == "get_candidate_summary"
        assert "phone" not in body["data"]
        assert "cpf" not in body["data"]
        assert "salary_expectation" not in body["data"]
        assert "internal_notes" not in body["data"]
        serialized = str(body["data"])
        for value in ("+55 11 99999-0000", "123.456.789-00", "8000.00", "nota sigilosa"):
            assert value not in serialized


# ── Test 9: Endpoint não chama LLM ────────────────────────────────────────────


class TestNoLlmCall:
    async def test_endpoint_does_not_invoke_any_llm_client(self) -> None:
        """O router é determinístico: nenhum cliente LLM deve ser instanciado."""
        user = _user(UserRole.RECRUITER)
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user

        with (
            patch(
                "src.interface.api.routers.ai_assistant.AssistantRouter.handle",
                new_callable=AsyncMock,
                return_value=_ok_response("job.summary"),
            ),
            patch("src.interface.api.routers.ai_assistant._build_services", return_value={}),
            # Garante que nenhum módulo de LLM conhecido é chamado
            patch("anthropic.Anthropic", side_effect=AssertionError("LLM foi instanciado")) as llm_cls,
        ):
            try:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post(_ENDPOINT, json={"intent": "job.summary"})
            finally:
                _fastapi_app.dependency_overrides.pop(get_current_user, None)

            llm_cls.assert_not_called()

        assert resp.status_code == 200
        assert resp.json()["ok"] is True


# ── Test 10: ToolRuntime criado com read_only=True ────────────────────────────


class TestToolRuntimeReadOnly:
    async def test_tool_runtime_instantiated_with_read_only_true(self) -> None:
        """Garante que o ToolRuntime é criado com read_only=True, bloqueando write tools."""
        user = _user(UserRole.RECRUITER)
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user

        from src.ai_orchestration.core.tool_runtime import ToolRuntime as _OrigRuntime

        runtime_kwargs: list[dict[str, Any]] = []
        original_init = _OrigRuntime.__init__

        def _capture_init(self, registry, *, read_only=True):  # type: ignore[override]
            runtime_kwargs.append({"read_only": read_only})
            original_init(self, registry, read_only=read_only)

        try:
            with (
                patch("src.interface.api.routers.ai_assistant.ToolRuntime.__init__", _capture_init),
                patch(
                    "src.interface.api.routers.ai_assistant.AssistantRouter.handle",
                    new_callable=AsyncMock,
                    return_value=_ok_response(),
                ),
                patch("src.interface.api.routers.ai_assistant._build_services", return_value={}),
            ):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    await c.post(_ENDPOINT, json={"intent": "job.summary"})
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        assert len(runtime_kwargs) >= 1
        assert runtime_kwargs[0]["read_only"] is True


# ── Test 11: Texto livre como intent → UNKNOWN_INTENT ────────────────────────


class TestFreeTextNotAccepted:
    async def test_free_text_as_intent_returns_unknown_intent(self) -> None:
        """Texto livre no campo intent não é aceito como routing — retorna UNKNOWN_INTENT."""
        user = _user(UserRole.RECRUITER)
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.interface.api.routers.ai_assistant._build_services", return_value={}):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post(
                        _ENDPOINT,
                        json={"intent": "preciso do resumo da vaga mais recente"},
                    )
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is False
        assert body["error_code"] == "UNKNOWN_INTENT"


# ── Test 12: Cobertura por domínio ────────────────────────────────────────────


_DOMAIN_INTENTS = [
    ("job.summary", "get_job_summary", {"job_id": str(uuid4())}),
    ("candidate.summary", "get_candidate_summary", {"candidate_id": str(uuid4())}),
    ("pipeline.overview", "get_job_pipeline_overview", {"job_id": str(uuid4())}),
    ("admission.case_summary", "get_admission_case_summary", {"admission_case_id": str(uuid4())}),
    ("protheus.export_status", "get_protheus_export_status", {"package_id": str(uuid4())}),
    ("knowledge.search", "search_knowledge", {"query": "test"}),
]


class TestDomainCoverage:
    async def test_job_domain_intent_resolves_to_expected_tool(self) -> None:
        intent, expected_tool, args = _DOMAIN_INTENTS[0]
        await _assert_tool_name_for_domain(intent, expected_tool, args, UserRole.ADMIN)

    async def test_candidate_domain_intent_resolves_to_expected_tool(self) -> None:
        intent, expected_tool, args = _DOMAIN_INTENTS[1]
        await _assert_tool_name_for_domain(intent, expected_tool, args, UserRole.ADMIN)

    async def test_pipeline_domain_intent_resolves_to_expected_tool(self) -> None:
        intent, expected_tool, args = _DOMAIN_INTENTS[2]
        await _assert_tool_name_for_domain(intent, expected_tool, args, UserRole.ADMIN)

    async def test_admission_domain_intent_resolves_to_expected_tool(self) -> None:
        intent, expected_tool, args = _DOMAIN_INTENTS[3]
        await _assert_tool_name_for_domain(intent, expected_tool, args, UserRole.ADMIN)

    async def test_protheus_domain_intent_resolves_to_expected_tool(self) -> None:
        intent, expected_tool, args = _DOMAIN_INTENTS[4]
        await _assert_tool_name_for_domain(intent, expected_tool, args, UserRole.ADMIN)

    async def test_knowledge_domain_intent_resolves_to_expected_tool(self) -> None:
        intent, expected_tool, args = _DOMAIN_INTENTS[5]
        await _assert_tool_name_for_domain(intent, expected_tool, args, UserRole.ADMIN)


async def _assert_tool_name_for_domain(
    intent: str,
    expected_tool: str,
    args: dict[str, Any],
    role: UserRole,
) -> None:
    """Usa router real com services vazios e verifica tool_name resolvido na resposta.

    Com services vazios e admin (todas as permissões), o ToolRuntime passa a
    verificação de permissões e falha em MISSING_SERVICE — mas o tool_name
    já está presente na AssistantResponse, comprovando que o routing foi correto.
    """
    user = _user(role)
    _fastapi_app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch("src.interface.api.routers.ai_assistant._build_services", return_value={}):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.post(_ENDPOINT, json={"intent": intent, "arguments": args})
    finally:
        _fastapi_app.dependency_overrides.pop(get_current_user, None)

    assert resp.status_code == 200
    body = resp.json()
    # MISSING_SERVICE confirma que o routing funcionou (intent → tool_name) e apenas
    # a injeção de service falhou (ausente no dict vazio)
    assert body["tool_name"] == expected_tool, (
        f"intent='{intent}' deveria resolver para '{expected_tool}', "
        f"mas retornou tool_name='{body.get('tool_name')}'"
    )
    assert body["error_code"] == "MISSING_SERVICE"
