from __future__ import annotations

import io
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path

from src.application.services.file_scanner import FileScanError, FileScanner, get_file_scanner
from src.core.settings import settings


class UploadValidationError(Exception):
    pass


class UploadTooLargeError(UploadValidationError):
    pass


@dataclass(frozen=True)
class ValidatedUpload:
    file_name: str
    mime_type: str
    extension: str
    content: bytes


@dataclass(frozen=True)
class UploadValidationPolicy:
    allowed_mime_types: set[str]
    max_size_bytes: int


MIME_EXTENSIONS: dict[str, set[str]] = {
    "application/pdf": {".pdf"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "application/vnd.ms-excel": {".xls"},
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {".xlsx"},
}

PRIMARY_EXTENSION: dict[str, str] = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
}

PDF_SUSPICIOUS_MARKERS = (
    b"/javascript",
    b"/launch",
    b"/embeddedfile",
)


def resume_upload_policy() -> UploadValidationPolicy:
    return UploadValidationPolicy(
        allowed_mime_types=_known_mime_types(settings.ALLOWED_RESUME_MIME_TYPES),
        max_size_bytes=settings.max_upload_size_bytes,
    )


def document_upload_policy() -> UploadValidationPolicy:
    return UploadValidationPolicy(
        allowed_mime_types=_known_mime_types(settings.ALLOWED_DOCUMENT_MIME_TYPES),
        max_size_bytes=settings.max_upload_size_bytes,
    )


def validate_upload(
    *,
    file_name: str,
    content_type: str | None,
    content: bytes,
    policy: UploadValidationPolicy,
    scanner: FileScanner | None = None,
) -> ValidatedUpload:
    if not content:
        raise UploadValidationError("Arquivo vazio")
    if len(content) > policy.max_size_bytes:
        limit_mb = policy.max_size_bytes // (1024 * 1024)
        raise UploadTooLargeError(f"Arquivo muito grande (máx {limit_mb}MB)")

    safe_name = sanitize_upload_filename(file_name)
    submitted_extension = Path(safe_name).suffix.lower()
    if not submitted_extension:
        raise UploadValidationError("Extensão de arquivo não permitida")

    normalized_content_type = _normalize_content_type(content_type)
    if normalized_content_type not in policy.allowed_mime_types:
        raise UploadValidationError("Tipo de arquivo não permitido")

    allowed_extensions = MIME_EXTENSIONS[normalized_content_type]
    if submitted_extension not in allowed_extensions:
        raise UploadValidationError("Extensão de arquivo não permitida para o tipo informado")

    detected_mime_type = _detect_mime_type(content)
    if detected_mime_type != normalized_content_type:
        raise UploadValidationError("Assinatura do arquivo não corresponde ao tipo informado")

    _validate_content_by_type(detected_mime_type, content)

    validated = ValidatedUpload(
        file_name=safe_name,
        mime_type=normalized_content_type,
        extension=PRIMARY_EXTENSION[normalized_content_type],
        content=content,
    )
    active_scanner = scanner or get_file_scanner()
    try:
        active_scanner.scan(file_name=validated.file_name, content=validated.content, mime_type=validated.mime_type)
    except FileScanError as exc:
        raise UploadValidationError(str(exc)) from exc
    return validated


def sanitize_upload_filename(file_name: str) -> str:
    if "\x00" in file_name:
        raise UploadValidationError("Nome de arquivo inválido")

    base_name = file_name.replace("\\", "/").rsplit("/", maxsplit=1)[-1].strip()
    base_name = unicodedata.normalize("NFKC", base_name)
    base_name = re.sub(r"[\x00-\x1f\x7f]+", "", base_name)
    base_name = re.sub(r"[^A-Za-z0-9._ -]+", "_", base_name)
    base_name = re.sub(r"\s+", " ", base_name).strip(" .")
    while ".." in base_name:
        base_name = base_name.replace("..", ".")
    base_name = base_name.lstrip(".")
    if not base_name:
        raise UploadValidationError("Nome de arquivo inválido")
    return base_name[:255]


def _known_mime_types(values: list[str]) -> set[str]:
    return {value.strip().lower() for value in values if value.strip().lower() in MIME_EXTENSIONS}


def _normalize_content_type(content_type: str | None) -> str:
    return (content_type or "").split(";", maxsplit=1)[0].strip().lower()


def _detect_mime_type(content: bytes) -> str | None:
    if content.startswith(b"%PDF"):
        return "application/pdf"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "application/vnd.ms-excel"
    if content.startswith(b"PK\x03\x04") and _looks_like_xlsx(content):
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return None


def _validate_content_by_type(mime_type: str, content: bytes) -> None:
    if mime_type == "application/pdf":
        if not content.startswith(b"%PDF"):
            raise UploadValidationError("Conteúdo enviado não parece ser um PDF válido")
        if b"%%EOF" not in content[-2048:]:
            raise UploadValidationError("Conteúdo enviado não parece ser um PDF válido")
        lowered = content[:1024 * 1024].lower()
        if any(marker in lowered for marker in PDF_SUSPICIOUS_MARKERS):
            raise UploadValidationError("PDF contém marcador suspeito")
        return

    if mime_type == "image/png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
        raise UploadValidationError("Conteúdo enviado não parece ser um PNG válido")

    if mime_type == "image/jpeg" and not content.startswith(b"\xff\xd8\xff"):
        raise UploadValidationError("Conteúdo enviado não parece ser um JPG válido")


def _looks_like_xlsx(content: bytes) -> bool:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            names = set(archive.namelist())
            return "[Content_Types].xml" in names and any(name.startswith("xl/") for name in names)
    except zipfile.BadZipFile:
        return False
