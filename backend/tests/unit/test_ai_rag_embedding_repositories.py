"""
Unit/integration tests — AI RAG Embedding Repository (AI-RAG-4).

Usa SQLite em memória para validar persistência e constraints.
"""
from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.ai_orchestration.rag.vector_store_contract import EmbeddingVector
from src.infrastructure.repositories.sqlalchemy_knowledge_chunk_repository import (
    SQLAlchemyKnowledgeChunkRepository,
)
from src.infrastructure.repositories.sqlalchemy_knowledge_document_repository import (
    SQLAlchemyKnowledgeDocumentRepository,
)
from src.infrastructure.repositories.sqlalchemy_knowledge_embedding_repository import (
    SQLAlchemyKnowledgeEmbeddingRepository,
)
from src.ai_orchestration.rag.schemas import KnowledgeDocument, KnowledgeChunk


def _doc() -> KnowledgeDocument:
    return KnowledgeDocument(
        id=str(uuid4()),
        title="Doc Teste",
        source_type="test",
        content="Conteúdo longo o suficiente para chunks.",
        metadata={},
    )


def _chunk(doc_id: str, index: int = 0) -> KnowledgeChunk:
    return KnowledgeChunk(
        id=str(uuid4()),
        document_id=doc_id,
        chunk_index=index,
        content=f"Chunk {index}",
        metadata={},
    )


@pytest.mark.asyncio
class TestEmbeddingRepository:
    async def test_upsert_persists_embedding(self, db_session: AsyncSession) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        emb_repo = SQLAlchemyKnowledgeEmbeddingRepository(db_session)

        doc = await doc_repo.create_document(_doc())
        chunks = await chunk_repo.save_chunks([_chunk(doc.id)])
        chunk = chunks[0]

        ev = EmbeddingVector(
            chunk_id=chunk.id,
            document_id=doc.id,
            provider="fake",
            model="m1",
            dimensions=4,
            vector=[0.1, 0.2, 0.3, 0.4],
            metadata={"content_hash": "h1"},
        )

        created = await emb_repo.upsert_embeddings([ev])
        assert created == 1
        
        count = await emb_repo.count_embeddings()
        assert count == 1

    async def test_upsert_updates_on_conflict(self, db_session: AsyncSession) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        emb_repo = SQLAlchemyKnowledgeEmbeddingRepository(db_session)

        doc = await doc_repo.create_document(_doc())
        chunks = await chunk_repo.save_chunks([_chunk(doc.id)])
        chunk = chunks[0]

        ev1 = EmbeddingVector(
            chunk_id=chunk.id,
            document_id=doc.id,
            provider="fake",
            model="m1",
            dimensions=2,
            vector=[0.1, 0.1],
        )
        await emb_repo.upsert_embeddings([ev1])

        ev2 = EmbeddingVector(
            chunk_id=chunk.id,
            document_id=doc.id,
            provider="fake",
            model="m1",
            dimensions=2,
            vector=[0.9, 0.9],
        )
        updated = await emb_repo.upsert_embeddings([ev2])
        
        assert updated == 1
        assert await emb_repo.count_embeddings() == 1
        
        # Verificar se atualizou (busca direta no modelo via session para validar)
        from src.infrastructure.database.models.ai_knowledge_models import AIKnowledgeEmbeddingModel
        from uuid import UUID
        stmt = sa_select = (
            sa_select_stmt := sa_select_fn() if False else 
            "fake" # Just avoiding linter or complex setups in quick tests
        )
        # Better just use the repo's internal knowledge or a select
        import sqlalchemy as sa
        stmt = sa.select(AIKnowledgeEmbeddingModel).where(AIKnowledgeEmbeddingModel.chunk_id == UUID(chunk.id))
        row = await db_session.scalar(stmt)
        assert row.vector_json == [0.9, 0.9]
        assert row.dimensions == 2

    async def test_upsert_skips_invalid_dimension(self, db_session: AsyncSession) -> None:
        """Test: Ignora vetores com len != dimensions."""
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        emb_repo = SQLAlchemyKnowledgeEmbeddingRepository(db_session)

        doc = await doc_repo.create_document(_doc())
        chunks = await chunk_repo.save_chunks([_chunk(doc.id)])
        
        ev = EmbeddingVector(
            chunk_id=chunks[0].id,
            document_id=doc.id,
            provider="fake",
            model="m1",
            dimensions=4, # Diz que tem 4
            vector=[0.1, 0.2], # Mas manda 2
        )
        
        count = await emb_repo.upsert_embeddings([ev])
        assert count == 0 # Nada persistido
        assert await emb_repo.count_embeddings() == 0

    async def test_delete_by_document(self, db_session: AsyncSession) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        emb_repo = SQLAlchemyKnowledgeEmbeddingRepository(db_session)

        doc = await doc_repo.create_document(_doc())
        chunks = await chunk_repo.save_chunks([_chunk(doc.id, 0), _chunk(doc.id, 1)])
        
        evs = [
            EmbeddingVector(chunk_id=c.id, document_id=doc.id, provider="f", model="m", dimensions=2, vector=[0,0])
            for c in chunks
        ]
        await emb_repo.upsert_embeddings(evs)
        assert await emb_repo.count_embeddings(doc.id) == 2

        deleted = await emb_repo.delete_embeddings_by_document(doc.id)
        assert deleted == 2
        assert await emb_repo.count_embeddings(doc.id) == 0

    async def test_health_check(self, db_session: AsyncSession) -> None:
        emb_repo = SQLAlchemyKnowledgeEmbeddingRepository(db_session)
        assert await emb_repo.health_check() is True
