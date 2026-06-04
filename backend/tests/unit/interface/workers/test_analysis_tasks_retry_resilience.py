from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import pytest
from celery.exceptions import Retry

from src.application.ports.ai_service import AIAnalysisResponse
from src.infrastructure.ai.gemini_adapter import AIProviderRateLimitedError
from src.interface.workers.analysis_tasks import (
    MAX_ANALYSIS_RETRIES,
    AnalysisErrorClassification,
    AnalysisExecutionError,
    AnalysisFailureDetails,
    _build_final_failure_reason,
    _build_retry_delay_seconds,
    _classify_analysis_exception,
    _extract_rate_limit_retry_after_seconds,
    _mark_analysis_failed,
    _mark_analysis_retry_scheduled,
    _run_real_ai_analysis,
    process_analysis,
)


def _http_error(status_code: int, *, retry_after: str | None = None) -> httpx.HTTPStatusError:
    headers = {"retry-after": retry_after} if retry_after is not None else {}
    response = httpx.Response(
        status_code=status_code,
        headers=headers,
        json={"error": {"message": f"HTTP {status_code}"}},
        request=httpx.Request("POST", "https://example.com"),
    )
    return httpx.HTTPStatusError(
        f"HTTP {status_code}",
        request=response.request,
        response=response,
    )


def _raise_analysis_error(
    cause: Exception,
    *,
    provider: str = "gemini",
    model_id: str = "gemini-2.5-flash",
) -> AnalysisExecutionError:
    try:
        raise cause
    except Exception as exc:
        raise AnalysisExecutionError(
            str(exc),
            details=AnalysisFailureDetails(
                provider=provider,
                model_id=model_id,
            ),
        ) from exc


def _mock_sessionmaker(mock_session: AsyncMock) -> MagicMock:
    factory = MagicMock()
    factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    factory.return_value.__aexit__ = AsyncMock(return_value=None)
    return factory


class TestRetryClassification:
    def test_extracts_retry_after_seconds_from_error(self) -> None:
        error = (
            'httpx.HTTPStatusError("Too Many Requests", '
            "status_code=429, retry_after_seconds=120)"
        )
        assert _extract_rate_limit_retry_after_seconds(error) == 120.0

    def test_classifies_429_as_temporary(self) -> None:
        with pytest.raises(AnalysisExecutionError) as exc_info:
            _raise_analysis_error(_http_error(429, retry_after="30"))

        classified = _classify_analysis_exception(exc_info.value)

        assert classified.is_temporary is True
        assert classified.provider_error_type == "rate_limited"
        assert classified.status_code == 429
        assert classified.retry_after_seconds == 30.0

    def test_classifies_provider_rate_limited_error(self) -> None:
        cooldown_until = datetime.now(UTC) + timedelta(seconds=90)
        with pytest.raises(AnalysisExecutionError) as exc_info:
            _raise_analysis_error(
                AIProviderRateLimitedError(
                    "All configured Gemini API keys are in rate-limit cooldown.",
                    provider="google",
                    model_id="gemini-2.5-flash",
                    retry_after_seconds=90,
                    cooldown_until=cooldown_until,
                    configured_key_count=2,
                    available_key_count=0,
                ),
                provider="google",
                model_id="gemini-2.5-flash",
            )

        classified = _classify_analysis_exception(exc_info.value)

        assert classified.is_temporary is True
        assert classified.provider_error_type == "rate_limited"
        assert classified.status_code == 429
        assert classified.retry_after_seconds == 90
        assert classified.cooldown_until == cooldown_until
        assert classified.configured_key_count == 2
        assert classified.available_key_count == 0

    def test_classifies_503_as_temporary(self) -> None:
        with pytest.raises(AnalysisExecutionError) as exc_info:
            _raise_analysis_error(_http_error(503))

        classified = _classify_analysis_exception(exc_info.value)

        assert classified.is_temporary is True
        assert classified.provider_error_type == "provider_unavailable"
        assert classified.status_code == 503

    def test_classifies_400_as_definitive(self) -> None:
        with pytest.raises(AnalysisExecutionError) as exc_info:
            _raise_analysis_error(_http_error(400))

        classified = _classify_analysis_exception(exc_info.value)

        assert classified.is_temporary is False
        assert classified.provider_error_type == "bad_request"
        assert classified.status_code == 400

    def test_classifies_payload_invalid_as_definitive(self) -> None:
        exc = AnalysisExecutionError(
            "Failed to parse AI response",
            details=AnalysisFailureDetails(provider="gemini", model_id="gemini-2.5-flash"),
        )

        classified = _classify_analysis_exception(exc)

        assert classified.is_temporary is False
        assert classified.provider_error_type == "payload_invalid"

    def test_backoff_schedule_matches_requirements(self) -> None:
        with patch("src.interface.workers.analysis_tasks.random.randint", return_value=0):
            assert _build_retry_delay_seconds(1) == 15
            assert _build_retry_delay_seconds(2) == 45
            assert _build_retry_delay_seconds(3) == 120
            assert _build_retry_delay_seconds(4) == 300

    def test_backoff_respects_retry_after_when_longer(self) -> None:
        with patch("src.interface.workers.analysis_tasks.random.randint", return_value=0):
            assert _build_retry_delay_seconds(1, retry_after_seconds=45.2) == 46


