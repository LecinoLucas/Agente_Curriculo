from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from io import BytesIO

import pdfplumber

logger = logging.getLogger(__name__)


class PdfTextExtractionError(Exception):
    """Erro ao extrair texto do PDF."""


@dataclass(frozen=True)
class ExtractedPdfText:
    text: str
    page_count: int
    word_count: int
    empty_pages: int
    used_ocr: bool


MIN_TEXT_CHARS_FOR_SUCCESS = 80
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
        from pdf2image import convert_from_bytes
        import pytesseract
    except ModuleNotFoundError as exc:
        logger.warning(
            "pdf.ocr_dependencies_missing",
            extra={"error": str(exc)},
        )
        raise PdfTextExtractionError(
            "OCR indisponível. Instale pdf2image e pytesseract ou envie um PDF com texto selecionável."
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
        raise PdfTextExtractionError("Erro ao preparar OCR do PDF.") from exc

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

    should_use_ocr = len(text) < MIN_TEXT_CHARS_FOR_SUCCESS

    if should_use_ocr:
        logger.info(
            "pdf.low_text_detected_trying_ocr",
            extra={
                "chars": len(text),
                "page_count": page_count,
                "empty_pages": empty_pages,
                "max_ocr_pages": MAX_OCR_PAGES,
            },
        )

        ocr_texts = _extract_with_ocr(content)
        ocr_text = _clean_text("\n\n".join(ocr_texts))

        if len(ocr_text) > len(text):
            text = ocr_text
            used_ocr = True
            empty_pages = 0

    if not text:
        raise PdfTextExtractionError("Não foi possível extrair texto do PDF.")

    word_count = _count_words(text)

    return ExtractedPdfText(
        text=text,
        page_count=page_count,
        word_count=word_count,
        empty_pages=empty_pages,
        used_ocr=used_ocr,
    )