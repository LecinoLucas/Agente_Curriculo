import asyncio
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from src.application.ports.ai_service import AIAnalysisResponse
from src.application.ports.ai_service import AIAnalysisRequest
from src.application.services.ai_provider_credential_service import AIRuntimeCredential
from src.infrastructure.ai.gemini_adapter import (
    AIProviderRateLimitedError,
    GeminiAdapter,
    _GEMINI_INVALID_KEYS,
    _GEMINI_KEY_COOLDOWNS,
)


def _make_success_response(request_url: str) -> httpx.Response:
    return httpx.Response(
        status_code=200,
        json={
            "candidates": [
                {
                    "finishReason": "STOP",
                    "content": {"parts": [{"text": '{"ok": true}'}]},
                }
            ],
            "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 2},
        },
        request=httpx.Request("POST", request_url),
    )


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


def _make_http_400_invalid_key_response() -> httpx.Response:
    return httpx.Response(
        status_code=400,
        json={"error": {"message": "API key not valid. Please pass a valid API key."}},
        request=httpx.Request("POST", "https://example.com"),
    )


def _make_http_400_all_keys_invalid_response() -> httpx.Response:
    return httpx.Response(
        status_code=400,
        json={"error": {"message": "All configured Gemini API keys are invalid."}},
        request=httpx.Request("POST", "https://example.com"),
    )


@pytest.fixture(autouse=True)
def clear_gemini_key_state() -> None:
    _GEMINI_KEY_COOLDOWNS.clear()
    _GEMINI_INVALID_KEYS.clear()
    yield
    _GEMINI_KEY_COOLDOWNS.clear()
    _GEMINI_INVALID_KEYS.clear()


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
async def test_analyze_with_retries_bubbles_up_429_without_local_retry() -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")

    http_error = httpx.HTTPStatusError(
        "Too Many Requests",
        request=httpx.Request("POST", "https://example.com"),
        response=_make_http_429_response(retry_after="2"),
    )

    with (
        patch.object(adapter, "_call_gemini_api", new_callable=AsyncMock) as mock_call,
    ):
        mock_call.side_effect = http_error

        with pytest.raises(httpx.HTTPStatusError):
            await adapter._analyze_with_retries(
                url="https://example.com",
                payload={},
                start_ms=0,
                queue_name="analysis.default",
            )

        assert mock_call.call_count == 1


@pytest.mark.asyncio
async def test_call_gemini_api_redacts_key_from_http_status_error() -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")
    leaked_url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-2.5-flash:generateContent?key=AIzaSECRET12345678901234567890"
    )
    response = httpx.Response(
        status_code=429,
        json={"error": {"message": "Quota exceeded. Please retry in 39s."}},
        request=httpx.Request("POST", leaked_url),
    )

    with patch.object(adapter._client, "post", new_callable=AsyncMock, return_value=response):
        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await adapter._call_gemini_api(url=leaked_url, payload={})

    rendered_error = str(exc_info.value)
    assert "AIza" not in rendered_error
    assert "key=%5BREDACTED%5D" in rendered_error or "key=[REDACTED]" in rendered_error
    assert "AIza" not in str(exc_info.value.request.url)


@pytest.mark.asyncio
async def test_key_failover_uses_second_key_after_first_key_rate_limit() -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")

    async def fake_post(url: str, **kwargs):
        if "key=key-1" in url:
            return httpx.Response(
                status_code=429,
                headers={"retry-after": "39"},
                json={"error": {"message": "Quota exceeded. Please retry in 39s."}},
                request=httpx.Request("POST", url),
            )
        return _make_success_response(url)

    with patch.object(adapter._client, "post", new_callable=AsyncMock, side_effect=fake_post) as post_mock:
        response = await adapter._analyze_with_key_failover(
            api_keys=["key-1", "key-2"],
            payload={},
            start_ms=0,
            queue_name="analysis.default",
        )

    assert response.content == '{"ok": true}'
    assert post_mock.call_count == 2
    assert _GEMINI_KEY_COOLDOWNS[0] > 0
    assert 1 not in _GEMINI_KEY_COOLDOWNS


