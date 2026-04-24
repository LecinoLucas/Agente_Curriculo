import time

import httpx
import structlog

from src.application.ports.ai_service import AIAnalysisRequest, AIAnalysisResponse, AIService
from src.core.settings import settings

logger = structlog.get_logger(__name__)


class GeminiAdapter(AIService):
    def __init__(self, model_id: str) -> None:
        self._model_id = model_id

    async def analyze(self, request: AIAnalysisRequest) -> AIAnalysisResponse:
        if not settings.GOOGLE_API_KEY:
            raise RuntimeError("GOOGLE_API_KEY is not configured")

        start_ms = int(time.monotonic() * 1000)
        url = (
            f"{settings.GEMINI_API_BASE_URL}/models/{self._model_id}:generateContent"
            f"?key={settings.GOOGLE_API_KEY}"
        )
        payload = {
            "systemInstruction": {
                "parts": [{"text": request.system_prompt}],
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": request.prompt_template}],
                }
            ],
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_tokens,
            },
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            body = response.json()

        elapsed_ms = int(time.monotonic() * 1000) - start_ms
        candidates = body.get("candidates", [])
        parts = []
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
        content = "\n".join(part.get("text", "") for part in parts if part.get("text"))

        usage = body.get("usageMetadata", {})
        input_tokens = int(usage.get("promptTokenCount", 0) or 0)
        output_tokens = int(usage.get("candidatesTokenCount", 0) or 0)

        logger.info(
            "gemini.response",
            model=self._model_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            elapsed_ms=elapsed_ms,
        )

        return AIAnalysisResponse(
            content=content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=0,
            cache_write_tokens=0,
            processing_time_ms=elapsed_ms,
        )
