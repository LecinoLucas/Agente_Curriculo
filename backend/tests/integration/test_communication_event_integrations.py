from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.communication_service import CommunicationService
from src.infrastructure.database.models import CandidateCommunicationModel, CommunicationTemplateModel

from .test_interview_operational_flow import (
    _create_interview,
    _seed_candidate_job,
)
from .test_hiring_decisions import _admin_headers
from .test_pre_admission import (
    _create_portal_session,
    _pdf_upload,
    _seed_pre_admission_with_item,
)


TEMPLATES = [
    (
        "interview_scheduled",
        "candidate",
        "Entrevista agendada",
        "Olá {candidate_name}, sua entrevista para a vaga {job_title} foi agendada para {scheduled_start}.",
    ),
    (
        "interview_rescheduled",
        "candidate",
        "Entrevista remarcada",
        "Olá {candidate_name}, sua entrevista para a vaga {job_title} foi remarcada para {scheduled_start}.",
    ),
    (
        "interview_cancelled",
        "candidate",
        "Entrevista cancelada",
        "Olá {candidate_name}, sua entrevista para a vaga {job_title} foi cancelada.",
    ),
    (
        "interview_no_show",
        "recruiter",
        "Candidato não compareceu",
        "O candidato {candidate_name} não compareceu à entrevista para a vaga {job_title}.",
    ),
    (
        "interview_awaiting_feedback",
        "recruiter",
        "Aguardando feedback da entrevista",
        "Entrevista com {candidate_name} para a vaga {job_title} realizada. Aguardando feedback.",
    ),
    (
        "hiring_decision_submitted",
        "hr",
        "Decisão de contratação registrada",
        "Uma decisão de contratação foi registrada para {candidate_name} na vaga {job_title}.",
    ),
    (
        "pre_admission_created",
        "candidate",
        "Processo de pré-admissão iniciado",
        "Olá {candidate_name}, o seu processo de pré-admissão foi iniciado. Verifique os documentos necessários.",
    ),
    (
        "document_rejected",
        "candidate",
        "Documento com pendência",
        "Olá {candidate_name}, o documento {document_type} foi devolvido com observação. Verifique os detalhes.",
    ),
    (
        "admission_package_approved",
        "hr",
        "Pacote admissional aprovado",
        "O pacote admissional para {candidate_name} na vaga {job_title} foi aprovado.",
    ),
]


@pytest.fixture
async def communication_event_templates(db_session: AsyncSession) -> None:
    for key, audience, subject, body in TEMPLATES:
        db_session.add(
            CommunicationTemplateModel(
                key=key,
                channel="internal",
                audience=audience,
                subject_template=subject,
                body_template=body,
                status="active",
            )
        )
    await db_session.commit()


async def _communications(
    db_session: AsyncSession,
    candidate_id: UUID,
    *,
    template_key: str | None = None,
) -> list[CandidateCommunicationModel]:
    stmt = sa.select(CandidateCommunicationModel).where(
        CandidateCommunicationModel.candidate_id == candidate_id
    )
    if template_key:
        stmt = stmt.where(CandidateCommunicationModel.template_key == template_key)
    result = await db_session.execute(stmt)
    return list(result.scalars().all())


