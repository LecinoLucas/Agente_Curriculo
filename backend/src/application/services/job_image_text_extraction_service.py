"""Image-to-text extraction for job advertisement uploads.

This service only extracts sanitized text that feeds the existing Job AI Draft
pipeline. It never persists files and never creates or publishes jobs.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from src.core.settings import settings


class JobImageExtractionUnavailableError(Exception):
    """Raised when no supported image extraction backend is available."""


class JobImageExtractionNoTextError(Exception):
    """Raised when the image is valid but does not contain useful text."""


@dataclass(frozen=True)
class JobImageTextExtractionResult:
    extracted_text: str
    confidence: float | None
    warnings: list[str] = field(default_factory=list)


class JobImageTextExtractionService:
    """Extract sanitized text from a job advertisement image."""

    def extract_from_image(
        self,
        *,
        filename: str,
        content_type: str | None,
        content: bytes,
    ) -> JobImageTextExtractionResult:
        if self._vision_pipeline_available():
            return self._extract_with_vision(
                filename=filename,
                content_type=content_type,
                content=content,
            )

        return self._extract_with_local_ocr(
            filename=filename,
            content_type=content_type,
            content=content,
        )

    def _vision_pipeline_available(self) -> bool:
        provider = (settings.AI_PROVIDER or "").strip().lower()
        model_id = (settings.AI_MODEL_ID or "").strip().lower()
        return False and provider in {"google", "gemini"} and model_id.startswith("gemini")

    def _extract_with_vision(
        self,
        *,
        filename: str,
        content_type: str | None,
        content: bytes,
    ) -> JobImageTextExtractionResult:
        raise JobImageExtractionUnavailableError(
            "Extração por visão ainda não está habilitada neste ambiente."
        )

    def _extract_with_local_ocr(
        self,
        *,
        filename: str,
        content_type: str | None,
        content: bytes,
    ) -> JobImageTextExtractionResult:
        try:
            from src.application.services.job_ocr_service import JobOcrService
        except Exception as exc:
            raise JobImageExtractionUnavailableError(
                "OCR indisponível neste ambiente para importar imagem de vaga."
            ) from exc

        result = JobOcrService().extract_from_image(
            filename=filename,
            content_type=content_type,
            content=content,
        )

        if not _has_useful_text(result.extracted_text):
            raise JobImageExtractionNoTextError(
                "Nao foi possivel extrair texto util da imagem enviada."
            )

        warnings: list[str] = ["image_text_extraction_requires_review"]
        if len(result.extracted_text) < 120:
            warnings.append("ocr_text_may_be_incomplete")

        return JobImageTextExtractionResult(
            extracted_text=result.extracted_text,
            confidence=result.confidence,
            warnings=warnings,
        )


def _has_useful_text(text: str) -> bool:
    normalized = (text or "").strip()
    if len(normalized) < 12:
        return False

    alnum_tokens = re.findall(r"[A-Za-zÀ-ÿ0-9]{2,}", normalized)
    return len(alnum_tokens) >= 3
