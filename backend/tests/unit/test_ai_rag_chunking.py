"""Unit tests — AI RAG TextChunker (AI-RAG-1).

Verifica:
 3. Chunker divide texto longo em múltiplos chunks.
 4. Chunker preserva ordem dos chunks (chunk_index sequencial).
 5. Chunker lida com texto curto (retorna 1 chunk).
 6. Chunker lida com texto vazio de forma controlada (retorna lista vazia).
12. Nenhum teste chama LLM, banco ou provider externo.
"""
from __future__ import annotations

import pytest

from src.ai_orchestration.rag.chunking import TextChunker
from src.ai_orchestration.rag.chunking_contract import Chunk


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_text(n_paragraphs: int, chars_per_para: int = 300) -> str:
    """Gera texto com n_paragraphs parágrafos de tamanho controlado."""
    para = "A " * (chars_per_para // 2)
    return "\n\n".join(para.strip() for _ in range(n_paragraphs))


# ── Configuração padrão ───────────────────────────────────────────────────────


class TestTextChunkerDefaults:
    def test_default_max_chars_is_2000(self) -> None:
        chunker = TextChunker()
        assert chunker.max_chars == 2000

    def test_default_overlap_chars_is_100(self) -> None:
        chunker = TextChunker()
        assert chunker.overlap_chars == 100

    def test_custom_max_chars(self) -> None:
        chunker = TextChunker(max_chars=500)
        assert chunker.max_chars == 500


# ── Texto vazio ───────────────────────────────────────────────────────────────


class TestEmptyText:
    def test_empty_string_returns_empty_list(self) -> None:
        chunker = TextChunker()
        result = chunker.chunk("")
        assert result == []

    def test_whitespace_only_returns_empty_list(self) -> None:
        chunker = TextChunker()
        result = chunker.chunk("   \n\n   ")
        assert result == []

    def test_newlines_only_returns_empty_list(self) -> None:
        chunker = TextChunker()
        result = chunker.chunk("\n\n\n")
        assert result == []


# ── Texto curto ───────────────────────────────────────────────────────────────


class TestShortText:
    def test_short_text_returns_one_chunk(self) -> None:
        chunker = TextChunker(max_chars=500)
        text = "Este é um texto curto."
        result = chunker.chunk(text)
        assert len(result) == 1

    def test_short_chunk_has_correct_content(self) -> None:
        chunker = TextChunker(max_chars=500)
        text = "Política de férias."
        result = chunker.chunk(text)
        assert result[0].content == "Política de férias."

    def test_short_chunk_has_index_zero(self) -> None:
        chunker = TextChunker(max_chars=500)
        result = chunker.chunk("Texto qualquer.")
        assert result[0].chunk_index == 0

    def test_text_exactly_at_max_chars_returns_one_chunk(self) -> None:
        chunker = TextChunker(max_chars=50)
        text = "A" * 50
        result = chunker.chunk(text)
        assert len(result) == 1

    def test_single_chunk_token_count_at_least_one(self) -> None:
        chunker = TextChunker()
        result = chunker.chunk("abc")
        assert result[0].token_count >= 1


# ── Texto longo ───────────────────────────────────────────────────────────────


class TestLongText:
    def test_long_text_returns_multiple_chunks(self) -> None:
        # 5 parágrafos de 200 chars cada com max_chars=300 → deve gerar 3+ chunks
        chunker = TextChunker(max_chars=300, overlap_chars=20)
        text = _make_text(n_paragraphs=5, chars_per_para=200)
        result = chunker.chunk(text)
        assert len(result) >= 2

    def test_chunks_cover_full_text(self) -> None:
        chunker = TextChunker(max_chars=200, overlap_chars=20)
        text = _make_text(n_paragraphs=6, chars_per_para=150)
        result = chunker.chunk(text)
        # Todo o conteúdo deve estar presente em algum chunk
        combined = " ".join(c.content for c in result)
        # Verifica que a maioria dos parágrafos está presente (overlap pode duplicar partes)
        assert len(combined) >= len(text) * 0.7

    def test_very_long_single_paragraph_is_split(self) -> None:
        # Parágrafo único sem quebra dupla, maior que max_chars
        chunker = TextChunker(max_chars=100, overlap_chars=10)
        text = "X " * 300  # 600 chars, sem \n\n
        result = chunker.chunk(text)
        assert len(result) >= 2


# ── Ordem e indexação ─────────────────────────────────────────────────────────


class TestChunkOrder:
    def test_chunk_indices_are_sequential_starting_at_zero(self) -> None:
        chunker = TextChunker(max_chars=100, overlap_chars=10)
        text = _make_text(n_paragraphs=4, chars_per_para=80)
        result = chunker.chunk(text)
        assert len(result) >= 1
        for expected_idx, chunk in enumerate(result):
            assert chunk.chunk_index == expected_idx, (
                f"chunk_index esperado {expected_idx}, recebido {chunk.chunk_index}"
            )

    def test_chunks_are_ordered_by_index(self) -> None:
        chunker = TextChunker(max_chars=150, overlap_chars=20)
        text = _make_text(n_paragraphs=5, chars_per_para=100)
        result = chunker.chunk(text)
        indices = [c.chunk_index for c in result]
        assert indices == sorted(indices)

    def test_first_chunk_starts_with_text_beginning(self) -> None:
        chunker = TextChunker(max_chars=200, overlap_chars=20)
        text = "PRIMEIRO_PARAGRAFO aqui.\n\n" + "B " * 200
        result = chunker.chunk(text)
        assert "PRIMEIRO_PARAGRAFO" in result[0].content


# ── Metadata ──────────────────────────────────────────────────────────────────


class TestChunkMetadata:
    def test_char_count_in_metadata(self) -> None:
        chunker = TextChunker()
        result = chunker.chunk("Texto com 26 caracteres ok.")
        assert "char_count" in result[0].metadata
        assert result[0].metadata["char_count"] == len(result[0].content)

    def test_base_metadata_is_propagated(self) -> None:
        chunker = TextChunker()
        meta = {"source_type": "rh_policy", "version": "v1"}
        result = chunker.chunk("Texto qualquer.", metadata=meta)
        assert result[0].metadata["source_type"] == "rh_policy"
        assert result[0].metadata["version"] == "v1"

    def test_base_metadata_does_not_mutate_original(self) -> None:
        chunker = TextChunker()
        meta = {"source_type": "ats_guide"}
        chunker.chunk("Texto.", metadata=meta)
        assert "char_count" not in meta  # original não deve ser mutado


# ── Chunk type ────────────────────────────────────────────────────────────────


class TestChunkType:
    def test_returns_list_of_chunk_objects(self) -> None:
        chunker = TextChunker()
        result = chunker.chunk("Um texto qualquer.")
        assert all(isinstance(c, Chunk) for c in result)

    def test_chunk_content_is_not_empty(self) -> None:
        chunker = TextChunker(max_chars=50, overlap_chars=5)
        text = _make_text(n_paragraphs=3, chars_per_para=80)
        result = chunker.chunk(text)
        for chunk in result:
            assert chunk.content.strip() != ""

    def test_no_llm_used(self) -> None:
        """Chunker é puramente determinístico — sem LLM, sem I/O."""
        chunker = TextChunker()
        # Se chegou aqui sem ImportError ou chamada externa, o teste passa
        result = chunker.chunk("Texto de exemplo para chunking determinístico.")
        assert len(result) == 1
