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
from src.interface.api.routers.conversation_upload import (
    CONVERSATION_SESSION_COOKIE_NAME,
    create_conversation_session_token,
)

pytestmark = pytest.mark.asyncio


async def _create_conversation(client: AsyncClient) -> dict:
    response = await client.post("/api/v1/conversations", json={"channel": "web"})
    assert response.status_code == 201
    return response.json()


async def _pass_identify(
    client: AsyncClient,
    session_id: str,
    identifier: str = "11999998888",
) -> None:
    """Drive IDENTIFY → CHOOSE_LOCATION for the lead-mode flow."""
    await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": identifier},
    )


async def test_create_conversation_returns_initial_state_and_quick_replies(
    client: AsyncClient,
    db_session: AsyncSession,
):
    response = await client.post("/api/v1/conversations", json={"channel": "web"})
    assert response.status_code == 201
    payload = response.json()

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
    assert response.cookies.get(CONVERSATION_SESSION_COOKIE_NAME) is not None

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
    assert payload["current_state"] == "CHOOSE_LOCATION"
    assert payload["quick_replies"] == []
    assert "localidade" in payload["assistant_message"].lower()
    # The raw identifier is NEVER stored in context — only non-sensitive markers.
    assert payload["session"]["context"]["identifier_type"] == "whatsapp"
    assert "identifier_unresolved" not in payload["session"]["context"]
    assert "identifier_raw" not in payload["session"]["context"]
    assert "11999998888" not in str(payload["session"]["context"])
    assert payload["message"]["role"] == "assistant"

    session = await db_session.get(ConversationSessionModel, session_id)
    assert session is not None
    assert session.current_state == "CHOOSE_LOCATION"
    assert session.candidate_id is None
    assert session.context_json["identifier_type"] == "whatsapp"
    assert session.context_json["identifier_unresolved"] is True
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
    await _pass_identify(client, session_id)

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
    await _pass_identify(client, session_id)
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
    # Send a valid phone number to advance IDENTIFY → CHOOSE_LOCATION.
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


async def test_resume_uploaded_event_advances_without_persisting_invalid_message_type(
    client: AsyncClient,
    db_session: AsyncSession,
):
    create_payload = await _create_conversation(client)
    session_id = create_payload["session_id"]
    for content in [
        "11999998888",
        "Peritoró",
        "any_in_location",
        "Frentista",
        "night",
        "continue",
        "send_resume",
    ]:
        response = await client.post(
            f"/api/v1/conversations/{session_id}/messages",
            json={"content": content},
        )
        assert response.status_code == 200

    response = await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": "resume_uploaded", "message_type": "event"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["current_state"] == "COLLECT_LEAD_NAME"
    assert "nome completo" in payload["assistant_message"].lower()

    event_message = await db_session.scalar(
        sa.select(ConversationMessageModel)
        .where(
            ConversationMessageModel.session_id == UUID(session_id),
            ConversationMessageModel.content == "resume_uploaded",
        )
        .order_by(ConversationMessageModel.created_at.desc())
        .limit(1)
    )
    assert event_message is not None
    assert event_message.message_type == "system"


# Minimal but structurally valid PDF (header + xref + trailer), accepted by the
# resume upload validator's magic-byte/MIME checks.
_MINIMAL_PDF = (
    b"%PDF-1.4\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n"
    b"xref\n0 4\n0000000000 65535 f \n"
    b"trailer<</Root 1 0 R/Size 4>>\nstartxref\n0\n%%EOF\n"
)


def test_resume_upload_route_registered_at_canonical_path():
    """Regression: the upload router must mount at exactly
    /api/v1/conversations/{session_id}/resume — never a doubled /api/v1 prefix.
    """
    from fastapi.routing import APIRoute

    from src.interface.api.main import app

    fapp = app
    while not hasattr(fapp, "routes"):
        fapp = fapp.app  # unwrap middleware layers

    resume_paths = {
        route.path
        for route in fapp.routes
        if isinstance(route, APIRoute) and route.path.endswith("/resume")
    }
    assert "/api/v1/conversations/{session_id}/resume" in resume_paths
    assert "/api/v1/api/v1/conversations/{session_id}/resume" not in resume_paths


async def test_resume_upload_accepts_valid_pdf(client: AsyncClient):
    create_payload = await _create_conversation(client)
    session_id = create_payload["session_id"]

    response = await client.post(
        f"/api/v1/conversations/{session_id}/resume",
        files={"file": ("cv.pdf", _MINIMAL_PDF, "application/pdf")},
    )

    assert response.status_code == 200
    assert "uploaded successfully" in response.json()["message"].lower()


async def test_resume_upload_without_conversation_cookie_returns_401(client: AsyncClient):
    create_payload = await _create_conversation(client)
    session_id = create_payload["session_id"]
    client.cookies.clear()

    response = await client.post(
        f"/api/v1/conversations/{session_id}/resume",
        files={"file": ("cv.pdf", _MINIMAL_PDF, "application/pdf")},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Conversation session authorization required"
    assert "traceback" not in response.text.lower()


async def test_resume_upload_cookie_for_other_session_returns_403(client: AsyncClient):
    first = await _create_conversation(client)
    second = await _create_conversation(client)
    client.cookies.set(
        CONVERSATION_SESSION_COOKIE_NAME,
        create_conversation_session_token(UUID(first["session_id"])),
        path="/api/v1/conversations",
    )

    response = await client.post(
        f"/api/v1/conversations/{second['session_id']}/resume",
        files={"file": ("cv.pdf", _MINIMAL_PDF, "application/pdf")},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Conversation session token does not match the requested session"


async def test_resume_upload_unknown_session_returns_clear_404(client: AsyncClient):
    missing_session_id = uuid4()
    client.cookies.set(
        CONVERSATION_SESSION_COOKIE_NAME,
        create_conversation_session_token(missing_session_id),
        path="/api/v1/conversations",
    )
    response = await client.post(
        f"/api/v1/conversations/{missing_session_id}/resume",
        files={"file": ("cv.pdf", _MINIMAL_PDF, "application/pdf")},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Conversation session not found"


async def test_resume_upload_invalid_file_still_blocked_when_authorized(client: AsyncClient):
    create_payload = await _create_conversation(client)
    session_id = create_payload["session_id"]

    response = await client.post(
        f"/api/v1/conversations/{session_id}/resume",
        files={"file": ("cv.pdf", b"not-a-pdf", "application/pdf")},
    )

    assert response.status_code == 400
    assert "pdf válido" in response.json()["detail"].lower()


async def test_resume_upload_oversized_file_still_blocked_when_authorized(client: AsyncClient):
    create_payload = await _create_conversation(client)
    session_id = create_payload["session_id"]
    oversized_pdf = b"%PDF-1.4\n" + (b"x" * (11 * 1024 * 1024)) + b"\n%%EOF"

    response = await client.post(
        f"/api/v1/conversations/{session_id}/resume",
        files={"file": ("cv.pdf", oversized_pdf, "application/pdf")},
    )

    assert response.status_code == 400
    assert "arquivo muito grande" in response.json()["detail"].lower()
