from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from io import BytesIO

import pdfplumber

from src.core.resume_text_quality import (
    LOW_QUALITY_FAILURE_REASON,
    assess_extracted_text_quality,
)

logger = logging.getLogger(__name__)


class PdfTextExtractionError(Exception):
    """Erro ao extrair texto do PDF."""

    def __init__(
        self,
        message: str,
        *,
        reason_code: str = "extraction_failed",
        ocr_attempted: bool = False,
        ocr_available: bool | None = None,
    ) -> None:
        super().__init__(message)
        self.reason_code = reason_code
        self.ocr_attempted = ocr_attempted
        self.ocr_available = ocr_available


@dataclass(frozen=True)
class ExtractedPdfText:
    text: str
    page_count: int
    word_count: int
    empty_pages: int
    used_ocr: bool


MAX_OCR_PAGES = 5
OCR_DPI = 200


def _clean_text(text: str) -> str:
    """
    Limpa o texto preservando quebras de linha úteis.
    Não transforma o currículo inteiro em uma linha só.
    """
    text = text.replace("\u00a0", " ")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _count_words(text: str) -> int:
    return len(re.findall(r"\b[\wÀ-ÿ]+\b", text, flags=re.UNICODE))


def _extract_with_pdfplumber(content: bytes) -> tuple[list[str], int, int]:
    page_texts: list[str] = []
    empty_pages = 0
    page_count = 0

    with pdfplumber.open(BytesIO(content)) as pdf:
        page_count = len(pdf.pages)

        for page_number, page in enumerate(pdf.pages, start=1):
            try:
                extracted = page.extract_text(
                    x_tolerance=1,
                    y_tolerance=3,
                    layout=False,
                )
            except Exception as exc:
                logger.warning(
                    "pdf.page_extract_failed",
                    extra={
                        "page": page_number,
                        "error": str(exc),
                    },
                )
                extracted = None

            cleaned = _clean_text(extracted or "")

            if cleaned:
                page_texts.append(cleaned)
            else:
                empty_pages += 1

    return page_texts, empty_pages, page_count


def _extract_with_ocr(
    content: bytes,
    *,
    max_pages: int = MAX_OCR_PAGES,
    dpi: int = OCR_DPI,
) -> list[str]:
    try:
        import pytesseract
        from pdf2image import convert_from_bytes
    except ModuleNotFoundError as exc:
        logger.warning(
            "pdf.ocr_unavailable",
            extra={"error": str(exc)},
        )
        raise PdfTextExtractionError(
            "OCR indisponível neste ambiente. Envie um PDF com texto selecionável "
            "ou habilite pdf2image/pytesseract.",
            reason_code="ocr_unavailable",
            ocr_attempted=False,
            ocr_available=False,
        ) from exc

    try:
        images = convert_from_bytes(
            content,
            first_page=1,
            last_page=max_pages,
            dpi=dpi,
        )
    except Exception as exc:
        logger.error(
            "pdf.ocr_convert_failed",
            extra={"error": str(exc)},
        )
        raise PdfTextExtractionError(
            "Erro ao preparar OCR do PDF.",
            reason_code="ocr_failed",
            ocr_attempted=True,
            ocr_available=True,
        ) from exc

    page_texts: list[str] = []

    for page_number, image in enumerate(images, start=1):
        try:
            text = pytesseract.image_to_string(
                image,
                lang="por+eng",
                config="--psm 6",
            )

            cleaned = _clean_text(text)

            if cleaned:
                page_texts.append(cleaned)

        except Exception as exc:
            logger.warning(
                "pdf.ocr_page_failed",
                extra={
                    "page": page_number,
                    "error": str(exc),
                },
            )

    return page_texts


def extract_pdf_text(content: bytes) -> ExtractedPdfText:
    if not content:
        raise PdfTextExtractionError("Arquivo PDF vazio.")

    try:
        page_texts, empty_pages, page_count = _extract_with_pdfplumber(content)
    except Exception as exc:
        logger.error(
            "pdf.open_failed",
            extra={"error": str(exc)},
        )
        raise PdfTextExtractionError("PDF inválido, corrompido ou ilegível.") from exc

    text = _clean_text("\n\n".join(page_texts))
    used_ocr = False
    quality = assess_extracted_text_quality(text)
    should_use_ocr = not quality.is_useful

    if should_use_ocr:
        logger.info(
            "pdf.ocr_fallback_started",
            extra={
                "chars": len(text),
                "quality_reason": quality.reason,
                "alpha_words": quality.alpha_word_count,
                "alpha_ratio": round(quality.alpha_ratio, 3),
                "page_count": page_count,
                "empty_pages": empty_pages,
                "max_ocr_pages": MAX_OCR_PAGES,
            },
        )

        try:
            ocr_texts = _extract_with_ocr(content)
        except PdfTextExtractionError as exc:
            logger.warning(
                "pdf.ocr_fallback_failed",
                extra={
                    "quality_reason": quality.reason,
                    "error": str(exc),
                    "reason_code": exc.reason_code,
                    "ocr_available": exc.ocr_available,
                },
            )
            raise

        ocr_text = _clean_text("\n\n".join(ocr_texts))
        ocr_quality = assess_extracted_text_quality(ocr_text)

        if ocr_quality.is_useful:
            logger.info(
                "pdf.ocr_fallback_used",
                extra={
                    "direct_quality_reason": quality.reason,
                    "ocr_chars": len(ocr_text),
                    "ocr_alpha_words": ocr_quality.alpha_word_count,
                },
            )
            text = ocr_text
            used_ocr = True
            empty_pages = 0
            quality = ocr_quality
        else:
            logger.warning(
                "pdf.ocr_text_low_quality",
                extra={
                    "direct_quality_reason": quality.reason,
                    "ocr_quality_reason": ocr_quality.reason,
                    "ocr_chars": len(ocr_text),
                    "ocr_alpha_words": ocr_quality.alpha_word_count,
                    "ocr_alpha_ratio": round(ocr_quality.alpha_ratio, 3),
                },
            )
            raise PdfTextExtractionError(
                LOW_QUALITY_FAILURE_REASON,
                reason_code="low_quality",
                ocr_attempted=True,
                ocr_available=True,
            )

    if not quality.is_useful:
        raise PdfTextExtractionError(
            LOW_QUALITY_FAILURE_REASON,
            reason_code="low_quality",
            ocr_attempted=used_ocr,
            ocr_available=True if used_ocr else None,
        )

    word_count = _count_words(text)

    return ExtractedPdfText(
        text=text,
        page_count=page_count,
        word_count=word_count,
        empty_pages=empty_pages,
        used_ocr=used_ocr,
    )
