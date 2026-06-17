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

from src.ai_orchestration.rag.candidate_safe_retriever import CandidateSafeRetriever
from src.ai_orchestration.rag.in_memory_retriever import InMemoryRetriever
from src.ai_orchestration.rag.schemas import (
    KnowledgeChunk,
    RetrievalQuery,
)
from src.application.services.candidate_assistant_intent_service import CandidateIntent

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