@pytest.mark.asyncio
async def test_gemini_analyze_uses_database_credential(monkeypatch: pytest.MonkeyPatch) -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")
    credential = AIRuntimeCredential(
        id=None,
        provider="google",
        model_id="gemini-2.5-flash",
        label="db-gemini",
        api_key="db-key-1234",
        key_last4="1234",
        is_persisted=True,
    )

    async def fake_load(cls, **kwargs):
        return [credential]

    async def fake_count(cls, **kwargs):
        return 1

    monkeypatch.setattr(
        "src.infrastructure.ai.gemini_adapter.AIProviderCredentialService.load_available_runtime_credentials",
        classmethod(fake_load),
    )
    monkeypatch.setattr(
        "src.infrastructure.ai.gemini_adapter.AIProviderCredentialService.count_runtime_matching_credentials",
        classmethod(fake_count),
    )

    async def fake_post(url: str, **kwargs):
        assert "key=db-key-1234" in url
        return _make_success_response(url)

    with patch.object(adapter._client, "post", new_callable=AsyncMock, side_effect=fake_post):
        response = await adapter.analyze(
            AIAnalysisRequest(
                resume_text="",
                system_prompt="sistema",
                prompt_template="{}",
                max_tokens=100,
                temperature=0.1,
            )
        )

    assert response.content == '{"ok": true}'


@pytest.mark.asyncio
async def test_gemini_all_database_credentials_in_cooldown_raises_controlled_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")

    async def fake_load(cls, **kwargs):
        return []

    async def fake_count(cls, **kwargs):
        return 2

    monkeypatch.setattr(
        "src.infrastructure.ai.gemini_adapter.AIProviderCredentialService.load_available_runtime_credentials",
        classmethod(fake_load),
    )
    monkeypatch.setattr(
        "src.infrastructure.ai.gemini_adapter.AIProviderCredentialService.count_runtime_matching_credentials",
        classmethod(fake_count),
    )

    with pytest.raises(AIProviderRateLimitedError) as exc_info:
        await adapter.analyze(
            AIAnalysisRequest(
                resume_text="",
                system_prompt="sistema",
                prompt_template="{}",
                max_tokens=100,
                temperature=0.1,
            )
        )

    assert exc_info.value.provider == "google"
    assert exc_info.value.configured_key_count == 2
    assert exc_info.value.available_key_count == 0


@pytest.mark.asyncio
async def test_key_failover_raises_rate_limit_when_all_keys_are_limited() -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")

    async def fake_post(url: str, **kwargs):
        return httpx.Response(
            status_code=429,
            headers={"retry-after": "12"},
            json={"error": {"message": "Quota exceeded. Please retry in 12s."}},
            request=httpx.Request("POST", url),
        )

    with patch.object(adapter._client, "post", new_callable=AsyncMock, side_effect=fake_post):
        with pytest.raises(AIProviderRateLimitedError) as exc_info:
            await adapter._analyze_with_key_failover(
                api_keys=["AIzaFIRSTSECRET123456789012345", "AIzaSECONDSECRET12345678901234"],
                payload={},
                start_ms=0,
                queue_name="analysis.default",
            )

    assert exc_info.value.status_code == 429
    assert exc_info.value.provider_error_type == "rate_limited"
    assert exc_info.value.retry_after_seconds == 12
    assert exc_info.value.configured_key_count == 2
    assert exc_info.value.available_key_count == 0
    assert "AIza" not in str(exc_info.value)
    assert len(_GEMINI_KEY_COOLDOWNS) == 2


@pytest.mark.asyncio
async def test_analyze_with_retries_bubbles_up_connection_error_without_local_retry() -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")
    connect_error = httpx.ConnectError(
        "connection refused",
        request=httpx.Request("POST", "https://example.com"),
    )

    with patch.object(adapter, "_call_gemini_api", new_callable=AsyncMock) as mock_call:
        mock_call.side_effect = connect_error

        with pytest.raises(httpx.ConnectError):
            await adapter._analyze_with_retries(
                url="https://example.com",
                payload={},
                start_ms=0,
                queue_name="analysis.default",
            )

        assert mock_call.call_count == 1


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


