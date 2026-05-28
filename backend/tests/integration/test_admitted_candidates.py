from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.hiring_decision_model import (
    CandidateJobHiringDecisionModel,
)
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionEventModel,
)
from tests.integration.helpers import _auth_headers, _create_active_user

ENDPOINT = "/api/v1/admissions/admitted"
DISMISS_ENDPOINT = "/api/v1/admissions/{case_id}/dismiss"
PASSWORD = "Senha123!"


def _naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


async def _headers_for_role(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> dict[str, str]:
    email = f"admitted-{role.value}-{uuid4().hex}@example.com"
    await _create_active_user(db_session, email, PASSWORD, role)
    return await _auth_headers(client, email, PASSWORD)


async def _seed_case(
    db_session: AsyncSession,
    *,
    created_by: UUID,
    candidate_name: str,
    candidate_email: str,
    job_title: str,
    case_status: str = "admitted",
    closed_at: datetime | None = None,
    dismissed_at: datetime | None = None,
    with_pipeline: bool = True,
) -> tuple[CandidateModel, JobModel, PreAdmissionCaseModel, UUID | None]:
    now = datetime.now(UTC)
    candidate = CandidateModel(
        id=uuid4(),
        full_name=candidate_name,
        email=candidate_email,
        cpf="12345678901",
        cpf_hash="sensitive-hash",
        cpf_last4="8901",
        phone="11999999999",
        created_by=created_by,
        application_source="manual",
        lgpd_consent_at=now,
    )
    job = JobModel(
        id=uuid4(),
        title=job_title,
        description="Vaga de teste",
        status="published",
        created_by=created_by,
    )
    db_session.add_all([candidate, job])
    await db_session.flush()

    pipeline_id = uuid4() if with_pipeline else None
    if with_pipeline:
        db_session.add(
            CandidateJobPipelineModel(
                candidate_job_pipeline_id=pipeline_id,
                candidate_id=candidate.id,
                job_id=job.id,
                link_status="hired",
                pipeline_stage="admitted" if case_status in {"admitted", "dismissed"} else "rejected",
                pipeline_status="terminal",
                relationship_status="hired" if case_status in {"admitted", "dismissed"} else "rejected",
                is_terminal=True,
                terminated_at=closed_at or now,
                termination_reason="process_completed" if case_status in {"admitted", "dismissed"} else "rejected",
                entered_at=now - timedelta(days=4),
                updated_at=dismissed_at or closed_at or now,
            )
        )

    decision = CandidateJobHiringDecisionModel(
        id=uuid4(),
        candidate_id=candidate.id,
        job_id=job.id,
        pipeline_id=pipeline_id,
        decided_by=created_by,
        decision_status="submitted",
        decision_outcome="hire",
        reason_code="strong_fit",
        submitted_at=now - timedelta(days=2),
        created_at=now - timedelta(days=2),
        updated_at=now - timedelta(days=2),
    )
    db_session.add(decision)
    await db_session.flush()

    case = PreAdmissionCaseModel(
        id=uuid4(),
        candidate_id=candidate.id,
        job_id=job.id,
        hiring_decision_id=decision.id,
        status=case_status,
        salary_offer=12000,
        start_date=date(2026, 6, 15),
        work_model="hibrido",
        notes="Observação interna sensível",
        created_by=created_by,
        created_at=now - timedelta(days=1),
        updated_at=dismissed_at or closed_at or now,
        closed_at=closed_at if case_status in {"admitted", "dismissed"} else None,
        dismissed_at=dismissed_at if case_status == "dismissed" else None,
        dismissal_reason="Desligamento solicitado pelo RH" if case_status == "dismissed" else None,
    )
    db_session.add(case)
    await db_session.commit()
    return candidate, job, case, pipeline_id


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.HR])
async def test_hr_admin_list_admitted_candidates(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> None:
    headers = await _headers_for_role(client, db_session, role)
    actor = await _create_active_user(
        db_session,
        f"admitted-seed-{role.value}-{uuid4().hex}@example.com",
        PASSWORD,
        UserRole.ADMIN,
    )
    closed_at = datetime.now(UTC) - timedelta(hours=2)
    candidate, job, case, pipeline_id = await _seed_case(
        db_session,
        created_by=actor.id,
        candidate_name="Ana Admitida",
        candidate_email=f"ana-admitida-{uuid4().hex}@example.com",
        job_title="Pessoa Desenvolvedora",
        closed_at=closed_at,
    )

    response = await client.get(ENDPOINT, headers=headers)

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["total"] == 1
    assert payload["summary"]["total_admitted"] == 1
    item = payload["data"][0]
    assert item == {
        "candidate_id": str(candidate.id),
        "candidate_name": "Ana Admitida",
        "candidate_email": candidate.email,
        "job_id": str(job.id),
        "job_title": "Pessoa Desenvolvedora",
        "pipeline_id": str(pipeline_id),
        "admission_case_id": str(case.id),
        "admission_status": "admitted",
        "admitted_at": closed_at.replace(tzinfo=None).isoformat(),
        "dismissed_at": None,
        "start_date": "2026-06-15",
        "work_model": "hibrido",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.RECRUITER, UserRole.VIEWER])
