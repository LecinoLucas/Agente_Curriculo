from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionEventModel,
)

from .test_pre_admission import (
    _create_portal_session,
    _pdf_upload,
    _seed_pre_admission_with_item,
)


async def _upload_candidate_document(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    case: dict,
    item: dict,
    token: str = "workspace-upload",
) -> dict:
    await _create_portal_session(db_session, candidate_id, token)
    client.cookies.set("candidate_portal_token", token)
    response = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
        files=_pdf_upload("rg_workspace.pdf"),
    )
    client.cookies.clear()
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()


@pytest.mark.asyncio
async def test_workspace_returns_case_candidate_active_job_checklist_documents_blockers_and_events(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    document = await _upload_candidate_document(
        client,
        db_session,
        candidate_id=candidate_id,
        case=case,
        item=item,
    )

    response = await client.get(f"/api/v1/admission/cases/{case['id']}/workspace", headers=headers)

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["case"]["id"] == case["id"]
    assert payload["candidate"]["id"] == str(candidate_id)
    assert payload["candidate"]["initials"]
    assert payload["job"]["id"] == str(job_id)
    assert payload["checklist"]["total"] == 1
    assert payload["checklist"]["items"][0]["id"] == item["id"]
    assert payload["checklist"]["items"][0]["document_id"] == document["id"]
    assert payload["documents"][0]["id"] == document["id"]
    assert payload["documents"][0]["checklist_item_id"] == item["id"]
    assert payload["documents"][0]["checklist_title"] == item["title"]
    assert payload["documents"][0]["filename"] == "rg_workspace.pdf"
    assert payload["documents"][0]["mime_type"] == "application/pdf"
    assert payload["documents"][0]["size_bytes"] > 0
    assert payload["documents"][0]["is_current_for_item"] is True
    assert payload["main_blockers"][0]["type"] == "pending_checklist_item"
    assert payload["summary"]["ready_for_export"] is False
    assert any(event["type"] == "document_uploaded" for event in payload["recent_events"])


@pytest.mark.asyncio
async def test_overview_is_lightweight_and_calculates_progress(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    document = await _upload_candidate_document(
        client,
        db_session,
        candidate_id=candidate_id,
        case=case,
        item=item,
        token="workspace-overview",
    )

    extra_item_response = await client.post(
        f"/api/v1/pre-admission/{case['id']}/checklist-items",
        headers=headers,
        json={"item_type": "rg", "title": "RG", "required": True},
    )
    assert extra_item_response.status_code == status.HTTP_201_CREATED, extra_item_response.text
    extra_item = extra_item_response.json()
    reject_response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={"rejection_reason_public": "Reenvie o documento legível."},
    )
    assert reject_response.status_code == status.HTTP_200_OK, reject_response.text
    waive_response = await client.post(
        f"/api/v1/admission/checklist-items/{extra_item['id']}/mark-not-required",
        headers=headers,
    )
    assert waive_response.status_code == status.HTTP_200_OK, waive_response.text

    response = await client.get(
        f"/api/v1/pre-admission/cases/{case['id']}/overview",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["case"]["id"] == case["id"]
    assert payload["candidate"]["id"] == str(candidate_id)
    assert payload["job"]["id"] == str(job_id)
    assert payload["status_label"]
    assert payload["progress"] == {
        "total": 2,
        "approved": 0,
        "pending": 0,
        "rejected": 1,
        "in_review": 0,
        "waived": 1,
    }
    assert payload["main_blocker"]["type"] == "rejected_item"
    assert "documents" not in payload
    assert "recent_events" not in payload


@pytest.mark.asyncio
async def test_documents_endpoint_returns_checklist_and_staff_review_metadata(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    document = await _upload_candidate_document(
        client,
        db_session,
        candidate_id=candidate_id,
        case=case,
        item=item,
        token="workspace-documents",
    )
    reject_response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={
            "rejection_reason_public": "Envie um PDF legível.",
            "review_notes": "Validar frente e verso no próximo envio.",
        },
    )
    assert reject_response.status_code == status.HTTP_200_OK, reject_response.text

    response = await client.get(
        f"/api/v1/pre-admission/cases/{case['id']}/documents",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["checklist"]["items"][0]["id"] == item["id"]
    assert payload["checklist"]["items"][0]["document_id"] == document["id"]
    assert payload["documents"][0]["id"] == document["id"]
    assert payload["documents"][0]["reviewed_by_name"] is not None
    assert payload["documents"][0]["reviewed_at"] is not None
    assert payload["documents"][0]["review_notes"] == "Validar frente e verso no próximo envio."
    assert payload["documents"][0]["rejection_reason_public"] == "Envie um PDF legível."


@pytest.mark.asyncio
async def test_events_endpoint_returns_paginated_items_most_recent_first(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, _candidate_id, case, _item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    case_id = UUID(case["id"])
    base_time = datetime.now(UTC)
    for index in range(5):
        db_session.add(
            PreAdmissionEventModel(
                case_id=case_id,
                event_type=f"manual_event_{index}",
                actor_id=None,
                payload_json={"index": index},
                created_at=(base_time + timedelta(minutes=index)).replace(microsecond=0),
            )
        )
    await db_session.commit()

    response = await client.get(
        f"/api/v1/pre-admission/cases/{case['id']}/events?page=1&page_size=3",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["page"] == 1
    assert payload["page_size"] == 3
    assert payload["total"] >= 5
    assert len(payload["items"]) == 3
    assert payload["has_next"] is True
    created_at = [item["created_at"] for item in payload["items"]]
    assert created_at == sorted(created_at, reverse=True)


@pytest.mark.asyncio
async def test_staff_slice_endpoints_require_staff_auth_and_block_candidate_portal_session(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, _item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )

    unauthenticated = await client.get(f"/api/v1/pre-admission/cases/{case['id']}/overview")
    assert unauthenticated.status_code == status.HTTP_401_UNAUTHORIZED

    await _create_portal_session(db_session, candidate_id, "staff-slice-portal")
    client.cookies.set("candidate_portal_token", "staff-slice-portal")
    portal_response = await client.get(f"/api/v1/pre-admission/cases/{case['id']}/documents")
    client.cookies.clear()

    assert portal_response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_workspace_incomplete_checklist_is_not_ready_for_export(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, _candidate_id, case, _item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )

    response = await client.get(f"/api/v1/admission/cases/{case['id']}/workspace", headers=headers)

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["summary"]["readiness_status"] == "not_ready"
    assert payload["summary"]["ready_for_export"] is False
    assert any(blocker["type"] == "missing_document" for blocker in payload["main_blockers"])


@pytest.mark.asyncio
async def test_workspace_all_required_items_approved_is_ready_for_export(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    await _upload_candidate_document(
        client,
        db_session,
        candidate_id=candidate_id,
        case=case,
        item=item,
        token="workspace-ready",
    )

    response = await client.post(
        f"/api/v1/admission/checklist-items/{item['id']}/approve",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["checklist"]["approved"] == 1
    assert payload["summary"]["readiness_status"] == "ready"
    assert payload["summary"]["ready_for_export"] is True
    assert payload["main_blockers"] == []


@pytest.mark.asyncio
async def test_mark_ready_for_export_blocks_with_422_when_there_are_blockers(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, _candidate_id, case, _item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )

    response = await client.post(
        f"/api/v1/admission/cases/{case['id']}/mark-ready-for-export",
        headers=headers,
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    detail = response.json()["detail"]
    assert detail["blockers"]
    assert detail["blockers"][0]["type"] == "missing_document"


@pytest.mark.asyncio
async def test_mark_ready_for_export_marks_case_and_creates_event_when_ready(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    await _upload_candidate_document(
        client,
        db_session,
        candidate_id=candidate_id,
        case=case,
        item=item,
        token="workspace-mark-ready",
    )
    await client.post(f"/api/v1/admission/checklist-items/{item['id']}/approve", headers=headers)

    response = await client.post(
        f"/api/v1/admission/cases/{case['id']}/mark-ready-for-export",
        headers=headers,
    )
    db_case = await db_session.get(PreAdmissionCaseModel, UUID(case["id"]))
    event_count = int(
        await db_session.scalar(
            sa.select(sa.func.count(PreAdmissionEventModel.id)).where(
                PreAdmissionEventModel.case_id == UUID(case["id"]),
                PreAdmissionEventModel.event_type == "case_ready_for_export",
            )
        )
        or 0
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    assert response.json()["summary"]["ready_for_export"] is True
    assert db_case is not None
    assert db_case.ready_for_export is True
    assert db_case.status == "ready_for_admission"
    assert event_count == 1


@pytest.mark.asyncio
async def test_approve_action_creates_event_and_recalculates_readiness(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    await _upload_candidate_document(
        client,
        db_session,
        candidate_id=candidate_id,
        case=case,
        item=item,
        token="workspace-approve-event",
    )

    response = await client.post(
        f"/api/v1/admission/checklist-items/{item['id']}/approve",
        headers=headers,
    )
    event = await db_session.scalar(
        sa.select(PreAdmissionEventModel).where(
            PreAdmissionEventModel.case_id == UUID(case["id"]),
            PreAdmissionEventModel.event_type == "checklist_item_approved",
        )
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    assert response.json()["summary"]["ready_for_export"] is True
    assert event is not None
    assert event.payload_json["checklist_item_id"] == item["id"]


@pytest.mark.asyncio
async def test_workspace_document_review_fields_keep_public_and_internal_texts_separate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    document = await _upload_candidate_document(
        client,
        db_session,
        candidate_id=candidate_id,
        case=case,
        item=item,
        token="workspace-review-fields",
    )

    reject_response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={
            "rejection_reason_public": "Envie uma imagem legível do documento.",
            "review_notes": "Conferir assinatura em eventual reenvio.",
        },
    )
    assert reject_response.status_code == status.HTTP_200_OK, reject_response.text

    response = await client.get(f"/api/v1/admission/cases/{case['id']}/workspace", headers=headers)

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    workspace_document = payload["documents"][0]
    assert workspace_document["status"] == "rejected"
    assert workspace_document["rejection_reason_public"] == "Envie uma imagem legível do documento."
    assert workspace_document["review_notes"] == "Conferir assinatura em eventual reenvio."
    assert workspace_document["reviewed_at"] is not None
    assert workspace_document["reviewed_by_name"] is not None
    assert all("review_notes" not in event["description"] for event in payload["recent_events"])


def test_workspace_service_does_not_use_legacy_analysis_or_link_fallbacks() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    source = (
        backend_dir / "src/application/services/admission_case_workspace_service.py"
    ).read_text()

    assert "latest_analysis" not in source
    assert "candidate_job_links" not in source
    assert "current_analysis_id" not in source


@pytest.mark.asyncio
async def test_workspace_blocks_case_when_pipeline_is_inactive(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, job_id, candidate_id, case, _item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline is not None
    pipeline.pipeline_status = "terminal"
    pipeline.relationship_status = "withdrawn"
    pipeline.is_terminal = True
    pipeline.terminated_at = datetime.now(UTC)
    pipeline.termination_reason = "Teste de pipeline inativo"
    await db_session.commit()

    response = await client.get(f"/api/v1/admission/cases/{case['id']}/workspace", headers=headers)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
