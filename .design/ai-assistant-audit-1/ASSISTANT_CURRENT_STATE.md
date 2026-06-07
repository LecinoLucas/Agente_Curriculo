# ASSISTANT_CURRENT_STATE

Auditoria funcional da fase `AI-ASSISTANT-AUDIT-1`. Escopo: leitura de backend/frontend/RAG e testes locais, sem implementar feature.

## Arquitetura atual

O assistente interno opera em modo estruturado e read-only:

- Frontend global: `AiAssistantDrawer` abre pelo `TopNavbar` dentro do `AppShell`.
- Endpoint operacional: `POST /api/v1/ai/assistant/read-only`.
- Router: `AssistantRouter` recebe `intent`, resolve no `IntentCatalog` e executa via `ToolRuntime`.
- Registry: `DEFAULT_REGISTRY` registra tools com metadados de dominio, permissao, `read_only` e `requires_approval`.
- RAG: `knowledge.search` usa `PostgresVectorRetriever`; `knowledge.answer` usa o mesmo retriever e `RagAnswerService`.
- Governanca/admin: `/admin` aba `IA`, `/admin/ia` laboratorio, `/admin/conhecimento` base de conhecimento.
- Usage: `AIUsageService` agrega chamadas/tokens/erros sem armazenar prompt, resposta, curriculo bruto, OCR, payloads ou embeddings.

O router nao chama LLM diretamente. O endpoint monta services e contexto por role, cria `ToolRuntime(DEFAULT_REGISTRY, read_only=True)` e retorna `AiAssistantReadOnlyResponse`.

## Feature flags e status

- Assistente: `enabled=true`, `read_only=true`, `free_text_enabled=false` no endpoint `/ai/status`.
- RAG synthesis: controlado por `RAG_SYNTHESIS_ENABLED`, default `False`.
- Embeddings Gemini: controlado por `RAG_EMBEDDING_PROVIDER` e `RAG_GEMINI_EMBEDDING_ENABLED`; se indisponivel, pode degradar para fake/fallback.
- Protheus real: `PROTHEUS_REAL_SEND_ENABLED=false` e `ERP_ALLOW_REAL_SEND=false` por padrao.
- `/ai/status` e `/ai/usage/summary` sao `AdminOnly`.

## Roles e permissoes

Mapa efetivo do endpoint:

| Role | Permissoes de assistant |
|---|---|
| admin | jobs, candidates, pipeline, admissions, protheus, assistant/knowledge |
| recruiter | jobs, candidates, pipeline, assistant/knowledge |
| hr | admissions, protheus, assistant/knowledge |
| manager | jobs, candidates, pipeline, assistant/knowledge |
| viewer | jobs |
| candidate | nenhuma |

Observacao: o drawer aparece dentro do `AppShell` para usuarios autenticados internos, mas a permissao real e aplicada no backend. Viewer consegue ver a UI, mas nao consegue usar Knowledge por falta de `can_use_assistant`; candidato fica fora do AppShell interno.

## Intents atuais

| Intent | Tool | Dominio |
|---|---|---|
| `job.summary` | `get_job_summary` | jobs |
| `job.search` | `search_jobs` | jobs |
| `job.requirements` | `get_job_requirements` | jobs |
| `job.ai_draft_context` | `get_job_ai_draft_context` | jobs |
| `candidate.summary` | `get_candidate_summary` | candidates |
| `candidate.search` | `search_candidates` | candidates |
| `candidate.profile_context` | `get_candidate_profile_context` | candidates |
| `candidate.resume_analysis` | `get_candidate_resume_analysis_summary` | candidates |
| `pipeline.overview` | `get_job_pipeline_overview` | pipeline |
| `pipeline.candidate_position` | `get_candidate_pipeline_position` | pipeline |
| `pipeline.history` | `get_candidate_pipeline_history` | pipeline |
| `pipeline.search_candidates` | `search_pipeline_candidates` | pipeline |
| `admission.case_summary` | `get_admission_case_summary` | admission |
| `admission.checklist_status` | `get_admission_checklist_status` | admission |
| `admission.documents_status` | `get_admission_documents_status` | admission |
| `admission.events_summary` | `get_admission_events_summary` | admission |
| `protheus.export_status` | `get_protheus_export_status` | protheus |
| `knowledge.search` | `search_knowledge` | knowledge |
| `knowledge.answer` | `answer_knowledge` | knowledge |

