# Plano RAG: ATS/RH

**Status:** Draft  
**Data:** 2026-06-06  
**Fase:** AI-ARCH-1 (Arquitetura Base)  
**Implementação real:** AI-RAG-1 (futura)

---

## Objetivo

Prover ao assistente de IA do ATS/RH a capacidade de responder perguntas sobre políticas, regras, documentação e procedimentos internos com **citação de fonte verificável**, sem alucinar informações.

---

## Fontes de Conhecimento

### 1. Políticas de RH
- Política de benefícios (vale-refeição, plano de saúde, home office)
- Política de cargos e salários
- Código de conduta
- Política de férias e afastamentos
- Política de dress code e presencial

### 2. Regras de Contratação
- Critérios mínimos por nível (júnior, pleno, sênior, liderança)
- Documentos exigidos por tipo de contrato (CLT, PJ, estágio)
- Prazos de processo seletivo por tipo de vaga
- Regras de aprovação de headcount

### 3. Documentação do ATS
- Guia de criação de vaga
- Guia de triagem de candidatos
- Guia de uso do pipeline
- Guia de entrevistas e scorecards
- Guia de ranking e match de candidatos

### 4. Documentação de Pré-Admissão
- Checklist de documentos por tipo de contrato
- Fluxo de aprovação de documentos
- Regras de prazos de envio
- Como lidar com documentos faltantes
- Orientações para o candidato no portal

### 5. Documentação Protheus
- Quando e como exportar admissão para Protheus
- Campos obrigatórios de exportação
- Como lidar com erros de integração
- Status de exportação e significados

### 6. Guias Internos
- FAQ de recrutadores
- Onboarding de novos recrutadores no ATS
- Boas práticas de descrição de vagas
- Boas práticas de entrevista estruturada

### 7. Critérios de Ranking
- Como o score de candidatos é calculado
- Fatores de match por tipo de vaga
- Como interpretar a pontuação de habilidades
- Como funciona o deal breaker

### 8. Checklist de Admissão
- Etapas do processo de admissão
- Responsáveis por cada etapa
- Prazos e SLAs

---

## Estratégia Técnica

### Banco de Dados: Postgres + pgvector (futuro)

**Fase atual (AI-ARCH-1):** Apenas contratos e schemas definidos. Nenhuma tabela criada.  
**Fase futura (AI-RAG-1):** Ativar pgvector e criar migrations.

#### Tabelas futuras sugeridas

```sql
-- Documentos da base de conhecimento
CREATE TABLE knowledge_documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    source_type TEXT NOT NULL,  -- 'rh_policy', 'ats_guide', 'pre_admission', 'protheus', etc.
    content     TEXT NOT NULL,  -- texto completo
    metadata    JSONB,          -- autor, versão, data de vigência, tags
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    is_active   BOOLEAN DEFAULT TRUE
);

-- Chunks para busca semântica
CREATE TABLE knowledge_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_index     INT NOT NULL,
    content         TEXT NOT NULL,
    embedding       VECTOR(1536),  -- dimensão compatível com text-embedding-ada-002 / text-embedding-3-small
    metadata        JSONB,         -- posição no doc, seção, heading
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops);

-- Log de consultas RAG (observabilidade)
CREATE TABLE rag_query_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL,
    session_id      UUID NOT NULL,
    user_id         UUID NOT NULL,
    query           TEXT NOT NULL,
    source_types    TEXT[],
    chunks_returned INT,
    top_score       FLOAT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Estratégia de Chunking

**Abordagem:** Chunking por seção + overlap semântico

| Critério | Valor |
|---|---|
| Tamanho alvo por chunk | 400–600 tokens |
| Overlap entre chunks | 50–100 tokens |
| Separação preferencial | Parágrafos, heading H2/H3 |
| Chunk máximo | 800 tokens (sem corte de frase) |

**Processo:**
1. Documento ingere via `ingestion_contract.py`
2. Preprocessamento: limpeza, normalização, remoção de formatting
3. Divisão semântica por parágrafos e headings
4. Geração de embedding por chunk
5. Armazenamento com metadados de posição e seção

### Estratégia de Metadados

Cada chunk armazena os seguintes metadados:
```json
{
  "document_id": "uuid",
  "document_title": "Política de Benefícios",
  "source_type": "rh_policy",
  "chunk_index": 3,
  "section_heading": "Plano de Saúde",
  "version": "2024-Q1",
  "author": "RH Corporativo",
  "effective_date": "2024-01-01",
  "tags": ["benefícios", "saúde", "assistência médica"]
}
```

### Estratégia de Retrieval

**Fase inicial (AI-RAG-1):** Busca vetorial simples por similaridade de cosseno.  
**Fase futura:** Hybrid search (vetorial + BM25 keyword) com re-ranking.

```
Query do usuário
  → embedding da query
  → busca por similaridade (top-K chunks)
  → filtro por source_type (quando relevante)
  → rerank por score mínimo (threshold: 0.75)
  → montar contexto com chunks selecionados
  → gerar resposta com citação de fonte
```

---

## Como evitar resposta sem fonte

### Regras obrigatórias

1. **Threshold mínimo de score**: Se o chunk mais relevante tiver score < 0.75, o agente responde: *"Não encontrei informação suficiente na base de conhecimento sobre esse tema. Consulte o responsável do RH."*

2. **Fonte obrigatória na resposta**: Toda resposta gerada via RAG deve incluir `RagSource[]` no `RagAnswer`. Respostas sem fonte são consideradas inválidas.

3. **Confiança explícita**: O campo `confidence` no `RagAnswer` reflete o score médio dos chunks utilizados. Confiança < 0.6 deve ser sinalizada ao usuário.

4. **Sem fabricação**: O prompt do agente RAG deve incluir instrução explícita: *"Responda apenas com base nas fontes fornecidas. Se a informação não estiver nas fontes, diga que não sabe."*

5. **Citação de chunk**: A resposta deve indicar o `document_id`, `title` e `section_heading` de onde a informação foi extraída.

### Exemplo de resposta RAG válida

```json
{
  "answer": "O colaborador tem direito a 30 dias de férias remuneradas após 12 meses de trabalho, conforme a Política de RH.",
  "sources": [
    {
      "document_id": "uuid-do-doc",
      "title": "Política de Férias e Afastamentos",
      "chunk_id": "uuid-do-chunk",
      "source_type": "rh_policy",
      "score": 0.91,
      "metadata": {"section_heading": "Direito a Férias"}
    }
  ],
  "confidence": 0.91,
  "warnings": []
}
```

---

## Como citar documentos internos

Na interface do assistente (quando implementada), citações serão exibidas como:

> 📄 Fonte: **Política de Férias e Afastamentos** (Seção: Direito a Férias) — Relevância: 91%

No backend, o `RagAnswer` sempre carrega a lista completa de `RagSource[]` para auditoria e rastreabilidade.

---

## Fases de Implementação RAG

| Fase | Descrição |
|------|-----------|
| AI-ARCH-1 (atual) | Contratos, schemas e plano. Sem tabelas, sem embeddings |
| AI-RAG-1 | Habilitar pgvector, criar migrations, ingestão de primeiros docs |
| AI-RAG-2 | Ingestion pipeline completo, chunking automático |
| AI-RAG-3 | Hybrid search e re-ranking |
| AI-RAG-4 | Interface de gestão de base de conhecimento para RH |
