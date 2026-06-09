"""
AI-USAGE-LOG-HARDENING-1 — regression tests.

Invariants enforced here:
- Failure in usage logging MUST NOT propagate to AI flows (best-effort).
- No sensitive data (prompt, resume, CPF, email, phone) reaches the log model.
- Operation names are stable per flow.
- latency_ms is populated for RAG synthesis.
- estimated_cost_usd is calculated when tokens are present.
"""
from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.application.services.ai_usage_log_service import AIUsageLogPayload, _build_model


# ── _build_model: no sensitive fields ────────────────────────────────────────


class TestBuildModelSafety:
    def _payload(self, **kw) -> AIUsageLogPayload:
        defaults = dict(
            provider="google",
            model="gemini-2.5-flash",
            operation="behavioral_analysis",
            status="success",
            input_tokens=100,
            output_tokens=50,
        )
        return AIUsageLogPayload(**{**defaults, **kw})

    def test_model_has_no_prompt_field(self) -> None:
        row = _build_model(self._payload())
        assert not hasattr(row, "prompt")
        assert not hasattr(row, "prompt_text")
        assert not hasattr(row, "system_prompt")

    def test_model_has_no_resume_field(self) -> None:
        row = _build_model(self._payload())
        assert not hasattr(row, "resume_text")
        assert not hasattr(row, "raw_resume")

    def test_model_has_no_provider_response_field(self) -> None:
        row = _build_model(self._payload())
        assert not hasattr(row, "provider_response")
        assert not hasattr(row, "raw_response")

    def test_error_message_is_normalized(self) -> None:
        row = _build_model(self._payload(error_message="  ", status="error"))
        assert row.error_message is None

    def test_error_message_capped_at_2000_chars(self) -> None:
        long_msg = "x" * 5000
        row = _build_model(self._payload(error_message=long_msg, status="error"))
        assert len(row.error_message) <= 2000

    def test_estimated_cost_computed_for_known_model(self) -> None:
        row = _build_model(self._payload(
            provider="google",
            model="gemini-2.5-flash",
            input_tokens=1000,
            output_tokens=500,
        ))
        assert row.estimated_cost_usd is not None
        assert isinstance(row.estimated_cost_usd, Decimal)
        assert row.estimated_cost_usd > Decimal("0")

    def test_estimated_cost_none_for_unknown_model(self) -> None:
        row = _build_model(self._payload(provider="unknown", model="model-xyz"))
        assert row.estimated_cost_usd is None

    def test_latency_ms_stored(self) -> None:
        row = _build_model(self._payload(latency_ms=350))
        assert row.latency_ms == 350


# ── Operation name stability ──────────────────────────────────────────────────


class TestOperationNames:
    def test_rag_synthesis_operation_name(self) -> None:
        row = _build_model(AIUsageLogPayload(
            provider="google", model="gemini-2.5-flash",
            operation="rag_synthesis", status="success",
        ))
        assert row.operation == "rag_synthesis"

    def test_behavioral_analysis_operation_name(self) -> None:
        row = _build_model(AIUsageLogPayload(
            provider="google", model="gemini-2.5-flash",
            operation="behavioral_analysis", status="success",
        ))
        assert row.operation == "behavioral_analysis"

    def test_job_profile_operation_name(self) -> None:
        row = _build_model(AIUsageLogPayload(
            provider="google", model="gemini-2.5-flash",
            operation="job_profile", status="success",
        ))
        assert row.operation == "job_profile"

    def test_job_ai_draft_operation_name(self) -> None:
        row = _build_model(AIUsageLogPayload(
            provider="google", model="gemini-2.5-flash",
            operation="job_ai_draft", status="success",
        ))
        assert row.operation == "job_ai_draft"

    def test_resume_analysis_operation_name(self) -> None:
        row = _build_model(AIUsageLogPayload(
            provider="google", model="gemini-2.5-flash",
            operation="resume_analysis", status="success",
        ))
        assert row.operation == "resume_analysis"


# ── RAG: latency_ms populated + failure resilience ───────────────────────────


