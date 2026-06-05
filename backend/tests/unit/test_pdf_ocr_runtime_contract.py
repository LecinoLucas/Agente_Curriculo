from __future__ import annotations

import importlib
from pathlib import Path


def test_pdf_ocr_python_dependencies_are_importable() -> None:
    assert importlib.import_module("pdf2image") is not None
    assert importlib.import_module("pytesseract") is not None


def test_worker_container_installs_pdf_ocr_system_packages() -> None:
    dockerfile = Path("docker/worker.Dockerfile").read_text(encoding="utf-8")

    assert "poppler-utils" in dockerfile
    assert "tesseract-ocr" in dockerfile
    assert "tesseract-ocr-por" in dockerfile


def test_api_container_installs_pdf_ocr_system_packages() -> None:
    dockerfile = Path("docker/api.Dockerfile").read_text(encoding="utf-8")

    assert "poppler-utils" in dockerfile
    assert "tesseract-ocr" in dockerfile
    assert "tesseract-ocr-por" in dockerfile