Todas as intents do catalogo apontam para tools existentes no registry. Os testes locais confirmam consistencia catalogo/registry.

## Tools registradas no DEFAULT_REGISTRY

Todas estao `read_only=True` e `requires_approval=False`.

| Tool | Permissao | Exposta no drawer? |
|---|---|---|
| `search_knowledge` | `can_use_assistant` | Sim, via texto da base |
| `answer_knowledge` | `can_use_assistant` | Sim, via texto da base |
| `get_job_summary` | `can_view_jobs` | Sim |
| `search_jobs` | `can_view_jobs` | Nao |
| `get_job_requirements` | `can_view_jobs` | Sim |
| `get_job_ai_draft_context` | `can_view_jobs` | Nao |
| `get_candidate_summary` | `can_view_candidates` | Sim |
| `search_candidates` | `can_view_candidates` | Nao |
| `get_candidate_profile_context` | `can_view_candidates` | Nao |
| `get_candidate_resume_analysis_summary` | `can_view_candidates` | Nao |
| `get_job_pipeline_overview` | `can_view_pipeline` | Sim |
| `get_candidate_pipeline_position` | `can_view_pipeline` | Nao |
| `get_candidate_pipeline_history` | `can_view_pipeline` | Nao |
| `search_pipeline_candidates` | `can_view_pipeline` | Nao |
| `get_admission_case_summary` | `can_view_admissions` | Sim, mas argumento errado na UI |
| `get_admission_checklist_status` | `can_view_admissions` | Nao |
| `get_admission_documents_status` | `can_view_admissions` | Sim, mas argumento errado na UI |
| `get_admission_events_summary` | `can_view_admissions` | Nao |
| `get_protheus_export_status` | `can_view_protheus_status` | Nao |

Inconsistencia menor: comentario do `registry.py` ainda diz "17 total" e lista sem Knowledge, mas `_EXPECTED_TOOL_COUNT = 19` e testes cobrem 19.

## Acoes do frontend por rota

O drawer extrai parametros por regex:

| Rota | Parametro extraido | Acoes visiveis |
|---|---|---|
| `/vagas/:id` | `jobId` | `job.summary`, `job.requirements`, `pipeline.overview` |
| `/vagas/:id/editar` | `jobId` | Mesmas de vaga |
| `/candidatos/:id` | `candidateId` | `candidate.summary`, `candidate.active_pipeline` |
| `/admitidos/:id` | `admissionId` | `admission.case_summary`, `admission.documents_status` |
| `/admin/*`, `/rh`, `/pipeline/:jobId`, `/admissao/:caseId`, genericas | nenhum ou nao suportado | Nenhuma acao contextual, apenas Knowledge |

Problemas objetivos:

- `candidate.active_pipeline` nao existe no `IntentCatalog`; a acao tende a retornar `UNKNOWN_INTENT`.
- A rota real de admissao tambem e `/admissao/:caseId` e `/admission/cases/:caseId`, mas o drawer so olha `/admitidos/:id`.
- As tools de admissao esperam `admission_case_id`; o drawer envia `admission_id`.
- A rota `/pipeline/:jobId` nao alimenta `jobId` porque `extractParams` nao cobre `/pipeline/:jobId`.
- A action de pipeline por candidato exigiria `job_id` e `candidate_id`, mas o drawer oferece apenas candidateId para uma intent inexistente.

## Historico e renderizacao

