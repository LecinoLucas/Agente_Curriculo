from __future__ import annotations

from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.pre_admission_service import MAX_PRE_ADMISSION_DOCUMENT_BYTES
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionDocumentModel,
    PreAdmissionEventModel,
)
from src.infrastructure.storage import pre_admission_documents as document_storage
from tests.integration.helpers import _auth_headers, _create_active_user

from .test_pre_admission import (
    _create_plain_candidate,
    _create_portal_session,
    _seed_pre_admission_with_item,
)

# Fase 30B — segurança de documentos sensíveis na pré-admissão (RBAC + path
# traversal + content-type). Sempre no smoke.
pytestmark = pytest.mark.smoke


@pytest.fixture(autouse=True)
def private_pre_admission_storage(tmp_path, monkeypatch: pytest.MonkeyPatch):
    storage_dir = tmp_path / "private_uploads" / "pre_admission"
    monkeypatch.setattr(document_storage, "PRE_ADMISSION_DOCUMENTS_DIR", storage_dir)
    return storage_dir


def _upload(filename: str, content: bytes, mime_type: str) -> dict:
    return {"document_file": (filename, content, mime_type)}


async def _staff_headers_for_role(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> dict[str, str]:
    email = f"pre-admission-download-{role.value}-{uuid4().hex[:8]}@example.com"
    await _create_active_user(db_session, email, "Senha123!", role)
    return await _auth_headers(client, email, "Senha123!")


async def _upload_for_seed(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    filename: str,
    content: bytes,
    mime_type: str,
    token: str = "portal-pre-admission-security",
) -> tuple[dict[str, str], UUID, UUID, dict, dict, dict]:
    headers, job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, token)
    client.cookies.set("candidate_portal_token", token)
    response = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
        files=_upload(filename, content, mime_type),
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return headers, job_id, candidate_id, case, item, response.json()


@pytest.mark.asyncio
async def test_valid_pdf_upload_passes(client: AsyncClient, db_session: AsyncSession) -> None:
    *_rest, document = await _upload_for_seed(
        client,
        db_session,
        filename="cpf.pdf",
        content=b"%PDF-1.4\n%%EOF",
        mime_type="application/pdf",
    )

    assert document["mime_type"] == "application/pdf"
    assert document["original_filename"] == "cpf.pdf"


@pytest.mark.asyncio
async def test_valid_png_upload_passes(client: AsyncClient, db_session: AsyncSession) -> None:
    *_rest, document = await _upload_for_seed(
        client,
        db_session,
        filename="comprovante.png",
        content=b"\x89PNG\r\n\x1a\npng-data",
        mime_type="image/png",
    )

    assert document["mime_type"] == "image/png"


@pytest.mark.asyncio
async def test_valid_jpeg_upload_passes(client: AsyncClient, db_session: AsyncSession) -> None:
    *_rest, document = await _upload_for_seed(
        client,
        db_session,
        filename="rg.jpeg",
        content=b"\xff\xd8\xff\xe0jpeg-data",
        mime_type="image/jpeg",
    )

    assert document["mime_type"] == "image/jpeg"


@pytest.mark.asyncio
async def test_empty_file_fails(client: AsyncClient, db_session: AsyncSession) -> None:
    _headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-empty")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-empty")

    response = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
        files=_upload("cpf.pdf", b"", "application/pdf"),
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_pdf_extension_with_invalid_signature_fails(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-invalid-signature")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-invalid-signature")

    response = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
        files=_upload("cpf.pdf", b"not a pdf", "application/pdf"),
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_path_traversal_filename_is_neutralized(
    client: AsyncClient,
    db_session: AsyncSession,
    private_pre_admission_storage,
) -> None:
    *_rest, document = await _upload_for_seed(
        client,
        db_session,
        filename="../../..\\cpf.pdf",
        content=b"%PDF-1.4\n%%EOF",
        mime_type="application/pdf",
        token="portal-pre-admission-traversal",
    )
    db_document = await db_session.get(PreAdmissionDocumentModel, UUID(document["id"]))
    assert db_document is not None

    saved_path = document_storage.resolve_pre_admission_document_path(db_document.storage_key)
    assert document["original_filename"] == "cpf.pdf"
    assert saved_path.exists()
    assert saved_path.relative_to(private_pre_admission_storage)
    assert ".." not in db_document.storage_key


