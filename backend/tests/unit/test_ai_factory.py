import pytest

from src.infrastructure.ai.claude_adapter import ClaudeAdapter
from src.infrastructure.ai.factory import AIServiceFactory, UnsupportedAIProviderError
from src.infrastructure.ai.gemini_adapter import GeminiAdapter


def test_factory_resolves_claude_provider():
    service = AIServiceFactory.create("anthropic", "claude-sonnet-4-6")
    assert isinstance(service, ClaudeAdapter)


def test_factory_resolves_gemini_provider():
    service = AIServiceFactory.create("gemini", "gemini-1.5-pro")
    assert isinstance(service, GeminiAdapter)


def test_factory_rejects_unknown_provider():
    with pytest.raises(UnsupportedAIProviderError):
        AIServiceFactory.create("openai", "gpt-test")
