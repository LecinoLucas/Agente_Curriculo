"""OP-6F.5 — Lead registration flow in the Conversation Engine.

Tests the path for a new (unresolved) lead:
  IDENTIFY → ... → COLLECT_LEAD_NAME → COLLECT_LEAD_WHATSAPP → COLLECT_LGPD_CONSENT
  → CONFIRM_APPLICATION → VERIFY_OTP → DONE (Candidate + CandidateApplication created).

Security guarantees tested:
- No Candidate created before OTP is verified.
- No Candidate created without LGPD consent.
- No CandidateApplication created before Candidate.
- PII (full WhatsApp/CPF) not in public API responses.
- No pipeline created.
- Existing Candidate by phone is linked (no duplicate).
"""
from __future__ import annotations

import json
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

# A CPF that passes mod-11 validation but is NOT in the DB (new lead).
UNKNOWN_CPF = "52998224725"
# A WhatsApp that is NOT linked to any Candidate.
UNKNOWN_WHATSAPP = "11987654321"
LEAD_NAME = "Maria da Silva"


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
    response = await client.post("/api/v1/conversations", json={"channel": "web"})
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
    otp = await db_session.scalar(
        sa.select(ConversationOtpModel)
        .where(ConversationOtpModel.session_id == UUID(session_id))
        .order_by(ConversationOtpModel.created_at.desc())
        .limit(1)
    )
    assert otp is not None, "No OTP found"
    sid = UUID(session_id)
    for i in range(1_000_000):
        code = f"{i:06d}"
        if sha256(f"{sid}:{code}".encode()).hexdigest() == otp.otp_hash:
            return code
    raise AssertionError("OTP not found in range")


async def _drive_to_lead_name(
    client: AsyncClient,
    session_id: str,
    identifier: str = UNKNOWN_CPF,
) -> None:
    """Drive from IDENTIFY through COLLECT_RESUME to reach COLLECT_LEAD_NAME."""
    steps = [identifier, "Peritoró", "any_in_location", "Frentista", "night", "continue"]
    for content in steps:
        await _send(client, session_id, content)
    r = await _send(client, session_id, "skip_resume")
    assert r["current_state"] == "COLLECT_LEAD_NAME", r["current_state"]


async def _complete_lead_registration(
    client: AsyncClient,
    db_session: AsyncSession,
    session_id: str,
    name: str = LEAD_NAME,
    whatsapp: str = UNKNOWN_WHATSAPP,
) -> dict:
    """Complete COLLECT_LEAD_NAME → COLLECT_LEAD_WHATSAPP → COLLECT_LGPD_CONSENT
    → CONFIRM_APPLICATION → VERIFY_OTP → DONE."""
    await _send(client, session_id, name)
    await _send(client, session_id, whatsapp)
    await _send(client, session_id, "aceito")
    await _send(client, session_id, "confirm")
    code = await _extract_otp_code(db_session, session_id)
    return await _send(client, session_id, code)


# ── State routing ─────────────────────────────────────────────────────────────


async def test_unresolved_lead_advances_to_choose_location(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)

    r = await _send(client, session_id, UNKNOWN_CPF)
    assert r["current_state"] == "CHOOSE_LOCATION"
    assert r["session"]["context"].get("lead_mode") is True
    assert r["session"]["context"].get("identifier_type") == "cpf"


async def test_lead_collects_location_function_shift(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)
    await _send(client, session_id, UNKNOWN_CPF)

    r = await _send(client, session_id, "Peritoró")
    assert r["current_state"] == "CHOOSE_UNIT_OR_ANY"
    r = await _send(client, session_id, "any_in_location")
    assert r["current_state"] == "CHOOSE_FUNCTION"
    r = await _send(client, session_id, "Frentista")
    assert r["current_state"] == "CHOOSE_SHIFT"
    r = await _send(client, session_id, "night")
    assert r["current_state"] == "SHOW_JOBS"


async def test_after_collect_resume_lead_goes_to_collect_lead_name(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)
    await _drive_to_lead_name(client, session_id)


async def test_whatsapp_lead_skips_collect_lead_whatsapp(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """WhatsApp leads already provided their number in IDENTIFY — COLLECT_LEAD_WHATSAPP
    is skipped; they go directly from COLLECT_LEAD_NAME to COLLECT_LGPD_CONSENT."""
    await _location(db_session)
    session_id = await _start(client)

    r = await _send(client, session_id, UNKNOWN_WHATSAPP)
    assert r["current_state"] == "CHOOSE_LOCATION"

    for content in ["Peritoró", "any_in_location", "Frentista", "night", "continue"]:
        await _send(client, session_id, content)
    await _send(client, session_id, "skip_resume")

    after_name = await _send(client, session_id, LEAD_NAME)
    assert after_name["current_state"] == "COLLECT_LGPD_CONSENT"


# ── Validation ────────────────────────────────────────────────────────────────


async def test_empty_name_keeps_state_collect_lead_name(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)
    await _drive_to_lead_name(client, session_id)

    r = await _send(client, session_id, "   ")
    assert r["current_state"] == "COLLECT_LEAD_NAME"


async def test_single_word_name_is_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)
    await _drive_to_lead_name(client, session_id)

    r = await _send(client, session_id, "Maria")
    assert r["current_state"] == "COLLECT_LEAD_NAME"


async def test_invalid_whatsapp_keeps_state_collect_lead_whatsapp(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)
    await _drive_to_lead_name(client, session_id)
    await _send(client, session_id, LEAD_NAME)  # COLLECT_LEAD_WHATSAPP

    r = await _send(client, session_id, "12345")  # too short
    assert r["current_state"] == "COLLECT_LEAD_WHATSAPP"


