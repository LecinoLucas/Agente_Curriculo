# AI-USAGE-1 — Cobertura de Usage

## Coberto nesta fase

- `job_ai_draft`
  - Já registrava usage em `ai_usage_logs`.
  - Usa tokens vindos da resposta do provider quando disponíveis.

- `rag_synthesis`
  - Passou a registrar usage quando a síntese chama o provider.
  - Provider/model/status são registrados.
  - Tokens ficam `0` quando o provider não expõe usage no contrato atual.
  - Não registra prompt, resposta, chunks, query ou metadados sensíveis.

## Usage unavailable

- `rag_synthesis`
  - Usage real do Gemini não é extraído nesta fase porque o contrato atual do `GeminiRagSynthesisProvider` retorna apenas texto.
  - Registro usa tokens `0` e operação `rag_synthesis`.

## Ainda não coberto

- `knowledge.search`
  - Não chama LLM de síntese; usa retriever/embedding.
  - Não foi registrado nesta fase para evitar contabilizar custo artificial.

- RAG embeddings
  - FakeEmbeddingProvider não gera custo real.
  - Gemini embeddings não tiveram usage real integrado nesta fase.

- Fluxos de análise de currículo além dos registros já existentes
  - Mantidos como estão para evitar ampliar escopo sem auditoria específica.

## Fonte do usage

- Job AI Draft: objeto `usage` retornado pelo fluxo de IA.
- RAG synthesis: registro operacional no backend; tokens reais indisponíveis nesta fase.

## Estimativa

- `estimated_cost_usd` continua sendo calculado pelo serviço existente quando há preço configurado e tokens disponíveis.
- Para RAG synthesis com tokens `0`, custo estimado efetivo é zero.
