"""OP-6F — Secure candidate identification in the Conversation Engine (IDENTIFY).

Drives the public conversation endpoints and asserts that CPF/WhatsApp start a
lead-mode flow without storing the raw identifier, without revealing whether the
candidate exists, without authenticating early, and without creating a pipeline.
"""
import json
from datetime import UTC, datetime
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
from src.infrastructure.database.models.operational_master_model import (
    LocationGroupModel,
    OperationalGroupModel,
    OperationalUnitModel,
)
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


async def _active_conversation_for_candidate(
    db_session: AsyncSession,
    candidate_id: UUID,
    *,
    state: str,
    context: dict | None = None,
) -> ConversationSessionModel:
    now = datetime.now(UTC)
    session = ConversationSessionModel(
        candidate_id=candidate_id,
        channel="web",
        current_state=state,
        status="active",
        context_json=context or {},
        last_message_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(session)
    await db_session.commit()
    await db_session.refresh(session)
    return session


async def _active_application_for_candidate(
    db_session: AsyncSession,
    candidate_id: UUID,
    *,
    status: str = "started",
    location_id: UUID | None = None,
    unit_id: UUID | None = None,
    accepts_any_unit: bool = False,
    desired_job_area: str | None = None,
    desired_shift: str | None = None,
) -> CandidateApplicationModel:
    application = CandidateApplicationModel(
        candidate_id=candidate_id,
        source="bot",
        status=status,
        preferred_location_group_id=location_id,
        preferred_unit_id=unit_id,
        accepts_any_unit_in_location=accepts_any_unit,
        desired_job_area=desired_job_area,
        desired_shift=desired_shift,
    )
    db_session.add(application)
    await db_session.commit()
    await db_session.refresh(application)
    return application


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
    session_id: str,
    identifier: str,
) -> dict:
    """Drive IDENTIFY → CHOOSE_LOCATION for tests."""
    return await _send(client, session_id, identifier)


async def _drive_to_late_otp(client: AsyncClient, session_id: str, identifier: str) -> dict:
    """Drive IDENTIFY through the intake states, stopping at CONFIRM_APPLICATION."""
    steps = [
        identifier,
        "Peritoró",
        "any_in_location",
        "Frentista",
        "night",
        "continue",
        "skip_resume",
    ]
    payload: dict = {}
    for content in steps:
        payload = await _send(client, session_id, content)
    return payload


