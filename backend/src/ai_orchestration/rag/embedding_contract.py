"""
Embedding Provider Contract: Interface para geração de embeddings de texto.

Contrato abstrato para implementações futuras (AI-RAG-1b):
    - OpenAIEmbeddingProvider (text-embedding-3-small / text-embedding-3-large)
    - AnthropicEmbeddingProvider (quando disponível via API)
    - LocalEmbeddingProvider (para testes offline / sentence-transformers)

Nenhuma chamada real a modelos de linguagem neste módulo.

Separação de responsabilidades:
    - Este contrato APENAS gera vetores a partir de texto.
    - Persistência dos vetores: VectorStoreContract.
    - Uso dos vetores na busca: VectorStoreContract.similarity_search.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class EmbeddingBatch:
    """Resultado de uma chamada de embedding em lote.

    Campos:
        texts: Textos originais que foram embedded (para debug/auditoria).
        vectors: Um vetor por texto, na mesma ordem que `texts`.
        model: Modelo utilizado para geração.
        provider: Provider que gerou os embeddings.
        dimensions: Dimensões de cada vetor.
        total_tokens: Total de tokens processados (para billing/observabilidade).
    """

    texts: list[str]
    vectors: list[list[float]]
    model: str
    provider: str
    dimensions: int
    total_tokens: int = 0
    warnings: list[str] = field(default_factory=list)


class EmbeddingProviderContract(ABC):
    """Interface para provedores de embeddings de texto.

    Responsabilidades:
        - Gerar embeddings para lotes de texto (ingestão de chunks).
        - Gerar embedding para uma única query (similarity search).
        - Reportar provider, modelo e dimensões para auditoria.

    Notas de implementação:
        - `embed_texts` deve ser chamado com lotes de no máximo 2048 textos.
        - Textos vazios ou com apenas whitespace devem retornar vetor zero.
        - O caller é responsável por normalizar os textos antes de enviar.
        - Nunca truncar silenciosamente — levantar erro se o texto exceder o
          limite do modelo (ex: 8191 tokens para text-embedding-3-small).

    Implementações previstas (AI-RAG-1b):
        - OpenAIEmbeddingProvider
        - LocalEmbeddingProvider (modo offline para testes)
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Identificador do provider — ex: "openai", "anthropic", "local".

        Usado para auditoria e seleção de modelo no EmbeddingVector.
        """
        ...

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Modelo de embedding — ex: "text-embedding-3-small".

        Armazenado em EmbeddingVector.model para garantir reprodutibilidade.
        """
        ...

    @property
    @abstractmethod
    def dimensions(self) -> int:
        """Número de dimensões do vetor produzido.

        Ex: 1536 para text-embedding-3-small, 3072 para text-embedding-3-large.
        Deve ser consistente com a coluna `embedding vector(N)` no pgvector.
        """
        ...

    @abstractmethod
    async def embed_texts(self, texts: list[str]) -> EmbeddingBatch:
        """Gera embeddings para um lote de textos.

        Tipicamente usado na ingestão de chunks (AI-RAG-2).

        Args:
            texts: Lista de strings a embedded. Máximo 2048 por chamada.

        Returns:
            EmbeddingBatch com um vetor por texto, na mesma ordem.

        Raises:
            ValueError: Se `texts` estiver vazio.
            RuntimeError: Se o provider retornar erro (rate limit, auth, etc.).
        """
        ...

    @abstractmethod
    async def embed_query(self, text: str) -> list[float]:
        """Gera embedding para uma única string de consulta.

        Tipicamente usado na busca (VectorStoreContract.similarity_search).

        Args:
            text: Query do usuário ou AssistantRouter.

        Returns:
            Vetor de floats com `self.dimensions` elementos.

        Raises:
            ValueError: Se `text` estiver vazio.
            RuntimeError: Se o provider retornar erro.
        """
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Verifica se o provider está acessível e o modelo disponível.

        Returns:
            True se uma chamada teste de embedding retornar com sucesso.
            False caso contrário (sem chave de API, rate limit, etc.).
        """
        ...
