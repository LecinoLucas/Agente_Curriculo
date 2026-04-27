from __future__ import annotations

from app.modules.document_processing.extractors.base_extractor import BaseTextExtractor


class ImageOCRExtractor(BaseTextExtractor):
    def extract_text(self, file_path: str) -> str:
        try:
            from PIL import Image
            import pytesseract
        except Exception as exc:
            raise RuntimeError(
                "OCR dependencies are missing. Install pillow and pytesseract."
            ) from exc

        with Image.open(file_path) as image:
            text = pytesseract.image_to_string(image, lang="por+eng")
        return text.strip()

