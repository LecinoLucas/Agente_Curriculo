from uuid import UUID
import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.conversation_model import ConversationSessionModel
from src.infrastructure.database.models.operational_master_model import LocationGroupModel
from src.infrastructure.security.cpf_identity import derive_cpf_identity

pytestmark = pytest.mark.asyncio

UNKNOWN_CPF = "52998224725"
UNKNOWN_WHATSAPP = "11987654321"
LEAD_NAME = "Maria da Silva"

async def _location(db_session: AsyncSession, name: str = "Peritoró") -> LocationGroupModel:
    loc = await db_session.scalar(
        sa.select(LocationGroupModel).where(LocationGroupModel.name == name)
    )
    if loc:
        return loc
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

async def test_cpf_is_persisted_for_new_lead(client: AsyncClient, db_session: AsyncSession):
    await _location(db_session)
    
    # 1. Start conversation
    resp = await client.post("/api/v1/conversations", json={"channel": "web"})
    session_id = resp.json()["session_id"]
    
    # 2. Identify by CPF
    r = await client.post(f"/api/v1/conversations/{session_id}/messages", json={"content": UNKNOWN_CPF})
    
    # Verify security: lead_cpf is NOT in public response context
    resp_context = r.json()["session"]["context"]
    assert "lead_cpf" not in resp_context
    assert UNKNOWN_CPF not in str(resp_context)
    
    # Verify it IS in DB context_json (private persistence between steps)
    db_session.expire_all()
    session = await db_session.get(ConversationSessionModel, UUID(session_id))
    assert session.context_json["lead_cpf"] == UNKNOWN_CPF

    # 3. Drive through states until registration completion
    steps = ["Peritoró", "any_in_location", "Frentista", "night", "continue", "skip_resume", LEAD_NAME, UNKNOWN_WHATSAPP, "aceito", "confirm"]
    for content in steps:
        r = await client.post(f"/api/v1/conversations/{session_id}/messages", json={"content": content})
        assert r.status_code == 200, f"Failed at {content}: {r.json()}"
        
    # 4. Verify Candidate creation and CPF persistence
    db_session.expire_all()
    session = await db_session.scalar(
        sa.select(ConversationSessionModel).where(ConversationSessionModel.id == UUID(session_id))
    )
    assert session.candidate_id is not None
    
    candidate = await db_session.get(CandidateModel, session.candidate_id)
    assert candidate.full_name == LEAD_NAME
    assert candidate.cpf == UNKNOWN_CPF, f"Expected CPF {UNKNOWN_CPF}, got {candidate.cpf}"
    
    # Also verify hash and last4
    identity = derive_cpf_identity(UNKNOWN_CPF)
    assert candidate.cpf_hash == identity.cpf_hash
    assert candidate.cpf_last4 == identity.cpf_last4

    # 5. Verify security: lead_cpf is popped after use
    assert "lead_cpf" not in session.context_json

async def test_whatsapp_only_lead_no_cpf(client: AsyncClient, db_session: AsyncSession):
    await _location(db_session)
    
    # 1. Start conversation
    resp = await client.post("/api/v1/conversations", json={"channel": "web"})
    session_id = resp.json()["session_id"]
    
    # 2. Identify by WhatsApp
    await client.post(f"/api/v1/conversations/{session_id}/messages", json={"content": UNKNOWN_WHATSAPP})
    
    # 3. Drive through states (COLLECT_LEAD_WHATSAPP will be skipped)
    steps = ["Peritoró", "any_in_location", "Frentista", "night", "continue", "skip_resume", LEAD_NAME, "aceito", "confirm"]
    for content in steps:
        r = await client.post(f"/api/v1/conversations/{session_id}/messages", json={"content": content})
        assert r.status_code == 200
        
    # 4. Verify Candidate creation
    db_session.expire_all()
    session = await db_session.scalar(
        sa.select(ConversationSessionModel).where(ConversationSessionModel.id == UUID(session_id))
    )
    assert session.candidate_id is not None
    
    candidate = await db_session.get(CandidateModel, session.candidate_id)
    assert candidate.phone == UNKNOWN_WHATSAPP
    assert candidate.cpf is None
    assert candidate.cpf_hash is None
    assert candidate.cpf_last4 is None
