"""
Gemini RAG Synthesis Provider: Gera respostas baseadas em evidências usando Google Gemini.

Fase AI-RAG-10 — Síntese com fontes.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
import logging
from typing import Any, Awaitable, Callable

import httpx
from src.core.settings import settings
from src.core.log_sanitizer import sanitize_log_text
from src.ai_orchestration.rag.answer_schemas import RagSynthesisProviderResult

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GeminiSynthesisError(RuntimeError):
    """Erro sanitizado e classificado para synthesis Gemini."""

    error_code: str
    user_message: str
    retryable: bool = False
    provider_message: str | None = None
    status_code: int | None = None

    def __str__(self) -> str:
        return self.user_message


class GeminiRagSynthesisProvider:
    """Provedor de síntese textual utilizando Google Gemini (AI-RAG-10)."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        max_retries: int = 2,
        retry_backoff_seconds: float = 0.5,
        sleep: Callable[[float], Awaitable[None]] | None = None,
    ):
        self._api_key = api_key or settings.GOOGLE_API_KEY_1
        self._model_name = model or settings.RAG_GEMINI_SYNTHESIS_MODEL
        self._provider_name = "gemini"
        self._max_retries = max(0, max_retries)
        self._retry_backoff_seconds = max(0.0, retry_backoff_seconds)
        self._sleep = sleep or asyncio.sleep

    @property
    def provider_name(self) -> str:
        return self._provider_name

    @property
    def model_name(self) -> str:
        return self._model_name

    async def generate_response(self, prompt: str) -> RagSynthesisProviderResult:
        """Gera resposta textual para o prompt fornecido, incluindo metadados de tokens."""
        if not self._api_key:
            raise GeminiSynthesisError(
                error_code="GEMINI_API_KEY_MISSING",
                user_message="Gemini API Key não configurada para síntese.",
                retryable=False,
            )

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

        last_error: GeminiSynthesisError | None = None

        async with httpx.AsyncClient(timeout=settings.AI_PROVIDER_TIMEOUT_SECONDS) as client:
            for attempt in range(self._max_retries + 1):
                try:
                    response = await client.post(
                        f"{settings.GEMINI_API_BASE_URL}/models/{self._model_name}:generateContent",
                        params={"key": self._api_key},
                        json=payload,
                    )

                    if response.status_code != 200:
                        self._handle_api_error(response)

                    data = response.json()

                    usage = data.get("usageMetadata", {})
                    input_tokens = usage.get("promptTokenCount", 0)
                    output_tokens = usage.get("candidatesTokenCount", 0)
                    total_tokens = usage.get("totalTokenCount", 0)
                    usage_available = "totalTokenCount" in usage

                    candidates = data.get("candidates", [])
                    if not candidates:
                        raise GeminiSynthesisError(
                            error_code="GEMINI_EMPTY_RESPONSE",
                            user_message="O provedor de IA retornou uma resposta vazia.",
                            provider_message="Gemini API returned no candidates.",
                        )

                    parts = candidates[0].get("content", {}).get("parts", [])
                    if not parts:
                        raise GeminiSynthesisError(
                            error_code="GEMINI_EMPTY_RESPONSE",
                            user_message="O provedor de IA retornou uma resposta vazia.",
                            provider_message="Gemini API returned no parts.",
                        )

                    answer_text = parts[0].get("text", "").strip()

                    return RagSynthesisProviderResult(
                        text=answer_text,
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        total_tokens=total_tokens,
                        usage_available=usage_available
                    )

                except httpx.TimeoutException as exc:
                    last_error = GeminiSynthesisError(
                        error_code="PROVIDER_TIMEOUT",
                        user_message="Não foi possível gerar a resposta agora porque o provedor de IA demorou além do esperado. Tente novamente em instantes.",
                        retryable=True,
                        provider_message=sanitize_log_text(str(exc)),
                    )
                except httpx.RequestError as exc:
                    last_error = GeminiSynthesisError(
                        error_code="PROVIDER_UNAVAILABLE",
                        user_message="Não foi possível gerar a resposta agora porque o provedor de IA está temporariamente indisponível. Tente novamente em instantes.",
                        retryable=True,
                        provider_message=sanitize_log_text(str(exc)),
                    )
                except GeminiSynthesisError as exc:
                    last_error = exc

                if last_error is None:
                    break
                if not last_error.retryable or attempt >= self._max_retries:
                    raise last_error
                await self._sleep(self._retry_backoff_seconds * (attempt + 1))

        raise last_error or GeminiSynthesisError(
            error_code="GEMINI_SYNTHESIS_ERROR",
            user_message="Não foi possível gerar a resposta agora.",
        )

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
        error_code = "GEMINI_SYNTHESIS_ERROR"
        user_message = "Não foi possível gerar a resposta agora."
        retryable = False

        if code == 503:
            error_code = "PROVIDER_UNAVAILABLE"
            user_message = "Não foi possível gerar a resposta agora porque o provedor de IA está temporariamente indisponível. Tente novamente em instantes."
            retryable = True
        elif code == 429:
            error_code = "PROVIDER_RATE_LIMITED"
            user_message = "Não foi possível gerar a resposta agora porque o provedor de IA atingiu o limite temporário de uso. Tente novamente em instantes."
            retryable = True
        elif 400 <= int(code) < 500:
            error_code = "PROVIDER_BAD_REQUEST"
            user_message = "O provedor de IA rejeitou a solicitação de síntese."
        elif int(code) >= 500:
            error_code = "PROVIDER_UNAVAILABLE"
            user_message = "Não foi possível gerar a resposta agora porque o provedor de IA está temporariamente indisponível. Tente novamente em instantes."
            retryable = True

        logger.warning(
            "gemini_synthesis.api_error",
            extra={
                "status_code": code,
                "error_code": error_code,
                "retryable": retryable,
                "provider_message": sanitized_msg,
            },
        )
        raise GeminiSynthesisError(
            error_code=error_code,
            user_message=user_message,
            retryable=retryable,
            provider_message=sanitized_msg,
            status_code=int(code),
        )
