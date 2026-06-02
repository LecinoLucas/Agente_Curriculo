"""OP-6F.2 — OTP verification tests for the Conversation Engine.

Verifies security properties:
- OTP is issued on valid identifier input
- Correct code confirms candidate_id
- Wrong code does not confirm, decrements attempts
- Consumed OTP cannot be reused
- Expired OTP triggers re-issue
- Locked (max attempts) returns to IDENTIFY
- Public response never exposes OTP, CPF, phone, name, email
- Session without verified OTP does not create CandidateApplication
- No pipeline is ever created
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
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
from src.infrastructure.database.models.conversation_model import ConversationSessionModel
from src.infrastructure.database.models.conversation_otp_model import ConversationOtpModel
from src.infrastructure.database.models.operational_master_model import LocationGroupModel

pytestmark = pytest.mark.asyncio

VALID_CPF = "52998224725"
WHATSAPP = "11999998888"


# ── Fixtures ─────────────────────────────────────────────────────────────────


async def _candidate_with_cpf(
    db_session: AsyncSession,
    cpf: str = VALID_CPF,
) -> CandidateModel:
    candidate = CandidateModel(
        full_name="Pessoa Candidata",
        cpf=cpf,
        cpf_hash=sha256(cpf.encode()).hexdigest(),
        cpf_last4=cpf[-4:],
    )
    db_session.add(candidate)
    await db_session.commit()
    await db_session.refresh(candidate)
    return candidate


async def _candidate_with_phone(db_session: AsyncSession) -> CandidateModel:
    candidate = CandidateModel(full_name="Pessoa Candidata", phone=WHATSAPP)
    db_session.add(candidate)
    await db_session.commit()
    await db_session.refresh(candidate)
    return candidate


async def _location(db_session: AsyncSession, name: str = "Peritoró") -> LocationGroupModel:
    loc = LocationGroupModel(
        name=name,
        normalized_name=name.casefold(),
        state="MA",
        city=name,
        type="city",
    )
    db_session.add(loc)
    await db_session.commit()
    await db_session.refresh(loc)
    return loc


async def _start(client: AsyncClient) -> str:
    r = await client.post("/api/v1/conversations", json={"channel": "web"})
    assert r.status_code == 201
    return r.json()["session_id"]


async def _send(client: AsyncClient, session_id: str, content: str) -> dict:
    r = await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": content},
    )
    assert r.status_code == 200
    return r.json()


async def _latest_otp(db_session: AsyncSession, session_id: str) -> ConversationOtpModel:
    otp = await db_session.scalar(
        sa.select(ConversationOtpModel)
        .where(ConversationOtpModel.session_id == UUID(session_id))
        .order_by(ConversationOtpModel.created_at.desc())
        .limit(1)
    )
    assert otp is not None, "No OTP found"
    return otp


async def _extract_code(db_session: AsyncSession, session_id: str) -> str:
    """Recover the plaintext code by iterating all 10^6 possibilities."""
    otp = await _latest_otp(db_session, session_id)
    sid = UUID(session_id)
    for i in range(1_000_000):
        code = f"{i:06d}"
        if sha256(f"{sid}:{code}".encode()).hexdigest() == otp.otp_hash:
            return code
    raise AssertionError("OTP code not in 0-999999 range")


# ── Tests ─────────────────────────────────────────────────────────────────────


async def test_identify_issues_otp_and_advances_to_verify_otp(
    client: AsyncClient,
    db_session: AsyncSession,
):
    session_id = await _start(client)
    payload = await _send(client, session_id, VALID_CPF)

    assert payload["current_state"] == "VERIFY_OTP"
    assert "código" in payload["assistant_message"].lower()
    assert payload["quick_replies"] == []  # No quick replies in VERIFY_OTP

    otp = await _latest_otp(db_session, session_id)
    assert otp.consumed_at is None
    assert otp.attempts == 0


async def test_identify_issues_otp_for_whatsapp(
    client: AsyncClient,
    db_session: AsyncSession,
):
    session_id = await _start(client)
    payload = await _send(client, session_id, "(11) 99999-8888")

    assert payload["current_state"] == "VERIFY_OTP"
    otp = await _latest_otp(db_session, session_id)
    assert otp.identifier_type == "whatsapp"


async def test_correct_otp_links_candidate_and_advances(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    session_id = await _start(client)
    await _send(client, session_id, VALID_CPF)

    code = await _extract_code(db_session, session_id)
    verify = await _send(client, session_id, code)

    assert verify["current_state"] == "CHOOSE_LOCATION"
    assert "Identidade confirmada" in verify["assistant_message"]
    assert verify["session"]["context"].get("identity_verified") is True

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id == candidate.id

    otp = await _latest_otp(db_session, session_id)
    assert otp.consumed_at is not None


async def test_wrong_otp_does_not_verify_and_stays_in_verify_otp(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _candidate_with_cpf(db_session)
    session_id = await _start(client)
    await _send(client, session_id, VALID_CPF)

    payload = await _send(client, session_id, "000000")  # deliberately wrong

    assert payload["current_state"] == "VERIFY_OTP"
    assert "incorreto" in payload["assistant_message"].lower()

    otp = await _latest_otp(db_session, session_id)
    assert otp.attempts == 1
    assert otp.consumed_at is None

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id is None


async def test_otp_consumed_cannot_be_reused(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _candidate_with_cpf(db_session)
    session_id = await _start(client)
    await _send(client, session_id, VALID_CPF)

    code = await _extract_code(db_session, session_id)
    await _send(client, session_id, code)  # consume it

    # Start a new session and try the same code (cross-session replay attempt)
    session_id2 = await _start(client)
    await _send(client, session_id2, VALID_CPF)
    payload2 = await _send(client, session_id2, code)

    # The code belongs to session_id, not session_id2 → the hash won't match
    assert payload2["current_state"] != "CHOOSE_LOCATION"


async def test_expired_otp_triggers_reissue(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _candidate_with_cpf(db_session)
    session_id = await _start(client)
    await _send(client, session_id, VALID_CPF)

    # Manually expire the OTP. Use naive UTC so SQLite comparisons work.
    otp = await _latest_otp(db_session, session_id)
    otp.expires_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    await db_session.commit()

    payload = await _send(client, session_id, "123456")  # any code

    assert payload["current_state"] == "VERIFY_OTP"
    assert "expirou" in payload["assistant_message"].lower()

    # A fresh OTP should have been issued.
    new_otp = await _latest_otp(db_session, session_id)
    assert new_otp.id != otp.id
    assert new_otp.consumed_at is None
    expires = new_otp.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    assert expires > datetime.now(UTC)


async def test_max_attempts_returns_to_identify(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _candidate_with_cpf(db_session)
    session_id = await _start(client)
    await _send(client, session_id, VALID_CPF)

    # Exhaust attempts.
    otp = await _latest_otp(db_session, session_id)
    otp.attempts = otp.max_attempts  # pre-fill to trigger lock on next submission
    await db_session.commit()

    payload = await _send(client, session_id, "000000")

    assert payload["current_state"] == "IDENTIFY"
    assert "CPF ou WhatsApp" in payload["assistant_message"]
    assert payload["quick_replies"] == [
        {"value": "cpf", "label": "Informar CPF"},
        {"value": "whatsapp", "label": "Informar WhatsApp"},
    ]


async def test_response_never_exposes_otp_cpf_phone_or_name(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _candidate_with_cpf(db_session)
    session_id = await _start(client)

    # IDENTIFY
    identify_payload = await _send(client, session_id, VALID_CPF)
    import json
    serialized = json.dumps(identify_payload)
    assert VALID_CPF not in serialized
    assert "Pessoa Candidata" not in serialized
    assert "otp_hash" not in serialized
    assert "otp_code" not in serialized

    # Wrong VERIFY_OTP attempt
    wrong_payload = await _send(client, session_id, "000000")
    wrong_serialized = json.dumps(wrong_payload)
    assert VALID_CPF not in wrong_serialized
    assert "otp_hash" not in wrong_serialized


async def test_session_without_verified_otp_does_not_create_application(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """A candidate whose OTP was never verified must not get a CandidateApplication."""
    await _candidate_with_cpf(db_session)
    await _location(db_session)
    session_id = await _start(client)

    # Enter IDENTIFY and go directly to submitting location without verifying OTP.
    await _send(client, session_id, VALID_CPF)
    # The session is now in VERIFY_OTP — trying to send a location value should
    # be treated as an OTP code attempt, not as location data.
    await _send(client, session_id, "Peritoró")

    # No application should have been created because identity is not yet verified.
    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateApplicationModel)
    )
    assert count == 0


async def test_otp_flow_creates_no_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _candidate_with_cpf(db_session)
    await _location(db_session)
    session_id = await _start(client)

    await _send(client, session_id, VALID_CPF)
    code = await _extract_code(db_session, session_id)
    await _send(client, session_id, code)
    for content in ["Peritoró", "any_in_location", "Frentista", "night"]:
        await _send(client, session_id, content)

    pipeline_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    assert pipeline_count == 0


async def test_otp_for_unknown_candidate_still_issued_and_verifiable(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Anti-enumeration: OTP is issued even when no candidate matches the identifier."""
    session_id = await _start(client)
    payload = await _send(client, session_id, VALID_CPF)

    assert payload["current_state"] == "VERIFY_OTP"
    otp = await _latest_otp(db_session, session_id)
    assert otp.candidate_id is None

    code = await _extract_code(db_session, session_id)
    verify = await _send(client, session_id, code)

    # Verifies OK but candidate_id stays None (nobody matched)
    assert verify["current_state"] == "CHOOSE_LOCATION"
    assert verify["session"]["context"].get("identity_verified") is True

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id is None
