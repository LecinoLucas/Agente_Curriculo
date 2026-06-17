"""Tests — Candidate Bot MVP Safety Foundation.

Validates:
1. CandidateSafeRetriever returns public documents.
2. CandidateSafeRetriever blocks internal RH documents.
3. CandidateSafeRetriever blocks admin documents.
4. CandidateSafeRetriever blocks documents with no visibility set.
5. InMemoryRetriever still works without audience filter (staff RAG regression).
6. _intent_to_token maps talk_to_hr to "talk_to_hr" token.
7. _handle_talk_to_hr response does not promise a deadline.
8. ConversationHandoffModel fields: correct status, session_id, reason.
9. CandidateSafeRetriever appends candidate_safe_filter_applied warning.
"""
from __future__ import annotations

import pytest
import sqlalchemy as sa

from src.ai_orchestration.rag.candidate_safe_retriever import CandidateSafeRetriever
from src.ai_orchestration.rag.in_memory_retriever import InMemoryRetriever
from src.ai_orchestration.rag.schemas import (
    KnowledgeChunk,
    KnowledgeDocument,
    RetrievalQuery,
    RetrievalResult,
    RetrievedChunk,
)
from src.application.services.candidate_assistant_intent_service import CandidateIntent
from src.application.services.conversation_service import ConversationService
from src.core.settings import settings
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.conversation_handoff_model import (
    ConversationHandoffModel,
)
from src.infrastructure.database.models.conversation_model import (
    ConversationMessageModel,
    ConversationSessionModel,
)
from src.infrastructure.database.models.operational_master_model import LocationGroupModel
from src.infrastructure.repositories.sqlalchemy_candidate_application_repository import (
    SQLAlchemyCandidateApplicationRepository,
)
from src.infrastructure.repositories.sqlalchemy_conversation_repository import (
    SQLAlchemyConversationRepository,
)
from src.infrastructure.repositories.sqlalchemy_resume_repository import (
    SQLAlchemyResumeRepository,
)
from src.interface.api.schemas.conversation_schemas import (
    ConversationCreateRequest,
    ConversationMessageCreateRequest,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _chunk(
    chunk_id: str,
    content: str,
    *,
    visibility: str | None = None,
    audience: str | None = None,
    source_type: str = "faq",
) -> KnowledgeChunk:
    meta: dict = {"source_type": source_type}
    if visibility is not None:
        meta["visibility"] = visibility
    if audience is not None:
        meta["audience"] = audience
    return KnowledgeChunk(
        id=chunk_id,
        document_id="doc-1",
        chunk_index=0,
        content=content,
        metadata=meta,
        source_title="Test",
    )


_CHUNK_PUBLIC = _chunk("pub", "benefícios vale refeição", visibility="public", audience="candidate")
_CHUNK_INTERNAL_RH = _chunk("rh", "critérios de descarte por histórico criminal", visibility="internal", source_type="rh_policy")
_CHUNK_ADMIN = _chunk("adm", "política salarial interna admin", visibility="internal", source_type="internal_guide")
_CHUNK_NO_VISIBILITY = _chunk("noviz", "algo sem visibilidade definida")


def _document(
    document_id: str,
    *,
    visibility: str | None = None,
    audience: str | None = None,
) -> KnowledgeDocument:
    metadata: dict[str, str] = {}
    if visibility is not None:
        metadata["visibility"] = visibility
    if audience is not None:
        metadata["audience"] = audience
    return KnowledgeDocument(
        id=document_id,
        title=f"Document {document_id}",
        source_type="faq",
        content=f"content for {document_id}",
        metadata=metadata,
    )


def _conversation_service(session) -> ConversationService:
    return ConversationService(
        repository=SQLAlchemyConversationRepository(session),
        session=session,
        application_repository=SQLAlchemyCandidateApplicationRepository(session),
        resume_repository=SQLAlchemyResumeRepository(session),
    )


# ---------------------------------------------------------------------------
# Part 1–4: RAG audience filtering via CandidateSafeRetriever
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_candidate_safe_retriever_returns_public_document():
    """Documento público para candidato é retornado pelo wrapper seguro."""
    inner = InMemoryRetriever(chunks=[_CHUNK_PUBLIC, _CHUNK_INTERNAL_RH])
    safe = CandidateSafeRetriever(inner)
    result = await safe.retrieve(RetrievalQuery(query="benefícios"))
    chunk_ids = [r.chunk.id for r in result.chunks]
    assert "pub" in chunk_ids


@pytest.mark.asyncio
async def test_candidate_safe_retriever_blocks_internal_rh_document():
    """Documento interno de RH NÃO é retornado pelo wrapper de candidato."""
    inner = InMemoryRetriever(chunks=[_CHUNK_PUBLIC, _CHUNK_INTERNAL_RH])
    safe = CandidateSafeRetriever(inner)
    result = await safe.retrieve(RetrievalQuery(query="critérios descarte"))
    chunk_ids = [r.chunk.id for r in result.chunks]
    assert "rh" not in chunk_ids


@pytest.mark.asyncio
async def test_candidate_safe_retriever_blocks_admin_document():
    """Documento admin/interno NÃO é retornado pelo wrapper de candidato."""
    inner = InMemoryRetriever(chunks=[_CHUNK_PUBLIC, _CHUNK_ADMIN])
    safe = CandidateSafeRetriever(inner)
    result = await safe.retrieve(RetrievalQuery(query="política salarial"))
    chunk_ids = [r.chunk.id for r in result.chunks]
    assert "adm" not in chunk_ids


@pytest.mark.asyncio
async def test_candidate_safe_retriever_blocks_no_visibility_document():
    """Documento sem visibility definida NÃO aparece no contexto público do candidato."""
    inner = InMemoryRetriever(chunks=[_CHUNK_PUBLIC, _CHUNK_NO_VISIBILITY])
    safe = CandidateSafeRetriever(inner)
    result = await safe.retrieve(RetrievalQuery(query="algo"))
    chunk_ids = [r.chunk.id for r in result.chunks]
    assert "noviz" not in chunk_ids


@pytest.mark.asyncio
async def test_candidate_safe_retriever_adds_warning():
    """Wrapper adiciona 'candidate_safe_filter_applied' nos warnings."""
    inner = InMemoryRetriever(chunks=[_CHUNK_PUBLIC])
    safe = CandidateSafeRetriever(inner)
    result = await safe.retrieve(RetrievalQuery(query="benefícios"))
    assert "candidate_safe_filter_applied" in result.warnings


@pytest.mark.asyncio
async def test_candidate_safe_retriever_filters_unsafe_chunks_even_if_inner_ignores_filters():
    """Mesmo se o retriever interno ignorar filtros, o wrapper remove chunks inseguros."""

    class UnsafeInnerRetriever:
        async def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
            return RetrievalResult(
                query=query.query,
                chunks=[
                    RetrievedChunk(chunk=_CHUNK_PUBLIC, score=0.9),
                    RetrievedChunk(chunk=_CHUNK_INTERNAL_RH, score=0.8),
                ],
                total=2,
                warnings=[],
            )

        async def get_document(self, document_id: str):
            return None

    safe = CandidateSafeRetriever(UnsafeInnerRetriever())
    result = await safe.retrieve(RetrievalQuery(query="benefícios"))

    chunk_ids = [r.chunk.id for r in result.chunks]
    assert chunk_ids == ["pub"]
    assert "candidate_safe_chunks_filtered" in result.warnings


@pytest.mark.asyncio
async def test_candidate_safe_retriever_get_document_blocks_unsafe_direct_lookup():
    """Lookup direto por document_id também respeita o filtro público/candidato."""
    inner = InMemoryRetriever(
        chunks=[_CHUNK_PUBLIC],
        documents={
            "pub-doc": _document("pub-doc", visibility="public", audience="candidate"),
            "rh-doc": _document("rh-doc", visibility="internal"),
            "adm-doc": _document("adm-doc", visibility="public", audience="admin"),
            "noviz-doc": _document("noviz-doc"),
        },
    )
    safe = CandidateSafeRetriever(inner)

    public_document = await safe.get_document("pub-doc")

    assert public_document is not None
    assert public_document.id == "pub-doc"
    assert await safe.get_document("rh-doc") is None
    assert await safe.get_document("adm-doc") is None
    assert await safe.get_document("noviz-doc") is None


# ---------------------------------------------------------------------------
# Part 9 (regression): Staff RAG continues working without audience filter
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_internal_retriever_staff_rag_regression():
    """InMemoryRetriever sem wrapper retorna documentos internos para o staff."""
    inner = InMemoryRetriever(chunks=[_CHUNK_INTERNAL_RH, _CHUNK_ADMIN, _CHUNK_PUBLIC])
    # Staff RAG uses the retriever directly, no CandidateSafeRetriever wrapper
    result = await inner.retrieve(RetrievalQuery(query="critérios política"))
    chunk_ids = [r.chunk.id for r in result.chunks]
    # Both internal chunks must appear for staff
    assert "rh" in chunk_ids
    assert "adm" in chunk_ids


@pytest.mark.asyncio
async def test_internal_retriever_source_type_filter_unchanged():
    """Filtro source_type original do InMemoryRetriever continua funcionando."""
    inner = InMemoryRetriever(
        chunks=[
            _chunk("faq1", "benefícios funcionários", visibility="public", audience="candidate", source_type="faq"),
            _chunk("rh1", "política de admissão rh", visibility="internal", source_type="rh_policy"),
        ]
    )
    result = await inner.retrieve(
        RetrievalQuery(query="benefícios política", filters={"source_type": "faq"})
    )
    chunk_ids = [r.chunk.id for r in result.chunks]
    assert "faq1" in chunk_ids
    assert "rh1" not in chunk_ids


# ---------------------------------------------------------------------------
# Part 6: _intent_to_token maps talk_to_hr
# ---------------------------------------------------------------------------

def test_intent_to_token_maps_talk_to_hr_from_any_state():
    """_intent_to_token retorna 'talk_to_hr' para intent talk_to_hr em qualquer estado."""
    from src.application.services.conversation_service import ConversationService

    intent = CandidateIntent(intent="talk_to_hr", confidence=0.9)
    for state in ("CHOOSE_LOCATION", "CHOOSE_FUNCTION", "COLLECT_RESUME", "CONFIRM_APPLICATION"):
        token = ConversationService._intent_to_token(state, intent)
        assert token == "talk_to_hr", f"Expected 'talk_to_hr' for state={state}, got {token!r}"


# ---------------------------------------------------------------------------
# Part 7: talk_to_hr response does not promise a deadline
# ---------------------------------------------------------------------------

def test_talk_to_hr_message_does_not_promise_deadline():
    """A mensagem de handoff não promete prazo ao candidato."""
    from src.application.services.conversation_service import _TALK_TO_HR_MESSAGE

    forbidden_patterns = ["horas", "dias", "minutos", "amanhã", "hoje", "prazo", "48h", "24h"]
    lowered = _TALK_TO_HR_MESSAGE.lower()
    for pattern in forbidden_patterns:
        assert pattern not in lowered, (
            f"Mensagem de handoff promete prazo com '{pattern}': {_TALK_TO_HR_MESSAGE!r}"
        )


# ---------------------------------------------------------------------------
# Part 8: ConversationHandoffModel — correct fields
# ---------------------------------------------------------------------------

def test_conversation_handoff_model_defaults():
    """ConversationHandoffModel pode ser instanciado com os campos mínimos obrigatórios."""
    from uuid import uuid4

    from src.infrastructure.database.models.conversation_handoff_model import (
        HANDOFF_STATUSES,
        ConversationHandoffModel,
    )

    session_id = uuid4()
    handoff = ConversationHandoffModel(
        session_id=session_id,
        reason="candidate_requested",
        status="pending",
    )
    assert handoff.session_id == session_id
    assert handoff.status == "pending"
    assert handoff.reason == "candidate_requested"
    assert handoff.resolved_at is None
    assert handoff.assigned_to_user_id is None
    assert "pending" in HANDOFF_STATUSES
    assert "resolved" in HANDOFF_STATUSES


@pytest.mark.asyncio
async def test_talk_to_hr_creates_pending_handoff_and_persists_intent(db_session):
    """ConversationService cria handoff rastreável e persiste o intent no inbound."""
    candidate = CandidateModel(full_name="Pessoa Candidata")
    db_session.add(candidate)
    await db_session.flush()
    service = _conversation_service(db_session)

    started = await service.create_session(
        ConversationCreateRequest(channel="web", candidate_id=candidate.id)
    )
    turn = await service.receive_message(
        started.session_id,
        ConversationMessageCreateRequest(content="talk_to_hr"),
    )

    handoff = await db_session.scalar(
        sa.select(ConversationHandoffModel).where(
            ConversationHandoffModel.session_id == started.session_id
        )
    )
    assert handoff is not None
    assert handoff.status == "pending"
    assert handoff.candidate_id == candidate.id
    assert handoff.reason == "candidate_requested"
    assert handoff.metadata_json["state_at_request"] == "IDENTIFY"
    assert handoff.metadata_json["message_id"]

    persisted_session = await db_session.scalar(
        sa.select(ConversationSessionModel).where(
            ConversationSessionModel.id == started.session_id
        )
    )
    assert persisted_session is not None
    assert persisted_session.context_json["handoff_requested"] is True

    candidate_messages = (
        await db_session.execute(
            sa.select(ConversationMessageModel)
            .where(
                ConversationMessageModel.session_id == started.session_id,
                ConversationMessageModel.role == "candidate",
            )
            .order_by(
                ConversationMessageModel.created_at.asc(),
                ConversationMessageModel.id.asc(),
            )
        )
    ).scalars().all()
    assert len(candidate_messages) == 1
    assert candidate_messages[0].interpreted_intent == "talk_to_hr"

    assert turn.handoff_required is True
    assert turn.current_state == "IDENTIFY"
    assert "prazo" not in turn.assistant_message.lower()


@pytest.mark.asyncio
async def test_talk_to_hr_handoff_is_idempotent_for_same_pending_session(db_session):
    """Segundo pedido talk_to_hr na mesma sessão não duplica handoff pendente."""
    candidate = CandidateModel(full_name="Pessoa Candidata")
    db_session.add(candidate)
    await db_session.flush()
    service = _conversation_service(db_session)

    started = await service.create_session(
        ConversationCreateRequest(channel="web", candidate_id=candidate.id)
    )

    first_turn = await service.receive_message(
        started.session_id,
        ConversationMessageCreateRequest(content="talk_to_hr"),
    )
    second_turn = await service.receive_message(
        started.session_id,
        ConversationMessageCreateRequest(content="talk_to_hr"),
    )

    pending_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(ConversationHandoffModel).where(
            ConversationHandoffModel.session_id == started.session_id,
            ConversationHandoffModel.status == "pending",
        )
    )
    assert pending_count == 1
    assert first_turn.handoff_required is True
    assert second_turn.handoff_required is True


