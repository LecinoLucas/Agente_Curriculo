from __future__ import annotations

import io
from uuid import uuid4

import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.file_scanner import FileScanThreatFound
from src.application.services.upload_validation_service import (
    UploadValidationError,
    document_upload_policy,
    resume_upload_policy,
    validate_upload,
)
from src.core.settings import settings
from src.domain.entities.user import UserRole
from src.infrastructure.storage import pre_admission_documents, resume_files
from tests.integration.helpers import _auth_headers, _create_active_user
from tests.integration.test_pre_admission import _create_portal_session, _seed_pre_admission_with_item
from tests.integration.test_public_application_pipeline import _form
from tests.integration.test_resume_upload_async import _create_candidate


pytestmark = pytest.mark.smoke

VALID_PDF = (
    b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
    b"xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n9\n%%EOF"
)


@pytest.fixture(autouse=True)
def isolated_upload_storage(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(resume_files, "RESUME_UPLOAD_DIR", tmp_path / "uploads" / "resumes")
    monkeypatch.setattr(
        pre_admission_documents,
        "PRE_ADMISSION_DOCUMENTS_DIR",
        tmp_path / "private_uploads" / "pre_admission",
    )


def test_valid_pdf_passes() -> None:
    validated = validate_upload(
        file_name="curriculo.pdf",
        content_type="application/pdf",
        content=VALID_PDF,
        policy=resume_upload_policy(),
    )

    assert validated.mime_type == "application/pdf"
    assert validated.extension == ".pdf"


def test_fake_pdf_with_pdf_extension_is_rejected() -> None:
    with pytest.raises(UploadValidationError):
        validate_upload(
            file_name="curriculo.pdf",
            content_type="application/pdf",
            content=b"not-a-pdf",
            policy=resume_upload_policy(),
        )


def test_empty_file_is_rejected() -> None:
    with pytest.raises(UploadValidationError):
        validate_upload(
            file_name="curriculo.pdf",
            content_type="application/pdf",
            content=b"",
            policy=resume_upload_policy(),
        )


def test_file_above_limit_is_rejected() -> None:
    with pytest.raises(UploadValidationError):
        validate_upload(
            file_name="curriculo.pdf",
            content_type="application/pdf",
            content=b"%PDF-1.4\n%%EOF" + b"x" * settings.max_upload_size_bytes,
            policy=resume_upload_policy(),
        )


def test_path_traversal_filename_is_sanitized() -> None:
    validated = validate_upload(
        file_name="../../..\\cpf.pdf",
        content_type="application/pdf",
        content=VALID_PDF,
        policy=document_upload_policy(),
    )

    assert validated.file_name == "cpf.pdf"


@pytest.mark.parametrize(
    ("filename", "content", "mime_type"),
    [
        ("foto.jpg", b"\xff\xd8\xff\xe0jpeg-data", "image/jpeg"),
        ("comprovante.png", b"\x89PNG\r\n\x1a\npng-data", "image/png"),
    ],
)
def test_valid_jpg_png_pass_when_allowed(filename: str, content: bytes, mime_type: str) -> None:
    validated = validate_upload(
        file_name=filename,
        content_type=mime_type,
        content=content,
        policy=document_upload_policy(),
    )

    assert validated.mime_type == mime_type


def test_exe_renamed_to_pdf_is_rejected() -> None:
    with pytest.raises(UploadValidationError):
        validate_upload(
            file_name="malware.pdf",
            content_type="application/pdf",
            content=b"MZ\x90\x00exe-content",
            policy=resume_upload_policy(),
        )


def test_fake_scanner_detecting_malware_rejects_upload() -> None:
    class MalwareScanner:
        def scan(self, *, file_name: str, content: bytes, mime_type: str) -> None:
            raise FileScanThreatFound("malware detected")

    with pytest.raises(UploadValidationError):
        validate_upload(
            file_name="curriculo.pdf",
            content_type="application/pdf",
            content=VALID_PDF,
            policy=resume_upload_policy(),
            scanner=MalwareScanner(),
        )


@pytest.mark.asyncio
async def test_public_application_still_accepts_valid_pdf(client: AsyncClient, db_session: AsyncSession) -> None:
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data=_form(),
        files={"resume_file": ("resume.pdf", io.BytesIO(VALID_PDF), "application/pdf")},
    )

    assert response.status_code == status.HTTP_201_CREATED, response.text


@pytest.mark.asyncio
async def test_pre_admission_still_accepts_valid_document(client: AsyncClient, db_session: AsyncSession) -> None:
    _headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(client, db_session)
    token = f"portal-pre-admission-upload-hardening-{uuid4().hex[:8]}"
    await _create_portal_session(db_session, candidate_id, token)
    client.cookies.set("candidate_portal_token", token)

    response = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
        files={"document_file": ("cpf.pdf", VALID_PDF, "application/pdf")},
    )

    assert response.status_code == status.HTTP_201_CREATED, response.text
    assert response.json()["mime_type"] == "application/pdf"


@pytest.mark.asyncio
async def test_admin_resume_upload_rejects_fake_pdf(client: AsyncClient, db_session: AsyncSession) -> None:
    email = f"upload-hardening-{uuid4().hex[:8]}@test.com"
    await _create_active_user(db_session, email, "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, email, "password123")
    candidate_id = await _create_candidate(client, headers)

    init_response = await client.post("/api/v1/resumes", headers=headers, json={"candidate_id": candidate_id})
    assert init_response.status_code == status.HTTP_202_ACCEPTED

    upload_response = await client.post(
        f"/api/v1/resumes/{init_response.json()['resume_id']}/upload",
        headers=headers,
        files={"file": ("curriculo.pdf", b"MZ\x90\x00exe-content", "application/pdf")},
    )

    assert upload_response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
