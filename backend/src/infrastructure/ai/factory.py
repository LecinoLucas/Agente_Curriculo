from src.application.ports.ai_service import AIService
from src.infrastructure.ai.claude_adapter import ClaudeAdapter
from src.infrastructure.ai.gemini_adapter import GeminiAdapter


class UnsupportedAIProviderError(Exception):
    pass


class AIServiceFactory:
    @staticmethod
    def create(provider: str, model_id: str) -> AIService:
        normalized = provider.strip().lower()

        if normalized in {"anthropic", "claude"}:
            return ClaudeAdapter(model_id=model_id)
        if normalized in {"google", "gemini"}:
            return GeminiAdapter(model_id=model_id)

        raise UnsupportedAIProviderError(f"Unsupported AI provider: {provider}")