async def test_recruiter_and_viewer_cannot_list_admitted_candidates(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> None:
    headers = await _headers_for_role(client, db_session, role)

    response = await client.get(ENDPOINT, headers=headers)

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_rejected_and_talent_pool_candidates_do_not_appear(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _headers_for_role(client, db_session, UserRole.HR)
    actor = await _create_active_user(
        db_session,
        f"admitted-filter-seed-{uuid4().hex}@example.com",
        PASSWORD,
        UserRole.ADMIN,
    )
    admitted, _, _, _ = await _seed_case(
        db_session,
        created_by=actor.id,
        candidate_name="Candidato Admitido",
        candidate_email=f"admitted-only-{uuid4().hex}@example.com",
        job_title="Vaga Admitida",
        closed_at=datetime.now(UTC),
    )
    await _seed_case(
        db_session,
        created_by=actor.id,
        candidate_name="Candidato Rejeitado",
        candidate_email=f"rejected-{uuid4().hex}@example.com",
        job_title="Vaga Rejeitada",
        case_status="offer_declined",
    )
    talent_pool = CandidateModel(
        id=uuid4(),
        full_name="Pessoa Banco",
        email=f"talent-pool-{uuid4().hex}@example.com",
        created_by=actor.id,
        application_source="manual",
    )
    db_session.add(talent_pool)
    await db_session.commit()

    response = await client.get(ENDPOINT, headers=headers)

    assert response.status_code == status.HTTP_200_OK
    ids = {item["candidate_id"] for item in response.json()["data"]}
    assert ids == {str(admitted.id)}


@pytest.mark.asyncio
async def test_admitted_candidates_response_does_not_expose_sensitive_data(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _headers_for_role(client, db_session, UserRole.ADMIN)
    actor = await _create_active_user(
        db_session,
        f"admitted-sensitive-seed-{uuid4().hex}@example.com",
        PASSWORD,
        UserRole.ADMIN,
    )
    await _seed_case(
        db_session,
        created_by=actor.id,
        candidate_name="Sem Dados Sensíveis",
        candidate_email=f"safe-{uuid4().hex}@example.com",
        job_title="Vaga Segura",
        closed_at=datetime.now(UTC),
    )

    response = await client.get(ENDPOINT, headers=headers)

    assert response.status_code == status.HTTP_200_OK
    item = response.json()["data"][0]
    forbidden_keys = {
        "cpf",
        "cpf_hash",
        "cpf_last4",
        "salary_offer",
        "notes",
        "documents",
        "checklist_items",
        "protheus_payload",
        "score",
        "ranking",
    }
    assert forbidden_keys.isdisjoint(item.keys())


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.HR])
async def test_hr_admin_can_dismiss_admitted_case(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> None:
    headers = await _headers_for_role(client, db_session, role)
    actor = await _create_active_user(
        db_session,
        f"admitted-dismiss-seed-{role.value}-{uuid4().hex}@example.com",
        PASSWORD,
        UserRole.ADMIN,
    )
    closed_at = datetime.now(UTC) - timedelta(days=3)
    candidate, job, case, pipeline_id = await _seed_case(
        db_session,
        created_by=actor.id,
        candidate_name="Pessoa Admitida",
        candidate_email=f"dismiss-{uuid4().hex}@example.com",
        job_title="Analista RH",
        closed_at=closed_at,
    )

    response = await client.post(
        DISMISS_ENDPOINT.format(case_id=case.id),
        headers=headers,
        json={"reason": "Desligamento solicitado pelo RH"},
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["admission_status"] == "dismissed"
    assert payload["dismissal_reason"] == "Desligamento solicitado pelo RH"
    assert payload["dismissed_at"] is not None

    refreshed_case = await db_session.get(PreAdmissionCaseModel, case.id)
    assert refreshed_case is not None
    assert refreshed_case.status == "dismissed"
    assert refreshed_case.closed_at == closed_at
    assert refreshed_case.dismissed_at is not None
    assert refreshed_case.dismissal_reason == "Desligamento solicitado pelo RH"

    refreshed_pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_job_pipeline_id == pipeline_id
        )
    )
    assert refreshed_pipeline is not None
    assert refreshed_pipeline.pipeline_stage == "admitted"
    assert refreshed_pipeline.relationship_status == "hired"
    assert refreshed_pipeline.is_terminal is True
    assert _naive_utc(refreshed_pipeline.terminated_at) == _naive_utc(closed_at)

    list_response = await client.get(ENDPOINT, headers=headers)
    assert list_response.status_code == status.HTTP_200_OK
    listed_item = list_response.json()["data"][0]
    assert listed_item["candidate_id"] == str(candidate.id)
    assert listed_item["admission_status"] == "dismissed"
    assert listed_item["dismissed_at"] is not None

    dismissed_only = await client.get(ENDPOINT, headers=headers, params={"status": "dismissed"})
    assert dismissed_only.status_code == status.HTTP_200_OK
    assert dismissed_only.json()["total"] == 1
    assert dismissed_only.json()["summary"]["total_admitted"] == 0

    event = await db_session.scalar(
        sa.select(PreAdmissionEventModel)
        .where(
            PreAdmissionEventModel.case_id == case.id,
            PreAdmissionEventModel.event_type == "case_dismissed",
        )
        .order_by(PreAdmissionEventModel.created_at.desc())
        .limit(1)
    )
    assert event is not None

    audit_log = await db_session.scalar(
        sa.select(AuditLogModel)
        .where(
            AuditLogModel.action == "admission.dismissed",
            AuditLogModel.resource_id == case.id,
        )
        .order_by(AuditLogModel.timestamp.desc())
        .limit(1)
    )
    assert audit_log is not None
    assert audit_log.user_id is not None
    assert audit_log.metadata_["candidate_id"] == str(candidate.id)
    assert audit_log.metadata_["job_id"] == str(job.id)
    assert audit_log.metadata_["pipeline_id"] == str(pipeline_id)
    assert audit_log.metadata_["previous_status"] == "admitted"
    assert audit_log.metadata_["new_status"] == "dismissed"


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.RECRUITER, UserRole.VIEWER])
async def test_recruiter_and_viewer_cannot_dismiss_admitted_case(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> None:
    headers = await _headers_for_role(client, db_session, role)
    actor = await _create_active_user(
        db_session,
        f"admitted-dismiss-forbidden-{uuid4().hex}@example.com",
        PASSWORD,
        UserRole.ADMIN,
    )
    _, _, case, _ = await _seed_case(
        db_session,
        created_by=actor.id,
        candidate_name="Pessoa Restrita",
        candidate_email=f"restrict-{uuid4().hex}@example.com",
        job_title="Analista RH",
        closed_at=datetime.now(UTC),
    )

    response = await client.post(
        DISMISS_ENDPOINT.format(case_id=case.id),
        headers=headers,
        json={"reason": "Motivo"},
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_cannot_dismiss_non_admitted_case_or_twice(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _headers_for_role(client, db_session, UserRole.HR)
    actor = await _create_active_user(
        db_session,
        f"admitted-dismiss-invalid-{uuid4().hex}@example.com",
        PASSWORD,
        UserRole.ADMIN,
    )
    _, _, non_admitted_case, _ = await _seed_case(
        db_session,
        created_by=actor.id,
        candidate_name="Pessoa Rejeitada",
        candidate_email=f"invalid-{uuid4().hex}@example.com",
        job_title="Analista RH",
        case_status="offer_declined",
    )
    _, _, dismissed_case, _ = await _seed_case(
        db_session,
        created_by=actor.id,
        candidate_name="Pessoa Desligada",
        candidate_email=f"dismissed-{uuid4().hex}@example.com",
        job_title="Analista RH",
        case_status="dismissed",
        closed_at=datetime.now(UTC) - timedelta(days=4),
        dismissed_at=datetime.now(UTC) - timedelta(days=1),
    )
    dismissed_case_id = dismissed_case.id

    invalid_response = await client.post(
        DISMISS_ENDPOINT.format(case_id=non_admitted_case.id),
        headers=headers,
        json={"reason": "Motivo"},
    )
    assert invalid_response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    repeated_response = await client.post(
        DISMISS_ENDPOINT.format(case_id=dismissed_case_id),
        headers=headers,
        json={"reason": "Motivo"},
    )
    assert repeated_response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_dismiss_requires_reason(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _headers_for_role(client, db_session, UserRole.HR)
    actor = await _create_active_user(
        db_session,
        f"admitted-dismiss-reason-{uuid4().hex}@example.com",
        PASSWORD,
        UserRole.ADMIN,
    )
    _, _, case, _ = await _seed_case(
        db_session,
        created_by=actor.id,
        candidate_name="Pessoa Sem Motivo",
        candidate_email=f"reason-{uuid4().hex}@example.com",
        job_title="Analista RH",
        closed_at=datetime.now(UTC),
    )

    response = await client.post(
        DISMISS_ENDPOINT.format(case_id=case.id),
        headers=headers,
        json={"reason": "   "},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
