from datetime import UTC, datetime
from hashlib import sha256
from uuid import UUID

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
from src.infrastructure.database.models.conversation_model import (
    ConversationMessageModel,
    ConversationSessionModel,
)

pytestmark = pytest.mark.asyncio


async def _create_candidate_with_application(
    db_session: AsyncSession,
    *,
    cpf_digits: str,
) -> tuple[CandidateModel, CandidateApplicationModel]:
    candidate = CandidateModel(
        full_name="Candidato Conversa",
        email="conversation@example.com",
        phone="11987654321",
        cpf=None,
        cpf_hash=sha256(cpf_digits.encode("utf-8")).hexdigest(),
        cpf_last4=cpf_digits[-4:],
        location_city="Goiânia",
        location_state="GO",
        location_country="BR",
        created_by=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(candidate)
    await db_session.flush()

    application = CandidateApplicationModel(
        candidate_id=candidate.id,
        job_id=None,
        source="web_portal",
        status="started",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(application)
    await db_session.commit()
    return candidate, application


async def test_create_session_returns_initial_question_and_nullable_links(
    client: AsyncClient,
    db_session: AsyncSession,
):
    response = await client.post("/api/v1/conversations", json={"channel": "web"})

    assert response.status_code == 201
    payload = response.json()
    assert payload["session"]["channel"] == "web"
    assert payload["session"]["current_state"] == "IDENTIFY"
    assert payload["session"]["status"] == "active"
    assert "CPF ou WhatsApp" in payload["message"]["content"]
    assert payload["message"]["direction"] == "outbound"

    session = await db_session.get(ConversationSessionModel, UUID(payload["session"]["id"]))
    assert session is not None
    assert session.candidate_id is None
    assert session.application_id is None


async def test_message_advances_state_saves_messages_and_keeps_current_state(
    client: AsyncClient,
    db_session: AsyncSession,
):
    cpf_digits = "12345678901"
    candidate, application = await _create_candidate_with_application(
        db_session,
        cpf_digits=cpf_digits,
    )
    create_response = await client.post("/api/v1/conversations", json={"channel": "web"})
    session_id = UUID(create_response.json()["session"]["id"])

    message_response = await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": cpf_digits},
    )

    assert message_response.status_code == 200
    payload = message_response.json()
    assert payload["session"]["current_state"] == "RESUME_OR_NEW"
    assert payload["session"]["context"] == {
        "identified": True,
        "candidate_found": True,
        "active_application_found": True,
        "answers": {},
    }
    assert "continuar" in payload["message"]["content"].lower()

    session = await db_session.get(ConversationSessionModel, session_id)
    assert session is not None
    assert session.candidate_id == candidate.id
    assert session.application_id == application.id
    assert session.current_state == "RESUME_OR_NEW"

    messages = (
        await db_session.execute(
            sa.select(ConversationMessageModel)
            .where(ConversationMessageModel.session_id == session.id)
            .order_by(ConversationMessageModel.created_at.asc())
        )
    ).scalars().all()
    assert [message.direction for message in messages] == ["outbound", "inbound", "outbound"]
    assert messages[1].content == "[identificacao protegida]"
    assert messages[1].interpreted_intent == "identity_provided"


async def test_recover_session_and_list_messages(
    client: AsyncClient,
):
    create_response = await client.post("/api/v1/conversations", json={"channel": "web"})
    session_id = create_response.json()["session"]["id"]
    await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": "Peritoro"},
    )

    session_response = await client.get(f"/api/v1/conversations/{session_id}")
    messages_response = await client.get(f"/api/v1/conversations/{session_id}/messages")

    assert session_response.status_code == 200
    assert session_response.json()["id"] == session_id
    assert session_response.json()["current_state"] == "RESUME_OR_NEW"
    assert session_response.json()["context"]["identified"] is False

    assert messages_response.status_code == 200
    messages = messages_response.json()
    assert len(messages) == 3
    assert messages[0]["direction"] == "outbound"
    assert messages[1]["direction"] == "inbound"
    assert messages[2]["direction"] == "outbound"


async def test_does_not_store_plain_cpf_or_create_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
):
    cpf_digits = "12345678901"
    await _create_candidate_with_application(db_session, cpf_digits=cpf_digits)
    create_response = await client.post("/api/v1/conversations", json={"channel": "web"})
    session_id = UUID(create_response.json()["session"]["id"])

    await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": f"Meu CPF é {cpf_digits}"},
    )

    session = await db_session.get(ConversationSessionModel, session_id)
    assert session is not None
    assert cpf_digits not in str(session.context_json)

    messages = (
        await db_session.execute(
            sa.select(ConversationMessageModel).where(
                ConversationMessageModel.session_id == session.id
            )
        )
    ).scalars().all()
    assert all(cpf_digits not in message.content for message in messages)

    pipeline_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    assert pipeline_count == 0
