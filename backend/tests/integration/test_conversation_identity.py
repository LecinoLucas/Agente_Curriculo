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
from src.infrastructure.database.models.conversation_otp_model import ConversationOtpModel
from src.infrastructure.database.models.operational_master_model import LocationGroupModel
from src.interface.api.rate_limiting import reset_rate_limit_storage

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
    if not with_hash:
        await db_session.execute(
            sa.update(CandidateModel)
            .where(CandidateModel.id == candidate.id)
            .values(cpf_hash=None, cpf_last4=None)
        )
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


async def _extract_otp_code(db_session: AsyncSession, session_id: str) -> str:
    """Retrieve the plaintext OTP by brute-forcing 6-digit codes against the stored hash.

    This helper is only used in tests. In production no code is ever stored in plain
    text; here we recover it by trying all 000000-999999 codes against the hash.
    """
    from hashlib import sha256
    otp = await db_session.scalar(
        sa.select(ConversationOtpModel)
        .where(ConversationOtpModel.session_id == UUID(session_id))
        .order_by(ConversationOtpModel.created_at.desc())
        .limit(1)
    )
    assert otp is not None, "No OTP found for session"
    sid = UUID(session_id)
    for i in range(1_000_000):
        code = f"{i:06d}"
        if sha256(f"{sid}:{code}".encode()).hexdigest() == otp.otp_hash:
            return code
    raise AssertionError("OTP code not found in 0-999999 range")


async def _complete_identify(
    client: AsyncClient,
    db_session: AsyncSession,
    session_id: str,
    identifier: str,
) -> dict:
    """Drive IDENTIFY → VERIFY_OTP → CHOOSE_LOCATION for tests."""
    await _send(client, session_id, identifier)
    code = await _extract_otp_code(db_session, session_id)
    return await _send(client, session_id, code)


async def test_identify_with_existing_cpf_links_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    session_id = await _start(client)

    # IDENTIFY → VERIFY_OTP (OTP issued, state advances to VERIFY_OTP)
    identify_payload = await _send(client, session_id, VALID_CPF)
    assert identify_payload["current_state"] == "VERIFY_OTP"
    assert identify_payload["session"]["context"]["identifier_type"] == "cpf"
    assert identify_payload["session"]["context"]["cpf_last4"] == VALID_CPF[-4:]

    # VERIFY_OTP → CHOOSE_LOCATION (correct code confirms identity)
    code = await _extract_otp_code(db_session, session_id)
    verify_payload = await _send(client, session_id, code)
    assert verify_payload["current_state"] == "CHOOSE_LOCATION"
    assert "Identidade confirmada" in verify_payload["assistant_message"]

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id == candidate.id
    assert session.context_json.get("identity_verified") is True


async def test_candidate_cpf_identity_fields_are_populated_on_insert(
    db_session: AsyncSession,
):
    candidate = CandidateModel(
        full_name="Pessoa Candidata",
        cpf="529.982.247-25",
    )
    db_session.add(candidate)
    await db_session.commit()
    await db_session.refresh(candidate)

    assert candidate.cpf_hash == sha256(VALID_CPF.encode()).hexdigest()
    assert candidate.cpf_last4 == VALID_CPF[-4:]


async def test_candidate_cpf_identity_fields_are_populated_on_update(
    db_session: AsyncSession,
):
    candidate = CandidateModel(full_name="Pessoa Candidata")
    db_session.add(candidate)
    await db_session.commit()

    candidate.cpf = "529.982.247-25"
    await db_session.commit()
    await db_session.refresh(candidate)

    assert candidate.cpf_hash == sha256(VALID_CPF.encode()).hexdigest()
    assert candidate.cpf_last4 == VALID_CPF[-4:]


async def test_identify_with_plaintext_cpf_fallback_links_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
):
    # Candidate has only the plaintext `cpf` column (no cpf_hash) — the resolver's
    # compatibility fallback must still find it by normalized digits.
    candidate = await _candidate_with_cpf(
        db_session,
        cpf="529.982.247-25",
        with_hash=False,
    )
    session_id = await _start(client)

    await _complete_identify(client, db_session, session_id, VALID_CPF)

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id == candidate.id


async def test_identify_with_existing_whatsapp_links_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_phone(db_session)
    session_id = await _start(client)

    # IDENTIFY → VERIFY_OTP
    identify_payload = await _send(client, session_id, "(11) 99999-8888")
    assert identify_payload["current_state"] == "VERIFY_OTP"
    assert identify_payload["session"]["context"]["identifier_type"] == "whatsapp"

    # VERIFY_OTP → CHOOSE_LOCATION
    code = await _extract_otp_code(db_session, session_id)
    await _send(client, session_id, code)

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id == candidate.id


async def test_identify_with_unknown_cpf_does_not_link_or_reveal(
    client: AsyncClient,
    db_session: AsyncSession,
):
    session_id = await _start(client)

    # Valid CPF, no match → OTP still issued (anti-enumeration), advances to VERIFY_OTP.
    payload = await _send(client, session_id, VALID_CPF)

    assert payload["current_state"] == "VERIFY_OTP"
    # The OTP prompt is the same whether the candidate was found or not.
    assert "código" in payload["assistant_message"].lower()
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

    # Check after IDENTIFY (context written before OTP prompt)
    payload = await _send(client, session_id, VALID_CPF)
    assert payload["current_state"] == "VERIFY_OTP"

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

    await _complete_identify(client, db_session, session_id, VALID_CPF)
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

    # Valid but unknown → OTP issued, submit correct code to advance
    await _complete_identify(client, db_session, session_id, VALID_CPF)
    await _send(client, session_id, "Peritoró")

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateApplicationModel)
    )
    assert count == 0


async def test_create_with_explicit_candidate_id_skips_otp(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    session_id = await _start(client, candidate.id)  # candidate_id passed explicitly

    # Identity already known → IDENTIFY skips OTP and goes directly to CHOOSE_LOCATION.
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
    db_session: AsyncSession,
):
    session_id = await _start(client)
    await _complete_identify(client, db_session, session_id, VALID_CPF)
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
    # Anti-enumeration: IDENTIFY replies must be identical regardless of whether
    # the candidate was found. Both produce the same VERIFY_OTP prompt.
    await _candidate_with_cpf(db_session, cpf=VALID_CPF)
    known_session = await _start(client)
    success = await _send(client, known_session, VALID_CPF)

    unknown_session = await _start(client)
    not_found = await _send(client, unknown_session, OTHER_VALID_CPF)

    # Both should be in VERIFY_OTP and have the same message.
    assert success["current_state"] == "VERIFY_OTP"
    assert not_found["current_state"] == "VERIFY_OTP"
    assert success["assistant_message"] == not_found["assistant_message"]


async def test_identity_flow_creates_no_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _candidate_with_cpf(db_session)
    await _location(db_session)
    session_id = await _start(client)

    await _complete_identify(client, db_session, session_id, VALID_CPF)
    for content in ["Peritoró", "any_in_location", "Frentista", "night"]:
        await _send(client, session_id, content)

    pipeline_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    assert pipeline_count == 0


async def test_conversation_identify_rate_limit_blocks_identifier_probing(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    from src.core.settings import settings

    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)

    session_id = await _start(client)
    statuses: list[int] = []
    for _ in range(21):
        response = await client.post(
            f"/api/v1/conversations/{session_id}/messages",
            json={"content": "entrada invalida"},
        )
        statuses.append(response.status_code)

    assert all(status != 429 for status in statuses[:20])
    assert statuses[20] == 429
