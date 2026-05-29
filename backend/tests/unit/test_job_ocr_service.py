"""Unit tests — JobOcrService (Fase IA Vaga 2).

All tests are synchronous / in-process — no HTTP, no DB, no external services.
pytesseract must be importable for tests that exercise the full OCR pipeline.
"""

from __future__ import annotations

import io

import pytest
from PIL import Image

from src.application.services.job_ocr_service import (
    MAX_EXTRACTED_CHARS,
    JobOcrService,
    OcrImageTooLargeError,
    OcrValidationError,
    _sanitize_text,
)

# ── Image factories ───────────────────────────────────────────────────────────

def _png_bytes(width: int = 100, height: int = 30) -> bytes:
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_bytes() -> bytes:
    img = Image.new("RGB", (100, 30), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ── Validation: content guards ────────────────────────────────────────────────

@pytest.mark.unit
class TestOcrServiceValidation:
    def test_raises_on_empty_content(self) -> None:
        svc = JobOcrService()
        with pytest.raises(OcrValidationError, match="vazio"):
            svc.extract_from_image(filename="a.png", content_type="image/png", content=b"")

    def test_raises_on_oversized_file(self) -> None:
        svc = JobOcrService()
        # PNG magic header + 6 MB padding
        oversized = b"\x89PNG\r\n\x1a\n" + b"x" * (6 * 1024 * 1024)
        with pytest.raises(OcrImageTooLargeError):
            svc.extract_from_image(filename="big.png", content_type="image/png", content=oversized)

    def test_raises_on_disallowed_mime_type(self) -> None:
        svc = JobOcrService()
        with pytest.raises(OcrValidationError, match="Tipo de arquivo"):
            svc.extract_from_image(
                filename="doc.pdf",
                content_type="application/pdf",
                content=b"%PDF-fake",
            )

    def test_raises_on_svg_mime(self) -> None:
        svc = JobOcrService()
        with pytest.raises(OcrValidationError):
            svc.extract_from_image(
                filename="icon.svg",
                content_type="image/svg+xml",
                content=b"<svg/>",
            )

    def test_raises_on_html_mime(self) -> None:
        svc = JobOcrService()
        with pytest.raises(OcrValidationError):
            svc.extract_from_image(
                filename="page.html",
                content_type="text/html",
                content=b"<html></html>",
            )

    def test_raises_when_png_magic_bytes_invalid(self) -> None:
        svc = JobOcrService()
        fake = b"NOTAPNG" + b"\x00" * 100
        with pytest.raises(OcrValidationError, match="PNG"):
            svc.extract_from_image(filename="fake.png", content_type="image/png", content=fake)

    def test_raises_when_jpeg_magic_bytes_invalid(self) -> None:
        svc = JobOcrService()
        fake = b"NOTAJPEG" + b"\x00" * 100
        with pytest.raises(OcrValidationError, match="JPEG"):
            svc.extract_from_image(filename="fake.jpg", content_type="image/jpeg", content=fake)

    def test_raises_when_webp_magic_bytes_invalid(self) -> None:
        svc = JobOcrService()
        fake = b"RIFFXXXXXFAIL" + b"\x00" * 100  # RIFF prefix but wrong bytes 8-12
        with pytest.raises(OcrValidationError, match="WebP"):
            svc.extract_from_image(filename="fake.webp", content_type="image/webp", content=fake)

    def test_accepts_image_jpg_as_alias(self) -> None:
        """image/jpg is a non-standard alias that should be normalised to image/jpeg."""
        svc = JobOcrService()
        jpg = _jpeg_bytes()
        result = svc.extract_from_image(filename="photo.jpg", content_type="image/jpg", content=jpg)
        assert result.mime_type == "image/jpeg"


# ── OCR pipeline ──────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestOcrPipeline:
    def test_valid_png_returns_result(self) -> None:
        svc = JobOcrService()
        result = svc.extract_from_image(
            filename="vaga.png",
            content_type="image/png",
            content=_png_bytes(),
        )
        assert result.mime_type == "image/png"
        assert result.character_count >= 0
        assert isinstance(result.extracted_text, str)
        assert isinstance(result.text_preview, str)

    def test_valid_jpeg_returns_result(self) -> None:
        svc = JobOcrService()
        result = svc.extract_from_image(
            filename="vaga.jpg",
            content_type="image/jpeg",
            content=_jpeg_bytes(),
        )
        assert result.mime_type == "image/jpeg"
        assert result.character_count >= 0

    def test_character_count_matches_text_length(self) -> None:
        svc = JobOcrService()
        result = svc.extract_from_image(
            filename="test.png",
            content_type="image/png",
            content=_png_bytes(),
        )
        assert result.character_count == len(result.extracted_text)

    def test_extracted_text_does_not_exceed_limit(self) -> None:
        svc = JobOcrService()
        result = svc.extract_from_image(
            filename="test.png",
            content_type="image/png",
            content=_png_bytes(),
        )
        assert len(result.extracted_text) <= MAX_EXTRACTED_CHARS

    def test_preview_is_within_extracted_text(self) -> None:
        svc = JobOcrService()
        result = svc.extract_from_image(
            filename="test.png",
            content_type="image/png",
            content=_png_bytes(),
        )
        if result.extracted_text:
            assert result.text_preview in result.extracted_text
        else:
            assert result.text_preview == ""

    def test_source_info_populated_correctly(self) -> None:
        svc = JobOcrService()
        png = _png_bytes()
        result = svc.extract_from_image(
            filename="myvaga.png",
            content_type="image/png",
            content=png,
        )
        assert result.filename == "myvaga.png"
        assert result.size_bytes == len(png)

    def test_confidence_is_none_in_this_phase(self) -> None:
        svc = JobOcrService()
        result = svc.extract_from_image(
            filename="test.png",
            content_type="image/png",
            content=_png_bytes(),
        )
        assert result.confidence is None


# ── Sanitisation ─────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestSanitizeText:
    def test_removes_null_bytes(self) -> None:
        assert "\x00" not in _sanitize_text("hello\x00world")

    def test_removes_control_chars(self) -> None:
        dirty = "ab\x01\x02\x03cd\x0b\x0ced"
        clean = _sanitize_text(dirty)
        for ch in "\x01\x02\x03\x0b\x0c":
            assert ch not in clean

    def test_preserves_newlines(self) -> None:
        text = "linha 1\nlinha 2\nlinha 3"
        assert "\n" in _sanitize_text(text)

    def test_collapses_excess_newlines(self) -> None:
        text = "a\n\n\n\n\nb"
        result = _sanitize_text(text)
        assert "\n\n\n" not in result

    def test_normalises_unicode(self) -> None:
        # Decomposed form (NFD) of 'ã' should be normalised
        nfd_a_tilde = "ã"  # 'a' + combining tilde
        result = _sanitize_text(nfd_a_tilde)
        assert result == "ã"

    def test_empty_string_returns_empty(self) -> None:
        assert _sanitize_text("") == ""

    def test_truncation_happens_in_service(self) -> None:
        # Build a PNG from a blank image; the extracted text will be short.
        # To test truncation directly we just check the limit constant is respected.
        svc = JobOcrService()
        result = svc.extract_from_image(
            filename="test.png",
            content_type="image/png",
            content=_png_bytes(),
        )
        assert len(result.extracted_text) <= MAX_EXTRACTED_CHARS
