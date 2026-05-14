from __future__ import annotations

from pathlib import Path
from uuid import UUID


PRE_ADMISSION_DOCUMENTS_DIR = Path(__file__).resolve().parents[3] / "private_uploads" / "pre_admission"


def resolve_pre_admission_document_path(storage_key: str) -> Path:
    relative_key = Path(storage_key)
    if relative_key.is_absolute() or any(part in {"", ".", ".."} for part in relative_key.parts):
        raise ValueError("Invalid pre-admission document path")

    candidate = (PRE_ADMISSION_DOCUMENTS_DIR / relative_key).resolve()
    base = PRE_ADMISSION_DOCUMENTS_DIR.resolve()

    try:
        candidate.relative_to(base)
    except ValueError as exc:
        raise ValueError("Invalid pre-admission document path") from exc

    if candidate == base:
        raise ValueError("Invalid pre-admission document path")

    return candidate


def build_pre_admission_storage_key(
    *,
    candidate_id: UUID,
    case_id: UUID,
    item_id: UUID,
    document_id: UUID,
    extension: str,
) -> tuple[str, str]:
    stored_filename = f"{document_id.hex}{extension}"
    storage_key = f"{candidate_id}/{case_id}/{item_id}/{stored_filename}"
    resolve_pre_admission_document_path(storage_key)
    return storage_key, stored_filename


def write_pre_admission_document(storage_key: str, content: bytes) -> Path:
    path = resolve_pre_admission_document_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path
