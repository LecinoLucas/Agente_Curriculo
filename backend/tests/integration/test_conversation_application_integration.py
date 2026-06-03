"""OP-6E — Conversation Engine ↔ CandidateApplication integration.

Drives the public conversation endpoints and asserts that the chat projects the
collected context onto a single CandidateApplication, without ever creating a
pipeline. CPF is never persisted on the application.
"""
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_application_model import (
    CandidateApplicationModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.conversation_model import ConversationSessionModel
from src.infrastructure.database.models.operational_master_model import (
    LocationGroupModel,
    OperationalGroupModel,
    OperationalUnitModel,
)
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel

pytestmark = pytest.mark.asyncio


async def _candidate(db_session: AsyncSession) -> CandidateModel:
    candidate = CandidateModel(full_name="Pessoa Candidata")
    db_session.add(candidate)
    await db_session.commit()
    await db_session.refresh(candidate)
    return candidate


async def _location(db_session: AsyncSession, name: str = "Peritoró") -> LocationGroupModel:
    location = LocationGroupModel(
        name=name,
        normalized_name=name.casefold(),
        state="MA",
        city=name,
        type="city",
    )
    db_session.add(location)
    await db_session.commit()
    await db_session.refresh(location)
    return location


async def _unit(
    db_session: AsyncSession,
    location: LocationGroupModel,
    name: str = "Posto Centro",
) -> OperationalUnitModel:
    group = OperationalGroupModel(code=f"G{uuid4().hex[:6]}", name="Grupo", normalized_name="grupo")
    db_session.add(group)
    await db_session.flush()
    unit = OperationalUnitModel(
        group_id=group.id,
        location_group_id=location.id,
        code=f"U{uuid4().hex[:6]}",
        name=name,
        normalized_name=name.casefold(),
        type="gas_station",
    )
    db_session.add(unit)
    await db_session.commit()
    await db_session.refresh(unit)
    return unit


async def _start(client: AsyncClient, candidate_id: UUID | None = None) -> str:
    body: dict = {"channel": "web"}
    if candidate_id is not None:
        body["candidate_id"] = str(candidate_id)
    response = await client.post("/api/v1/conversations", json=body)
    assert response.status_code == 201
    return response.json()["session_id"]


async def _send(client: AsyncClient, session_id: str, content: str) -> dict:
    response = await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": content},
    )
    assert response.status_code == 200
    return response.json()


async def _applications_for(
    db_session: AsyncSession,
    candidate_id: UUID,
) -> list[CandidateApplicationModel]:
    result = await db_session.execute(
        sa.select(CandidateApplicationModel).where(
            CandidateApplicationModel.candidate_id == candidate_id
        )
    )
    return list(result.scalars().all())