- Historico de sessao existe no `AppShell`, persiste enquanto o shell estiver montado e guarda ate 5 itens.
- Cada item guarda label, intent, kind, timestamp, query, resumo curto, resultado sanitizado e erro.
- Reabrir item do historico nao executa nova chamada.
- Resultado usa renderizador generico (`DataNode`) que traduz alguns labels, encurta IDs e remove chaves sensiveis.
- O resultado ainda e majoritariamente uma arvore de dados, nao uma resposta operacional com "diagnostico + por que + proximo passo".

## RAG atual

### Knowledge search

`knowledge.search`:

- valida query vazia;
- gera embedding via provider configurado;
- chama vector store;
- retorna chunks com `chunk_id`, `document_id`, `source_title`, `content`, `score`, metadados filtrados e warnings.

### Knowledge answer

`knowledge.answer`:

- recupera chunks;
- passa os chunks para `RagAnswerService`;
- se `RAG_SYNTHESIS_ENABLED=false`, retorna sucesso com resposta "Sintese de conhecimento desativada globalmente." e warning `rag_synthesis_disabled_by_flag`;
- se nao houver chunks, retorna mensagem de ausencia de evidencia;
- se Gemini falhar, retorna erro amigavel do provider.

### Evidencia de validacao existente

Relatorios anteriores em `.design/ai-live-rag-validation-1` e `.design/ai-live-rag-validation-2` indicam que:

- seed real da base ja foi executado com 6 documentos, 6 chunks e 6 embeddings Gemini;
- `knowledge.search` para "Quando posso exportar uma admissao para o Protheus?" retornou 3 fontes;
- `knowledge.answer` live chegou a recuperar contexto, mas falhou por indisponibilidade do provider Gemini;
- depois disso houve hardening de erro para `PROVIDER_UNAVAILABLE`, `PROVIDER_RATE_LIMITED` e `PROVIDER_TIMEOUT`;
- a revalidacao live pos-hardening nao foi concluida por limitacao do ambiente, nao por falha provada do codigo.

Nesta auditoria nao foi feita nova chamada Gemini real.

### Base seed

Seed local disponivel em `backend/scripts/knowledge_seed_docs`:

| Documento | Palavras aproximadas | Cobertura |
|---|---:|---|
| `admission_rules.md` | 153 | checklist/documentos admissao |
| `protheus_export_rules.md` | 151 | exportacao Protheus ficticia |
| `pipeline_rules.md` | 153 | etapas/gates de pipeline |
| `job_quality_rules.md` | 126 | qualidade de vagas |
| `anti_discrimination_policy.md` | 138 | criterios proibidos |
| `assistant_usage_policy.md` | 158 | uso seguro do assistente |

Essa base e suficiente para smoke test, mas pequena e generica para operacao real.

## Admin IA e usage/tokens

Superficies:

- `/admin` aba `IA`: governanca, status, consumo, warnings e atalhos.
- `/admin/ia`: laboratorio com status geral/Gemini/RAG/Assistente/Protheus e tres testes rapidos de Knowledge.
- `/admin/conhecimento`: CRUD admin de documentos, reindexacao, status de indexacao e teste basico de busca.
- `AiUsagePanel`: metricas por periodo, provider, modelo, custo estimado, falhas, uso diario e analises mais caras.

Limite atual: uso/tokens monitora o que e logado por services. O endpoint do assistente estruturado em si nao registra todas as chamadas de tools read-only; `rag_synthesis` registra chamadas do provider quando `RagAnswerService` usa session.

## Validacao executada

- `backend/.venv/bin/python -m pytest tests/unit/test_ai_assistant_router.py tests/unit/test_ai_assistant_endpoint.py tests/unit/test_ai_tool_registry.py tests/unit/test_ai_tool_runtime.py -v`: 132 passed.
- `frontend npx tsc --noEmit`: sem erros.
- `frontend npm run test -- --run AiAssistantDrawer`: 48 passed.