@pytest.mark.asyncio
async def test_key_failover_uses_second_key_after_first_key_invalid() -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")
    request = AIAnalysisResponse(
        content='{"ok": true}',
        input_tokens=1,
        output_tokens=2,
        cache_read_tokens=0,
        cache_write_tokens=0,
        processing_time_ms=100,
    )

    responses = [
        _make_http_400_invalid_key_response(),
        _make_success_response("https://example.com"),
    ]

    with patch.object(adapter._client, "post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = [
            httpx.HTTPStatusError("Bad Request", request=httpx.Request("POST", "https://example.com"), response=responses[0]),
            responses[1],
        ]

        response = await adapter._analyze_with_key_failover(
            api_keys=["key_1", "key_2"],
            payload={"test": "payload"},
            start_ms=0,
            queue_name="analysis.default",
        )

    assert response.content == '{"ok": true}'
    assert mock_post.call_count == 2
    assert 0 in _GEMINI_INVALID_KEYS


@pytest.mark.asyncio
async def test_key_failover_raises_when_all_keys_invalid() -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")

    responses = [
        _make_http_400_invalid_key_response(),
        _make_http_400_invalid_key_response(),
    ]

    with patch.object(adapter._client, "post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = [
            httpx.HTTPStatusError("Bad Request", request=httpx.Request("POST", "https://example.com"), response=responses[0]),
            httpx.HTTPStatusError("Bad Request", request=httpx.Request("POST", "https://example.com"), response=responses[1]),
        ]

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await adapter._analyze_with_key_failover(
                api_keys=["key_1", "key_2"],
                payload={"test": "payload"},
                start_ms=0,
                queue_name="analysis.default",
            )

    assert exc_info.value.response.status_code == 400
    assert "All configured Gemini API keys are invalid" in str(exc_info.value)
    assert mock_post.call_count == 2
    assert 0 in _GEMINI_INVALID_KEYS
    assert 1 in _GEMINI_INVALID_KEYS


@pytest.mark.asyncio
async def test_invalid_key_skipped_on_subsequent_call() -> None:
    adapter = GeminiAdapter("gemini-2.5-flash")
    _GEMINI_INVALID_KEYS.add(0)

    with patch.object(adapter._client, "post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = _make_success_response("https://example.com")

        response = await adapter._analyze_with_key_failover(
            api_keys=["key_1", "key_2"],
            payload={"test": "payload"},
            start_ms=0,
            queue_name="analysis.default",
        )

    assert response.content == '{"ok": true}'
    # Only key_2 should be called, not key_1
    assert mock_post.call_count == 1


def test_classify_400_invalid_key_vs_bad_request() -> None:
    from src.interface.workers.analysis_tasks import _classify_analysis_exception

    # Test invalid key
    invalid_key_response = httpx.Response(
        status_code=400,
        json={"error": {"message": "API key not valid. Please pass a valid API key."}},
        request=httpx.Request("POST", "https://example.com"),
    )
    error_invalid_key = httpx.HTTPStatusError("Bad Request", request=invalid_key_response.request, response=invalid_key_response)
    classification = _classify_analysis_exception(error_invalid_key)
    assert classification.provider_error_type == "invalid_api_key"
    assert not classification.is_temporary

    # Test generic bad request
    bad_request_response = httpx.Response(
        status_code=400,
        json={"error": {"message": "Missing required field: email"}},
        request=httpx.Request("POST", "https://example.com"),
    )
    error_bad_request = httpx.HTTPStatusError("Bad Request", request=bad_request_response.request, response=bad_request_response)
    classification = _classify_analysis_exception(error_bad_request)
    assert classification.provider_error_type == "bad_request"
    assert not classification.is_temporary