class TestRetryPersistence:
    @pytest.mark.asyncio
    async def test_marks_analysis_as_retry_scheduled_for_temporary_error(self) -> None:
        analysis_id = uuid4()
        mock_analysis = MagicMock()
        mock_analysis.status = "processing"
        mock_analysis.next_retry_at = None

        mock_session = AsyncMock()
        mock_session.scalar = AsyncMock(return_value=mock_analysis)
        mock_session.commit = AsyncMock()

        await _mark_analysis_retry_scheduled(
            analysis_id=str(analysis_id),
            task_id="task-123",
            error="status_code=503",
            retry_count=2,
            countdown_seconds=45,
            attempts=2,
            classification=AnalysisErrorClassification(
                provider_error_type="provider_unavailable",
                is_temporary=True,
                status_code=503,
            ),
            sessionmaker=_mock_sessionmaker(mock_session),
        )

        assert mock_analysis.status == "retry_scheduled"
        assert mock_analysis.retry_count == 2
        assert mock_analysis.attempts == 2
        assert mock_analysis.provider_error_type == "provider_unavailable"
        assert mock_analysis.provider_status_code == 503
        assert (
            mock_analysis.failure_reason
            == "Alta demanda no provedor IA. Tentando novamente automaticamente."
        )
        assert mock_analysis.next_retry_at is not None

        delta = mock_analysis.next_retry_at - datetime.now(UTC)
        assert 40 <= delta.total_seconds() <= 50

    @pytest.mark.asyncio
    async def test_marks_rate_limit_retry_with_clear_sanitized_reason(self) -> None:
        analysis_id = uuid4()
        mock_analysis = MagicMock()
        mock_analysis.status = "processing"
        mock_analysis.next_retry_at = None

        mock_session = AsyncMock()
        mock_session.scalar = AsyncMock(return_value=mock_analysis)
        mock_session.commit = AsyncMock()

        await _mark_analysis_retry_scheduled(
            analysis_id=str(analysis_id),
            task_id="task-123",
            error="POST https://generativelanguage.googleapis.com/v1/models/gemini?key=AIzaSECRET12345678901234567890",
            retry_count=1,
            countdown_seconds=48,
            attempts=1,
            classification=AnalysisErrorClassification(
                provider_error_type="rate_limited",
                is_temporary=True,
                status_code=429,
                retry_after_seconds=39,
            ),
            sessionmaker=_mock_sessionmaker(mock_session),
        )

        assert mock_analysis.status == "retry_scheduled"
        assert mock_analysis.provider_error_type == "rate_limited"
        assert mock_analysis.provider_status_code == 429
        assert (
            mock_analysis.failure_reason
            == "Limite de uso do provedor IA atingido. Nova tentativa automática agendada."
        )
        assert mock_analysis.next_retry_at is not None

    @pytest.mark.asyncio
    async def test_marks_analysis_failed_after_retry_limit(self) -> None:
        analysis_id = uuid4()
        mock_analysis = MagicMock()
        mock_analysis.status = "processing"
        mock_analysis.next_retry_at = datetime.now(UTC) + timedelta(seconds=60)

        mock_session = AsyncMock()
        mock_session.scalar = AsyncMock(return_value=mock_analysis)
        mock_session.commit = AsyncMock()

        await _mark_analysis_failed(
            analysis_id=str(analysis_id),
            task_id="task-123",
            error="status_code=503 upstream unavailable",
            retry_count=4,
            attempts=5,
            classification=AnalysisErrorClassification(
                provider_error_type="provider_unavailable",
                is_temporary=True,
                status_code=503,
            ),
            sessionmaker=_mock_sessionmaker(mock_session),
        )

        assert mock_analysis.status == "failed"
        assert mock_analysis.retry_count == MAX_ANALYSIS_RETRIES
        assert mock_analysis.attempts == 5
        assert mock_analysis.provider_error_type == "provider_unavailable"
        assert mock_analysis.provider_status_code == 503
        assert mock_analysis.next_retry_at is None
        assert mock_analysis.failure_reason.startswith(
            "Alta demanda no provedor IA após múltiplas tentativas."
        )

    def test_final_failure_reason_redacts_provider_api_key(self) -> None:
        reason = _build_final_failure_reason(
            classification=AnalysisErrorClassification(
                provider_error_type="provider_unavailable",
                is_temporary=True,
                status_code=503,
            ),
            error="429 at https://generativelanguage.googleapis.com/v1/models/gemini?key=AIzaSECRET12345678901234567890",
        )

        assert "AIza" not in reason
        assert "key=[REDACTED]" in reason

    def test_rate_limit_exhausted_uses_clear_final_failure_reason(self) -> None:
        reason = _build_final_failure_reason(
            classification=AnalysisErrorClassification(
                provider_error_type="rate_limited",
                is_temporary=True,
                status_code=429,
            ),
            error="429 rate limited",
        )

        assert reason == "provider_rate_limit_exhausted"

    def test_ai_response_schema_failure_reason_keeps_parser_code(self) -> None:
        reason = _build_final_failure_reason(
            classification=AnalysisErrorClassification(
                provider_error_type="payload_invalid",
                is_temporary=False,
            ),
            error="ai_response_missing_required_fields: missing fields; fields=education",
        )

        assert reason.startswith("ai_response_missing_required_fields")


