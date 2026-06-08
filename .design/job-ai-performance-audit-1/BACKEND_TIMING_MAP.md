# Job AI Draft - Backend Timing Map

Mapeamento do fluxo completo por requisição, focado no Critical Path da API.

| Etapa | Tempo observado/estimado | Pode crescer? | Risco | Evidência | Próxima ação |
|---|---|---|---|---|---|
| **Input Validation & Truncation** | `< 10ms` | Não | Baixo | `sanitize(text)[:MAX_COMBINED_CHARS]` | Nenhuma. Operação `O(N)` super rápida em memória local. |
| **LangGraph Orchestration Overhead** | `10ms - 30ms` | Não | Baixo | Transição de nós `StateGraph`. | Nenhuma. Overhead trivial. |
| **Chamada Provedor IA (Gemini)** | `5s - 25s` | **Sim** (Tokens) | Alto | Adaptador síncrono no loop `ai.analyze(request)`. | Reduzir `maxOutputTokens` e testar Caching. |
| **Parse JSON (Extração e Limpeza regex)** | `< 50ms` | Não | Baixo | Expressões regulares isolando bloco JSON. | Nenhuma. |
| **Post-Validate Guardrails** | `< 20ms` | Sim | Médio | Loops de listas, matching e deduplicação (`post_validate_node`). | Monitorar se listas de habilidades aumentarem drasticamente. |
| **Quality Evaluation** | `< 10ms` | Sim | Médio | Cálculos locais (`evaluate_quality_node`). | Manter como função paralela à extração bruta se possível. |
| **AI Usage Logging (DB Write)** | `< 50ms` | Sim (DB) | Baixo | Inserção isolada via SQLAlchemy `persist_ai_usage_log`. | Executar como background task fire-and-forget. |

*Limitação:* Estimativas baseadas nas características algorítmicas de I/O em Python, e no comportamento padrão de APIs LLM (a decodificação do LLM toma 98% do tempo do fluxo).
