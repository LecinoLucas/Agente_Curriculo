# FASE AI-COST-AUDIT-1: Relatório de Auditoria de Custo de IA

## 1. Status do Repositório (git status)
Foi encontrado 1 arquivo com alterações não commitadas (fase anterior):
- `M frontend/src/components/layout/Sidebar.tsx`
(A auditoria prosseguiu normalmente sem sobrescrever este arquivo).

## 2. Cálculo e Estimativa de Custo
- **Backend (`ai_pricing.py`)**: O cálculo está estruturado corretamente com uma tabela estática `AI_MODEL_PRICING` mapeando o preço por milhão de tokens (input/output) em dólar. Providers como Gemini e Anthropic possuem alias normalizados.
- O campo `estimated_cost_usd` é corretamente computado na gravação do log em `ai_usage_log_service.py` via `_build_model`.

## 3. Armazenamento e Logs
- **Modelo (`ai_usage_logs`)**: A tabela captura de maneira granular métricas como `provider`, `model`, `operation`, `status`, `input_tokens`, `output_tokens`, `total_tokens`, `latency_ms` e `error_message`.
- O registro é efetuado de forma "segura" (`safe_persist_ai_usage_log`), evitando que falhas na gravação do log abortem o fluxo principal.

## 4. Endpoints e Agregação
- **Serviço (`AdminBIService`)**: A consulta `_get_ai_summary` e agregadores diários obtêm os dados consolidados, retornando a soma de `estimated_cost_usd`.
- **API (`admin_system_health.py`)**: Endpoint `GET /api/v1/admin/health/ai-usage` fornece o agregado completo. Há endpoints adicionais de backfill e de tabela de preços (`/pricing`).

## 5. Frontend Admin
- **Componente (`AiUsagePanel.tsx`)**: O painel exibe e consome corretamente os totais agregados e métricas por período (incluindo "Custo estimado", tokens, gráficos de uso diário, latência e falhas).

## 6. Cobertura por Feature (Lacunas Encontradas)
Auditamos onde `persist_ai_usage_log` e `safe_persist_ai_usage_log` são chamados:

- **RAG Synthesis (`rag_answer_service.py`)**: 
  - **Status:** Coberto.
  - Grava métricas tanto em cenários de **sucesso** quanto de **falha** (captura a exceção `GeminiSynthesisError` e chama `_record_usage(status="error")`).
  
- **Resume Analysis (`analysis_tasks.py` / `analysis_service.py`)**:
  - **Status:** Coberto.
  - Utiliza `safe_persist_ai_usage_log`. Em caso de erro na análise do provedor, o worker captura a falha e registra os metadados de tokens gastos em logs com `status="failed"`.

- **Job AI Draft (`job_ai_draft_service.py` e `job_ai_draft_graph.py`)**:
  - **Status:** Cobertura Parcial / Lacuna Crítica ⚠️
  - **Problema:** A chamada a `persist_ai_usage_log` ocorre *apenas* no caminho de sucesso. Se o modelo falhar (ex: RateLimitError, ParseError ou timeout) gerando uma `AiDraftAIError` no meio do processo, o log de uso **não é persistido**.
  - **Risco:** Falhas repetidas de Job AI geram consumo invisível de tokens sem aparecer nos gráficos de falha ou custo estimado do Admin. 

## 7. Privacidade de Dados
- Nenhuma string de prompt ou de resposta (content_parts, embeddings, PDFs em texto puro) é salva nos logs de custo (`AIUsageLogModel`). Apenas metadados operacionais e identificadores soltos são retidos.

## Conclusão e Próximos Passos
A infraestrutura de IA e a exibição de custos está madura e segura. **A principal correção recomendada (em uma próxima fase) é adicionar a gravação do log de erro nas exceções do `JobAiDraftService` e `generate_draft_node` para garantir que falhas e custos perdidos não fiquem ocultos.**