@pytest.mark.asyncio
async def test_interview_events_create_communications(
    client: AsyncClient,
    db_session: AsyncSession,
    communication_event_templates,
) -> None:
    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    start = datetime.now(UTC) + timedelta(days=12)

    interview = await _create_interview(client, headers, job_id, candidate_id, start=start)
    assert await _communications(db_session, candidate_id, template_key="interview_scheduled")

    reschedule_start = start + timedelta(days=1)
    response = await client.patch(
        f"/api/v1/interviews/{interview['id']}/reschedule",
        headers=headers,
        json={
            "scheduled_start": reschedule_start.isoformat(),
            "scheduled_end": (reschedule_start + timedelta(hours=1)).isoformat(),
            "timezone": "America/Recife",
        },
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    assert await _communications(db_session, candidate_id, template_key="interview_rescheduled")

    response = await client.post(
        f"/api/v1/interviews/{interview['id']}/complete",
        headers=headers,
        json={"internal_notes": "Realizada."},
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    assert response.json()["status"] == "awaiting_feedback"
    assert await _communications(db_session, candidate_id, template_key="interview_awaiting_feedback")

    cancelled = await _create_interview(
        client,
        headers,
        job_id,
        candidate_id,
        start=datetime.now(UTC) + timedelta(days=20),
    )
    response = await client.post(
        f"/api/v1/interviews/{cancelled['id']}/cancel",
        headers=headers,
        json={"cancel_reason": "Agenda indisponível."},
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    assert await _communications(db_session, candidate_id, template_key="interview_cancelled")

    no_show = await _create_interview(
        client,
        headers,
        job_id,
        candidate_id,
        start=datetime.now(UTC) + timedelta(days=22),
    )
    response = await client.post(
        f"/api/v1/interviews/{no_show['id']}/no-show",
        headers=headers,
        json={"reason": "Não compareceu."},
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    assert await _communications(db_session, candidate_id, template_key="interview_no_show")


@pytest.mark.asyncio
async def test_pre_admission_and_document_events_create_safe_communications(
    client: AsyncClient,
    db_session: AsyncSession,
    communication_event_templates,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(client, db_session)
    decision_comms = await _communications(
        db_session,
        candidate_id,
        template_key="hiring_decision_submitted",
    )
    assert len(decision_comms) == 1
    assert "strong_fit" not in decision_comms[0].body
    assert "Decisão humana" not in decision_comms[0].body

    assert await _communications(db_session, candidate_id, template_key="pre_admission_created")
    await _create_portal_session(db_session, candidate_id, "portal-comm-reject")
    client.cookies.set("candidate_portal_token", "portal-comm-reject")
    document = (
        await client.post(
            f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
            files=_pdf_upload(),
        )
    ).json()
    client.cookies.clear()

    response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={"review_notes": "Arquivo ilegível."},
    )
    assert response.status_code == status.HTTP_200_OK, response.text

    comms = await _communications(db_session, candidate_id, template_key="document_rejected")
    assert len(comms) == 1
    assert "Arquivo ilegível" not in comms[0].body


@pytest.mark.asyncio
async def test_admission_package_approved_creates_communication(
    client: AsyncClient,
    db_session: AsyncSession,
    communication_event_templates,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(client, db_session)
    await _create_portal_session(db_session, candidate_id, "portal-comm-approve")
    client.cookies.set("candidate_portal_token", "portal-comm-approve")
    document = (
        await client.post(
            f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
            files=_pdf_upload(),
        )
    ).json()
    client.cookies.clear()

    approve_document = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/approve",
        headers=headers,
    )
    assert approve_document.status_code == status.HTTP_200_OK, approve_document.text

    for next_status in ("documents_pending", "documents_received", "ready_for_admission"):
        update = await client.patch(
            f"/api/v1/pre-admission/{case['id']}",
            headers=headers,
            json={"status": next_status},
        )
        assert update.status_code == status.HTTP_200_OK, update.text

    package_response = await client.post(
        f"/api/v1/pre-admission/{case['id']}/admission-package",
        headers=headers,
        json={},
    )
    assert package_response.status_code == status.HTTP_201_CREATED, package_response.text

    approve = await client.post(
        f"/api/v1/admission-packages/{package_response.json()['id']}/approve",
        headers=headers,
        json={},
    )
    assert approve.status_code == status.HTTP_200_OK, approve.text
    assert await _communications(db_session, candidate_id, template_key="admission_package_approved")


@pytest.mark.asyncio
async def test_notify_failure_does_not_break_main_flow(
    client: AsyncClient,
    db_session: AsyncSession,
    communication_event_templates,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail_notify(*args, **kwargs):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(CommunicationService, "notify_event", fail_notify)

    headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)

    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interviews",
        headers=headers,
        json={
            "title": "Entrevista RH",
            "interview_type": "hr",
            "interview_format": "online",
            "scheduled_start": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
            "scheduled_end": (datetime.now(UTC) + timedelta(days=30, hours=1)).isoformat(),
            "timezone": "America/Recife",
        },
    )

    assert response.status_code == status.HTTP_201_CREATED, response.text
    assert response.json()["status"] == "scheduled"
    assert await _communications(db_session, candidate_id) == []