@pytest.mark.asyncio
async def test_should_handoff_signal_creates_real_pending_handoff(db_session, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_INTENT_AI_ENABLED", True)
    candidate = CandidateModel(full_name="Pessoa Candidata")
    db_session.add(candidate)
    await db_session.flush()
    service = _conversation_service(db_session)

    async def _fake_interpret(**kwargs):
        return CandidateIntent(
            intent="unclear",
            confidence=0.4,
            should_handoff=True,
            talk_to_hr_message="Vou encaminhar seu atendimento para o RH.",
        )

    monkeypatch.setattr(service._intent_service, "interpret", _fake_interpret)

    started = await service.create_session(
        ConversationCreateRequest(channel="web", candidate_id=candidate.id)
    )
    await service.receive_message(
        started.session_id,
        ConversationMessageCreateRequest(content="cpf"),
    )
    turn = await service.receive_message(
        started.session_id,
        ConversationMessageCreateRequest(content="preciso falar com uma pessoa"),
    )

    pending_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(ConversationHandoffModel).where(
            ConversationHandoffModel.session_id == started.session_id,
            ConversationHandoffModel.status == "pending",
        )
    )
    assert pending_count == 1
    assert turn.handoff_required is True
    assert turn.assistant_message == "Vou encaminhar seu atendimento para o RH."


