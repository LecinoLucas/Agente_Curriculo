from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.conversation_model import (
    ConversationMessageModel,
    ConversationSessionModel,
)
from src.infrastructure.database.models.conversation_otp_model import ConversationOtpModel

pytestmark = pytest.mark.asyncio


async def _create_conversation(client: AsyncClient) -> dict:
    response = await client.post("/api/v1/conversations", json={"channel": "web"})
    assert response.status_code == 201
    return response.json()


async def _pass_identify(
    client: AsyncClient,
    db_session: AsyncSession,
    session_id: str,
    identifier: str = "11999998888",
) -> None:
    """Drive IDENTIFY → VERIFY_OTP → CHOOSE_LOCATION (submit correct OTP code)."""
    from hashlib import sha256 as _sha256

    await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": identifier},
    )
    otp = await db_session.scalar(
        sa.select(ConversationOtpModel)
        .where(ConversationOtpModel.session_id == UUID(session_id))
        .order_by(ConversationOtpModel.created_at.desc())
        .limit(1)
    )
    assert otp is not None
    sid = UUID(session_id)
    for i in range(1_000_000):
        code = f"{i:06d}"
        if _sha256(f"{sid}:{code}".encode()).hexdigest() == otp.otp_hash:
            await client.post(
                f"/api/v1/conversations/{session_id}/messages",
                json={"content": code},
            )
            return
    raise AssertionError("OTP code not found")


async def test_create_conversation_returns_initial_state_and_quick_replies(
    client: AsyncClient,
    db_session: AsyncSession,
):
    payload = await _create_conversation(client)

    assert payload["session_id"]
    assert payload["current_state"] == "IDENTIFY"
    assert payload["assistant_message"] == (
        "Olá! Vou te ajudar a encontrar uma vaga. "
        "Para começar, me diga seu CPF ou WhatsApp."
    )
    assert payload["quick_replies"] == [
        {"value": "cpf", "label": "Informar CPF"},
        {"value": "whatsapp", "label": "Informar WhatsApp"},
    ]
    assert payload["session"]["id"] == payload["session_id"]
    assert payload["options"] == payload["quick_replies"]
    assert payload["message"]["role"] == "assistant"
    assert payload["message"]["direction"] == "outbound"

    session = await db_session.get(ConversationSessionModel, UUID(payload["session_id"]))
    assert session is not None
    assert session.candidate_id is None
    assert session.application_id is None


