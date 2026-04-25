from dataclasses import dataclass
from io import BytesIO
from typing import Any, List
import logging
import re

import pdfplumber


logger = logging.getLogger(__name__)


class PdfTextExtractionError(Exception):
    """Erro ao extrair texto do PDF"""


@dataclass(frozen=True)
class ExtractedPdfText:
    text: str
    page_count: int
    word_count: int
    empty_pages: int
    used_ocr: bool


# -----------------------------
# Helpers
# -----------------------------

def _clean_text(text: str) -> str:
    """Normaliza espaços e limpa texto"""
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _count_words(text: str) -> int:
    """Contagem de palavras robusta"""
    return len(re.findall(r"\b\w+\b", text))


# -----------------------------
# Extração com pdfplumber
# -----------------------------

def _extract_with_pdfplumber(content: bytes):
    page_texts: List[str] = []
    empty_pages = 0

    with pdfplumber.open(BytesIO(content)) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            try:
                extracted = page.extract_text()
            except Exception as e:
                logger.warning(
                    "Erro ao extrair página",
                    extra={"page": page_number, "error": str(e)},
                )
                extracted = None

            if extracted:
                cleaned = extracted.strip()
                if cleaned:
                    page_texts.append(cleaned)
                else:
                    empty_pages += 1
            else:
                empty_pages += 1

    return page_texts, empty_pages


# -----------------------------
# OCR fallback
# -----------------------------

def _extract_with_ocr(content: bytes):
    page_texts: List[str] = []

    try:
        from pdf2image import convert_from_bytes
        import pytesseract
    except ModuleNotFoundError as exc:
        logger.warning(
            "OCR dependencies not installed; skipping OCR fallback",
            extra={"error": str(exc)},
        )
        raise PdfTextExtractionError(
            "OCR fallback indisponível. Instale pdf2image e pytesseract ou envie um PDF com texto selecionável."
        ) from exc

    try:
        images = convert_from_bytes(content)
    except Exception as e:
        logger.error("Falha ao converter PDF para imagem", extra={"error": str(e)})
        raise PdfTextExtractionError("Erro ao preparar OCR") from e

    for idx, image in enumerate(images, start=1):
        try:
            text = pytesseract.image_to_string(image, lang="por+eng")
            cleaned = text.strip()
            if cleaned:
                page_texts.append(cleaned)
        except Exception as e:
            logger.warning(
                "Erro no OCR da página",
                extra={"page": idx, "error": str(e)},
            )

    return page_texts


# -----------------------------
# Função principal
# -----------------------------

def extract_pdf_text(content: bytes) -> ExtractedPdfText:
    if not content:
        raise PdfTextExtractionError("Arquivo vazio")

    try:
        page_texts, empty_pages = _extract_with_pdfplumber(content)
    except Exception as exc:
        logger.error("Erro ao abrir PDF", extra={"error": str(exc)})
        raise PdfTextExtractionError("PDF inválido ou corrompido") from exc

    total_pages = len(page_texts) + empty_pages

    # Junta texto inicial
    text = "\n\n".join(page_texts)
    text = _clean_text(text)

    used_ocr = False

    # 🚨 Fallback automático para OCR
    if not text:
        logger.info("PDF sem texto, iniciando OCR fallback")

        ocr_texts = _extract_with_ocr(content)

        if not ocr_texts:
            raise PdfTextExtractionError(
                "Não foi possível extrair texto (nem via OCR)"
            )

        text = _clean_text("\n\n".join(ocr_texts))
        used_ocr = True
        empty_pages = 0  # OCR geralmente não mantém isso com precisão

    word_count = _count_words(text)

    return ExtractedPdfText(
        text=text,
        page_count=total_pages,
        word_count=word_count,
        empty_pages=empty_pages,
        used_ocr=used_ocr,
    )
