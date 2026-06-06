"""
Fake Embedding Provider: Implementação determinística para testes sem chamadas externas.

Gera vetores baseados no hash do texto (SHA-256) para garantir reprodutibilidade.
Nenhuma chamada para Gemini, Claude, OpenAI ou qualquer provider real.
"""
from __future__ import annotations

import hashlib
import struct

from src.ai_orchestration.rag.embedding_contract import (
    EmbeddingBatch,
    EmbeddingProviderContract,
)


class FakeEmbeddingProvider(EmbeddingProviderContract):
    """Provedor fake determinístico para RAG (AI-RAG-4).

    Gera vetores de tamanho fixo onde o conteúdo do vetor depende apenas do texto.
    Ideal para testes unitários e desenvolvimento offline.
    """

    def __init__(self, dimensions: int = 16):
        self._dimensions = dimensions
        self._provider_name = "fake"
        self._model_name = "fake-deterministic-v1"

    @property
    def provider_name(self) -> str:
        return self._provider_name

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed_texts(self, texts: list[str]) -> EmbeddingBatch:
        """Gera embeddings determinísticos para um lote de textos."""
        if not texts:
            raise ValueError("texts cannot be empty")

        vectors = [self._generate_vector(t) for t in texts]
        
        return EmbeddingBatch(
            texts=texts,
            vectors=vectors,
            model=self._model_name,
            provider=self._provider_name,
            dimensions=self._dimensions,
            total_tokens=sum(len(t.split()) for t in texts), # Estimativa simples
        )

    async def embed_query(self, text: str) -> list[float]:
        """Gera embedding determinístico para uma única query."""
        if not text:
            raise ValueError("text cannot be empty")
        return self._generate_vector(text)

    async def health_check(self) -> bool:
        """Sempre disponível, pois é local e determinístico."""
        return True

    def _generate_vector(self, text: str) -> list[float]:
        """Gera um vetor de floats a partir do hash SHA-256 do texto."""
        if not text.strip():
            return [0.0] * self._dimensions

        # SHA-256 gera 32 bytes
        hash_bytes = hashlib.sha256(text.encode("utf-8")).digest()
        
        # Expandimos ou truncamos para preencher as dimensões desejadas
        # Usamos struct para converter bytes em floats determinísticos
        floats = []
        for i in range(self._dimensions):
            # Usamos o i-ésimo byte (com wrap around se necessário) para derivar um float
            byte_idx = (i * 4) % len(hash_bytes)
            chunk = hash_bytes[byte_idx : byte_idx + 4]
            if len(chunk) < 4:
                # Padding se chegarmos ao fim do hash
                chunk = (chunk + hash_bytes)[:4]
            
            # Converte para float entre -1.0 e 1.0
            val = struct.unpack("I", chunk)[0]
            floats.append((val / 4294967295.0) * 2 - 1.0)
            
        return floats
