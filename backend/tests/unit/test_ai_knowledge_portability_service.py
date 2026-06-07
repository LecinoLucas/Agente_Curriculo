from __future__ import annotations

import pytest
import sqlalchemy as sa

from src.ai_orchestration.rag.fake_embedding_provider import FakeEmbeddingProvider
from src.application.services.ai_knowledge_admin_service import AIKnowledgeAdminService
from src.application.services.ai_knowledge_portability_service import (
    AIKnowledgePortabilityService,
    AIKnowledgePortabilityValidationError,
    PORTABLE_KNOWLEDGE_SCHEMA_VERSION,
    build_portable_bundle,
    build_portable_document_key,
)
from src.infrastructure.database.models.ai_knowledge_models import (
    AIKnowledgeChunkModel,
    AIKnowledgeDocumentModel,
    AIKnowledgeEmbeddingModel,
)


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "title": "Guia de Base de Conhecimento",
        "source_type": "internal_guide",
        "domain": "ai_assistant",
        "content": "Documento revisado para uso administrativo do assistente.",
        "visibility": "internal",
        "allowed_roles": ["ADMIN", "HR"],
        "sensitivity_level": "low",
        "tags": ["assistente", "base"],
        "status": "published",
        "reviewed_by": "QA Admin",
        "source_uri": "kb://guia-base-conhecimento",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_export_bundle_excludes_internal_fields(db_session) -> None:
    admin_service = AIKnowledgeAdminService(
        db_session, embedding_provider=FakeEmbeddingProvider(dimensions=8)
    )
    await admin_service.create_document(_payload())

    portability_service = AIKnowledgePortabilityService(db_session)
    bundle = await portability_service.export_bundle()

    assert bundle["schema_version"] == PORTABLE_KNOWLEDGE_SCHEMA_VERSION
    assert bundle["document_count"] == 1
    document = bundle["documents"][0]
    assert document["title"] == "Guia de Base de Conhecimento"
    assert "vector_json" not in str(document)
    assert "content_hash" not in document
    assert "metadata_json" not in document
    assert document["document_key"] == "source_uri:kb://guia-base-conhecimento"


@pytest.mark.asyncio
async def test_import_bundle_creates_document_without_embeddings_as_source_of_truth(db_session) -> None:
    portability_service = AIKnowledgePortabilityService(db_session)
    bundle = build_portable_bundle([_payload()])

    result = await portability_service.import_bundle(bundle)

    assert result.created == 1
    row = await db_session.scalar(sa.select(AIKnowledgeDocumentModel))
    assert row is not None
    assert row.indexing_status == "pending"
    assert row.content == _payload()["content"]
    assert row.metadata_json["document_key"] == "source_uri:kb://guia-base-conhecimento"


@pytest.mark.asyncio
async def test_import_bundle_updates_existing_document_and_clears_indexed_artifacts(db_session) -> None:
    admin_service = AIKnowledgeAdminService(
        db_session, embedding_provider=FakeEmbeddingProvider(dimensions=8)
    )
    created = await admin_service.create_document(_payload(content="Versão antiga indexada."))
    assert created["chunk_count"] > 0

    portability_service = AIKnowledgePortabilityService(db_session)
    bundle = build_portable_bundle([_payload(content="Versão nova do documento revisado.")])
    result = await portability_service.import_bundle(bundle)

    assert result.updated == 1
    row = await db_session.get(AIKnowledgeDocumentModel, created["id"])
    assert row is not None
    assert row.content == "Versão nova do documento revisado."
    assert row.indexing_status == "pending"

    chunk_count = await db_session.scalar(
        sa.select(sa.func.count(AIKnowledgeChunkModel.id)).where(
            AIKnowledgeChunkModel.document_id == created["id"]
        )
    )
    embedding_count = await db_session.scalar(
        sa.select(sa.func.count(AIKnowledgeEmbeddingModel.id))
    )
    assert chunk_count == 0
    assert embedding_count == 0


def test_build_portable_document_key_without_source_uri_uses_stable_fields() -> None:
    key = build_portable_document_key(
        {
            "title": "Política do Assistente",
            "domain": "AI_Assistant",
            "source_type": "Internal Guide",
        }
    )
    assert key == "title:politica-do-assistente|domain:ai_assistant|source_type:internal-guide"


def test_build_portable_bundle_blocks_sensitive_content() -> None:
    with pytest.raises(AIKnowledgePortabilityValidationError):
        build_portable_bundle([_payload(content="CPF 123.456.789-00")])
