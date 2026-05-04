import asyncio
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from src.application.ports.ai_service import AIAnalysisResponse
from src.infrastructure.ai.gemini_adapter import GeminiAdapter


def _make_http_429_response(*, retry_after: str | None = None, message: str | None = None) -> httpx.Response:
    headers = {}
    if retry_after is not None:
        headers["retry-after"] = retry_after

    body: dict = {}
    if message is not None:
        body = {"error": {"message": message}}

    return httpx.Response(
        status_code=429,
        headers=headers,
        json=body,
        request=httpx.Request("POST", "https://example.com"),
    )


def test_extract_retry_after_seconds_from_header() -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")
    response = _make_http_429_response(retry_after="12.5")
    assert adapter._extract_retry_after_seconds(response) == 12.5


def test_extract_retry_after_seconds_from_error_message() -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")
    response = _make_http_429_response(
        message="Quota exceeded. Please retry in 28.93s."
    )
    assert adapter._extract_retry_after_seconds(response) == 28.93


def test_rate_limit_delay_uses_multiplier_and_retry_after() -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")

    with patch("src.infrastructure.ai.gemini_adapter.random.randint", return_value=0):
        # base (attempt=0) = 800ms, *2 for rate limit = 1600ms.
        assert adapter._calculate_retry_delay_ms(0, is_rate_limit=True) == 1600

        # Retry-After dominates if larger.
        assert adapter._calculate_retry_delay_ms(
            0,
            is_rate_limit=True,
            retry_after_seconds=5.0,
        ) == 5000


@pytest.mark.asyncio
async def test_analyze_with_retries_honors_retry_after_on_429() -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")

    http_error = httpx.HTTPStatusError(
        "Too Many Requests",
        request=httpx.Request("POST", "https://example.com"),
        response=_make_http_429_response(retry_after="2"),
    )

    fake_result = AIAnalysisResponse(
        content='{"ok": true}',
        input_tokens=1,
        output_tokens=1,
        cache_read_tokens=0,
        cache_write_tokens=0,
        processing_time_ms=1,
    )

    with (
        patch.object(adapter, "_call_gemini_api", new_callable=AsyncMock) as mock_call,
        patch.object(adapter, "_parse_response", return_value=fake_result),
        patch("src.infrastructure.ai.gemini_adapter.asyncio.sleep", new_callable=AsyncMock) as mock_sleep,
    ):
        mock_call.side_effect = [http_error, {"candidates": [{"content": {"parts": [{"text": "{}"}]}}]}]

        result = await adapter._analyze_with_retries(
            url="https://example.com",
            payload={},
            start_ms=0,
            queue_name="analysis.default",
        )

        assert result.content == '{"ok": true}'
        assert mock_call.call_count == 2
        mock_sleep.assert_awaited_once()
        sleep_seconds = mock_sleep.await_args.args[0]
        assert sleep_seconds >= 2.0


@pytest.mark.asyncio
async def test_analyze_with_retries_raises_after_final_429() -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")
    http_error = httpx.HTTPStatusError(
        "Too Many Requests",
        request=httpx.Request("POST", "https://example.com"),
        response=_make_http_429_response(retry_after="1"),
    )

    with (
        patch.object(adapter, "_call_gemini_api", new_callable=AsyncMock) as mock_call,
        patch("src.infrastructure.ai.gemini_adapter.asyncio.sleep", new_callable=AsyncMock),
        patch("src.infrastructure.ai.gemini_adapter.settings.AI_MAX_RETRIES", 1),
    ):
        mock_call.side_effect = http_error

        with pytest.raises(RuntimeError, match="status_code=429"):
            await adapter._analyze_with_retries(
                url="https://example.com",
                payload={},
                start_ms=0,
                queue_name="analysis.default",
            )

        assert mock_call.call_count == 2


@pytest.mark.asyncio
async def test_run_with_concurrency_limit_serializes_when_limit_is_one() -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")
    active = 0
    max_active = 0

    async def guarded_call() -> AIAnalysisResponse:
        nonlocal active, max_active
        active += 1
        max_active = max(max_active, active)
        await asyncio.sleep(0.05)
        active -= 1
        return AIAnalysisResponse(
            content='{"ok": true}',
            input_tokens=1,
            output_tokens=1,
            cache_read_tokens=0,
            cache_write_tokens=0,
            processing_time_ms=1,
        )

    with (
        patch("src.infrastructure.ai.gemini_adapter._LOCAL_GEMINI_SEMAPHORE", asyncio.Semaphore(1)),
        patch.object(adapter, "_acquire_distributed_slot", new_callable=AsyncMock),
        patch.object(adapter, "_release_distributed_slot", new_callable=AsyncMock),
    ):
        await asyncio.gather(
            adapter._run_with_concurrency_limit(
                queue_name="analysis.default",
                run_call=guarded_call,
            ),
            adapter._run_with_concurrency_limit(
                queue_name="analysis.default",
                run_call=guarded_call,
            ),
            adapter._run_with_concurrency_limit(
                queue_name="analysis.default",
                run_call=guarded_call,
            ),
        )

    assert max_active == 1
