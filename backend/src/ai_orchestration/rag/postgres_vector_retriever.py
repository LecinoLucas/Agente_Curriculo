"""
PostgresVectorRetriever: Retriever vetorial usando PostgresVectorStore (AI-RAG-6).

Orquestra a geração de query embedding e a busca vetorial, retornando RetrievalResult.
Nunca gera resposta com LLM — apenas recupera chunks com score e fonte.
Nenhuma chamada a Gemini, Claude, OpenAI ou provider externo.

Fluxo:
    1. Valida query (vazio → warning controlado sem chamar provider).
    2. Gera query embedding via EmbeddingProviderContract.
    3. Chama VectorStoreContract.similarity_search com o vetor gerado.
    4. Retorna RetrievalResult com chunks, score, warnings — sem embedding bruto.

Fallback controlado:
    - Erro no provider → RetrievalResult vazio com warning "embedding_provider_error".
    - Erro no vector store → RetrievalResult vazio com warning "vector_store_error".
    - pgvector indisponível → propagado via warnings do vector store.
"""
from __future__ import annotations

from src.ai_orchestration.rag.document_repository_contract import (
    KnowledgeDocumentRepositoryContract,
)
from src.ai_orchestration.rag.embedding_contract import EmbeddingProviderContract
from src.ai_orchestration.rag.retriever_contract import RetrieverContract
from src.ai_orchestration.rag.schemas import (
    KnowledgeDocument,
    RetrievalQuery,
    RetrievalResult,
)
from src.ai_orchestration.rag.vector_store_contract import VectorStoreContract


class PostgresVectorRetriever(RetrieverContract):
    """Retriever vetorial sobre PostgresVectorStore com fallback controlado.

    Args:
        vector_store: Implementação de VectorStoreContract (ex: PostgresVectorStore).
        embedding_provider: Implementação de EmbeddingProviderContract para query embedding.
        document_repository: Repositório de documentos para get_document().
    """

    def __init__(
        self,
        vector_store: VectorStoreContract,
        embedding_provider: EmbeddingProviderContract,
        document_repository: KnowledgeDocumentRepositoryContract,
    ) -> None:
        self._vector_store = vector_store
        self._embedding_provider = embedding_provider
        self._document_repository = document_repository

    async def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Recupera chunks relevantes para a query via busca vetorial.

        Nunca propaga exceção — retorna warnings em caso de degradação.
        Não retorna embeddings brutos em nenhum campo do resultado.
        """
        if not query.query.strip():
            return RetrievalResult(
                query=query.query,
                chunks=[],
                total=0,
                warnings=["empty_query"],
            )

        # Gera embedding da query — falha vira warning controlado
        try:
            query_vector = await self._embedding_provider.embed_query(query.query)
            
            # Validação de dimensão da query
            if len(query_vector) != self._embedding_provider.dimensions:
                return RetrievalResult(
                    query=query.query,
                    chunks=[],
                    total=0,
                    warnings=["INVALID_QUERY_EMBEDDING_DIMENSION"],
                )
        except Exception as exc:
            return RetrievalResult(
                query=query.query,
                chunks=[],
                total=0,
                warnings=[
                    "embedding_provider_error: Não foi possível gerar embedding da consulta. "
                    "Verifique se Gemini está configurado ou use provider fake."
                ],
            )

        # Executa busca vetorial — falha vira warning controlado
        try:
            result = await self._vector_store.similarity_search(query, query_vector)
        except Exception as exc:
            return RetrievalResult(
                query=query.query,
                chunks=[],
                total=0,
                warnings=[f"vector_store_error: {type(exc).__name__}"],
            )

        return result

    async def get_document(self, document_id: str) -> KnowledgeDocument | None:
        """Recupera documento da base de conhecimento pelo ID.

        Returns None em caso de erro ou documento não encontrado.
        """
        try:
            return await self._document_repository.get_document(document_id)
        except Exception:
            return None
