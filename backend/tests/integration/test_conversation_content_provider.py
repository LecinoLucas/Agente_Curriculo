"""OP-6H-3F — AssistantContentProvider integration tests.

Verifies that the Conversation Engine reads persisted state-content and
quick-replies from the DB and falls back gracefully to hardcoded defaults when
rows are absent, inactive, or contain invalid data.
"""
from __future__ import annotations

from uuid import UUID

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.assistant_settings_catalog import (
    seed_assistant_configuration,
)
from src.infrastructure.database.models.assistant_settings_model import (
    AssistantQuickReplyModel,
    AssistantStateContentModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.conversation_model import (
    ConversationSessionModel,
)
from src.infrastructure.database.models.conversation_otp_model import ConversationOtpModel
from src.infrastructure.database.models.operational_master_model import (
    LocationGroupModel,
)

pytestmark = pytest.mark.asyncio

# ── helpers ───────────────────────────────────────────────────────────────────


async def _seed(db: AsyncSession) -> None:
    await seed_assistant_configuration(db)
    await db.commit()


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


async def _location(db: AsyncSession, name: str = "Peritoró") -> LocationGroupModel:
    loc = LocationGroupModel(
        name=name, normalized_name=name.casefold(), state="MA", city=name, type="city"
    )
    db.add(loc)
    await db.commit()
    await db.refresh(loc)
    return loc


async def _extract_otp(db: AsyncSession, session_id: str) -> str:
    from hashlib import sha256

    otp = await db.scalar(
        sa.select(ConversationOtpModel)
        .where(ConversationOtpModel.session_id == UUID(session_id))
        .order_by(ConversationOtpModel.created_at.desc())
        .limit(1)
    )
    assert otp is not None
    sid = UUID(session_id)
    for i in range(1_000_000):
        code = f"{i:06d}"
        if sha256(f"{sid}:{code}".encode()).hexdigest() == otp.otp_hash:
            return code
    raise AssertionError("OTP not found")


# ── DB content overrides bot response ─────────────────────────────────────────


async def test_engine_uses_db_prompt_text_when_active(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    await _location(db_session)

    # Override CHOOSE_FUNCTION prompt in DB.  The CHOOSE_FUNCTION prompt is
    # returned as the assistant_message when the candidate answers CHOOSE_UNIT_OR_ANY.
    await db_session.execute(
        sa.update(AssistantStateContentModel)
        .where(AssistantStateContentModel.state == "CHOOSE_FUNCTION")
        .values(prompt_text="Qual função você procura? (personalizado)")
    )
    await db_session.commit()

    session_id = await _start(client)
    for step in ["52998224725", "Peritoró"]:
        await _send(client, session_id, step)
    r = await _send(client, session_id, "any_in_location")  # → CHOOSE_FUNCTION
    assert r["current_state"] == "CHOOSE_FUNCTION"
    assert "personalizado" in r["assistant_message"]


async def test_patch_and_send_reflects_new_text(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Simulates the full admin-edit → next-bot-reply cycle end to end."""
    await _seed(db_session)
    await _location(db_session)

    # Simulate what the PATCH endpoint does: update prompt_text, bump version.
    await db_session.execute(
        sa.update(AssistantStateContentModel)
        .where(AssistantStateContentModel.state == "CHOOSE_SHIFT")
        .values(
            prompt_text="Qual o seu turno de preferência? (v2)",
            version=2,
        )
    )
    await db_session.commit()

    session_id = await _start(client)
    for step in ["52998224725", "Peritoró", "any_in_location", "Frentista"]:
        r = await _send(client, session_id, step)
    # After CHOOSE_FUNCTION, response is CHOOSE_SHIFT with custom prompt.
    assert r["current_state"] == "CHOOSE_SHIFT"
    assert "turno de preferência" in r["assistant_message"]
    assert "v2" in r["assistant_message"]


# ── Fallback to hardcoded when row absent ─────────────────────────────────────


async def test_engine_falls_back_to_hardcoded_when_no_db_content(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """No seed → no rows in DB → hardcoded defaults used."""
    await _location(db_session)

    session_id = await _start(client)
    r = await _send(client, session_id, "52998224725")
    assert r["current_state"] == "CHOOSE_LOCATION"
    # Default hardcoded text
    assert "localidade" in r["assistant_message"].lower()


async def test_engine_falls_back_when_state_content_inactive(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    await _location(db_session)

    await db_session.execute(
        sa.update(AssistantStateContentModel)
        .where(AssistantStateContentModel.state == "CHOOSE_LOCATION")
        .values(
            prompt_text="Texto que não deve aparecer",
            is_active=False,
        )
    )
    await db_session.commit()

    session_id = await _start(client)
    r = await _send(client, session_id, "52998224725")
    assert r["current_state"] == "CHOOSE_LOCATION"
    assert "Texto que não deve aparecer" not in r["assistant_message"]


async def test_engine_falls_back_when_prompt_text_empty(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    await _location(db_session)

    await db_session.execute(
        sa.update(AssistantStateContentModel)
        .where(AssistantStateContentModel.state == "CHOOSE_LOCATION")
        .values(prompt_text="   ")  # whitespace-only
    )
    await db_session.commit()

    session_id = await _start(client)
    r = await _send(client, session_id, "52998224725")
    assert r["current_state"] == "CHOOSE_LOCATION"
    # Should be non-empty (hardcoded default)
    assert r["assistant_message"].strip()


# ── Quick replies from DB ─────────────────────────────────────────────────────


async def test_engine_uses_db_quick_replies_when_active(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    await _location(db_session)

    # Change label for "morning" in CHOOSE_SHIFT.
    await db_session.execute(
        sa.update(AssistantQuickReplyModel)
        .where(
            AssistantQuickReplyModel.state == "CHOOSE_SHIFT",
            AssistantQuickReplyModel.value == "morning",
        )
        .values(label="Manhã (personalizado)")
    )
    await db_session.commit()

    session_id = await _start(client)
    for step in ["52998224725", "Peritoró", "any_in_location", "Frentista"]:
        r = await _send(client, session_id, step)
    assert r["current_state"] == "CHOOSE_SHIFT"
    labels = [qr["label"] for qr in r["quick_replies"]]
    assert "Manhã (personalizado)" in labels


async def test_inactive_quick_replies_not_returned(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    await _location(db_session)

    # Deactivate "any" option in CHOOSE_SHIFT.
    await db_session.execute(
        sa.update(AssistantQuickReplyModel)
        .where(
            AssistantQuickReplyModel.state == "CHOOSE_SHIFT",
            AssistantQuickReplyModel.value == "any",
        )
        .values(is_active=False)
    )
    await db_session.commit()

    session_id = await _start(client)
    for step in ["52998224725", "Peritoró", "any_in_location", "Frentista"]:
        r = await _send(client, session_id, step)
    assert r["current_state"] == "CHOOSE_SHIFT"
    values = [qr["value"] for qr in r["quick_replies"]]
    assert "any" not in values
    assert "morning" in values  # others still active


async def test_quick_reply_with_invalid_value_is_ignored(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    await _location(db_session)

    # Insert a row with a value NOT in the catalogue for CHOOSE_SHIFT.
    db_session.add(
        AssistantQuickReplyModel(
            state="CHOOSE_SHIFT",
            value="invalid_not_in_catalogue",
            label="Opção inválida",
            sort_order=99,
        )
    )
    await db_session.commit()

    session_id = await _start(client)
    for step in ["52998224725", "Peritoró", "any_in_location", "Frentista"]:
        r = await _send(client, session_id, step)
    assert r["current_state"] == "CHOOSE_SHIFT"
    values = [qr["value"] for qr in r["quick_replies"]]
    assert "invalid_not_in_catalogue" not in values


async def test_all_quick_replies_inactive_falls_back_to_hardcoded(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    await _location(db_session)

    # Deactivate ALL quick replies for CHOOSE_SHIFT.
    await db_session.execute(
        sa.update(AssistantQuickReplyModel)
        .where(AssistantQuickReplyModel.state == "CHOOSE_SHIFT")
        .values(is_active=False)
    )
    await db_session.commit()

    session_id = await _start(client)
    for step in ["52998224725", "Peritoró", "any_in_location", "Frentista"]:
        r = await _send(client, session_id, step)
    assert r["current_state"] == "CHOOSE_SHIFT"
    # Hardcoded: morning, afternoon, night, any
    values = [qr["value"] for qr in r["quick_replies"]]
    assert "morning" in values
    assert "any" in values


# ── Security / anti-enumeration ───────────────────────────────────────────────


async def test_identify_does_not_reveal_cpf_exists(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Even with DB content seeded, the IDENTIFY anti-enumeration invariant holds."""
    await _seed(db_session)
    cand = CandidateModel(full_name="Pessoa X", cpf="52998224725")
    db_session.add(cand)
    await db_session.commit()
    await _location(db_session)

    session_known = await _start(client)
    r_known = await _send(client, session_known, "52998224725")
    session_unknown = await _start(client)
    r_unknown = await _send(client, session_unknown, "16899535009")

    assert r_known["current_state"] == "CHOOSE_LOCATION"
    assert r_unknown["current_state"] == "CHOOSE_LOCATION"
    assert r_known["assistant_message"] == r_unknown["assistant_message"]


# ── Lead + OTP states are hardcoded ──────────────────────────────────────────


async def test_lead_registration_flow_still_works_with_db_content(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """COLLECT_LEAD_* states remain hardcoded even with assistant_* seeded."""
    await _seed(db_session)
    await _location(db_session)

    session_id = await _start(client)
    for step in ["52998224725", "Peritoró", "any_in_location", "Frentista", "night", "continue"]:
        await _send(client, session_id, step)
    r = await _send(client, session_id, "skip_resume")
    assert r["current_state"] == "COLLECT_LEAD_NAME"

    await _send(client, session_id, "Maria da Silva")
    await _send(client, session_id, "11987654321")
    after_lgpd = await _send(client, session_id, "aceito")
    assert after_lgpd["current_state"] == "CONFIRM_APPLICATION"

    otp_r = await _send(client, session_id, "confirm")
    assert otp_r["current_state"] == "VERIFY_OTP"
    code = await _extract_otp(db_session, session_id)
    done = await _send(client, session_id, code)
    assert done["current_state"] == "DONE"

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None and session.candidate_id is not None


async def test_verify_otp_continues_to_work(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    await _location(db_session)

    # Known candidate via CPF.
    from hashlib import sha256 as _sha256
    cpf = "52998224725"
    cand = CandidateModel(
        full_name="Pessoa OTP",
        cpf=cpf,
        cpf_hash=_sha256(cpf.encode()).hexdigest(),
        cpf_last4=cpf[-4:],
    )
    db_session.add(cand)
    await db_session.commit()

    session_id = await _start(client)
    steps = [cpf, "Peritoró", "any_in_location", "Frentista",
             "night", "continue", "skip_resume", "confirm"]
    for step in steps:
        r = await _send(client, session_id, step)
    assert r["current_state"] == "VERIFY_OTP"
    code = await _extract_otp(db_session, session_id)
    done = await _send(client, session_id, code)
    assert done["current_state"] == "DONE"


# ── Pipeline is never created ─────────────────────────────────────────────────


async def test_pipeline_not_created_with_db_content(
    client: AsyncClient,
    db_session: AsyncSession,
):
    from src.infrastructure.database.models.candidate_job_pipeline_model import (
        CandidateJobPipelineModel,
    )

    await _seed(db_session)
    cand = CandidateModel(full_name="Pessoa Pipeline")
    db_session.add(cand)
    await db_session.commit()
    await _location(db_session)

    body: dict = {"channel": "web", "candidate_id": str(cand.id)}
    r2 = await client.post("/api/v1/conversations", json=body)
    assert r2.status_code == 201
    sid2 = r2.json()["session_id"]

    steps = ["cpf", "Peritoró", "any_in_location", "Frentista",
             "night", "continue", "skip_resume", "confirm"]
    for step in steps:
        await _send(client, sid2, step)

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    assert count == 0
