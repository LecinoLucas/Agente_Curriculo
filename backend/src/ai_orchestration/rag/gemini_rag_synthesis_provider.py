"""
Gemini RAG Synthesis Provider: Gera respostas baseadas em evidências usando Google Gemini.

Fase AI-RAG-10 — Síntese com fontes.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from src.core.settings import settings
from src.core.log_sanitizer import sanitize_log_text
from src.ai_orchestration.rag.answer_schemas import RagSynthesisProviderResult

logger = logging.getLogger(__name__)


class GeminiRagSynthesisProvider:
    """Provedor de síntese textual utilizando Google Gemini (AI-RAG-10)."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
    ):
        self._api_key = api_key or settings.GOOGLE_API_KEY_1
        self._model_name = model or settings.RAG_GEMINI_SYNTHESIS_MODEL
        self._provider_name = "gemini"

    @property
    def provider_name(self) -> str:
        return self._provider_name

    @property
    def model_name(self) -> str:
        return self._model_name

    async def generate_response(self, prompt: str) -> RagSynthesisProviderResult:
        """Gera resposta textual para o prompt fornecido, incluindo metadados de tokens."""
        if not self._api_key:
            raise RuntimeError("Gemini API Key não configurada para síntese.")

        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.1, # Baixa temperatura para maior fidelidade às fontes
                "topP": 0.95,
                "maxOutputTokens": 1024,
            }
        }

        try:
            async with httpx.AsyncClient(timeout=settings.AI_PROVIDER_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    f"{settings.GEMINI_API_BASE_URL}/models/{self._model_name}:generateContent",
                    params={"key": self._api_key},
                    json=payload,
                )

                if response.status_code != 200:
                    self._handle_api_error(response)

                data = response.json()
                
                # Extract Usage Metadata
                usage = data.get("usageMetadata", {})
                input_tokens = usage.get("promptTokenCount", 0)
                output_tokens = usage.get("candidatesTokenCount", 0)
                total_tokens = usage.get("totalTokenCount", 0)
                usage_available = "totalTokenCount" in usage

                # Gemini response path: candidates[0].content.parts[0].text
                candidates = data.get("candidates", [])
                if not candidates:
                    raise RuntimeError("Gemini API retornou resposta vazia (sem candidates).")
                
                parts = candidates[0].get("content", {}).get("parts", [])
                if not parts:
                    raise RuntimeError("Gemini API retornou resposta vazia (sem parts).")
                
                answer_text = parts[0].get("text", "").strip()

                return RagSynthesisProviderResult(
                    text=answer_text,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=total_tokens,
                    usage_available=usage_available
                )

        except httpx.RequestError as exc:
            sanitized_exc = sanitize_log_text(str(exc))
            raise RuntimeError(f"Network error calling Gemini Synthesis API: {sanitized_exc}") from None

    def _handle_api_error(self, response: httpx.Response) -> None:
        """Trata erros da API sem vazar segredos."""
        try:
            error_data = response.json().get("error", {})
            message = error_data.get("message", "Unknown Gemini API error")
            code = error_data.get("code", response.status_code)
        except Exception:
            message = response.text or "Unknown error"
            code = response.status_code

        sanitized_msg = sanitize_log_text(message)
        logger.error(f"Gemini Synthesis API Error (HTTP {code}): {sanitized_msg}")
        raise RuntimeError(f"Gemini Synthesis API failed: {sanitized_msg}")
