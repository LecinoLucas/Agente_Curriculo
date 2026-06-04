from __future__ import annotations

import pytest

from src.core.resume_text_quality import (
    LOW_QUALITY_FAILURE_REASON,
    assess_extracted_text_quality,
    is_extracted_text_useful,
)
from src.infrastructure.pdf import text_extractor
from src.infrastructure.pdf.text_extractor import PdfTextExtractionError, extract_pdf_text


@pytest.mark.parametrize(
    "text",
    [
        "",
        "||||||||||||",
        "000000000000",
        "..... ----- /////",
        "Cargo",
        "teste teste teste teste teste teste teste",
    ],
)
def test_assess_extracted_text_quality_rejects_noise(text: str) -> None:
    quality = assess_extracted_text_quality(text)
    assert quality.is_useful is False
    assert quality.reason is not None


def test_assess_extracted_text_quality_accepts_short_real_resume_signal() -> None:
    text = "Ana Souza\nExperiência: Operadora de Caixa\nana@example.com"

    quality = assess_extracted_text_quality(text)

    assert quality.is_useful is True
    assert quality.professional_term_count >= 1


def test_extract_pdf_text_uses_good_pdf_text_without_ocr(monkeypatch: pytest.MonkeyPatch) -> None:
    ocr_called = False

    monkeypatch.setattr(
        text_extractor,
        "_extract_with_pdfplumber",
        lambda _content: (
            ["Ana Souza\nExperiência: Operadora de Caixa\nPython Excel"],
            0,
            1,
        ),
    )

    def _fail_if_ocr_runs(_content):
        nonlocal ocr_called
        ocr_called = True
        raise AssertionError("OCR should not run for useful PDF text")

    monkeypatch.setattr(text_extractor, "_extract_with_ocr", _fail_if_ocr_runs)

    result = extract_pdf_text(b"%PDF")

    assert result.used_ocr is False
    assert "Ana Souza" in result.text
    assert ocr_called is False


def test_extract_pdf_text_empty_pdf_text_uses_good_ocr(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        text_extractor,
        "_extract_with_pdfplumber",
        lambda _content: ([], 1, 1),
    )
    monkeypatch.setattr(
        text_extractor,
        "_extract_with_ocr",
        lambda _content: ["Bruno Lima\nExperiência: Analista Financeiro\nExcel SQL"],
    )

    result = extract_pdf_text(b"%PDF")

    assert result.used_ocr is True
    assert "Bruno Lima" in result.text
    assert is_extracted_text_useful(result.text) is True


def test_extract_pdf_text_low_quality_non_empty_text_uses_ocr(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        text_extractor,
        "_extract_with_pdfplumber",
        lambda _content: (["|||||||| 000000 ----"], 0, 1),
    )
    monkeypatch.setattr(
        text_extractor,
        "_extract_with_ocr",
        lambda _content: ["Carla Nunes\nExperiência: Desenvolvedora Backend\nPython FastAPI"],
    )

    result = extract_pdf_text(b"%PDF")

    assert result.used_ocr is True
    assert "Desenvolvedora Backend" in result.text


def test_extract_pdf_text_fails_when_direct_and_ocr_text_are_low_quality(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        text_extractor,
        "_extract_with_pdfplumber",
        lambda _content: (["000000000000"], 0, 1),
    )
    monkeypatch.setattr(
        text_extractor,
        "_extract_with_ocr",
        lambda _content: ["..... ----- /////"],
    )

    with pytest.raises(PdfTextExtractionError) as exc_info:
        extract_pdf_text(b"%PDF")

    assert str(exc_info.value) == LOW_QUALITY_FAILURE_REASON


def test_extract_pdf_text_fails_when_ocr_unavailable_after_low_quality_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        text_extractor,
        "_extract_with_pdfplumber",
        lambda _content: (["000000000000"], 0, 1),
    )
    monkeypatch.setattr(
        text_extractor,
        "_extract_with_ocr",
        lambda _content: (_ for _ in ()).throw(PdfTextExtractionError("OCR indisponível")),
    )

    with pytest.raises(PdfTextExtractionError) as exc_info:
        extract_pdf_text(b"%PDF")

    assert str(exc_info.value) == LOW_QUALITY_FAILURE_REASON