async def test_get_conversation_returns_current_state_and_quick_replies(
    client: AsyncClient,
):
    create_payload = await _create_conversation(client)
    session_id = create_payload["session_id"]

    response = await client.get(f"/api/v1/conversations/{session_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["session_id"] == session_id
    assert payload["current_state"] == "IDENTIFY"
    assert payload["status"] == "active"
    assert payload["quick_replies"] == create_payload["quick_replies"]
    assert "CPF ou WhatsApp" in payload["assistant_message"]


async def test_send_message_saves_candidate_and_assistant_messages(
    client: AsyncClient,
    db_session: AsyncSession,
):
    create_payload = await _create_conversation(client)
    session_id = UUID(create_payload["session_id"])

    response = await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": "11999998888", "message_type": "text"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["session_id"] == str(session_id)
    # With OTP, IDENTIFY → VERIFY_OTP (not CHOOSE_LOCATION directly).
    assert payload["current_state"] == "VERIFY_OTP"
    assert payload["quick_replies"] == []
    assert "código" in payload["assistant_message"].lower()
    # The raw identifier is NEVER stored in context — only non-sensitive markers.
    assert payload["session"]["context"]["identifier_type"] == "whatsapp"
    assert payload["session"]["context"]["identifier_unresolved"] is True
    assert "identifier_raw" not in payload["session"]["context"]
    assert "11999998888" not in str(payload["session"]["context"])
    assert payload["message"]["role"] == "assistant"

    session = await db_session.get(ConversationSessionModel, session_id)
    assert session is not None
    assert session.current_state == "VERIFY_OTP"
    assert session.candidate_id is None
    assert session.context_json["identifier_type"] == "whatsapp"
    assert "identifier_raw" not in session.context_json

    messages = (
        await db_session.execute(
            sa.select(ConversationMessageModel)
            .where(ConversationMessageModel.session_id == session_id)
            .order_by(ConversationMessageModel.created_at.asc(), ConversationMessageModel.id.asc())
        )
    ).scalars().all()
    assert [message.role for message in messages] == ["assistant", "candidate", "assistant"]
    assert messages[1].content == "11999998888"


async def test_state_machine_advances_location_to_unit_choice_with_options(
    client: AsyncClient,
    db_session: AsyncSession,
):
    create_payload = await _create_conversation(client)
    session_id = create_payload["session_id"]
    # IDENTIFY → VERIFY_OTP → CHOOSE_LOCATION (via OTP).
    await _pass_identify(client, db_session, session_id)

    response = await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": "Peritoró", "message_type": "text"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["current_state"] == "CHOOSE_UNIT_OR_ANY"
    assert payload["assistant_message"] == (
        "Encontrei Peritoró. Você prefere um posto específico "
        "ou qualquer posto da localidade?"
    )
    assert payload["quick_replies"] == [
        {"value": "any_in_location", "label": "Qualquer posto em Peritoró"},
        {"value": "choose_unit", "label": "Escolher posto"},
    ]
    assert payload["session"]["context"]["location_hint"] == "Peritoró"


async def test_get_resume_keeps_state_and_options(
    client: AsyncClient,
    db_session: AsyncSession,
):
    create_payload = await _create_conversation(client)
    session_id = create_payload["session_id"]
    await _pass_identify(client, db_session, session_id)
    await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": "Peritoró"},
    )

    response = await client.get(f"/api/v1/conversations/{session_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["current_state"] == "CHOOSE_UNIT_OR_ANY"
    assert payload["quick_replies"][0]["value"] == "any_in_location"
    assert payload["context"]["location_hint"] == "Peritoró"


async def test_list_messages_returns_ordered_history(
    client: AsyncClient,
    db_session: AsyncSession,
):
    create_payload = await _create_conversation(client)
    session_id = create_payload["session_id"]
    # Send a valid phone number to advance IDENTIFY → VERIFY_OTP (2 messages: candidate + assistant)
    await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": "11999998888", "message_type": "text"},
    )

    response = await client.get(f"/api/v1/conversations/{session_id}/messages")

    assert response.status_code == 200
    messages = response.json()
    assert [message["role"] for message in messages] == [
        "assistant",
        "candidate",
        "assistant",
    ]
    assert [message["direction"] for message in messages] == [
        "outbound",
        "inbound",
        "outbound",
    ]


async def test_missing_session_returns_404(client: AsyncClient):
    response = await client.get(f"/api/v1/conversations/{uuid4()}")

    assert response.status_code == 404


async def test_completed_session_does_not_advance(
    client: AsyncClient,
    db_session: AsyncSession,
):
    now = datetime.now(UTC)
    session = ConversationSessionModel(
        channel="web",
        current_state="DONE",
        status="completed",
        context_json={"identifier_raw": "cpf"},
        last_message_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(session)
    await db_session.commit()

    response = await client.post(
        f"/api/v1/conversations/{session.id}/messages",
        json={"content": "continuar"},
    )

    assert response.status_code == 422
    refreshed = await db_session.get(ConversationSessionModel, session.id)
    assert refreshed is not None
    assert refreshed.current_state == "DONE"
    assert refreshed.status == "completed"

    message_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(ConversationMessageModel)
    )
    assert message_count == 0


async def test_cancelled_session_does_not_advance(
    client: AsyncClient,
    db_session: AsyncSession,
):
    now = datetime.now(UTC)
    session = ConversationSessionModel(
        channel="web",
        current_state="CHOOSE_LOCATION",
        status="cancelled",
        context_json={},
        last_message_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(session)
    await db_session.commit()

    response = await client.post(
        f"/api/v1/conversations/{session.id}/messages",
        json={"content": "Peritoró"},
    )

    assert response.status_code == 422
    refreshed = await db_session.get(ConversationSessionModel, session.id)
    assert refreshed is not None
    assert refreshed.current_state == "CHOOSE_LOCATION"


async def test_conversation_flow_does_not_create_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
):
    create_payload = await _create_conversation(client)
    session_id = create_payload["session_id"]
    for content in ["cpf", "Peritoró", "any_in_location", "Frentista", "night"]:
        await client.post(
            f"/api/v1/conversations/{session_id}/messages",
            json={"content": content},
        )

    pipeline_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    assert pipeline_count == 0
