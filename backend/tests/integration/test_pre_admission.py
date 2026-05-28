from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_portal_auth_service import PORTAL_SESSION_PURPOSE
from src.application.services.pre_admission_service import MAX_PRE_ADMISSION_DOCUMENT_BYTES
from src.infrastructure.database.models.candidate_auth_token_model import CandidateAuthTokenModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistTemplateItemModel,
    PreAdmissionChecklistTemplateModel,
    PreAdmissionDocumentModel,
)
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel

from .test_hiring_decisions import (
    _admin_headers,
    _create_decision,
    _recruiter_headers,
    _seed_candidate_job,
    seed_candidate_ready_for_hire,
)


async def _create_hire_decision(
    client: AsyncClient,
    db_session: AsyncSession,
    headers: dict[str, str],
    job_id: UUID,
    candidate_id: UUID,
) -> dict:
    await seed_candidate_ready_for_hire(db_session, job_id=job_id, candidate_id=candidate_id)
    return await _create_decision(
        client,
        headers,
        job_id,
        candidate_id,
        outcome="hire",
        reason_code="strong_fit",
        notes="Decisão humana de contratação.",
    )


async def _move_pipeline_to_stage(
    db_session: AsyncSession,
    *,
    job_id: UUID,
    candidate_id: UUID,
    stage: str,
) -> None:
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline is not None
    pipeline.pipeline_stage = stage
    await db_session.commit()


async def _create_pre_admission(
    client: AsyncClient,
    db_session: AsyncSession,
    headers: dict[str, str],
    job_id: UUID,
    candidate_id: UUID,
) -> dict:
    await _ensure_default_checklist_template(db_session)
    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
        headers=headers,
        json={
            "salary_offer": "12000.00",
            "start_date": "2026-06-01",
            "work_model": "hibrido",
            "notes": "Oferta em preparação.",
        },
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()


