"""Contract tests for the candidate-facing pre-admission endpoints.

Locks down the shape exposed to the candidate so future refactors don't:
- leak internal RH fields (item.notes, document.review_notes, document.reviewed_by)
- leak Protheus/ERP fields, scoring or rankings
- drop the documents summary required by the dashboard tile

Each test seeds a case with one checklist item and one document, then walks
the JSON response to assert presence/absence of fields.
"""
from __future__ import annotations

from uuid import UUID

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)

from .test_hiring_decisions import _seed_candidate_job
from .test_pre_admission import (
    _admin_headers,
    _complete_candidate_portal_profile,
    _create_portal_session,
    _create_plain_candidate,
    _pdf_upload,
    _seed_pre_admission_with_item,
)


_FORBIDDEN_PORTAL_KEYS = frozenset(
    {
        # Internal RH-only fields
        "notes",
        "review_notes",
        "reviewed_by",
        "reviewed_at",
        "ready_for_export",
        "ready_for_export_at",
        "ready_for_export_by",
        "created_by",
        "hiring_decision_id",
        "internal_notes",
        # Protheus / ERP / scoring
        "protheus",
        "protheus_status",
        "export_package",
        "package_id",
        "attempt_id",
        "erp_payload",
        "final_score",
        "score",
        "ranking_position",
    }
)


def _walk_keys(obj: object) -> set[str]:
    found: set[str] = set()
    if isinstance(obj, dict):
        for key, value in obj.items():
            found.add(key)
            found.update(_walk_keys(value))
    elif isinstance(obj, list):
        for item in obj:
            found.update(_walk_keys(item))
    return found