@pytest.mark.asyncio
async def test_document_response_does_not_expose_internal_storage(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    *_rest, document = await _upload_for_seed(
        client,
        db_session,
        filename="cpf.pdf",
        content=b"%PDF-1.4\n%%EOF",
        mime_type="application/pdf",
        token="portal-pre-admission-response",
    )

    assert {"file_path", "stored_filename", "storage_key", "storage_path"}.isdisjoint(document)


@pytest.mark.asyncio
async def test_candidate_cannot_download_other_candidate_document(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    *_rest, document = await _upload_for_seed(
        client,
        db_session,
        filename="cpf.pdf",
        content=b"%PDF-1.4\n%%EOF",
        mime_type="application/pdf",
        token="portal-pre-admission-owner",
    )
    other_candidate = await _create_plain_candidate(db_session)
    await _create_portal_session(db_session, other_candidate.id, "portal-pre-admission-other-owner")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-other-owner")

    response = await client.get(
        f"/api/v1/candidate-portal/pre-admission/documents/{document['id']}/download"
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_staff_download_is_authorized_and_audited(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers, _job_id, _candidate_id, case, item, document = await _upload_for_seed(
        client,
        db_session,
        filename="cpf.pdf",
        content=b"%PDF-1.4\n%%EOF",
        mime_type="application/pdf",
        token="portal-pre-admission-staff-download",
    )
    client.cookies.clear()

    response = await client.get(
        f"/api/v1/pre-admission/documents/{document['id']}/download", headers=headers
    )
    event = await db_session.scalar(
        sa.select(PreAdmissionEventModel)
        .where(
            PreAdmissionEventModel.case_id == UUID(case["id"]),
            PreAdmissionEventModel.event_type == "document_downloaded",
        )
        .order_by(PreAdmissionEventModel.created_at.desc())
        .limit(1)
    )

    assert response.status_code == status.HTTP_200_OK
    assert event is not None
    assert event.payload_json == {
        "document_id": document["id"],
        "checklist_item_id": item["id"],
        "actor_type": "staff",
        "actor_role": "admin",
        "mime_type": "application/pdf",
        "size_bytes": document["size_bytes"],
    }
    assert "storage_key" not in event.payload_json
    assert "file_path" not in event.payload_json
    assert "content" not in event.payload_json
    assert "file_bytes" not in event.payload_json


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("role", "expected_status"),
    [
        (UserRole.ADMIN, status.HTTP_200_OK),
        (UserRole.HR, status.HTTP_200_OK),
        (UserRole.RECRUITER, status.HTTP_403_FORBIDDEN),
        (UserRole.MANAGER, status.HTTP_403_FORBIDDEN),
        (UserRole.VIEWER, status.HTTP_403_FORBIDDEN),
        (UserRole.CANDIDATE, status.HTTP_403_FORBIDDEN),
    ],
)
async def test_staff_download_role_matrix(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
    expected_status: int,
) -> None:
    _seed_headers, _job_id, _candidate_id, _case, _item, document = await _upload_for_seed(
        client,
        db_session,
        filename="cpf.pdf",
        content=b"%PDF-1.4\n%%EOF",
        mime_type="application/pdf",
        token=f"portal-pre-admission-role-{role.value}",
    )
    client.cookies.clear()
    role_headers = await _staff_headers_for_role(client, db_session, role)

    response = await client.get(
        f"/api/v1/pre-admission/documents/{document['id']}/download",
        headers=role_headers,
    )

    assert response.status_code == expected_status


@pytest.mark.asyncio
async def test_recruiter_cannot_approve_or_reject_pre_admission_document(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _seed_headers, _job_id, _candidate_id, _case, _item, document = await _upload_for_seed(
        client,
        db_session,
        filename="cpf.pdf",
        content=b"%PDF-1.4\n%%EOF",
        mime_type="application/pdf",
        token="portal-pre-admission-recruiter-action",
    )
    client.cookies.clear()
    recruiter_headers = await _staff_headers_for_role(client, db_session, UserRole.RECRUITER)

    approve_response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/approve",
        headers=recruiter_headers,
    )
    reject_response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=recruiter_headers,
        json={"review_notes": "Documento ilegível."},
    )

    assert approve_response.status_code == status.HTTP_403_FORBIDDEN
    assert reject_response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_hr_can_approve_and_reject_pre_admission_documents(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    seed_headers, _job_id, candidate_id, case, _item, first_document = await _upload_for_seed(
        client,
        db_session,
        filename="cpf.pdf",
        content=b"%PDF-1.4\n%%EOF",
        mime_type="application/pdf",
        token="portal-pre-admission-hr-approve",
    )
    client.cookies.clear()
    hr_headers = await _staff_headers_for_role(client, db_session, UserRole.HR)

    approve_response = await client.post(
        f"/api/v1/pre-admission/documents/{first_document['id']}/approve",
        headers=hr_headers,
    )
    assert approve_response.status_code == status.HTTP_200_OK
    assert approve_response.json()["status"] == "approved"

    second_item_response = await client.post(
        f"/api/v1/pre-admission/{case['id']}/checklist-items",
        headers=seed_headers,
        json={
            "item_type": "rg",
            "title": "RG",
            "required": True,
        },
    )
    assert second_item_response.status_code == status.HTTP_201_CREATED, second_item_response.text
    second_item = second_item_response.json()

    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-hr-reject")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-hr-reject")
    upload_response = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{second_item['id']}/documents",
        files=_upload("rg.pdf", b"%PDF-1.4\n%%EOF", "application/pdf"),
    )
    assert upload_response.status_code == status.HTTP_201_CREATED, upload_response.text
    second_document = upload_response.json()

    client.cookies.clear()
    reject_response = await client.post(
        f"/api/v1/pre-admission/documents/{second_document['id']}/reject",
        headers=hr_headers,
        json={"review_notes": "Documento ilegível."},
    )

    assert reject_response.status_code == status.HTTP_200_OK
    assert reject_response.json()["status"] == "rejected"


@pytest.mark.asyncio
async def test_candidate_download_is_audited(client: AsyncClient, db_session: AsyncSession) -> None:
    _headers, _job_id, _candidate_id, case, item, document = await _upload_for_seed(
        client,
        db_session,
        filename="cpf.pdf",
        content=b"%PDF-1.4\n%%EOF",
        mime_type="application/pdf",
        token="portal-pre-admission-candidate-download",
    )

    response = await client.get(
        f"/api/v1/candidate-portal/pre-admission/documents/{document['id']}/download"
    )
    event = await db_session.scalar(
        sa.select(PreAdmissionEventModel)
        .where(
            PreAdmissionEventModel.case_id == UUID(case["id"]),
            PreAdmissionEventModel.event_type == "document_downloaded",
        )
        .order_by(PreAdmissionEventModel.created_at.desc())
        .limit(1)
    )

    assert response.status_code == status.HTTP_200_OK
    assert event is not None
    assert event.payload_json["actor_type"] == "candidate"
    assert event.payload_json["checklist_item_id"] == item["id"]


@pytest.mark.asyncio
async def test_staff_download_sanitizes_content_disposition_filename(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, _candidate_id, _case, _item, document = await _upload_for_seed(
        client,
        db_session,
        filename="cpf.pdf",
        content=b"%PDF-1.4\n%%EOF",
        mime_type="application/pdf",
        token="portal-pre-admission-filename-sanitized",
    )
    db_document = await db_session.get(PreAdmissionDocumentModel, UUID(document["id"]))
    assert db_document is not None
    db_document.original_filename = "../../RG (sigiloso)\nfinal.pdf"
    await db_session.commit()
    client.cookies.clear()

    response = await client.get(
        f"/api/v1/pre-admission/documents/{document['id']}/download",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK
    disposition = response.headers.get("content-disposition", "")
    assert "attachment" in disposition
    assert "%0A" not in disposition
    assert ".." not in disposition
    assert "%2F" not in disposition
    assert "%5C" not in disposition
    assert "(" not in disposition
    assert ")" not in disposition


@pytest.mark.asyncio
async def test_download_returns_controlled_404_when_storage_raises_file_not_found(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _job_id, _candidate_id, _case, _item, document = await _upload_for_seed(
        client,
        db_session,
        filename="cpf.pdf",
        content=b"%PDF-1.4\n%%EOF",
        mime_type="application/pdf",
        token="portal-pre-admission-storage-missing",
    )
    client.cookies.clear()

    def _raise_file_not_found(_: str):
        raise FileNotFoundError("missing file")

    monkeypatch.setattr(
        "src.application.services.pre_admission_service.resolve_pre_admission_document_path",
        _raise_file_not_found,
    )

    response = await client.get(
        f"/api/v1/pre-admission/documents/{document['id']}/download",
        headers=headers,
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("case_status", "expected_candidate_status"),
    [("cancelled", status.HTTP_404_NOT_FOUND), ("admitted", status.HTTP_200_OK)],
)
async def test_terminal_case_document_download_policy(
    client: AsyncClient,
    db_session: AsyncSession,
    case_status: str,
    expected_candidate_status: int,
) -> None:
    headers, _job_id, _candidate_id, case, _item, document = await _upload_for_seed(
        client,
        db_session,
        filename="cpf.pdf",
        content=b"%PDF-1.4\n%%EOF",
        mime_type="application/pdf",
        token=f"portal-pre-admission-terminal-{case_status}",
    )
    await client.patch(
        f"/api/v1/pre-admission/{case['id']}", headers=headers, json={"status": case_status}
    )

    candidate_response = await client.get(
        f"/api/v1/candidate-portal/pre-admission/documents/{document['id']}/download"
    )
    client.cookies.clear()
    staff_response = await client.get(
        f"/api/v1/pre-admission/documents/{document['id']}/download", headers=headers
    )

    assert candidate_response.status_code == expected_candidate_status
    assert staff_response.status_code == status.HTTP_200_OK


@pytest.mark.asyncio
async def test_upload_above_10mb_fails(client: AsyncClient, db_session: AsyncSession) -> None:
    _headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(
        db_session, candidate_id, "portal-pre-admission-oversized-security"
    )
    client.cookies.set("candidate_portal_token", "portal-pre-admission-oversized-security")

    response = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
        files=_upload(
            "cpf.pdf", b"%PDF" + b"x" * MAX_PRE_ADMISSION_DOCUMENT_BYTES, "application/pdf"
        ),
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_disallowed_mime_type_fails(client: AsyncClient, db_session: AsyncSession) -> None:
    _headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-disallowed-mime")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-disallowed-mime")

    response = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
        files=_upload("cpf.pdf", b"%PDF-1.4\n%%EOF", "application/octet-stream"),
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_stored_filename_does_not_contain_original_name(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    *_rest, document = await _upload_for_seed(
        client,
        db_session,
        filename="cpf-secreto.pdf",
        content=b"%PDF-1.4\n%%EOF",
        mime_type="application/pdf",
        token="portal-pre-admission-stored-name",
    )
    db_document = await db_session.get(PreAdmissionDocumentModel, UUID(document["id"]))

    assert db_document is not None
    assert "cpf-secreto" not in db_document.stored_filename
    assert db_document.stored_filename.endswith(".pdf")


@pytest.mark.asyncio
async def test_saved_file_stays_inside_private_pre_admission_storage(
    client: AsyncClient,
    db_session: AsyncSession,
    private_pre_admission_storage,
) -> None:
    *_rest, document = await _upload_for_seed(
        client,
        db_session,
        filename="cpf.pdf",
        content=b"%PDF-1.4\n%%EOF",
        mime_type="application/pdf",
        token="portal-pre-admission-storage-boundary",
    )
    db_document = await db_session.get(PreAdmissionDocumentModel, UUID(document["id"]))
    assert db_document is not None

    saved_path = document_storage.resolve_pre_admission_document_path(db_document.storage_key)
    assert saved_path.exists()
    assert saved_path.relative_to(private_pre_admission_storage)
