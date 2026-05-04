from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from src.infrastructure.extractors.image_ocr_extractor import ImageOCRExtractor
from src.infrastructure.extractors.pdf_extractor import PDFTextExtractor
from src.infrastructure.schemas.document_processing_schemas import (
    DocumentProcessingResult,
    DetectedType,
)

_PDF_EXTENSIONS = {".pdf"}
_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}

_CPF_PATTERN = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b")
_RG_PATTERN = re.compile(r"\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dXx]\b")
_CNPJ_PATTERN = re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b")
_CNH_PATTERN = re.compile(r"\b\d{11}\b")

_INVALID_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")
_ZERO_WIDTH_CHARS = re.compile(r"[​-‍﻿]")
_MULTI_SPACES = re.compile(r"[ \t\f\v]+")
_MULTI_NEWLINES = re.compile(r"\n{3,}")
_OCR_NOISE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"[`´]{2,}"), ""),
    (re.compile(r"[|]{2,}"), " "),
    (re.compile(r"[_]{3,}"), " "),
    (re.compile(r"[~]{2,}"), " "),
    (re.compile(r"[•·]{2,}"), " "),
]


def clean_text(raw_text: str) -> str:
    if not raw_text:
        return ""

    normalized = unicodedata.normalize("NFKC", raw_text)
    normalized = normalized.replace("�", "")
    normalized = _INVALID_CONTROL_CHARS.sub(" ", normalized)
    normalized = _ZERO_WIDTH_CHARS.sub("", normalized)

    for pattern, replacement in _OCR_NOISE_PATTERNS:
        normalized = pattern.sub(replacement, normalized)

    normalized = re.sub(r"([A-Za-z0-9])\1{4,}", r"\1\1", normalized)
    normalized = re.sub(r"\r\n?", "\n", normalized)
    normalized = _MULTI_SPACES.sub(" ", normalized)

    cleaned_lines: list[str] = []
    for line in normalized.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if not re.search(r"[A-Za-z0-9]", stripped) and len(stripped) <= 3:
            continue
        cleaned_lines.append(stripped)

    final_text = "\n".join(cleaned_lines)
    final_text = _MULTI_NEWLINES.sub("\n\n", final_text)
    return final_text.strip()


class DocumentProcessingService:
    def process_document(self, file_path: str) -> DocumentProcessingResult:
        errors: list[str] = []
        raw_text = self._extract_text(file_path, errors)
        normalized_text = clean_text(raw_text)
        score_by_type = self._score_document_types(normalized_text)
        detected_type = self._detect_document_type(score_by_type)
        confidence = self._calculate_confidence(normalized_text, score_by_type, errors)

        return DocumentProcessingResult(
            raw_text=raw_text,
            clean_text=normalized_text,
            detected_type=detected_type,
            confidence=confidence,
            errors=errors,
        )

    def _extract_text(self, file_path: str, errors: list[str]) -> str:
        extension = Path(file_path).suffix.lower()

        if extension in _PDF_EXTENSIONS:
            raw_text = ""
            try:
                raw_text = PDFTextExtractor().extract_text(file_path)
            except Exception:
                self._push_error(errors, "pdf_extraction_failed")

            if raw_text.strip():
                return raw_text

            try:
                return self._extract_pdf_with_ocr(file_path)
            except Exception:
                self._push_error(errors, "ocr_failed")
                return raw_text

        if extension in _IMAGE_EXTENSIONS:
            try:
                return ImageOCRExtractor().extract_text(file_path)
            except Exception:
                self._push_error(errors, "ocr_failed")
                return ""

        self._push_error(errors, "unsupported_file_type")
        return ""

    def _extract_pdf_with_ocr(self, file_path: str) -> str:
        try:
            from pdf2image import convert_from_path
            import pytesseract
        except Exception as exc:
            raise RuntimeError("PDF OCR dependencies are missing.") from exc

        pages = convert_from_path(file_path, dpi=200)
        page_texts: list[str] = []
        for page in pages:
            extracted = pytesseract.image_to_string(page, lang="por+eng").strip()
            if extracted:
                page_texts.append(extracted)
        return "\n\n".join(page_texts).strip()

    def _score_document_types(self, clean: str) -> dict[DetectedType, float]:
        if not clean:
            return {
                "cpf": 0.0,
                "rg": 0.0,
                "cnh": 0.0,
                "cnpj": 0.0,
                "unknown": 0.0,
            }

        normalized = clean.upper()
        cpf_keywords = ["CPF", "CADASTRO DE PESSOA FISICA"]
        rg_keywords = ["RG", "REGISTRO GERAL", "IDENTIDADE"]
        cnh_keywords = ["CNH", "CARTEIRA NACIONAL DE HABILITACAO", "PERMISSAO PARA DIRIGIR"]
        cnpj_keywords = ["CNPJ", "CADASTRO NACIONAL DA PESSOA JURIDICA"]

        cpf_score = self._score_type(normalized, _CPF_PATTERN, cpf_keywords)
        rg_score = self._score_type(normalized, _RG_PATTERN, rg_keywords)
        cnh_score = self._score_type(normalized, _CNH_PATTERN, cnh_keywords)
        cnpj_score = self._score_type(normalized, _CNPJ_PATTERN, cnpj_keywords)

        if not any(keyword in normalized for keyword in cnh_keywords):
            cnh_score *= 0.35

        return {
            "cpf": round(min(cpf_score, 1.0), 4),
            "rg": round(min(rg_score, 1.0), 4),
            "cnh": round(min(cnh_score, 1.0), 4),
            "cnpj": round(min(cnpj_score, 1.0), 4),
            "unknown": 0.0,
        }

    def _detect_document_type(self, score_by_type: dict[DetectedType, float]) -> DetectedType:
        detected_type, detected_score = max(score_by_type.items(), key=lambda item: item[1])
        if detected_score < 0.35:
            return "unknown"
        return detected_type

    def _calculate_confidence(
        self,
        clean: str,
        score_by_type: dict[DetectedType, float],
        errors: list[str],
    ) -> float:
        if not clean:
            return 0.0

        text_len = len(clean)
        length_score = min(text_len / 1200, 1.0)

        alnum_chars = sum(1 for char in clean if char.isalnum())
        quality_ratio = alnum_chars / max(text_len, 1)
        quality_score = min(max((quality_ratio - 0.25) / 0.6, 0.0), 1.0)

        pattern_score = max(score_by_type.values()) if score_by_type else 0.0

        confidence = (0.4 * length_score) + (0.4 * pattern_score) + (0.2 * quality_score)
        confidence -= min(0.1 * len(errors), 0.3)

        if text_len < 20:
            confidence *= 0.5

        return round(min(max(confidence, 0.0), 1.0), 2)

    def _score_type(self, text: str, pattern: re.Pattern[str], keywords: list[str]) -> float:
        score = 0.0
        pattern_count = len(pattern.findall(text))
        keyword_hits = sum(1 for keyword in keywords if keyword in text)

        if pattern_count > 0:
            score += 0.45
            score += min(pattern_count, 3) * 0.1

        if keyword_hits > 0:
            score += min(keyword_hits, 3) * 0.15

        shared_doc_keywords = ["DOCUMENTO", "NOME", "FILIACAO", "EMISSAO", "VALIDADE"]
        shared_hits = sum(1 for keyword in shared_doc_keywords if keyword in text)
        if shared_hits > 0:
            score += min(shared_hits, 2) * 0.05

        return min(score, 1.0)

    @staticmethod
    def _push_error(errors: list[str], code: str) -> None:
        if code not in errors:
            errors.append(code)