async def test_conversation_creates_application_after_location_and_links_session(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate(db_session)
    location = await _location(db_session)
    session_id = await _start(client, candidate.id)

    # Answering IDENTIFY alone must NOT create an application yet.
    await _send(client, session_id, "cpf")
    assert await _applications_for(db_session, candidate.id) == []

    # Choosing a location is the first real intake data → application is created.
    await _send(client, session_id, "Peritoró")

    applications = await _applications_for(db_session, candidate.id)
    assert len(applications) == 1
    application = applications[0]
    assert application.preferred_location_group_id == location.id
    assert application.status == "started"
    assert application.source == "bot"
    assert application.job_id is None

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.application_id == application.id


async def test_resending_messages_does_not_duplicate_application(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate(db_session)
    await _location(db_session)
    session_id = await _start(client, candidate.id)

    await _send(client, session_id, "cpf")
    await _send(client, session_id, "Peritoró")
    await _send(client, session_id, "any_in_location")
    await _send(client, session_id, "Frentista")

    assert len(await _applications_for(db_session, candidate.id)) == 1


async def test_any_unit_preference_sets_accepts_any_true(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate(db_session)
    location = await _location(db_session)
    session_id = await _start(client, candidate.id)

    await _send(client, session_id, "cpf")
    await _send(client, session_id, "Peritoró")
    await _send(client, session_id, "any_in_location")

    application = (await _applications_for(db_session, candidate.id))[0]
    assert application.accepts_any_unit_in_location is True
    assert application.preferred_location_group_id == location.id
    assert application.preferred_unit_id is None


async def test_specific_unit_sets_preferred_unit_id(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate(db_session)
    location = await _location(db_session)
    unit = await _unit(db_session, location, name="Posto Centro")
    session_id = await _start(client, candidate.id)

    await _send(client, session_id, "cpf")
    await _send(client, session_id, "Peritoró")
    await _send(client, session_id, "Posto Centro")

    application = (await _applications_for(db_session, candidate.id))[0]
    assert application.preferred_unit_id == unit.id
    assert application.accepts_any_unit_in_location is False


async def test_function_and_shift_are_persisted(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate(db_session)
    await _location(db_session)
    session_id = await _start(client, candidate.id)

    await _send(client, session_id, "cpf")
    await _send(client, session_id, "Peritoró")
    await _send(client, session_id, "any_in_location")
    await _send(client, session_id, "Frentista")
    await _send(client, session_id, "night")

    application = (await _applications_for(db_session, candidate.id))[0]
    assert application.desired_job_area == "Frentista"
    assert application.desired_shift == "night"


async def test_confirmation_sets_status_submitted(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate(db_session)
    await _location(db_session)
    session_id = await _start(client, candidate.id)

    steps = ["cpf", "Peritoró", "any_in_location", "Frentista", "night", "continue", "skip_resume"]
    for content in steps:
        await _send(client, session_id, content)

    # CONFIRM_APPLICATION → confirm
    await _send(client, session_id, "confirm")

    application = (await _applications_for(db_session, candidate.id))[0]
    assert application.status == "submitted"


async def test_unresolved_lead_collects_data_and_creates_candidate_and_application(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """OP-6F.6: an unresolved lead who provides name/WhatsApp/LGPD and confirms
    should result in a new Candidate and CandidateApplication with no pipeline,
    without any OTP step."""
    location = await _location(db_session)
    session_id = await _start(client)  # anonymous web chat (public flow)

    # Valid CPF not in DB → lead mode.
    await _send(client, session_id, "52998224725")

    # Collect intake preferences — no application until identity is confirmed.
    for content in ["Peritoró", "any_in_location", "Frentista", "night"]:
        await _send(client, session_id, content)

    count_before_lead_info = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateApplicationModel)
    )
    assert count_before_lead_info == 0

    await _send(client, session_id, "continue")
    # COLLECT_RESUME → COLLECT_LEAD_NAME (lead mode active).
    after_resume = await _send(client, session_id, "skip_resume")
    assert after_resume["current_state"] == "COLLECT_LEAD_NAME"

    # Collect name.
    after_name = await _send(client, session_id, "Maria da Silva")
    assert after_name["current_state"] == "COLLECT_LEAD_WHATSAPP"

    # Collect WhatsApp.
    after_wa = await _send(client, session_id, "11987654321")
    assert after_wa["current_state"] == "COLLECT_LGPD_CONSENT"

    # Accept LGPD.
    after_lgpd = await _send(client, session_id, "aceito")
    assert after_lgpd["current_state"] == "CONFIRM_APPLICATION"

    # Confirm — finalizes directly without an OTP step.
    confirm = await _send(client, session_id, "confirm")
    assert confirm["current_state"] == "DONE"
    assert "registrada" in confirm["assistant_message"].lower()

    # Candidate and Application should now exist.
    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id is not None
    assert session.application_id is not None

    candidate = await db_session.get(CandidateModel, session.candidate_id)
    assert candidate is not None
    assert candidate.full_name == "Maria da Silva"
    assert candidate.phone == "11987654321"
    assert candidate.lgpd_consent_at is not None
    assert candidate.lgpd_consent_version == "v1.0"

    apps = await _applications_for(db_session, session.candidate_id)
    assert len(apps) == 1
    assert apps[0].preferred_location_group_id == location.id
    assert apps[0].status in ("submitted", "started")
    assert apps[0].lgpd_consent_at is not None
    assert apps[0].lgpd_consent_version == "v1.0"

    # No pipeline.
    pipeline_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    assert pipeline_count == 0


async def test_confirming_unresolved_lead_with_pending_resume_creates_public_resume(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    monkeypatch.setattr(
        "src.application.services.conversation_service.write_resume_file",
        lambda _key, _content: None,
    )
    monkeypatch.setattr(
        "src.application.services.conversation_service.enqueue_resume_extraction",
        lambda _version_id: None,
    )

    await _location(db_session)
    session_id = await _start(client)

    await _send(client, session_id, "52998224725")
    for content in ["Peritoró", "any_in_location", "Frentista", "night", "continue"]:
        await _send(client, session_id, content)

    awaiting_upload = await _send(client, session_id, "send_resume")
    assert awaiting_upload["current_state"] == "AWAITING_RESUME_UPLOAD"

    pending_resume = tmp_path / "portal-resume.pdf"
    pending_resume.write_bytes(b"%PDF-1.4 portal resume")
    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    session.context_json = {
        **(session.context_json or {}),
        "pending_resume_path": str(pending_resume),
        "pending_resume_filename": "portal-resume.pdf",
    }
    await db_session.commit()

    uploaded = await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": "resume_uploaded", "message_type": "event"},
    )
    assert uploaded.status_code == 200
    assert uploaded.json()["current_state"] == "COLLECT_LEAD_NAME"

    for content in ["Maria com Currículo", "11987654322", "aceito"]:
        await _send(client, session_id, content)

    confirm = await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": "confirm", "message_type": "quick_reply"},
    )
    assert confirm.status_code == 200
    assert confirm.json()["current_state"] == "DONE"

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id is not None
    assert session.application_id is not None
    assert "pending_resume_path" not in (session.context_json or {})

    candidate = await db_session.get(CandidateModel, session.candidate_id)
    assert candidate is not None
    assert candidate.full_name == "Maria com Currículo"
    assert candidate.phone == "11987654322"
    assert candidate.lgpd_consent_at is not None
    assert candidate.lgpd_consent_version == "v1.0"

    application = await db_session.get(CandidateApplicationModel, session.application_id)
    assert application is not None
    assert application.candidate_id == candidate.id
    assert application.status == "submitted"
    assert application.lgpd_consent_at is not None
    assert application.lgpd_consent_version == "v1.0"

    resume = await db_session.scalar(
        sa.select(ResumeModel).where(ResumeModel.candidate_id == candidate.id)
    )
    assert resume is not None
    assert resume.created_by is None

    version = await db_session.scalar(
        sa.select(ResumeVersionModel).where(ResumeVersionModel.resume_id == resume.id)
    )
    assert version is not None
    assert version.uploaded_by is None
    assert version.original_file_name == "portal-resume.pdf"
    assert version.file_size_bytes == len(b"%PDF-1.4 portal resume")
    assert pending_resume.exists() is False

    pipeline_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    assert pipeline_count == 0


async def test_application_integration_never_creates_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate(db_session)
    await _location(db_session)
    session_id = await _start(client, candidate.id)

    steps = [
        "cpf",
        "Peritoró",
        "any_in_location",
        "Frentista",
        "night",
        "continue",
        "skip_resume",
        "confirm",
    ]
    for content in steps:
        await _send(client, session_id, content)

    pipeline_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    assert pipeline_count == 0


async def test_start_with_unknown_candidate_returns_404(client: AsyncClient):
    response = await client.post(
        "/api/v1/conversations",
        json={"channel": "web", "candidate_id": str(uuid4())},
    )
    assert response.status_code == 404
