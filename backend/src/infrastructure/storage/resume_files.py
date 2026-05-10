from __future__ import annotations

from pathlib import Path


RESUME_UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "resumes"


def resolve_resume_storage_path(s3_key: str) -> Path:
    candidate = (RESUME_UPLOAD_DIR / Path(s3_key)).resolve()
    base = RESUME_UPLOAD_DIR.resolve()

    if not str(candidate).startswith(str(base)):
        raise ValueError("Invalid resume storage path")

    return candidate


def write_resume_file(s3_key: str, content: bytes) -> Path:
    path = resolve_resume_storage_path(s3_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path

