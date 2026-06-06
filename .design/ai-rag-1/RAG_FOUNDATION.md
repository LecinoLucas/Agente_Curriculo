# AI-RAG-1: Fundação RAG Read-Only

**Status:** Implementado (fundação)
**Data:** 2026-06-06
**Fase:** AI-RAG-1 — Fundação sem LLM, sem embeddings, sem banco

---

## Objetivo do RAG no ATS/RH

Prover ao assistente de IA a capacidade de responder perguntas sobre políticas
internas, regras de contratação, documentação do ATS e procedimentos de admissão
com **citação de fonte verificável** — sem alucinação.

O assistente nunca fabrica informações: se não encontra base na knowledge store,
informa que não sabe e sugere consultar o responsável.

---

## Fontes Futuras de Conhecimento

| Categoria | Exemplos |
|---|---|
| **Políticas de RH** | Férias, benefícios, código de conduta, cargos e salários |
| **Regras de Contratação** | Critérios por nível (JR/PL/SR), docs por tipo de contrato |
| **Documentação ATS** | Guia de criação de vaga, triagem, pipeline, scorecards |
| **Documentação Pré-Admissão** | Checklist de documentos, fluxo de aprovação, prazos |
| **Documentação Protheus** | Exportação ao ERP, campos obrigatórios, erros de integração |
| **Guias Internos** | FAQ de recrutadores, onboarding no ATS, boas práticas |
| **Critérios de Ranking** | Como o score é calculado, fatores de match, deal breakers |
| **Checklists Admissionais** | Etapas de admissão, responsáveis, SLAs |
| **Walkthroughs Técnicos** | Documentação das fases do projeto (ARCH, TOOLS, ASSISTANT...) |

---

## Por Que Começar Sem LLM / Embeddings

A fundação RAG é implementada sem chamada a modelos de linguagem ou geração de
embeddings por três razões:

1. **Testar a arquitetura antes do custo**: Contratos, schemas, chunking e
   retriever devem ser validados independentemente da camada LLM.
2. **Determinismo nos testes**: O `InMemoryRetriever` e o `TextChunker` são
   completamente determinísticos — resultados são reproduzíveis sem variação.
3. **Separação de responsabilidades**: O RAG recupera. O LLM gera. As camadas
   são independentes e podem evoluir separadamente.

---

## Arquitetura da Fundação (AI-RAG-1)

```
KnowledgeDocument
    │
    ▼  TextChunker.chunk()
list[Chunk]
    │  (caller adiciona document_id → KnowledgeChunk)
    ▼
list[KnowledgeChunk]
    │  armazenado em InMemoryRetriever (testes)
    ▼  ou PostgresVectorRetriever (produção — AI-RAG-1b)
InMemoryRetriever.retrieve(RetrievalQuery)
    │
    ▼
RetrievalResult
    └── list[RetrievedChunk]
             ├── chunk: KnowledgeChunk  (conteúdo + fonte)
             ├── score: float
             └── match_reason: str
```

---

## Futura Evolução para pgvector

A transição do `InMemoryRetriever` para o `PostgresVectorRetriever` requer:

1. **Migration** (AI-RAG-1b):
   - `knowledge_documents` — tabela de documentos
   - `knowledge_chunks` — chunks com coluna `embedding vector(1536)`
   - Índice `ivfflat` na coluna de embedding
   - `rag_query_log` — log de queries para observabilidade

2. **Ingestion Pipeline** (AI-RAG-2):
   - Ingestão via `IngestionContract`
   - Geração de embeddings via `text-embedding-3-small` (Anthropic/OpenAI)
   - Persistência no banco com metadados completos

3. **Hybrid Retriever** (AI-RAG-3):
   - Combinação de busca vetorial (semântica) + BM25 (keyword)
   - Re-ranking por relevância

O `RetrieverContract` permanece estável — as implementações são intercambiáveis
sem alterar o código que consome o retriever.

---

## Estratégia de Chunking

### TextChunker (AI-RAG-1)

| Parâmetro | Valor padrão | Descrição |
|---|---|---|
| `max_chars` | 2000 | Limite máximo de caracteres por chunk |
| `overlap_chars` | 100 | Sobreposição entre chunks consecutivos |
| `token_count` | `len(content) // 4` | Estimativa sem tokenizador (4 chars/token) |

