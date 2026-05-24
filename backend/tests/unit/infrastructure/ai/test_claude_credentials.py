from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.application.ports.ai_service import AIAnalysisRequest
from src.application.services.ai_provider_credential_service import AIRuntimeCredential
from src.infrastructure.ai.claude_adapter import ClaudeAdapter
from src.infrastructure.ai.gemini_adapter import AIProviderRateLimitedError


@pytest.mark.asyncio
async def test_claude_uses_database_credential(monkeypatch: pytest.MonkeyPatch) -> None:
    credential = AIRuntimeCredential(
        id=None,
        provider="anthropic",
        model_id="claude-sonnet-4-6",
        label="db-claude",
        api_key="anthropic-db-key-1234",
        key_last4="1234",
        is_persisted=True,
    )
    adapter = ClaudeAdapter("claude-sonnet-4-6")
    monkeypatch.setattr(adapter, "_get_runtime_credentials", AsyncMock(return_value=([credential], 1)))

    seen_keys: list[str] = []

    class FakeMessages:
        async def create(self, **kwargs):
            return SimpleNamespace(
                content=[SimpleNamespace(text='{"ok": true}')],
                usage=SimpleNamespace(
                    input_tokens=10,
                    output_tokens=5,
                    cache_read_input_tokens=0,
                    cache_creation_input_tokens=0,
                ),
            )

    class FakeAnthropic:
        def __init__(self, *, api_key: str):
            seen_keys.append(api_key)
            self.messages = FakeMessages()

    monkeypatch.setattr("src.infrastructure.ai.claude_adapter.AsyncAnthropic", FakeAnthropic)

    response = await adapter.analyze(
        AIAnalysisRequest(
            resume_text="",
            system_prompt="sistema",
            prompt_template="{}",
            max_tokens=100,
            temperature=0.1,
        )
    )

    assert seen_keys == ["anthropic-db-key-1234"]
    assert response.content == '{"ok": true}'


@pytest.mark.asyncio
async def test_claude_all_credentials_in_cooldown_raises_controlled_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    adapter = ClaudeAdapter("claude-sonnet-4-6")
    monkeypatch.setattr(adapter, "_get_runtime_credentials", AsyncMock(return_value=([], 2)))

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

    assert exc_info.value.provider == "anthropic"
    assert exc_info.value.configured_key_count == 2
    assert exc_info.value.available_key_count == 0