async def test_identify_with_existing_cpf_advances_as_unverified_lead(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    session_id = await _start(client)

    identify_payload = await _send(client, session_id, VALID_CPF)
    assert identify_payload["current_state"] == "CHOOSE_LOCATION"
    assert identify_payload["assistant_message"] == (
        "Certo. Em qual localidade você prefere trabalhar?"
    )
    assert identify_payload["session"]["context"]["identifier_type"] == "cpf"
    assert identify_payload["session"]["context"]["cpf_last4"] == VALID_CPF[-4:]
    assert identify_payload["session"]["context"]["identity_verified"] is False
    assert "pending_candidate_id" not in identify_payload["session"]["context"]

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id is None
    assert session.context_json.get("pending_candidate_id") == str(candidate.id)
    assert session.context_json.get("identity_verified") is False


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

    await _complete_identify(client, session_id, VALID_CPF)

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id is None
    assert session.context_json.get("pending_candidate_id") == str(candidate.id)


async def test_identify_with_existing_whatsapp_advances_as_unverified_lead(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_phone(db_session)
    session_id = await _start(client)

    identify_payload = await _send(client, session_id, "(11) 99999-8888")
    assert identify_payload["current_state"] == "CHOOSE_LOCATION"
    assert identify_payload["session"]["context"]["identifier_type"] == "whatsapp"
    assert identify_payload["session"]["context"]["identity_verified"] is False
    assert "pending_candidate_id" not in identify_payload["session"]["context"]

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id is None
    assert session.context_json.get("pending_candidate_id") == str(candidate.id)


async def test_identify_with_existing_cpf_resumes_active_session_safely(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    previous = await _active_conversation_for_candidate(
        db_session,
        candidate.id,
        state="CHOOSE_FUNCTION",
        context={
            "location_hint": "Peritoró",
            "preference": "any_in_location",
            "identifier_raw": VALID_CPF,
            "cpf": VALID_CPF,
            "identity_verified": True,
        },
    )
    session_id = await _start(client)

    payload = await _send(client, session_id, VALID_CPF)

    assert payload["current_state"] == "CHOOSE_FUNCTION"
    assert payload["assistant_message"] == (
        "Encontrei uma conversa em andamento. Vamos continuar de onde você parou."
    )
    public_context = payload["session"]["context"]
    assert public_context["location_hint"] == "Peritoró"
    assert public_context["preference"] == "any_in_location"
    assert public_context["identity_verified"] is False
    assert "pending_candidate_id" not in public_context
    assert "possible_candidate_id" not in public_context
    assert "resumed_from_session_id" not in public_context
    assert VALID_CPF not in json.dumps(public_context)

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id is None
    assert session.current_state == "CHOOSE_FUNCTION"
    assert session.context_json["pending_candidate_id"] == str(candidate.id)
    assert session.context_json["resumed_from_session_id"] == str(previous.id)
    assert session.context_json["identity_verified"] is False
    assert "identifier_raw" not in session.context_json
    assert VALID_CPF not in json.dumps(session.context_json)


async def test_identify_with_existing_whatsapp_resumes_active_session_safely(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_phone(db_session)
    await _active_conversation_for_candidate(
        db_session,
        candidate.id,
        state="CHOOSE_SHIFT",
        context={
            "location_hint": "Peritoró",
            "preference": "choose_unit",
            "desired_function": "Frentista",
            "phone": WHATSAPP,
        },
    )
    session_id = await _start(client)

    payload = await _send(client, session_id, "(11) 99999-8888")

    assert payload["current_state"] == "CHOOSE_SHIFT"
    assert payload["assistant_message"] == (
        "Encontrei uma conversa em andamento. Vamos continuar de onde você parou."
    )
    public_context = payload["session"]["context"]
    assert public_context["identifier_type"] == "whatsapp"
    assert public_context["whatsapp_last4"] == WHATSAPP[-4:]
    assert public_context["desired_function"] == "Frentista"
    assert public_context["identity_verified"] is False
    assert "possible_candidate_id" not in public_context
    assert WHATSAPP not in json.dumps(public_context)


async def test_active_session_has_priority_over_active_application(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    await _active_conversation_for_candidate(
        db_session,
        candidate.id,
        state="CHOOSE_SHIFT",
        context={"desired_function": "Frentista"},
    )
    await _active_application_for_candidate(db_session, candidate.id, status="submitted")
    session_id = await _start(client)

    payload = await _send(client, session_id, VALID_CPF)

    assert payload["current_state"] == "CHOOSE_SHIFT"
    assert payload["assistant_message"] == (
        "Encontrei uma conversa em andamento. Vamos continuar de onde você parou."
    )
    assert "enviada para análise" not in payload["assistant_message"].casefold()


async def test_identify_with_existing_cpf_started_application_without_location_asks_location(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    application = await _active_application_for_candidate(
        db_session,
        candidate.id,
        status="qualified",
    )
    session_id = await _start(client)
    application_count_before = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateApplicationModel)
    )

    payload = await _send(client, session_id, VALID_CPF)

    assert payload["current_state"] == "CHOOSE_LOCATION"
    assert payload["assistant_message"] == (
        "Você já tem uma candidatura em andamento. Em qual localidade você prefere trabalhar?"
    )
    response_blob = json.dumps(payload, ensure_ascii=False)
    assert "Pessoa Candidata" not in response_blob
    assert VALID_CPF not in response_blob
    public_context = payload["session"]["context"]
    assert public_context["application_in_progress"] is True
    assert public_context["identity_verified"] is False
    assert "pending_application_id" not in public_context
    assert "pending_application_status" not in public_context
    assert "pending_candidate_id" not in public_context

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id is None
    assert session.application_id is None
    assert session.context_json["pending_application_id"] == str(application.id)
    assert session.context_json["pending_application_status"] == "qualified"
    assert session.context_json["resumed_application_id"] == str(application.id)

    continue_payload = await _send(client, session_id, "vamos")
    assert continue_payload["current_state"] == "CHOOSE_LOCATION"
    assert continue_payload["assistant_message"] == (
        "Em qual localidade você prefere trabalhar?"
    )
    assert "Não encontrei essa localidade" not in continue_payload["assistant_message"]

    messages_response = await client.get(f"/api/v1/conversations/{session_id}/messages")
    assert messages_response.status_code == 200
    messages_blob = json.dumps(messages_response.json(), ensure_ascii=False)
    assert VALID_CPF not in messages_blob
    assert f"CPF informado com final {VALID_CPF[-3:]}" in messages_blob

    application_count_after = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateApplicationModel)
    )
    pipeline_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel)
    )
    assert application_count_after == application_count_before
    assert pipeline_count == 0