@pytest.mark.asyncio
async def test_portal_envelope_exposes_summary_counts_and_no_internal_fields(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, _, candidate_id, case, item = await _seed_pre_admission_with_item(client, db_session)
    await _create_portal_session(db_session, candidate_id, "portal-summary-counts")
    client.cookies.set("candidate_portal_token", "portal-summary-counts")

    response = await client.get("/api/v1/candidate-portal/pre-admission")
    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()

    summary = payload["summary"]
    assert summary["has_pre_admission_case"] is True
    assert summary["pre_admission_status"] == case["status"]
    assert summary["status_public_label"] == "Aguardando documentos"
    assert summary["documents_total"] == 1
    assert summary["documents_approved"] == 0
    assert summary["documents_submitted"] == 0
    assert summary["next_pending_document"] == item["title"]

    keys = _walk_keys(payload)
    leaked = keys & _FORBIDDEN_PORTAL_KEYS
    assert not leaked, f"Portal leaked internal fields: {sorted(leaked)}"


@pytest.mark.asyncio
async def test_portal_checklist_item_has_public_contract_fields(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, _, candidate_id, _case, _item = await _seed_pre_admission_with_item(client, db_session)
    await _create_portal_session(db_session, candidate_id, "portal-checklist-contract")
    client.cookies.set("candidate_portal_token", "portal-checklist-contract")

    response = await client.get("/api/v1/candidate-portal/pre-admission")
    assert response.status_code == status.HTTP_200_OK
    case_payload = response.json()["case"]
    assert case_payload["status_public_label"] == "Aguardando documentos"
    item_payload = case_payload["checklist_items"][0]

    expected_keys = {
        "item_id",
        "title",
        "description",
        "required",
        "status",
        "status_public_label",
        "rejection_reason_public",
        "uploaded_document",
        "allowed_file_types",
        "max_file_size_mb",
    }
    assert expected_keys.issubset(item_payload.keys())
    # Internal staff fields must not be exposed on the candidate item view
    assert "notes" not in item_payload
    assert "case_id" not in item_payload
    assert "item_type" not in item_payload
    assert item_payload["max_file_size_mb"] >= 1
    assert "application/pdf" in item_payload["allowed_file_types"]


@pytest.mark.asyncio
async def test_portal_exposes_rejection_reason_public_after_rejection(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-reject-public")
    client.cookies.set("candidate_portal_token", "portal-reject-public")
    document = (
        await client.post(
            f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
            files=_pdf_upload(),
        )
    ).json()
    assert set(document) == {
        "id",
        "original_filename",
        "mime_type",
        "size_bytes",
        "status",
        "status_public_label",
        "uploaded_at",
    }
    assert document["status_public_label"] == "Documentos em análise"
    client.cookies.clear()
    reject = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={
            "rejection_reason_public": "Imagem ilegível, reenvie.",
            "review_notes": "Doc rejeitado por X — não compartilhar com candidato.",
        },
    )
    assert reject.status_code == status.HTTP_200_OK

    client.cookies.set("candidate_portal_token", "portal-reject-public")
    response = await client.get("/api/v1/candidate-portal/pre-admission")
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["summary"]["status_public_label"] == "Correções solicitadas"
    item_payload = payload["case"]["checklist_items"][0]
    assert item_payload["status"] == "rejected"
    assert item_payload["status_public_label"] == "Correções solicitadas"
    assert item_payload["rejection_reason_public"] == "Imagem ilegível, reenvie."
    # The candidate-facing uploaded_document must not carry reviewer identity
    uploaded = item_payload["uploaded_document"]
    assert uploaded is not None
    assert "reviewed_by" not in uploaded
    assert "review_notes" not in uploaded
    assert uploaded["status_public_label"] == "Correções solicitadas"
    # Internal note text must never appear anywhere in the portal payload.
    assert "não compartilhar com candidato" not in response.text


@pytest.mark.asyncio
async def test_portal_returns_empty_summary_when_no_case(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _job_id, candidate_id = await _seed_candidate_job(db_session)
    await _complete_candidate_portal_profile(db_session, candidate_id)
    await _create_portal_session(db_session, candidate_id, "portal-no-case")
    client.cookies.set("candidate_portal_token", "portal-no-case")

    response = await client.get("/api/v1/candidate-portal/pre-admission")

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["case"] is None
    assert payload["summary"]["has_pre_admission_case"] is False
    assert payload["summary"]["documents_total"] == 0


@pytest.mark.asyncio
async def test_portal_other_candidate_cannot_view_case_by_id(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    other = await _create_plain_candidate(db_session)
    await _create_portal_session(db_session, other.id, "portal-other-detail")
    client.cookies.set("candidate_portal_token", "portal-other-detail")

    response = await client.get(f"/api/v1/candidate-portal/pre-admission/{case['id']}")

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_portal_overview_carries_pre_admission_summary(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, _, candidate_id, case, item = await _seed_pre_admission_with_item(client, db_session)
    await _create_portal_session(db_session, candidate_id, "portal-overview-summary")
    client.cookies.set("candidate_portal_token", "portal-overview-summary")

    overview = await client.get("/api/v1/public/candidate-portal/overview")
    assert overview.status_code == status.HTTP_200_OK, overview.text
    payload = overview.json()

    assert payload["pre_admission"] is not None
    assert payload["pre_admission"]["has_pre_admission_case"] is True
    assert payload["pre_admission"]["pre_admission_status"] == case["status"]
    assert payload["pre_admission"]["status_public_label"] == "Aguardando documentos"
    assert payload["pre_admission"]["documents_total"] == 1
    assert payload["pre_admission"]["next_pending_document"] == item["title"]

    # Sanity: no Protheus/score leak on the overview either
    leaked = _walk_keys(payload) & _FORBIDDEN_PORTAL_KEYS
    assert not leaked, f"Overview leaked internal fields: {sorted(leaked)}"


@pytest.mark.asyncio
async def test_portal_overview_relabels_protheus_stage_for_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, job_id, candidate_id, _case, _item = await _seed_pre_admission_with_item(client, db_session)
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline is not None
    pipeline.pipeline_stage = "protheus"
    await db_session.commit()

    await _create_portal_session(db_session, candidate_id, "portal-overview-protheus")
    client.cookies.set("candidate_portal_token", "portal-overview-protheus")

    overview = await client.get("/api/v1/public/candidate-portal/overview")

    assert overview.status_code == status.HTTP_200_OK, overview.text
    payload = overview.json()
    assert payload["status_public"] == "Pré-admissão"
    assert payload["current_process_status_label"] == "Pré-admissão"
    assert payload["active_application"]["status_public"] == "Pré-admissão"
    assert "Protheus" not in overview.text


_DESTRUCTIVE_KEY_ENSURED: tuple[str, UUID] | None = None
