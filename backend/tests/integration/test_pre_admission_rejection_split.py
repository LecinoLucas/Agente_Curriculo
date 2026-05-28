"""Contract tests for the split between public rejection reason and internal note.

After phase S2 the staff endpoint receives two independent text fields:
- ``rejection_reason_public`` — surfaced to the candidate.
- ``review_notes`` — internal RH-only note.

These tests pin the contract so a regression that re-derives the public
reason from internal text is caught immediately.
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionChecklistItemModel,
    PreAdmissionDocumentModel,
)

from .test_pre_admission import (
    _create_portal_session,
    _pdf_upload,
    _seed_pre_admission_with_item,
)


_FORBIDDEN_PORTAL_KEYS = frozenset(
    {
        "review_notes",
        "reviewed_by",
        "reviewed_at",
        "internal_notes",
        "notes",
        "created_by",
        "hiring_decision_id",
        "ready_for_export",
        "protheus",
        "final_score",
        "score",
        "ranking_position",
    }
)


def _walk_keys(payload: object) -> set[str]:
    found: set[str] = set()
    if isinstance(payload, dict):
        for key, value in payload.items():
            found.add(key)
            found.update(_walk_keys(value))
    elif isinstance(payload, list):
        for item in payload:
            found.update(_walk_keys(item))
    return found


async def _upload_doc_as_candidate(
    client: AsyncClient,
    *,
    db_session: AsyncSession,
    candidate_id,
    case_id: str,
    item_id: str,
    token: str,
) -> dict:
    await _create_portal_session(db_session, candidate_id, token)
    client.cookies.set("candidate_portal_token", token)
    response = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case_id}/checklist-items/{item_id}/documents",
        files=_pdf_upload(),
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    client.cookies.clear()
    return response.json()


@pytest.mark.asyncio
async def test_reject_with_public_reason_stores_field_and_exposes_to_portal(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _, candidate_id, case, item = await _seed_pre_admission_with_item(client, db_session)
    document = await _upload_doc_as_candidate(
        client,
        db_session=db_session,
        candidate_id=candidate_id,
        case_id=case["id"],
        item_id=item["id"],
        token="portal-reject-public-1",
    )

    response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={
            "rejection_reason_public": "Imagem ilegível, reenvie.",
            "review_notes": "Suspeita de alteração no documento — investigar.",
        },
    )
    assert response.status_code == status.HTTP_200_OK, response.text

    db_session.expire_all()
    row = await db_session.get(PreAdmissionDocumentModel, UUID(document["id"]))
    assert row is not None
    assert row.rejection_reason_public == "Imagem ilegível, reenvie."
    assert row.review_notes == "Suspeita de alteração no documento — investigar."

    # Portal must surface only the public field.
    client.cookies.set("candidate_portal_token", "portal-reject-public-1")
    envelope = (await client.get("/api/v1/candidate-portal/pre-admission")).json()
    item_payload = envelope["case"]["checklist_items"][0]
    assert item_payload["status"] == "rejected"
    assert item_payload["status_public_label"] == "Correções solicitadas"
    assert item_payload["rejection_reason_public"] == "Imagem ilegível, reenvie."
    assert envelope["summary"]["status_public_label"] == "Correções solicitadas"


@pytest.mark.asyncio
async def test_portal_envelope_never_carries_review_notes(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _, candidate_id, case, item = await _seed_pre_admission_with_item(client, db_session)
    document = await _upload_doc_as_candidate(
        client,
        db_session=db_session,
        candidate_id=candidate_id,
        case_id=case["id"],
        item_id=item["id"],
        token="portal-reject-noleak",
    )

    INTERNAL_TEXT = "SUPERSECRETO: candidato sob suspeita de fraude documental."
    reject = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={
            "rejection_reason_public": "Reenvie um documento legível.",
            "review_notes": INTERNAL_TEXT,
        },
    )
    assert reject.status_code == status.HTTP_200_OK

    client.cookies.set("candidate_portal_token", "portal-reject-noleak")
    envelope_response = await client.get("/api/v1/candidate-portal/pre-admission")
    assert envelope_response.status_code == status.HTTP_200_OK
    payload = envelope_response.json()

    leaked_keys = _walk_keys(payload) & _FORBIDDEN_PORTAL_KEYS
    assert not leaked_keys, f"Portal leaked: {sorted(leaked_keys)}"
    assert INTERNAL_TEXT not in envelope_response.text
    assert "attempt_id" not in envelope_response.text
    assert "package_id" not in envelope_response.text
    assert "export_package" not in envelope_response.text


@pytest.mark.asyncio
async def test_portal_falls_back_to_null_when_no_public_reason_provided(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _, candidate_id, case, item = await _seed_pre_admission_with_item(client, db_session)
    document = await _upload_doc_as_candidate(
        client,
        db_session=db_session,
        candidate_id=candidate_id,
        case_id=case["id"],
        item_id=item["id"],
        token="portal-reject-internalonly",
    )

    response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={"review_notes": "Internal: validar com gestor da vaga."},
    )
    assert response.status_code == status.HTTP_200_OK, response.text

    client.cookies.set("candidate_portal_token", "portal-reject-internalonly")
    envelope = (await client.get("/api/v1/candidate-portal/pre-admission")).json()
    item_payload = envelope["case"]["checklist_items"][0]
    assert item_payload["status"] == "rejected"
    assert item_payload["status_public_label"] == "Correções solicitadas"
    assert item_payload["rejection_reason_public"] is None
    assert "Internal" not in envelope.__repr__()


@pytest.mark.asyncio
async def test_reject_without_any_text_returns_422(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _, candidate_id, case, item = await _seed_pre_admission_with_item(client, db_session)
    document = await _upload_doc_as_candidate(
        client,
        db_session=db_session,
        candidate_id=candidate_id,
        case_id=case["id"],
        item_id=item["id"],
        token="portal-reject-empty",
    )

    response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={"rejection_reason_public": "   ", "review_notes": ""},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_staff_response_exposes_both_internal_and_public(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _, candidate_id, case, item = await _seed_pre_admission_with_item(client, db_session)
    document = await _upload_doc_as_candidate(
        client,
        db_session=db_session,
        candidate_id=candidate_id,
        case_id=case["id"],
        item_id=item["id"],
        token="portal-reject-staffview",
    )

    reject = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={
            "rejection_reason_public": "Reenvie em PDF.",
            "review_notes": "Anexo recebido em formato diferente do exigido.",
        },
    )
    assert reject.status_code == status.HTTP_200_OK
    payload = reject.json()
    assert payload["rejection_reason_public"] == "Reenvie em PDF."
    assert payload["review_notes"] == "Anexo recebido em formato diferente do exigido."
    assert payload["reviewed_by"] is not None


@pytest.mark.asyncio
async def test_public_reason_max_length_enforced(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _, candidate_id, case, item = await _seed_pre_admission_with_item(client, db_session)
    document = await _upload_doc_as_candidate(
        client,
        db_session=db_session,
        candidate_id=candidate_id,
        case_id=case["id"],
        item_id=item["id"],
        token="portal-reject-maxlen",
    )

    response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={"rejection_reason_public": "x" * 1001},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_legacy_review_notes_in_db_is_not_exposed_to_portal(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Pre-existing documents (rejected before S2) keep ``review_notes`` set
    but no ``rejection_reason_public``. The portal must not surface the legacy
    internal text.
    """
    headers, _, candidate_id, case, item = await _seed_pre_admission_with_item(client, db_session)
    document = await _upload_doc_as_candidate(
        client,
        db_session=db_session,
        candidate_id=candidate_id,
        case_id=case["id"],
        item_id=item["id"],
        token="portal-reject-legacy",
    )
    # Simulate legacy DB state: rejected document with only the old internal field.
    row = await db_session.get(PreAdmissionDocumentModel, UUID(document["id"]))
    assert row is not None
    row.status = "rejected"
    row.reviewed_at = datetime.now(UTC)
    row.review_notes = "LEGACY-INTERNAL: candidato sob acompanhamento."
    row.rejection_reason_public = None
    checklist_item_row = await db_session.get(
        PreAdmissionChecklistItemModel, UUID(item["id"])
    )
    assert checklist_item_row is not None
    checklist_item_row.status = "rejected"
    await db_session.commit()

    client.cookies.set("candidate_portal_token", "portal-reject-legacy")
    envelope = (await client.get("/api/v1/candidate-portal/pre-admission")).json()
    item_payload = envelope["case"]["checklist_items"][0]
    assert item_payload["status"] == "rejected"
    assert item_payload["rejection_reason_public"] is None
    assert "LEGACY-INTERNAL" not in envelope.__repr__()