async def test_identify_with_started_application_location_without_unit_asks_unit_preference(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    location = await _location(db_session)
    await _active_application_for_candidate(
        db_session,
        candidate.id,
        location_id=location.id,
    )
    session_id = await _start(client)

    payload = await _send(client, session_id, VALID_CPF)

    assert payload["current_state"] == "CHOOSE_UNIT_OR_ANY"
    assert "posto específico" in payload["assistant_message"]
    assert payload["quick_replies"][0]["value"] == "any_in_location"
    assert payload["session"]["context"]["location_hint"] == "Peritoró"
    assert "pending_application_id" not in payload["session"]["context"]


async def test_identify_with_started_application_unit_without_function_asks_function(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    location = await _location(db_session)
    unit = await _unit(db_session, location)
    await _active_application_for_candidate(
        db_session,
        candidate.id,
        location_id=location.id,
        unit_id=unit.id,
    )
    session_id = await _start(client)

    payload = await _send(client, session_id, VALID_CPF)

    assert payload["current_state"] == "CHOOSE_FUNCTION"
    assert payload["assistant_message"] == (
        "Você já tem uma candidatura em andamento. Qual função você deseja procurar?"
    )
    assert payload["session"]["context"]["preference"] == "Posto Centro"


async def test_identify_with_started_application_function_without_shift_asks_shift(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    location = await _location(db_session)
    await _active_application_for_candidate(
        db_session,
        candidate.id,
        location_id=location.id,
        accepts_any_unit=True,
        desired_job_area="Frentista",
    )
    session_id = await _start(client)

    payload = await _send(client, session_id, VALID_CPF)

    assert payload["current_state"] == "CHOOSE_SHIFT"
    assert payload["assistant_message"] == (
        "Você já tem uma candidatura em andamento. Qual turno você prefere?"
    )
    assert payload["quick_replies"][0]["value"] == "morning"
    public_context = payload["session"]["context"]
    assert public_context["desired_function"] == "Frentista"
    assert "pending_application_id" not in public_context


async def test_identify_with_submitted_application_does_not_restart_intake(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    await _active_application_for_candidate(db_session, candidate.id, status="submitted")
    session_id = await _start(client)

    payload = await _send(client, session_id, VALID_CPF)

    assert payload["current_state"] == "DONE"
    assert payload["assistant_message"] == (
        "Sua candidatura já foi enviada para análise do RH. Se precisar atualizar "
        "alguma informação, o RH entrará em contato."
    )
    assert "cidade" not in payload["assistant_message"].casefold()
    response_blob = json.dumps(payload, ensure_ascii=False)
    assert "Pessoa Candidata" not in response_blob
    assert VALID_CPF not in response_blob
    assert "pending_application_id" not in payload["session"]["context"]


async def test_identify_with_linked_application_informs_hr_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    await _active_application_for_candidate(db_session, candidate.id, status="linked_to_pipeline")
    session_id = await _start(client)

    payload = await _send(client, session_id, VALID_CPF)

    assert payload["current_state"] == "DONE"
    assert payload["assistant_message"] == "Sua candidatura já está em análise pelo RH."
    assert "cidade" not in payload["assistant_message"].casefold()
    assert VALID_CPF not in json.dumps(payload, ensure_ascii=False)


async def test_identify_with_existing_whatsapp_active_application_asks_location_safely(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_phone(db_session)
    await _active_application_for_candidate(db_session, candidate.id)
    session_id = await _start(client)

    payload = await _send(client, session_id, WHATSAPP)

    assert payload["current_state"] == "CHOOSE_LOCATION"
    assert payload["assistant_message"] == (
        "Você já tem uma candidatura em andamento. Em qual localidade você prefere trabalhar?"
    )
    assert payload["session"]["context"]["identity_verified"] is False
    response_blob = json.dumps(payload, ensure_ascii=False)
    assert "Pessoa Candidata" not in response_blob
    assert WHATSAPP not in response_blob

    messages_response = await client.get(f"/api/v1/conversations/{session_id}/messages")
    assert messages_response.status_code == 200
    messages_blob = json.dumps(messages_response.json(), ensure_ascii=False)
    assert WHATSAPP not in messages_blob
    assert f"WhatsApp informado com final {WHATSAPP[-3:]}" in messages_blob


async def test_resumed_active_application_is_reused_after_late_otp(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    location = await _location(db_session)
    application = await _active_application_for_candidate(db_session, candidate.id)
    session_id = await _start(client)

    steps = [
        VALID_CPF,
        "Peritoró",
        "any_in_location",
        "Frentista",
        "night",
        "continue",
        "skip_resume",
    ]
    for content in steps:
        await _send(client, session_id, content)

    count_before = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateApplicationModel)
    )
    assert count_before == 1

    confirm = await _send(client, session_id, "confirm")
    assert confirm["current_state"] == "VERIFY_OTP"

    code = await _extract_otp_code(db_session, session_id)
    verified = await _send(client, session_id, code)
    assert verified["current_state"] == "DONE"

    count_after = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateApplicationModel)
    )
    assert count_after == count_before

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id == candidate.id
    assert session.application_id == application.id

    await db_session.refresh(application)
    assert application.preferred_location_group_id == location.id
    assert application.accepts_any_unit_in_location is True
    assert application.desired_job_area == "Frentista"
    assert application.desired_shift == "night"
    assert application.status == "started"


async def test_get_by_current_session_id_keeps_session_priority(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    await _active_conversation_for_candidate(
        db_session,
        candidate.id,
        state="CHOOSE_SHIFT",
        context={"desired_function": "Frentista"},
    )
    current_session_id = await _start(client)
    current_session = await db_session.get(
        ConversationSessionModel,
        UUID(current_session_id),
    )
    assert current_session is not None
    current_session.current_state = "CHOOSE_LOCATION"
    current_session.context_json = {"location_hint": "Sessão atual"}
    await db_session.commit()

    response = await client.get(f"/api/v1/conversations/{current_session_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["session_id"] == current_session_id
    assert payload["current_state"] == "CHOOSE_LOCATION"
    assert payload["context"]["location_hint"] == "Sessão atual"


async def test_identify_with_unknown_cpf_does_not_link_or_reveal(
    client: AsyncClient,
    db_session: AsyncSession,
):
    session_id = await _start(client)

    payload = await _send(client, session_id, VALID_CPF)

    assert payload["current_state"] == "CHOOSE_LOCATION"
    assert payload["assistant_message"] == (
        "Certo. Em qual localidade você prefere trabalhar?"
    )
    assert "identifier_unresolved" not in payload["session"]["context"]
    assert payload["session"]["context"]["lead_mode"] is True

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id is None
    assert session.context_json["identifier_unresolved"] is True


async def test_identify_with_unknown_whatsapp_does_not_link_or_reveal(
    client: AsyncClient,
    db_session: AsyncSession,
):
    session_id = await _start(client)

    payload = await _send(client, session_id, "(11) 99999-8888")

    assert payload["current_state"] == "CHOOSE_LOCATION"
    assert payload["assistant_message"] == (
        "Certo. Em qual localidade você prefere trabalhar?"
    )
    public_context = payload["session"]["context"]
    assert public_context["identifier_type"] == "whatsapp"
    assert public_context["whatsapp_last4"] == WHATSAPP[-4:]
    assert public_context["lead_mode"] is True
    assert "identifier_unresolved" not in public_context
    assert "pending_candidate_id" not in public_context
    assert WHATSAPP not in json.dumps(public_context)

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id is None
    assert session.context_json["identifier_unresolved"] is True
    # OP-6F.5: lead_whatsapp is stored as an internal context key (stripped from
    # public API) so OTP and Candidate creation can proceed later. It must NOT
    # appear in the public context (asserted above via public_context).
    # The raw DB context will contain it; that's expected and controlled.
    assert "lead_whatsapp" in session.context_json  # internal key, used for OTP
    assert "lead_whatsapp" not in public_context     # not exposed via API


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
    assert payload["current_state"] == "CHOOSE_LOCATION"

    serialized = json.dumps(payload["session"]["context"])
    assert VALID_CPF not in serialized
    assert "identifier_raw" not in payload["session"]["context"]

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert VALID_CPF not in json.dumps(session.context_json)


async def test_resolved_candidate_creates_application_only_after_late_otp(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate_with_cpf(db_session)
    location = await _location(db_session)
    session_id = await _start(client)

    await _drive_to_late_otp(client, session_id, VALID_CPF)

    count_before = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateApplicationModel)
    )
    assert count_before == 0

    confirm = await _send(client, session_id, "confirm")
    assert confirm["current_state"] == "VERIFY_OTP"
    assert "código" in confirm["assistant_message"].lower()

    code = await _extract_otp_code(db_session, session_id)
    verified = await _send(client, session_id, code)
    assert verified["current_state"] == "DONE"

    result = await db_session.execute(
        sa.select(CandidateApplicationModel).where(
            CandidateApplicationModel.candidate_id == candidate.id
        )
    )
    applications = list(result.scalars().all())
    assert len(applications) == 1
    assert applications[0].preferred_location_group_id == location.id
    assert applications[0].status == "submitted"

    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session is not None
    assert session.candidate_id == candidate.id
    assert session.context_json.get("identity_verified") is True


async def test_unresolved_session_does_not_create_application(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _location(db_session)
    session_id = await _start(client)

    await _complete_identify(client, session_id, VALID_CPF)
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
    await _complete_identify(client, session_id, VALID_CPF)
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
    # the candidate was found. Both advance to CHOOSE_LOCATION with the same copy.
    await _candidate_with_cpf(db_session, cpf=VALID_CPF)
    known_session = await _start(client)
    success = await _send(client, known_session, VALID_CPF)

    unknown_session = await _start(client)
    not_found = await _send(client, unknown_session, OTHER_VALID_CPF)

    assert success["current_state"] == "CHOOSE_LOCATION"
    assert not_found["current_state"] == "CHOOSE_LOCATION"
    assert success["assistant_message"] == not_found["assistant_message"]


async def test_identity_flow_creates_no_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _candidate_with_cpf(db_session)
    await _location(db_session)
    session_id = await _start(client)

    await _complete_identify(client, session_id, VALID_CPF)
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
