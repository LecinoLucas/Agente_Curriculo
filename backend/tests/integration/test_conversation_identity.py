"""OP-6F — Secure candidate identification in the Conversation Engine (IDENTIFY).

Drives the public conversation endpoints and asserts that a CPF/WhatsApp can link
a candidate_id without storing the raw identifier, without revealing whether it
exists, without authenticating the candidate, and without creating a pipeline.
"""
import json
from hashlib import sha256
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
from src.infrastructure.database.models.operational_master_model import LocationGroupModel

pytestmark = pytest.mark.asyncio

VALID_CPF = "52998224725"  # passes mod-11 check digits
OTHER_VALID_CPF = "16899535009"
WHATSAPP = "11999998888"


async def _candidate_with_cpf(
    db_session: AsyncSession,
    cpf: str = VALID_CPF,
    *,
    with_hash: bool = True,
) -> CandidateModel:
    candidate = CandidateModel(
        full_name="Pessoa Candidata",
        cpf=cpf,
        cpf_hash=sha256(cpf.encode()).hexdigest() if with_hash else None,
        cpf_last4=cpf[-4:],
    )
    db_session.add(candidate)
    await db_session.commit()
    await db_session.refresh(candidate)
    return candidate


async def _candidate_with_phone(db_session: AsyncSession, phone: str = WHATSAPP) -> CandidateModel:
    candidate = CandidateModel(full_name="Pessoa Candidata", phone=phone)
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


async def test_identify_with_existing_cpf_links_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    session_id = await _start(client)

    payload = await _send(client, session_id, VALID_CPF)

    assert payload["current_state"] == "CHOOSE_LOCATION"
    assert payload["assistant_message"].startswith("Certo, vamos continuar")
    assert payload["session"]["context"]["identifier_type"] == "cpf"
    assert payload["session"]["context"]["cpf_last4"] == VALID_CPF[-4:]

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id == candidate.id


async def test_identify_with_plaintext_cpf_fallback_links_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
):
    # Candidate has only the plaintext `cpf` column (no cpf_hash) — the resolver's
    # compatibility fallback must still find it.
    candidate = await _candidate_with_cpf(db_session, with_hash=False)
    session_id = await _start(client)

    await _send(client, session_id, VALID_CPF)

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id == candidate.id


async def test_identify_with_existing_whatsapp_links_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_phone(db_session)
    session_id = await _start(client)

    payload = await _send(client, session_id, "(11) 99999-8888")

    assert payload["current_state"] == "CHOOSE_LOCATION"
    assert payload["session"]["context"]["identifier_type"] == "whatsapp"

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id == candidate.id


async def test_identify_with_unknown_cpf_does_not_link_or_reveal(
    client: AsyncClient,
    db_session: AsyncSession,
):
    session_id = await _start(client)

    payload = await _send(client, session_id, VALID_CPF)  # nobody owns it

    # Advances anyway, with a not-found reply that mirrors the success reply.
    assert payload["current_state"] == "CHOOSE_LOCATION"
    assert payload["assistant_message"].startswith("Tudo bem, vamos continuar")
    assert payload["session"]["context"]["identifier_unresolved"] is True

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id is None


async def test_identify_with_invalid_input_stays_in_identify(
    client: AsyncClient,
    db_session: AsyncSession,
):
    session_id = await _start(client)

    payload = await _send(client, session_id, "oi, tudo bem?")

    assert payload["current_state"] == "IDENTIFY"
    assert "CPF ou WhatsApp" in payload["assistant_message"]
    # Quick replies are re-offered so the chat never gets stuck.
    assert payload["quick_replies"] == [
        {"value": "cpf", "label": "Informar CPF"},
        {"value": "whatsapp", "label": "Informar WhatsApp"},
    ]

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.current_state == "IDENTIFY"
    assert session.candidate_id is None


async def test_full_cpf_never_stored_in_context(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _candidate_with_cpf(db_session)
    session_id = await _start(client)

    payload = await _send(client, session_id, VALID_CPF)

    serialized = json.dumps(payload["session"]["context"])
    assert VALID_CPF not in serialized
    assert "identifier_raw" not in payload["session"]["context"]

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert VALID_CPF not in json.dumps(session.context_json)


async def test_resolved_candidate_allows_application_next_steps(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    location = await _location(db_session)
    session_id = await _start(client)

    await _send(client, session_id, VALID_CPF)  # resolves → candidate_id linked
    await _send(client, session_id, "Peritoró")  # first real intake data

    result = await db_session.execute(
        sa.select(CandidateApplicationModel).where(
            CandidateApplicationModel.candidate_id == candidate.id
        )
    )
    applications = list(result.scalars().all())
    assert len(applications) == 1
    assert applications[0].preferred_location_group_id == location.id


async def test_unresolved_session_does_not_create_application(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)

    await _send(client, session_id, VALID_CPF)  # valid but unknown → no candidate
    await _send(client, session_id, "Peritoró")

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateApplicationModel)
    )
    assert count == 0


async def test_create_with_explicit_candidate_id_still_advances(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    session_id = await _start(client, candidate.id)  # candidate_id passed explicitly

    # Identity already known → IDENTIFY advances even on the placeholder value.
    payload = await _send(client, session_id, "cpf")
    assert payload["current_state"] == "CHOOSE_LOCATION"

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id == candidate.id


async def test_create_with_unknown_candidate_id_returns_404(client: AsyncClient):
    response = await client.post(
        "/api/v1/conversations",
        json={"channel": "web", "candidate_id": str(uuid4())},
    )
    assert response.status_code == 404


async def test_quick_replies_returned_on_send_and_get(
    client: AsyncClient,
):
    session_id = await _start(client)
    await _send(client, session_id, VALID_CPF)
    send_payload = await _send(client, session_id, "Peritoró")

    assert send_payload["current_state"] == "CHOOSE_UNIT_OR_ANY"
    assert send_payload["quick_replies"][0]["value"] == "any_in_location"

    get_response = await client.get(f"/api/v1/conversations/{session_id}")
    assert get_response.status_code == 200
    assert get_response.json()["quick_replies"][0]["value"] == "any_in_location"


async def test_success_and_not_found_messages_are_indistinguishable_tail(
    client: AsyncClient,
    db_session: AsyncSession,
):
    # Anti-enumeration: both replies must end the same way.
    await _candidate_with_cpf(db_session, cpf=VALID_CPF)
    known_session = await _start(client)
    success = await _send(client, known_session, VALID_CPF)

    unknown_session = await _start(client)
    not_found = await _send(client, unknown_session, OTHER_VALID_CPF)

    tail = "em qual cidade ou localidade você quer trabalhar."
    assert success["assistant_message"].endswith(tail)
    assert not_found["assistant_message"].endswith(tail)


async def test_identity_flow_creates_no_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _candidate_with_cpf(db_session)
    await _location(db_session)
    session_id = await _start(client)

    for content in [VALID_CPF, "Peritoró", "any_in_location", "Frentista", "night"]:
        await _send(client, session_id, content)

    pipeline_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    assert pipeline_count == 0
