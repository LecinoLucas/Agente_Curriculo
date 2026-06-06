"""
Text Chunker: Implementação determinística de chunking por caracteres.

Divide texto plano em chunks de tamanho controlado com overlap opcional.
Nenhum LLM. Nenhum embedding. Nenhum I/O externo.

Estratégia:
  1. Split por parágrafos (\\n\\n).
  2. Paragrafos > max_chars são sub-divididos por _force_split.
  3. Pedaços são agrupados em chunks com sobreposição (overlap) para preservar contexto.
  4. token_count é estimado como len(content) // 4 (≈ 4 chars/token, sem tokenizador).
"""
from __future__ import annotations

import re

from src.ai_orchestration.rag.chunking_contract import Chunk, ChunkingContract


class TextChunker(ChunkingContract):
    """Chunker determinístico por tamanho de caracteres com overlap.

    Args:
        max_chars: Tamanho máximo de cada chunk em caracteres (padrão: 2000).
        overlap_chars: Quantidade de caracteres de overlap entre chunks consecutivos
            para preservar contexto entre divisões (padrão: 100).
    """

    def __init__(self, max_chars: int = 2000, overlap_chars: int = 100) -> None:
        self.max_chars = max(1, max_chars)
        self.overlap_chars = max(0, min(overlap_chars, max_chars // 2))

    def chunk(self, text: str, metadata: dict | None = None) -> list[Chunk]:
        """Divide texto em chunks ordenados por posição.

        Args:
            text: Texto completo a ser dividido.
            metadata: Metadados base herdados por todos os chunks.

        Returns:
            Lista de Chunk com chunk_index sequencial (0-based).
            Lista vazia se text for vazio ou apenas espaços.
        """
        text = text.strip()
        if not text:
            return []

        raw_pieces = self._split_text(text)
        valid_pieces = [p.strip() for p in raw_pieces if p.strip()]
        base_meta = dict(metadata or {})

        result: list[Chunk] = []
        for i, piece in enumerate(valid_pieces):
            meta = {**base_meta, "char_count": len(piece)}
            result.append(
                Chunk(
                    content=piece,
                    chunk_index=i,
                    token_count=max(1, len(piece) // 4),
                    metadata=meta,
                )
            )
        return result

    # ── Internals ──────────────────────────────────────────────────────────────

    def _split_text(self, text: str) -> list[str]:
        """Divide o texto em pedaços de até max_chars, com overlap."""
        if len(text) <= self.max_chars:
            return [text]

        # Normalizar: dividir por parágrafo e sub-dividir parágrafos longos
        paragraphs = [p.strip() for p in re.split(r"\n\n+", text) if p.strip()]
        if not paragraphs:
            return self._force_split(text)

        normalized: list[str] = []
        for para in paragraphs:
            if len(para) > self.max_chars:
                normalized.extend(self._force_split(para))
            else:
                normalized.append(para)

        # Agrupar pedaços em chunks respeitando max_chars
        chunks: list[str] = []
        buffer = ""

        for piece in normalized:
            if not buffer:
                buffer = piece
            elif len(buffer) + 2 + len(piece) <= self.max_chars:
                buffer = buffer + "\n\n" + piece
            else:
                chunks.append(buffer)
                overlap = buffer[-self.overlap_chars :].strip() if self.overlap_chars else ""
                buffer = (overlap + " " + piece).strip() if overlap else piece

        if buffer:
            chunks.append(buffer)

        return chunks

    def _force_split(self, text: str) -> list[str]:
        """Divide texto por limite de caracteres quando não há parágrafos."""
        step = max(1, self.max_chars - self.overlap_chars)
        pieces: list[str] = []
        start = 0
        while start < len(text):
            end = min(start + self.max_chars, len(text))
            piece = text[start:end].strip()
            if piece:
                pieces.append(piece)
            if end >= len(text):
                break
            start += step
        return pieces
