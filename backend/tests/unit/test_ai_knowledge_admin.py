from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.ai_orchestration.rag.fake_embedding_provider import FakeEmbeddingProvider
from src.ai_orchestration.rag.postgres_vector_retriever import PostgresVectorRetriever
from src.ai_orchestration.rag.schemas import RetrievalQuery
from src.application.services.ai_knowledge_admin_service import (
    AIKnowledgeAdminService,
    AIKnowledgeValidationError,
)
from src.domain.entities.user import UserRole
from src.infrastructure.repositories.postgres_vector_store import PostgresVectorStore
from src.infrastructure.repositories.sqlalchemy_knowledge_document_repository import (
    SQLAlchemyKnowledgeDocumentRepository,
)
from src.infrastructure.security.password_service import hash_password


async def _create_user(
    db_session: AsyncSession,
    *,
    email: str,
    role: UserRole,
    password: str = "password123",
) -> None:
    from src.infrastructure.database.models.user_model import UserModel

    user = UserModel(
        id=uuid4(),
        email=email,
        full_name="Knowledge Admin",
        role=role.value,
        status="active",
        password_hash=hash_password(password),
    )
    db_session.add(user)
    await db_session.commit()


async def _login(client: AsyncClient, email: str, password: str = "password123") -> dict[str, str]:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _payload(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "title": "Política de uso do assistente",
        "source_type": "internal_guide",
        "domain": "ai_assistant",
        "content": (
            "O assistente deve responder apenas com base em políticas internas publicadas "
            "e sempre citar fontes verificáveis no contexto administrativo."
        ),
        "visibility": "internal",
        "allowed_roles": ["ADMIN", "HR"],
        "sensitivity_level": "low",
        "tags": ["assistente", "politica"],
        "status": "published",
        "reviewed_by": "QA Admin",
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_create_document_safe_and_searchable_after_index(
    db_session: AsyncSession,
) -> None:
    service = AIKnowledgeAdminService(db_session, embedding_provider=FakeEmbeddingProvider(dimensions=8))
    created = await service.create_document(_payload())

    assert created["status"] == "published"
    assert created["indexing_status"] == "indexed"
    assert created["chunk_count"] > 0
    assert created["chunks"]
    assert "content_hash" not in created["content"]

    retriever = PostgresVectorRetriever(
        vector_store=PostgresVectorStore(db_session),
        embedding_provider=FakeEmbeddingProvider(dimensions=8),
        document_repository=SQLAlchemyKnowledgeDocumentRepository(db_session),
    )
    result = await retriever.retrieve(RetrievalQuery(query="política do assistente", limit=5))

    assert result.total >= 1
    assert any(chunk.chunk.document_id == str(created["id"]) for chunk in result.chunks)


@pytest.mark.asyncio
async def test_create_document_blocks_cpf(db_session: AsyncSession) -> None:
    service = AIKnowledgeAdminService(db_session, embedding_provider=FakeEmbeddingProvider(dimensions=8))

    with pytest.raises(AIKnowledgeValidationError):
        await service.create_document(_payload(content="CPF 123.456.789-10 deve ser enviado para auditoria."))


@pytest.mark.asyncio
async def test_create_document_blocks_email(db_session: AsyncSession) -> None:
    service = AIKnowledgeAdminService(db_session, embedding_provider=FakeEmbeddingProvider(dimensions=8))

    with pytest.raises(AIKnowledgeValidationError):
        await service.create_document(
            _payload(content="Envie a documentação para pessoa@empresa.com antes de publicar.")
        )


@pytest.mark.asyncio
async def test_reindex_updates_chunks_and_preserves_safe_output(db_session: AsyncSession) -> None:
    service = AIKnowledgeAdminService(db_session, embedding_provider=FakeEmbeddingProvider(dimensions=8))
    created = await service.create_document(_payload())

    updated = await service.update_document(
        str(created["id"]),
        {
            "content": (
                "O assistente deve responder com fontes aprovadas, sem prompt bruto e com "
                "trechos resumidos para o painel administrativo."
            )
        },
    )
    details = await service.get_document(str(created["id"]))

    assert updated["indexing_status"] == "indexed"
    assert details["chunk_count"] > 0
    assert all("vector_json" not in chunk["content_preview"] for chunk in details["chunks"])


@pytest.mark.asyncio
async def test_archive_removes_document_from_search(db_session: AsyncSession) -> None:
    service = AIKnowledgeAdminService(db_session, embedding_provider=FakeEmbeddingProvider(dimensions=8))
    created = await service.create_document(_payload(title="Manual do pipeline"))

    retriever = PostgresVectorRetriever(
        vector_store=PostgresVectorStore(db_session),
        embedding_provider=FakeEmbeddingProvider(dimensions=8),
        document_repository=SQLAlchemyKnowledgeDocumentRepository(db_session),
    )
    before = await retriever.retrieve(RetrievalQuery(query="manual do pipeline", limit=5))
    assert any(chunk.chunk.document_id == str(created["id"]) for chunk in before.chunks)

    archived = await service.archive_document(str(created["id"]))
    after = await retriever.retrieve(RetrievalQuery(query="manual do pipeline", limit=5))

    assert archived["status"] == "archived"
    assert not any(chunk.chunk.document_id == str(created["id"]) for chunk in after.chunks)


@pytest.mark.asyncio
async def test_create_document_with_broken_embedding_provider_returns_friendly_error(
    db_session: AsyncSession,
) -> None:
    class BrokenProvider(FakeEmbeddingProvider):
        async def embed_texts(self, texts: list[str]):  # type: ignore[override]
            raise RuntimeError("provider indisponível")

    service = AIKnowledgeAdminService(db_session, embedding_provider=BrokenProvider(dimensions=8))
    created = await service.create_document(_payload(title="Falha controlada"))

    assert created["indexing_status"] == "failed"
    assert created["last_index_error"] == (
        "Não foi possível gerar embedding da consulta. Verifique se Gemini está configurado ou use provider fake."
    )


@pytest.mark.asyncio
async def test_api_knowledge_admin_requires_admin(client: AsyncClient) -> None:
    response = await client.get("/api/v1/ai/knowledge/documents")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_api_knowledge_admin_crud_flow(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _create_user(db_session, email="knowledge-admin@example.com", role=UserRole.ADMIN)
    headers = await _login(client, "knowledge-admin@example.com")

    monkeypatch.setattr(
        "src.interface.api.routers.admin_ai_knowledge.get_embedding_provider",
        lambda: FakeEmbeddingProvider(dimensions=8),
    )

    create_response = await client.post(
        "/api/v1/ai/knowledge/documents",
        headers=headers,
        json=_payload(),
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["status"] == "published"
    assert "content_hash" not in str(created)
    assert "vector_json" not in str(created)
    assert "embedding" not in str(created)

    list_response = await client.get("/api/v1/ai/knowledge/documents", headers=headers)
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed["total"] == 1
    assert listed["items"][0]["title"] == _payload()["title"]

    patch_response = await client.patch(
        f"/api/v1/ai/knowledge/documents/{created['id']}",
        headers=headers,
        json={"title": "Política revisada", "tags": ["assistente", "revisado"]},
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["title"] == "Política revisada"

    reindex_response = await client.post(
        f"/api/v1/ai/knowledge/documents/{created['id']}/reindex",
        headers=headers,
    )
    assert reindex_response.status_code == 200
    assert reindex_response.json()["ok"] is True
    assert reindex_response.json()["indexing_status"] == "indexed"

    archive_response = await client.post(
        f"/api/v1/ai/knowledge/documents/{created['id']}/archive",
        headers=headers,
    )
    assert archive_response.status_code == 200
    assert archive_response.json()["status"] == "archived"


@pytest.mark.asyncio
async def test_api_knowledge_admin_validation_error(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _create_user(db_session, email="knowledge-admin-2@example.com", role=UserRole.ADMIN)
    headers = await _login(client, "knowledge-admin-2@example.com")

    monkeypatch.setattr(
        "src.interface.api.routers.admin_ai_knowledge.get_embedding_provider",
        lambda: FakeEmbeddingProvider(dimensions=8),
    )

    response = await client.post(
        "/api/v1/ai/knowledge/documents",
        headers=headers,
        json=_payload(content="Contato do responsável: rh@empresa.com para suporte interno."),
    )
    assert response.status_code == 422
    assert "padrão sensível" in response.json()["detail"]
