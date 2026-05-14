from __future__ import annotations

from pathlib import Path


PRE_ADMISSION_DOCUMENTS_DIR = Path(__file__).resolve().parents[3] / "private_uploads" / "pre_admission"


def resolve_pre_admission_document_path(storage_key: str) -> Path:
    candidate = (PRE_ADMISSION_DOCUMENTS_DIR / Path(storage_key)).resolve()
    base = PRE_ADMISSION_DOCUMENTS_DIR.resolve()

    if not str(candidate).startswith(str(base)):
        raise ValueError("Invalid pre-admission document path")

    return candidate


def write_pre_admission_document(storage_key: str, content: bytes) -> Path:
    path = resolve_pre_admission_document_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path
