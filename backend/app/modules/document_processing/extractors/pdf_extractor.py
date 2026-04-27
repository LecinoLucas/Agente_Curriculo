from __future__ import annotations

from app.modules.document_processing.extractors.base_extractor import BaseTextExtractor


class PDFTextExtractor(BaseTextExtractor):
    def extract_text(self, file_path: str) -> str:
        import pdfplumber

        page_texts: list[str] = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                clean_text = page_text.strip()
                if clean_text:
                    page_texts.append(clean_text)
        return "\n\n".join(page_texts).strip()