async def _ensure_default_checklist_template(db_session: AsyncSession) -> PreAdmissionChecklistTemplateModel:
    existing = await db_session.scalar(
        sa.select(PreAdmissionChecklistTemplateModel).where(
            PreAdmissionChecklistTemplateModel.is_default.is_(True),
            PreAdmissionChecklistTemplateModel.is_active.is_(True),
        )
    )
    if existing is not None:
        return existing

    now = datetime.now(UTC)
    template = PreAdmissionChecklistTemplateModel(
        id=uuid4(),
        name="Checklist padrão de testes",
        description="Template padrão para testes de pré-admissão.",
        is_active=True,
        is_default=True,
        created_at=now,
        updated_at=now,
    )
    db_session.add(template)
    await db_session.flush()

    db_session.add(
        PreAdmissionChecklistTemplateItemModel(
            id=uuid4(),
            template_id=template.id,
            document_key="cpf",
            title="CPF",
            candidate_description="Envie o CPF.",
            is_required=True,
            accepted_file_types=["application/pdf", "image/jpeg", "image/png"],
            max_file_size_mb=10,
            display_order=0,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
    )
    await db_session.commit()
    return template


async def _create_checklist_item(
    client: AsyncClient,
    headers: dict[str, str],
    case_id: str,
    *,
    item_type: str = "cpf",
    title: str = "CPF",
) -> dict:
    response = await client.post(
        f"/api/v1/pre-admission/{case_id}/checklist-items",
        headers=headers,
        json={"item_type": item_type, "title": title, "required": True},
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()


async def _create_portal_session(
    db_session: AsyncSession, candidate_id: UUID, raw_token: str
) -> None:
    db_session.add(
        CandidateAuthTokenModel(
            candidate_id=candidate_id,
            purpose=PORTAL_SESSION_PURPOSE,
            token_hash=sha256(raw_token.encode("utf-8")).hexdigest(),
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
    )
    await db_session.commit()


async def _seed_pre_admission_with_item(
    client: AsyncClient,
    db_session: AsyncSession,
) -> tuple[dict[str, str], UUID, UUID, dict, dict]:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _complete_candidate_portal_profile(db_session, candidate_id)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="hired")
    case = await _create_pre_admission(client, db_session, headers, job_id, candidate_id)
    item = case["checklist_items"][0]
    return headers, job_id, candidate_id, case, item


def _pdf_upload(filename: str = "cpf.pdf") -> dict:
    return {
        "document_file": (
            filename,
            b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
            "application/pdf",
        )
    }


async def _complete_candidate_portal_profile(
    db_session: AsyncSession, candidate_id: UUID
) -> CandidateModel:
    candidate = await db_session.get(CandidateModel, candidate_id)
    assert candidate is not None
    candidate.phone = "11999999999"
    candidate.cpf = f"{uuid4().int % 10**11:011d}"
    candidate.salary_expectation = "12000.00"
    candidate.lgpd_consent_at = datetime.now(UTC)
    candidate.lgpd_consent_version = "test-v1"
    await db_session.commit()
    return candidate


async def _create_plain_candidate(db_session: AsyncSession) -> CandidateModel:
    candidate = CandidateModel(
        id=uuid4(),
        full_name=f"Candidato Portal {uuid4().hex[:6]}",
        email=f"pre-admission-portal-{uuid4().hex}@example.com",
        cpf=f"{uuid4().int % 10**11:011d}",
        phone="11999999999",
        salary_expectation="12000.00",
        location_city="São Paulo",
        location_state="SP",
        location_country="BR",
        lgpd_consent_at=datetime.now(UTC),
        lgpd_consent_version="test-v1",
        created_by=uuid4(),
        application_source="manual",
    )
    db_session.add(candidate)
    await db_session.commit()
    return candidate


@pytest.mark.asyncio
async def test_does_not_create_pre_admission_without_hire_decision(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_decision(client, headers, job_id, candidate_id, outcome="hold")

    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
        headers=headers,
        json={"notes": "Tentativa sem contratação."},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_creates_pre_admission_with_submitted_hire_decision(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    decision = await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="hired")

    payload = await _create_pre_admission(client, db_session, headers, job_id, candidate_id)

    assert payload["candidate_id"] == str(candidate_id)
    assert payload["job_id"] == str(job_id)
    assert payload["hiring_decision_id"] == decision["id"]
    assert payload["status"] == "draft"
    assert payload["salary_offer"] == "12000.00"


@pytest.mark.asyncio
async def test_does_not_create_pre_admission_in_incompatible_pipeline_stage(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="offer")

    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
        headers=headers,
        json={"notes": "Tentativa fora da etapa compatível."},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_get_pre_admission_marks_can_create_false_when_pipeline_stage_is_incompatible(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="offer")

    response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["case"] is None
    assert response.json()["hiring_decision_outcome"] == "hire"
    assert response.json()["can_create"] is False


@pytest.mark.asyncio
async def test_does_not_duplicate_case_for_same_decision(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="hired")

    first = await _create_pre_admission(client, db_session, headers, job_id, candidate_id)
    second = await _create_pre_admission(client, db_session, headers, job_id, candidate_id)

    count = int(
        await db_session.scalar(
            sa.select(sa.func.count(PreAdmissionCaseModel.id)).where(
                PreAdmissionCaseModel.candidate_id == candidate_id,
                PreAdmissionCaseModel.job_id == job_id,
            )
        )
        or 0
    )
    assert second["id"] == first["id"]
    assert count == 1


@pytest.mark.asyncio
async def test_get_lists_existing_case(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="hired")
    created = await _create_pre_admission(client, db_session, headers, job_id, candidate_id)

    response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["case"]["id"] == created["id"]
    assert response.json()["can_create"] is False


@pytest.mark.asyncio
async def test_recruiter_cannot_access_pre_admission_staff_endpoints(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin_headers = await _admin_headers(client, db_session)
    recruiter_headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, admin_headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="hired")
    created = await _create_pre_admission(client, db_session, admin_headers, job_id, candidate_id)

    read_response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
        headers=recruiter_headers,
    )
    workspace_response = await client.get(
        f"/api/v1/admission/cases/{created['id']}/workspace",
        headers=recruiter_headers,
    )
    update_response = await client.patch(
        f"/api/v1/pre-admission/{created['id']}",
        headers=recruiter_headers,
        json={"status": "offer_sent"},
    )

    assert read_response.status_code == status.HTTP_403_FORBIDDEN
    assert workspace_response.status_code == status.HTTP_403_FORBIDDEN
    assert update_response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_updates_status_and_registers_event(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="hired")
    case = await _create_pre_admission(client, db_session, headers, job_id, candidate_id)

    response = await client.patch(
        f"/api/v1/pre-admission/{case['id']}",
        headers=headers,
        json={"status": "offer_sent", "notes": "Oferta enviada manualmente."},
    )
    events = await client.get(f"/api/v1/pre-admission/{case['id']}/events", headers=headers)

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "offer_sent"
    assert events.status_code == status.HTTP_200_OK
    assert any(event["event_type"] == "status_changed" for event in events.json()["events"])


@pytest.mark.asyncio
async def test_case_status_machine_allows_valid_operational_transitions(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="hired")
    case = await _create_pre_admission(client, db_session, headers, job_id, candidate_id)

    for next_status in ("documents_pending", "documents_received", "ready_for_admission", "admitted"):
        response = await client.patch(
            f"/api/v1/pre-admission/{case['id']}",
            headers=headers,
            json={"status": next_status},
        )
        assert response.status_code == status.HTTP_200_OK, response.text
        assert response.json()["status"] == next_status


@pytest.mark.asyncio
async def test_case_status_machine_blocks_invalid_transition_with_predictable_error(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="hired")
    case = await _create_pre_admission(client, db_session, headers, job_id, candidate_id)

    response = await client.patch(
        f"/api/v1/pre-admission/{case['id']}",
        headers=headers,
        json={"status": "admitted"},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    payload = response.json()
    assert payload["error"]["code"] == "INVALID_PRE_ADMISSION_STATUS_TRANSITION"
    assert "Transição de status inválida" in payload["error"]["message"]
    assert "'draft' -> 'admitted'" in payload["error"]["message"]


@pytest.mark.asyncio
async def test_cancelled_case_cannot_be_changed_after_terminal_transition(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="hired")
    case = await _create_pre_admission(client, db_session, headers, job_id, candidate_id)

    cancelled = await client.patch(
        f"/api/v1/pre-admission/{case['id']}",
        headers=headers,
        json={"status": "cancelled"},
    )
    assert cancelled.status_code == status.HTTP_200_OK

    response = await client.patch(
        f"/api/v1/pre-admission/{case['id']}",
        headers=headers,
        json={"notes": "Tentar alterar caso cancelado."},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "encerrado" in response.json()["error"]["message"].lower()


@pytest.mark.asyncio
async def test_creates_checklist_item(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="hired")
    case = await _create_pre_admission(client, db_session, headers, job_id, candidate_id)

    response = await client.post(
        f"/api/v1/pre-admission/{case['id']}/checklist-items",
        headers=headers,
        json={"item_type": "cpf", "title": "CPF", "required": True},
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["item_type"] == "cpf"
    assert response.json()["status"] == "pending"


@pytest.mark.asyncio
async def test_updates_checklist_item_and_registers_event(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="hired")
    case = await _create_pre_admission(client, db_session, headers, job_id, candidate_id)
    item = (
        await client.post(
            f"/api/v1/pre-admission/{case['id']}/checklist-items",
            headers=headers,
            json={"item_type": "cpf", "title": "CPF", "required": True},
        )
    ).json()

    response = await client.patch(
        f"/api/v1/pre-admission/{case['id']}/checklist-items/{item['id']}",
        headers=headers,
        json={"status": "received", "notes": "Documento conferido visualmente."},
    )
    events = await client.get(f"/api/v1/pre-admission/{case['id']}/events", headers=headers)

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "received"
    assert any(event["event_type"] == "checklist_item_updated" for event in events.json()["events"])


@pytest.mark.asyncio
async def test_pre_admission_does_not_move_pipeline_automatically(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="hired")
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline is not None
    before_stage = pipeline.pipeline_stage

    await _create_pre_admission(client, db_session, headers, job_id, candidate_id)

    await db_session.refresh(pipeline)
    assert pipeline.pipeline_stage == before_stage


@pytest.mark.asyncio
async def test_pre_admission_does_not_change_ranking_or_hiring_decision(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    decision = await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="hired")
    score_count_before = int(
        await db_session.scalar(
            sa.select(sa.func.count(CandidateJobScoreModel.id)).where(
                CandidateJobScoreModel.candidate_id == candidate_id,
                CandidateJobScoreModel.job_id == job_id,
            )
        )
        or 0
    )

    await _create_pre_admission(client, db_session, headers, job_id, candidate_id)

    score_count_after = int(
        await db_session.scalar(
            sa.select(sa.func.count(CandidateJobScoreModel.id)).where(
                CandidateJobScoreModel.candidate_id == candidate_id,
                CandidateJobScoreModel.job_id == job_id,
            )
        )
        or 0
    )
    persisted_decision = await db_session.scalar(
        sa.select(CandidateJobHiringDecisionModel).where(
            CandidateJobHiringDecisionModel.id == UUID(decision["id"])
        )
    )
    assert score_count_after == score_count_before
    assert persisted_decision is not None
    assert persisted_decision.decision_status == "submitted"
    assert persisted_decision.decision_outcome == "hire"


@pytest.mark.asyncio
async def test_events_are_returned_ordered(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_stage(db_session, job_id=job_id, candidate_id=candidate_id, stage="hired")
    case = await _create_pre_admission(client, db_session, headers, job_id, candidate_id)
    await client.patch(
        f"/api/v1/pre-admission/{case['id']}",
        headers=headers,
        json={"status": "offer_preparing"},
    )
    await client.post(
        f"/api/v1/pre-admission/{case['id']}/checklist-items",
        headers=headers,
        json={"item_type": "rg", "title": "RG"},
    )

    response = await client.get(f"/api/v1/pre-admission/{case['id']}/events", headers=headers)
    payload = response.json()["events"]
    created_values = [event["created_at"] for event in payload]

    assert response.status_code == status.HTTP_200_OK
    assert created_values == sorted(created_values)
    assert payload[0]["event_type"] == "case_created"


@pytest.mark.asyncio
async def test_candidate_sees_only_own_pre_admission(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _headers, _job_id, candidate_id, case, _item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-own")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-own")

    response = await client.get("/api/v1/candidate-portal/pre-admission")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["case"]["id"] == case["id"]


@pytest.mark.asyncio
async def test_candidate_cannot_access_other_candidate_pre_admission(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _headers, _job_id, _candidate_id, case, _item = await _seed_pre_admission_with_item(
        client, db_session
    )
    other_candidate = await _create_plain_candidate(db_session)
    await _create_portal_session(db_session, other_candidate.id, "portal-pre-admission-other")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-other")

    response = await client.get(f"/api/v1/candidate-portal/pre-admission/{case['id']}")

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_candidate_valid_upload_creates_document(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-upload")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-upload")

    response = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
        files=_pdf_upload(),
    )

    assert response.status_code == status.HTTP_201_CREATED, response.text
    payload = response.json()
    assert payload["status"] == "uploaded"
    assert payload["original_filename"] == "cpf.pdf"
    assert "storage_key" not in payload


@pytest.mark.asyncio
async def test_candidate_upload_invalid_type_fails(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-invalid")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-invalid")

    response = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
        files={"document_file": ("cpf.txt", b"texto", "text/plain")},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_candidate_upload_oversized_file_fails(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-big")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-big")

    response = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
        files={
            "document_file": (
                "cpf.pdf",
                b"x" * (MAX_PRE_ADMISSION_DOCUMENT_BYTES + 1),
                "application/pdf",
            )
        },
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_candidate_upload_changes_checklist_to_received(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-received")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-received")

    await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
        files=_pdf_upload(),
    )
    await db_session.commit()

    refreshed = await client.get("/api/v1/candidate-portal/pre-admission")
    assert refreshed.json()["case"]["checklist_items"][0]["status"] == "received"


@pytest.mark.asyncio
async def test_admin_approve_changes_document_and_checklist_to_approved(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-approve")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-approve")
    document = (
        await client.post(
            f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
            files=_pdf_upload(),
        )
    ).json()
    client.cookies.clear()

    response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/approve", headers=headers
    )
    item_response = await client.get(
        f"/api/v1/jobs/{case['job_id']}/candidates/{case['candidate_id']}/pre-admission",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "approved"
    assert item_response.json()["case"]["checklist_items"][0]["status"] == "approved"


@pytest.mark.asyncio
async def test_admin_reject_requires_reason_and_changes_document_and_checklist(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-reject")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-reject")
    document = (
        await client.post(
            f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
            files=_pdf_upload(),
        )
    ).json()
    client.cookies.clear()

    invalid = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={"review_notes": ""},
    )
    response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={"review_notes": "Documento ilegível."},
    )

    assert invalid.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "rejected"
    assert response.json()["review_notes"] == "Documento ilegível."


@pytest.mark.asyncio
async def test_approved_document_cannot_be_rejected_without_explicit_reopen(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-approve-lock")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-approve-lock")
    document = (
        await client.post(
            f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
            files=_pdf_upload(),
        )
    ).json()
    client.cookies.clear()

    approved = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/approve",
        headers=headers,
    )
    assert approved.status_code == status.HTTP_200_OK

    rejected = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={"review_notes": "Não deveria aceitar reprovação após aprovação."},
    )

    assert rejected.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    payload = rejected.json()
    assert payload["error"]["code"] == "INVALID_PRE_ADMISSION_STATUS_TRANSITION"
    assert "'approved' -> 'rejected'" in payload["error"]["message"]


@pytest.mark.asyncio
async def test_rejected_document_can_be_replaced_by_candidate(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-replace")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-replace")
    first = (
        await client.post(
            f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
            files=_pdf_upload("cpf-antigo.pdf"),
        )
    ).json()
    await client.post(
        f"/api/v1/pre-admission/documents/{first['id']}/reject",
        headers=headers,
        json={"review_notes": "Arquivo errado."},
    )

    second = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
        files=_pdf_upload("cpf-novo.pdf"),
    )
    old_document = await db_session.get(PreAdmissionDocumentModel, UUID(first["id"]))

    assert second.status_code == status.HTTP_201_CREATED
    assert second.json()["original_filename"] == "cpf-novo.pdf"
    assert old_document is not None
    assert old_document.status == "replaced"