**Algoritmo:**
1. Strip do texto; retorna `[]` se vazio.
2. Se `len(text) <= max_chars` → retorna 1 chunk.
3. Split por `\n\n` (parágrafos).
4. Parágrafos > `max_chars` → `_force_split` por janela deslizante.
5. Agrupa parágrafos normalizados em chunks com overlap na fronteira.
6. Retorna `list[Chunk]` com `chunk_index` sequencial (0-based).

### Evolução Futura

O `ChunkingContract` abstrato permite introduzir estratégias mais sofisticadas:
- `SemanticChunker`: split por parágrafo com overlap semântico
- `RecursiveChunker`: split por heading → parágrafo → frase (AI-RAG-2)
- `MarkdownChunker`: split por seções H2/H3 para documentação estruturada

---

## Estratégia de Citações Internas

Toda resposta RAG (quando o LLM for ativado) deve incluir `RetrievedChunk[]`
com o `KnowledgeChunk` original — nunca apenas o texto sintetizado.

O frontend (AI-UI-1) exibirá:
```
📄 Fonte: Política de Férias (Seção: Direito a Férias) — Relevância: 91%
```

No backend, `RetrievalResult.chunks` carrega:
- `chunk.document_id` — para rastreabilidade
- `chunk.source_title` — para exibição
- `chunk.metadata.section_heading` — para citação precisa
- `chunk.chunk_index` — para ordenação e auditoria
- `score` — para threshold e confiança

---

## Proteção Contra Prompt Injection

O RAG lida com documentos internos de RH — não com inputs de usuário finais.
Ainda assim, aplica as seguintes proteções:

1. **Sem execução de conteúdo**: os chunks são texto puro — nunca executados
   como código, SQL ou prompt direto.
2. **Threshold de score**: chunks com score < min_score são descartados, evitando
   injeção de conteúdo irrelevante ou manipulado na janela de contexto do LLM.
3. **Source type filter**: o caller especifica `source_type` para restringir o
   escopo de busca, evitando cross-contamination entre domínios.
4. **Nenhum dado de usuário nos documentos**: a knowledge base contém apenas
   documentação interna — nunca dados de candidatos ou colaboradores.
5. **Instrução anti-alucinação no prompt LLM** (fase futura): o system prompt
   inclui: *"Responda apenas com base nas fontes fornecidas. Se não estiver nas
   fontes, diga que não sabe."*

---

## O Que Fica Fora do Escopo desta Fase

| Item | Status | Fase |
|---|---|---|
| pgvector e migration | ❌ Fora | AI-RAG-1b |
| Embeddings reais | ❌ Fora | AI-RAG-1b |
| LLM para geração de resposta | ❌ Fora | AI-AGENT-1 |
| Endpoint `/ai/rag/*` | ❌ Fora | AI-RAG-2 |
| Ingestion pipeline completo | ❌ Fora | AI-RAG-2 |
| Interface de gestão da knowledge base | ❌ Fora | AI-RAG-4 |
| Integração com AssistantRouter | ❌ Fora | AI-AGENT-1 |
| Busca híbrida (BM25 + vetorial) | ❌ Fora | AI-RAG-3 |

---

## Componentes Implementados

```
backend/src/ai_orchestration/rag/
├── schemas.py            ← KnowledgeDocument, KnowledgeChunk, RetrievalQuery,
│                            RetrievedChunk, RetrievalResult + RagSource, RagAnswer
├── chunking_contract.py  ← Chunk, ChunkingContract (abstract)
├── chunking.py           ← TextChunker (implementação determinística) ← NOVO
├── retriever_contract.py ← RetrieverContract (abstract, atualizado)
├── ingestion_contract.py ← IngestionDocument, IngestionResult, IngestionContract
└── in_memory_retriever.py ← InMemoryRetriever (keyword match, sem DB) ← NOVO

backend/tests/unit/
├── test_ai_rag_contracts.py          ← Testes de schemas ← NOVO
├── test_ai_rag_chunking.py           ← Testes do TextChunker ← NOVO
└── test_ai_rag_in_memory_retriever.py ← Testes do InMemoryRetriever ← NOVO
```