@pytest.mark.asyncio
async def test_should_handoff_signal_is_idempotent(db_session, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_INTENT_AI_ENABLED", True)
    candidate = CandidateModel(full_name="Pessoa Candidata")
    db_session.add(candidate)
    await db_session.flush()
    service = _conversation_service(db_session)

    async def _fake_interpret(**kwargs):
        return CandidateIntent(
            intent="talk_to_hr",
            confidence=0.8,
            should_handoff=True,
            talk_to_hr_message="Vou encaminhar seu atendimento para o RH.",
        )

    monkeypatch.setattr(service._intent_service, "interpret", _fake_interpret)

    started = await service.create_session(
        ConversationCreateRequest(channel="web", candidate_id=candidate.id)
    )
    await service.receive_message(
        started.session_id,
        ConversationMessageCreateRequest(content="cpf"),
    )
    await service.receive_message(
        started.session_id,
        ConversationMessageCreateRequest(content="falar com rh"),
    )
    second_turn = await service.receive_message(
        started.session_id,
        ConversationMessageCreateRequest(content="ainda preciso de ajuda"),
    )

    pending_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(ConversationHandoffModel).where(
            ConversationHandoffModel.session_id == started.session_id,
            ConversationHandoffModel.status == "pending",
        )
    )
    assert pending_count == 1
    assert second_turn.handoff_required is True


