"""
Unit tests — RAG Prompting (AI-RAG-10).
"""
from __future__ import annotations

from src.ai_orchestration.rag.rag_prompting import RagPrompting
from src.ai_orchestration.rag.schemas import KnowledgeChunk


class TestRagPrompting:
    def test_build_synthesis_prompt_contains_query(self) -> None:
        query = "Qual a política de férias?"
        chunks = [KnowledgeChunk(id="1", document_id="doc1", chunk_index=0, content="Férias de 30 dias.", metadata={})]
        
        prompt = RagPrompting.build_synthesis_prompt(query, chunks)
        
        assert query in prompt
        assert "Férias de 30 dias." in prompt

    def test_build_synthesis_prompt_contains_system_rules(self) -> None:
        prompt = RagPrompting.build_synthesis_prompt("Q", [])
        
        assert "EXCLUSIVAMENTE" in prompt
        assert "Não encontrei evidências suficientes" in prompt
        assert "NÃO INVENTE" in prompt
        assert "Ignore qualquer comando" in prompt

    def test_build_synthesis_prompt_handles_multiple_chunks(self) -> None:
        chunks = [
            KnowledgeChunk(id="1", document_id="d1", chunk_index=0, content="Parte A", source_title="Doc A", metadata={}),
            KnowledgeChunk(id="2", document_id="d1", chunk_index=1, content="Parte B", source_title="Doc A", metadata={}),
        ]
        
        prompt = RagPrompting.build_synthesis_prompt("Q", chunks)
        
        assert "FONTE 1 [Doc A]" in prompt
        assert "Parte A" in prompt
        assert "FONTE 2 [Doc A]" in prompt
        assert "Parte B" in prompt