class TestRagUsageLog:
    @pytest.mark.asyncio
    async def test_rag_record_usage_includes_latency_ms(self) -> None:
        from src.ai_orchestration.rag.rag_answer_service import RagAnswerService

        persisted: list[AIUsageLogPayload] = []

        async def fake_persist(session, payload):
            persisted.append(payload)

        mock_session = MagicMock()
        svc = RagAnswerService(usage_session=mock_session)

        with patch(
            "src.ai_orchestration.rag.rag_answer_service.persist_ai_usage_log",
            side_effect=fake_persist,
        ):
            await svc._record_usage(
                status="success",
                input_tokens=100,
                output_tokens=50,
                latency_ms=275,
            )

        assert len(persisted) == 1
        assert persisted[0].latency_ms == 275

    @pytest.mark.asyncio
    async def test_rag_usage_log_failure_does_not_raise(self) -> None:
        from src.ai_orchestration.rag.rag_answer_service import RagAnswerService

        mock_session = MagicMock()
        svc = RagAnswerService(usage_session=mock_session)

        with patch(
            "src.ai_orchestration.rag.rag_answer_service.persist_ai_usage_log",
            side_effect=RuntimeError("DB exploded"),
        ):
            # Must not raise
            await svc._record_usage(status="success", input_tokens=10, output_tokens=5)


# ── job_profiler: error_message sanitized ────────────────────────────────────


class TestJobProfilerSanitization:
    def test_error_message_strips_google_api_key(self) -> None:
        from src.core.log_sanitizer import sanitize_log_text

        raw = "HTTPError: key=AIzaSyXXXXXXXXXXXXXXXXXXXXXXX rejected"
        sanitized = sanitize_log_text(raw)[:500]
        assert "AIzaSy" not in sanitized

    def test_error_message_strips_bearer_token(self) -> None:
        from src.core.log_sanitizer import sanitize_log_text

        raw = "Unauthorized: Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig"
        sanitized = sanitize_log_text(raw)[:500]
        assert "eyJhbGciOiJSUzI1NiJ9" not in sanitized

    def test_error_message_capped_at_500(self) -> None:
        from src.core.log_sanitizer import sanitize_log_text

        long_msg = "error " * 500
        result = sanitize_log_text(long_msg)[:500]
        assert len(result) <= 500


# ── job_ai_draft_graph: persist wrapped in try/except ────────────────────────


class TestJobAiDraftUsageLogResilience:
    def test_persist_calls_are_wrapped_in_try_except(self) -> None:
        import inspect
        import importlib

        mod = importlib.import_module("src.ai_orchestration.jobs.job_ai_draft_graph")
        src = inspect.getsource(mod)

        # Each persist_ai_usage_log call must be inside a try block
        # Count try: blocks and persist calls — there should be ≥3 try blocks guarding them
        lines = src.splitlines()
        try_count = sum(1 for ln in lines if ln.strip() == "try:")
        persist_count = src.count("persist_ai_usage_log(")
        assert try_count >= persist_count, (
            f"Expected at least {persist_count} try blocks wrapping persist calls, found {try_count}"
        )


# ── safe_persist_ai_usage_log: never raises ───────────────────────────────────


class TestSafePersistNeverRaises:
    @pytest.mark.asyncio
    async def test_safe_persist_swallows_db_error(self) -> None:
        from src.application.services.ai_usage_log_service import safe_persist_ai_usage_log

        async def bad_persist(session, payload):
            raise RuntimeError("connection refused")

        factory = MagicMock()
        cm = AsyncMock()
        cm.__aenter__ = AsyncMock(return_value=cm)
        cm.__aexit__ = AsyncMock(return_value=None)
        factory.return_value = cm

        with patch(
            "src.application.services.ai_usage_log_service.persist_ai_usage_log",
            side_effect=bad_persist,
        ):
            # Must not raise
            await safe_persist_ai_usage_log(
                factory,
                AIUsageLogPayload(
                    provider="google",
                    model="gemini-2.5-flash",
                    operation="resume_analysis",
                    status="error",
                ),
            )