@pytest.mark.asyncio
async def test_talk_to_hr_unsafe_message_is_replaced_with_fallback(db_session, monkeypatch):
    from src.application.services.conversation_service import _TALK_TO_HR_MESSAGE

    monkeypatch.setattr(settings, "ASSISTANT_INTENT_AI_ENABLED", True)
    candidate = CandidateModel(full_name="Pessoa Candidata")
    db_session.add(candidate)
    await db_session.flush()
    service = _conversation_service(db_session)

    async def _fake_interpret(**kwargs):
        return CandidateIntent(
            intent="talk_to_hr",
            confidence=0.9,
            should_handoff=True,
            talk_to_hr_message="Em 24 horas o RH aprova sua candidatura. Envie seu CPF.",
        )

    monkeypatch.setattr(service._intent_service, "interpret", _fake_interpret)

    started = await service.create_session(
        ConversationCreateRequest(channel="web", candidate_id=candidate.id)
    )
    await service.receive_message(
        started.session_id,
        ConversationMessageCreateRequest(content="cpf"),
    )
    turn = await service.receive_message(
        started.session_id,
        ConversationMessageCreateRequest(content="preciso do rh"),
    )

    assert turn.assistant_message == _TALK_TO_HR_MESSAGE


@pytest.mark.asyncio
async def test_safe_user_message_is_used_for_unclear_fallback(db_session, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_INTENT_AI_ENABLED", True)
    location = LocationGroupModel(
        name="Goiânia",
        normalized_name="goiânia".casefold(),
        state="GO",
        city="Goiânia",
        type="city",
    )
    candidate = CandidateModel(full_name="Pessoa Candidata")
    db_session.add_all([location, candidate])
    await db_session.flush()
    service = _conversation_service(db_session)

    async def _fake_interpret(**kwargs):
        return CandidateIntent(
            intent="unclear",
            confidence=0.4,
            safe_user_message="Posso te ajudar melhor se você me disser a cidade desejada.",
        )

    monkeypatch.setattr(service._intent_service, "interpret", _fake_interpret)

    started = await service.create_session(
        ConversationCreateRequest(channel="web", candidate_id=candidate.id)
    )
    await service.receive_message(
        started.session_id,
        ConversationMessageCreateRequest(content="cpf"),
    )
    turn = await service.receive_message(
        started.session_id,
        ConversationMessageCreateRequest(content="não sei explicar"),
    )

    assert turn.current_state == "CHOOSE_LOCATION"
    assert turn.assistant_message == (
        "Posso te ajudar melhor se você me disser a cidade desejada."
    )


@pytest.mark.asyncio
async def test_unsafe_safe_user_message_falls_back_to_normal_flow(db_session, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_INTENT_AI_ENABLED", True)
    location = LocationGroupModel(
        name="Goiânia",
        normalized_name="goiânia".casefold(),
        state="GO",
        city="Goiânia",
        type="city",
    )
    candidate = CandidateModel(full_name="Pessoa Candidata")
    db_session.add_all([location, candidate])
    await db_session.flush()
    service = _conversation_service(db_session)

    async def _fake_interpret(**kwargs):
        return CandidateIntent(
            intent="unclear",
            confidence=0.4,
            safe_user_message="Me envie seu CPF e salário que aprovo hoje.",
        )

    monkeypatch.setattr(service._intent_service, "interpret", _fake_interpret)

    started = await service.create_session(
        ConversationCreateRequest(channel="web", candidate_id=candidate.id)
    )
    await service.receive_message(
        started.session_id,
        ConversationMessageCreateRequest(content="cpf"),
    )
    turn = await service.receive_message(
        started.session_id,
        ConversationMessageCreateRequest(content="não sei explicar"),
    )

    assert turn.current_state == "CHOOSE_LOCATION"
    assert "cpf" not in turn.assistant_message.lower()
    assert "aprovo hoje" not in turn.assistant_message.lower()
    assert "não encontrei essa localidade" in turn.assistant_message.lower()