class TestCeleryRetryBehavior:
    @pytest.mark.asyncio
    async def test_invalid_ai_json_does_not_return_completed_result_fields(self) -> None:
        class FakeAIService:
            async def analyze(self, request):
                return AIAnalysisResponse(
                    content="{invalid-json",
                    input_tokens=10,
                    output_tokens=5,
                    cache_read_tokens=0,
                    cache_write_tokens=0,
                    processing_time_ms=20,
                    finish_reason="STOP",
                )

        with (
            patch(
                "src.infrastructure.ai.factory.AIServiceFactory.create",
                return_value=FakeAIService(),
            ),
            patch(
                "src.interface.workers.analysis_tasks.safe_persist_ai_usage_log",
                new_callable=AsyncMock,
            ),
            pytest.raises(AnalysisExecutionError) as exc_info,
        ):
            await _run_real_ai_analysis(
                analysis_id=str(uuid4()),
                resume_text="Python FastAPI",
                prompt_version="7",
                provider="google",
                model_id="gemini-2.5-flash",
                prompt_max_tokens=1200,
                prompt_temperature=0.1,
                queue_name="analysis",
                sessionmaker=MagicMock(),
                job_id=None,
            )

        assert "ai_response_invalid_json" in str(exc_info.value)
        classified = _classify_analysis_exception(exc_info.value)
        assert classified.provider_error_type == "payload_invalid"
        assert classified.is_temporary is False
        assert exc_info.value.details.raw_llm_response == "{invalid-json"

    def test_process_analysis_uses_celery_retry_for_rate_limit_below_limit(self) -> None:
        rate_limit_exc = None
        try:
            _raise_analysis_error(
                AIProviderRateLimitedError(
                    "All configured Gemini API keys are in rate-limit cooldown.",
                    provider="google",
                    model_id="gemini-2.5-flash",
                    retry_after_seconds=60,
                    cooldown_until=datetime.now(UTC) + timedelta(seconds=60),
                    configured_key_count=2,
                    available_key_count=0,
                ),
                provider="google",
                model_id="gemini-2.5-flash",
            )
        except AnalysisExecutionError as exc:
            rate_limit_exc = exc

        assert rate_limit_exc is not None

        process_analysis.request.id = "task-123"
        process_analysis.request.retries = 0

        retry_triggered = Retry("scheduled")
        outcomes = iter([rate_limit_exc, None])

        def fake_run_async(coro):
            coro.close()
            outcome = next(outcomes)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        with (
            patch("src.interface.workers.analysis_tasks._run_async", side_effect=fake_run_async),
            patch.object(process_analysis, "apply_async") as apply_async_mock,
            patch.object(process_analysis, "retry", side_effect=retry_triggered) as retry_mock,
            patch("src.interface.workers.analysis_tasks.random.randint", return_value=0),
            pytest.raises(Retry),
        ):
            process_analysis.run("analysis-123")

        apply_async_mock.assert_not_called()
        retry_mock.assert_called_once()
        assert retry_mock.call_args.kwargs["countdown"] == 60

    def test_process_analysis_marks_rate_limit_failed_when_retry_limit_exhausted(self) -> None:
        rate_limit_exc = None
        try:
            _raise_analysis_error(
                AIProviderRateLimitedError(
                    "All configured Gemini API keys are in rate-limit cooldown.",
                    provider="google",
                    model_id="gemini-2.5-flash",
                    retry_after_seconds=60,
                    cooldown_until=datetime.now(UTC) + timedelta(seconds=60),
                    configured_key_count=2,
                    available_key_count=0,
                ),
                provider="google",
                model_id="gemini-2.5-flash",
            )
        except AnalysisExecutionError as exc:
            rate_limit_exc = exc

        assert rate_limit_exc is not None

        process_analysis.request.id = "task-123"
        process_analysis.request.retries = MAX_ANALYSIS_RETRIES

        outcomes = iter([rate_limit_exc, None])

        def fake_run_async(coro):
            coro.close()
            outcome = next(outcomes)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        with (
            patch("src.interface.workers.analysis_tasks._run_async", side_effect=fake_run_async),
            patch(
                "src.interface.workers.analysis_tasks._mark_analysis_failed_async",
                new_callable=AsyncMock,
            ) as failed_mock,
            patch.object(process_analysis, "apply_async") as apply_async_mock,
            patch.object(process_analysis, "retry") as retry_mock,
            pytest.raises(AnalysisExecutionError),
        ):
            process_analysis.run("analysis-123")

        failed_mock.assert_called_once()
        assert failed_mock.call_args.kwargs["retry_count"] == MAX_ANALYSIS_RETRIES
        assert failed_mock.call_args.kwargs["classification"].provider_error_type == "rate_limited"
        apply_async_mock.assert_not_called()
        retry_mock.assert_not_called()

    def test_process_analysis_uses_celery_retry_for_temporary_error(self) -> None:
        temp_exc = None
        try:
            _raise_analysis_error(_http_error(503))
        except AnalysisExecutionError as exc:
            temp_exc = exc

        assert temp_exc is not None

        retry_triggered = Retry("scheduled")
        process_analysis.request.id = "task-123"
        process_analysis.request.retries = 0

        outcomes = iter([temp_exc, None])

        def fake_run_async(coro):
            coro.close()
            outcome = next(outcomes)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        with (
            patch(
                "src.interface.workers.analysis_tasks._run_async",
                side_effect=fake_run_async,
            ) as run_async,
            patch.object(process_analysis, "retry", side_effect=retry_triggered) as retry_mock,
            patch("src.interface.workers.analysis_tasks.random.randint", return_value=0),
            pytest.raises(Retry),
        ):
            process_analysis.run("analysis-123")

        assert run_async.call_count == 2
        retry_mock.assert_called_once()
        assert retry_mock.call_args.kwargs["countdown"] == 15

    def test_process_analysis_fails_immediately_for_definitive_error(self) -> None:
        final_exc = None
        try:
            _raise_analysis_error(_http_error(400))
        except AnalysisExecutionError as exc:
            final_exc = exc

        assert final_exc is not None

        process_analysis.request.id = "task-123"
        process_analysis.request.retries = 0

        outcomes = iter([final_exc, None])

        def fake_run_async(coro):
            coro.close()
            outcome = next(outcomes)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        with (
            patch(
                "src.interface.workers.analysis_tasks._run_async",
                side_effect=fake_run_async,
            ) as run_async,
            patch.object(process_analysis, "retry") as retry_mock,
            pytest.raises(AnalysisExecutionError),
        ):
            process_analysis.run("analysis-123")

        assert run_async.call_count == 2
        retry_mock.assert_not_called()
