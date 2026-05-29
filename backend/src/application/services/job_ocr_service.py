"""OCR service for job vacancy image extraction (Fase IA Vaga 2).

Accepts image files (PNG, JPEG, WebP), validates them, runs local OCR via
pytesseract/tesseract, sanitises and truncates the result.

Rules enforced here:
- No AI calls.
- No file persistence.
- No vaga creation or pipeline mutation.
- Extracted text is never logged in full.
"""

from __future__ import annotations

import io
import re
import unicodedata
from dataclasses import dataclass

import pytesseract
import structlog
from PIL import Image, UnidentifiedImageError

logger = structlog.get_logger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

MAX_OCR_IMAGE_BYTES: int = 5 * 1024 * 1024  # 5 MB hard cap
MAX_EXTRACTED_CHARS: int = 12_000
TEXT_PREVIEW_CHARS: int = 200
MIN_RESIZE_PX: int = 64   # Upscale tiny images so tesseract can read them
MAX_RESIZE_PX: int = 5_000  # Limit maximum dimension to cap memory use

# Canonical MIME types this service accepts.
_ALLOWED_MIME_TYPES: frozenset[str] = frozenset({
    "image/png",
    "image/jpeg",
    "image/webp",
})

# Non-standard alias browsers sometimes send.
_MIME_ALIASES: dict[str, str] = {
    "image/jpg": "image/jpeg",
}


# ── Exceptions ────────────────────────────────────────────────────────────────

class OcrValidationError(Exception):
    """Raised for invalid/unsafe uploads — surface as HTTP 422 with a safe message."""


class OcrImageTooLargeError(OcrValidationError):
    """Raised when the upload exceeds MAX_OCR_IMAGE_BYTES."""


class OcrProcessingError(Exception):
    """Raised when tesseract itself fails — surface as HTTP 500."""


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class OcrResult:
    extracted_text: str
    text_preview: str
    character_count: int
    confidence: float | None
    filename: str
    mime_type: str
    size_bytes: int


# ── Public service ────────────────────────────────────────────────────────────

class JobOcrService:
    """Stateless OCR service — no DB, no AI, no side-effects."""

    def extract_from_image(
        self,
        *,
        filename: str,
        content_type: str | None,
        content: bytes,
    ) -> OcrResult:
        """Validate, OCR, sanitise and return extracted text.

        Raises:
            OcrValidationError: for invalid file type, magic bytes, or corrupt image.
            OcrImageTooLargeError: file exceeds the size limit.
            OcrProcessingError: tesseract engine failure.
        """
        if not content:
            raise OcrValidationError("Arquivo vazio")

        if len(content) > MAX_OCR_IMAGE_BYTES:
            limit_mb = MAX_OCR_IMAGE_BYTES // (1024 * 1024)
            raise OcrImageTooLargeError(f"Imagem muito grande (máx {limit_mb}MB)")

        mime_type = _normalize_mime(content_type)
        _validate_mime_type(mime_type)
        _validate_magic_bytes(content, mime_type)

        img = _open_image(content)
        img = _preprocess(img)

        raw_text = _run_ocr(img)
        clean_text = _sanitize_text(raw_text)
        truncated = clean_text[:MAX_EXTRACTED_CHARS]
        preview = truncated[:TEXT_PREVIEW_CHARS].strip()

        return OcrResult(
            extracted_text=truncated,
            text_preview=preview,
            character_count=len(truncated),
            confidence=None,  # Phase 3 may add confidence scoring
            filename=filename,
            mime_type=mime_type,
            size_bytes=len(content),
        )


# ── Internal helpers ──────────────────────────────────────────────────────────

def _normalize_mime(raw: str | None) -> str:
    normalised = (raw or "").split(";", maxsplit=1)[0].strip().lower()
    return _MIME_ALIASES.get(normalised, normalised)


def _validate_mime_type(mime_type: str) -> None:
    if mime_type not in _ALLOWED_MIME_TYPES:
        raise OcrValidationError(
            f"Tipo de arquivo não permitido. Aceitos: {', '.join(sorted(_ALLOWED_MIME_TYPES))}"
        )


def _validate_magic_bytes(content: bytes, mime_type: str) -> None:
    if mime_type == "image/png":
        if not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise OcrValidationError("Assinatura PNG inválida — arquivo pode estar corrompido")
    elif mime_type == "image/jpeg":
        if not content.startswith(b"\xff\xd8\xff"):
            raise OcrValidationError("Assinatura JPEG inválida — arquivo pode estar corrompido")
    elif mime_type == "image/webp" and not (content[:4] == b"RIFF" and content[8:12] == b"WEBP"):
        raise OcrValidationError("Assinatura WebP inválida — arquivo pode estar corrompido")


def _open_image(content: bytes) -> Image.Image:
    try:
        img = Image.open(io.BytesIO(content))
        # Verify integrity without fully decoding (catches truncated/corrupt images)
        img.verify()
    except (UnidentifiedImageError, Exception) as exc:
        raise OcrValidationError("Imagem inválida ou corrompida") from exc

    # PIL requires re-opening after verify()
    try:
        img = Image.open(io.BytesIO(content))
        img.load()
    except Exception as exc:
        raise OcrValidationError("Imagem inválida ou corrompida") from exc

    return img


def _preprocess(img: Image.Image) -> Image.Image:
    """Convert to grayscale and normalise dimensions for OCR."""
    img = img.convert("RGB")

    w, h = img.size

    # Upscale images that are too small for tesseract to read reliably
    if w < MIN_RESIZE_PX or h < MIN_RESIZE_PX:
        scale = max(MIN_RESIZE_PX / w, MIN_RESIZE_PX / h)
        new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
        img = img.resize((new_w, new_h), Image.LANCZOS)

    # Downscale very large images to limit memory/processing time
    if w > MAX_RESIZE_PX or h > MAX_RESIZE_PX:
        img.thumbnail((MAX_RESIZE_PX, MAX_RESIZE_PX), Image.LANCZOS)

    # Convert to grayscale — better OCR accuracy
    return img.convert("L")


def _run_ocr(img: Image.Image) -> str:
    try:
        # lang="por+eng" — tries Portuguese first, falls back to English
        text: str = pytesseract.image_to_string(img, lang="por+eng")
        return text
    except pytesseract.TesseractNotFoundError as exc:
        logger.error("job_ai_ocr.tesseract_not_found")
        raise OcrProcessingError("Motor OCR não encontrado no servidor") from exc
    except pytesseract.TesseractError as exc:
        logger.error("job_ai_ocr.tesseract_error", error_type=type(exc).__name__)
        raise OcrProcessingError("Falha ao processar imagem com OCR") from exc


def _sanitize_text(text: str) -> str:
    """Remove control chars, normalise whitespace, strip suspicious payloads."""
    if not text:
        return ""

    # Remove null bytes and non-printable control chars except \t, \n, \r
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    # Normalise unicode
    text = unicodedata.normalize("NFKC", text)

    # Collapse runs of spaces/tabs (but preserve newlines)
    text = re.sub(r"[^\S\n]+", " ", text)

    # Collapse more than two consecutive newlines
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()
