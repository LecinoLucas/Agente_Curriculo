import time

import structlog
from anthropic import AsyncAnthropic

from src.application.ports.ai_service import AIAnalysisRequest, AIAnalysisResponse, AIService
from src.core.settings import settings

logger = structlog.get_logger(__name__)


class ClaudeAdapter(AIService):
    def __init__(self, model_id: str) -> None:
        self._client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self._model_id = model_id

    async def analyze(self, request: AIAnalysisRequest) -> AIAnalysisResponse:
        start_ms = int(time.monotonic() * 1000)

        # System prompt is marked ephemeral so Anthropic caches it across calls.
        # ~80% of tokens are in the system prompt → significant cost reduction.
        system = [
            {
                "type": "text",
                "text": request.system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ]

        response = await self._client.messages.create(
            model=self._model_id or settings.ANTHROPIC_DEFAULT_MODEL,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            system=system,  # type: ignore[arg-type]
            messages=[{"role": "user", "content": request.prompt_template}],
        )

        elapsed_ms = int(time.monotonic() * 1000) - start_ms
        content = response.content[0].text if response.content else ""

        usage = response.usage
        cache_read = int(getattr(usage, "cache_read_input_tokens", 0) or 0)
        cache_write = int(getattr(usage, "cache_creation_input_tokens", 0) or 0)

        logger.info(
            "claude.response",
            model=self._model_id or settings.ANTHROPIC_DEFAULT_MODEL,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_read_tokens=cache_read,
            cache_write_tokens=cache_write,
            elapsed_ms=elapsed_ms,
        )

        return AIAnalysisResponse(
            content=content,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_read_tokens=cache_read,
            cache_write_tokens=cache_write,
            processing_time_ms=elapsed_ms,
        )
