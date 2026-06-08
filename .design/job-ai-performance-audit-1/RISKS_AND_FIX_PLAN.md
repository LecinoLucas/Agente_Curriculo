# Job AI Draft - Risks and Fix Plan

Este documento consolida os riscos identificados na auditoria de performance, tokens, custo e UX do Job AI Draft, propondo um plano de mitigação dividido em fases de correção.

---

## 1. Matriz de Riscos

| Risco | Classificação | Impacto | Probabilidade | Descrição |
|---|---|---|---|---|
| **Bloqueio Síncrono da API** | **ALTO** | O usuário fica com a tela travada por até 25s, gerando má percepção de UX. Risco de timeout HTTP em proxies (ex. Nginx/Cloudflare) limitados a 30s. | Alta | A chamada ao provedor de IA (`ai.analyze`) é feita síncronamente no Critical Path da requisição HTTP do Backend. |
| **Custo de Token por Chamadas Duplicadas/Repetidas** | **MÉDIO** | Desperdício financeiro com chaves de API/faturamento. | Média | Ausência de cache para descrições de vagas idênticas ou muito semelhantes. O usuário pode enviar a mesma vaga repetidamente. |
| **Desperdício de Tokens em Erros de Parsing** | **MÉDIO** | Custo financeiro sem retorno de dados estruturados. | Média | Se a IA falha ao fechar o JSON ou alucina na formatação (JSON inválido), os tokens de entrada e saída são faturados, mas o resultado é descartado com erro. |
| **Escrita de Logs Síncrona** | **BAIXO** | Pequeno atraso na latência de resposta da API (10ms a 50ms). | Baixa | A persistência dos logs de uso da IA (`persist_ai_usage_log`) é executada como parte da requisição. Se o banco de dados apresentar contenção, a API desacelera. |
| **Quality Evaluation Sequencial** | **BAIXO** | Aumento do tempo de CPU no backend. | Baixa | Os nós de pós-processamento, refinamento e qualidade rodam em sequência no LangGraph. Atualmente levam <30ms, mas podem acumular latência se novas regras complexas forem inseridas. |

---

## 2. Plano de Mitigação (Fases de Correção)

Propomos dividir a resolução dos problemas em duas fases subsequentes bem delimitadas.

### Fase 1: Otimização de Performance e Custo Backend (`JOB-AI-PERF-FIX-1`)

Foco em reduzir o consumo de tokens e a latência de execução do backend.

1. **Caching de Rascunhos de Vagas**:
   - Criar um mecanismo de cache local (usando uma tabela de cache ou Redis se disponível) baseado no hash do input de texto (`text_input` + `ocr_text`).
   - Se o mesmo texto for submetido dentro de um período (ex. 24 horas), retornar o rascunho em cache imediatamente (<100ms) sem chamar a API do Gemini.
2. **Otimização de Prompt e Payload**:
   - Simplificar o esquema JSON solicitado no prompt do Gemini para reduzir o número de tokens de saída (Output Tokens).
   - Remover arrays redundantes e focar estritamente nos metadados essenciais.
3. **Escrita de Logs Assíncrona (Fire-and-Forget)**:
   - Desacoplar a escrita do `ai_usage_logs` do ciclo de vida da requisição HTTP, utilizando tarefas em segundo plano do FastAPI (`BackgroundTasks`) ou `asyncio.create_task`.

---

### Fase 2: Modernização da UX do Rascunho (`JOB-AI-UX-FIX-1`)

Foco em transformar a experiência do usuário de síncrona para assíncrona.

1. **Processamento Assíncrono com Polling/WebSockets**:
   - Refatorar o endpoint `POST /api/v1/jobs/generate-draft` para registrar o pedido de rascunho, enfileirar a tarefa e retornar imediatamente um `job_id` com status `pending` (<200ms).
   - O frontend deixa de bloquear a tela com um loader impenetrável.
2. **Phased Loading & Status Updates**:
   - O frontend passa a consultar o status da geração em intervalos regulares (Polling) ou assinar um canal WebSocket.
   - O backend atualiza o status de progresso no banco de dados conforme transiciona pelos nós do LangGraph (ex: `Lendo sua vaga...` -> `Consultando IA...` -> `Validando dados...` -> `Concluído`).
   - O frontend exibe uma barra de progresso ou lista de etapas dinâmica, reduzindo a ansiedade de espera do usuário.
3. **Tratamento Amigável de Erros e Timeouts**:
   - Em caso de falha da API de IA, exibir erros específicos no frontend orientando o usuário (ex: "O provedor de IA está congestionado no momento. Tente novamente em alguns segundos.").
