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


async def test_no_candidate_id_does_not_create_application(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)  # anonymous web chat (public flow)

    # Valid but unknown CPF → advances past IDENTIFY without resolving a candidate.
    for content in ["52998224725", "Peritoró", "any_in_location", "Frentista", "night"]:
        await _send(client, session_id, content)

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateApplicationModel)
    )
    assert count == 0

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id is None
    assert session.application_id is None


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