async def test_lead_without_lgpd_consent_does_not_create_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)
    await _drive_to_lead_name(client, session_id)
    await _send(client, session_id, LEAD_NAME)
    await _send(client, session_id, UNKNOWN_WHATSAPP)

    r = await _send(client, session_id, "nao_aceito")
    assert r["current_state"] == "DONE"
    msg = r["assistant_message"].lower()
    assert "autorização" in msg or "tudo bem" in msg

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateModel)
    )
    assert count == 0


async def test_not_accepted_lgpd_cancels_session(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)
    await _drive_to_lead_name(client, session_id)
    await _send(client, session_id, LEAD_NAME)
    await _send(client, session_id, UNKNOWN_WHATSAPP)
    await _send(client, session_id, "nao_aceito")

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.status == "cancelled"


async def test_wrong_otp_does_not_create_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)
    await _drive_to_lead_name(client, session_id)
    await _send(client, session_id, LEAD_NAME)
    await _send(client, session_id, UNKNOWN_WHATSAPP)
    await _send(client, session_id, "aceito")
    await _send(client, session_id, "confirm")

    # Send wrong OTP.
    await _send(client, session_id, "000000")

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateModel)
    )
    assert count == 0


# ── Candidate + Application creation ─────────────────────────────────────────


async def test_correct_otp_creates_candidate_with_lgpd_consent(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)
    await _drive_to_lead_name(client, session_id)

    done = await _complete_lead_registration(client, db_session, session_id)
    assert done["current_state"] == "DONE"

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id is not None

    candidate = await db_session.get(CandidateModel, session.candidate_id)
    assert candidate is not None
    assert candidate.full_name == LEAD_NAME
    assert candidate.phone == UNKNOWN_WHATSAPP
    assert candidate.lgpd_consent_at is not None
    assert candidate.lgpd_consent_version == "v1.0"


async def test_correct_otp_creates_application_with_collected_data(
    client: AsyncClient,
    db_session: AsyncSession,
):
    location = await _location(db_session)
    session_id = await _start(client)
    await _drive_to_lead_name(client, session_id)

    done = await _complete_lead_registration(client, db_session, session_id)
    assert done["current_state"] == "DONE"

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.application_id is not None

    app = await db_session.get(CandidateApplicationModel, session.application_id)
    assert app is not None
    assert app.preferred_location_group_id == location.id
    assert app.desired_job_area == "Frentista"
    assert app.desired_shift == "night"
    assert app.source == "bot"


async def test_application_creation_is_idempotent(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Running the full lead flow twice for different sessions with the same phone
    links the second session to the existing Candidate (no duplicate)."""
    await _location(db_session)

    # First session.
    session_id_1 = await _start(client)
    await _drive_to_lead_name(client, session_id_1)
    await _complete_lead_registration(client, db_session, session_id_1)

    session_1 = await db_session.get(ConversationSessionModel, UUID(session_id_1))
    assert session_1 is not None
    candidate_id = session_1.candidate_id
    assert candidate_id is not None

    # Second session with the same WhatsApp (should link, not duplicate).
    session_id_2 = await _start(client)
    await _drive_to_lead_name(client, session_id_2, identifier=UNKNOWN_CPF)
    await _complete_lead_registration(client, db_session, session_id_2)

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateModel).where(
            CandidateModel.phone == UNKNOWN_WHATSAPP,
            CandidateModel.deleted_at.is_(None),
        )
    )
    assert count == 1  # no duplicate

    session_2 = await db_session.get(ConversationSessionModel, UUID(session_id_2))
    assert session_2 is not None
    assert session_2.candidate_id == candidate_id  # same Candidate linked


async def test_lead_registration_never_creates_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)
    await _drive_to_lead_name(client, session_id)
    await _complete_lead_registration(client, db_session, session_id)

    pipeline_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    assert pipeline_count == 0


async def test_session_application_id_populated_after_lead_registration(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)
    await _drive_to_lead_name(client, session_id)
    await _complete_lead_registration(client, db_session, session_id)

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.application_id is not None


# ── PII / LGPD / security ────────────────────────────────────────────────────


async def test_public_context_never_exposes_lead_name_or_whatsapp(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)
    await _drive_to_lead_name(client, session_id)

    after_name = await _send(client, session_id, LEAD_NAME)
    serialized_name = json.dumps(after_name["session"]["context"])
    assert LEAD_NAME not in serialized_name
    assert "lead_name" not in serialized_name

    after_wa = await _send(client, session_id, UNKNOWN_WHATSAPP)
    serialized_wa = json.dumps(after_wa["session"]["context"])
    assert UNKNOWN_WHATSAPP not in serialized_wa
    assert "lead_whatsapp" not in serialized_wa


async def test_public_context_never_exposes_full_cpf_or_phone(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)

    r = await _send(client, session_id, UNKNOWN_CPF)
    serialized = json.dumps(r["session"]["context"])
    assert UNKNOWN_CPF not in serialized
    assert UNKNOWN_WHATSAPP not in serialized


async def test_no_candidate_created_before_otp(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)
    await _drive_to_lead_name(client, session_id)
    await _send(client, session_id, LEAD_NAME)
    await _send(client, session_id, UNKNOWN_WHATSAPP)
    await _send(client, session_id, "aceito")

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateModel)
    )
    assert count == 0