@pytest.mark.asyncio
async def test_pre_admission_document_actions_generate_events(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-events")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-events")
    document = (
        await client.post(
            f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
            files=_pdf_upload(),
        )
    ).json()
    client.cookies.clear()
    await client.post(f"/api/v1/pre-admission/documents/{document['id']}/approve", headers=headers)

    events = await client.get(f"/api/v1/pre-admission/{case['id']}/events", headers=headers)
    event_types = {event["event_type"] for event in events.json()["events"]}

    assert "document_uploaded" in event_types
    assert "document_approved" in event_types


@pytest.mark.asyncio
async def test_pre_admission_document_download_respects_authorization(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-download")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-download")
    document = (
        await client.post(
            f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
            files=_pdf_upload(),
        )
    ).json()

    own_download = await client.get(
        f"/api/v1/candidate-portal/pre-admission/documents/{document['id']}/download"
    )
    client.cookies.clear()
    admin_download = await client.get(
        f"/api/v1/pre-admission/documents/{document['id']}/download",
        headers=headers,
    )
    other_candidate = await _create_plain_candidate(db_session)
    await _create_portal_session(
        db_session, other_candidate.id, "portal-pre-admission-forbidden-download"
    )
    client.cookies.set("candidate_portal_token", "portal-pre-admission-forbidden-download")
    forbidden = await client.get(
        f"/api/v1/candidate-portal/pre-admission/documents/{document['id']}/download"
    )

    assert own_download.status_code == status.HTTP_200_OK
    assert admin_download.status_code == status.HTTP_200_OK
    assert forbidden.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_cancelled_or_admitted_case_does_not_accept_candidate_upload(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client, db_session
    )
    await client.patch(
        f"/api/v1/pre-admission/{case['id']}", headers=headers, json={"status": "cancelled"}
    )
    await _create_portal_session(db_session, candidate_id, "portal-pre-admission-cancelled")
    client.cookies.set("candidate_portal_token", "portal-pre-admission-cancelled")

    response = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
        files=_pdf_upload(),
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
