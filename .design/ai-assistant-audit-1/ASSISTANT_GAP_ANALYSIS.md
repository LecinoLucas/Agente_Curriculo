# ASSISTANT_GAP_ANALYSIS

| Gap | Impacto | Modulo afetado | Severidade | Esforco | Fase sugerida |
|---|---|---|---|---|---|
| Quick action `candidate.active_pipeline` nao existe no catalogo | Erro visivel e perda de confianca | Frontend drawer / IntentCatalog | HIGH | Baixo | AI-ASSISTANT-UX-1 |
| Acoes de admissao enviam `admission_id`, mas tools esperam `admission_case_id` | Acoes admissionais quebram ou retornam erro | Frontend drawer / admission tools | HIGH | Baixo | AI-ASSISTANT-UX-1 |
| Drawer nao reconhece `/admissao/:caseId` e `/admission/cases/:caseId` | RH abre caso real e nao recebe acoes | Frontend drawer | HIGH | Baixo | AI-ASSISTANT-CONTEXT-1 |
| Drawer nao reconhece `/pipeline/:jobId` | Pipeline, uma das jornadas mais uteis, fica sem contexto | Frontend drawer | HIGH | Baixo | AI-ASSISTANT-CONTEXT-1 |
| Tools uteis nao expostas (`resume_analysis`, `profile_context`, `checklist_status`, `events_summary`, `protheus.export_status`) | Usuario so ve consultas superficiais | Frontend drawer | HIGH | Medio | AI-ASSISTANT-UX-1 |
| Resposta generica em arvore de dados | Baixa legibilidade, parece JSON bonito | Frontend drawer | HIGH | Medio | AI-ASSISTANT-UX-1 |
| Sem resposta por jornada com diagnostico/proximos passos | Assistente nao ajuda decisao operacional | Assistant UX/backend presenter | HIGH | Medio | AI-ASSISTANT-NEXT-ACTIONS-1 |
| 1 intent = 1 tool | Nao cruza vaga, candidato, pipeline e admissao | AssistantRouter/ToolRuntime camada futura | HIGH | Alto | AI-ASSISTANT-MULTITOOL-1 |
| Sem texto livre controlado para operacao | Usuario precisa conhecer botoes e intents | Assistant routing | HIGH | Medio-alto | AI-ASSISTANT-INTENT-1 |
| RAG base pequena e ficticia | Respostas de conhecimento parecem genericas | Knowledge base | HIGH | Medio | AI-KNOWLEDGE-ADMIN-1A |
| `knowledge.answer` com synthesis desligado retorna sucesso pouco util | Botao "Responder" pode frustrar | RAG/UX | MEDIUM | Baixo | AI-ASSISTANT-UX-1 |
| Warnings tecnicos aparecem em admin/lab | Admin sabe que ha problema, mas nao sabe acao | AiSettings/KnowledgeAdmin | MEDIUM | Baixo | AI-KNOWLEDGE-ADMIN-1A |
| Viewer ve drawer mas nao pode usar Knowledge | UX confusa para role read-only | AppShell/drawer/RBAC | MEDIUM | Baixo | AI-ASSISTANT-UX-1 |
| `search_jobs`, `search_candidates`, `search_pipeline_candidates` nao aparecem | Buscas operacionais ficam inacessiveis | Drawer | MEDIUM | Medio | AI-ASSISTANT-INTENT-1 |
| Sem ranking de acoes sugeridas por pagina | Acoes ficam estaticas e pouco relevantes | Drawer | MEDIUM | Medio | AI-ASSISTANT-NEXT-ACTIONS-1 |
| Sem criterio temporal/SLA para gargalos | Gargalo = maior contagem, nao urgencia real | Pipeline tools | MEDIUM | Medio | AI-ASSISTANT-MULTITOOL-1 |
| Sem citacoes para dados operacionais | Usuario nao sabe de onde veio recomendacao | Tool response/presenter | MEDIUM | Medio | AI-ASSISTANT-NEXT-ACTIONS-1 |
| Usage nao cobre todas as chamadas read-only do assistant | Admin ve tokens de RAG, mas nao uso real das tools | AIUsageService/endpoint | MEDIUM | Medio | AI-USAGE-LIMITS-1 |
| Limites por usuario/feature ainda ausentes no assistant | Risco de abuso e custo se free text/RAG crescer | AI limits | MEDIUM | Medio | AI-USAGE-LIMITS-1 |
| Logs de permissao incluem user_id em mensagem de erro interna | Baixo risco de exposicao no payload se frontend nao sanitizar | PermissionGuard/ToolRuntime | MEDIUM | Baixo | AI-ASSISTANT-SECURITY-1 |
| Knowledge admin allowed_roles usa strings uppercase, mas busca nao filtra por role no retriever observado | Possivel lacuna de controle por documento | RAG retrieval/admin | MEDIUM | Medio | AI-KNOWLEDGE-ADMIN-1A |
| Validacao de conteudo RAG bloqueia termos amplos como RG/documento pessoal | Pode impedir documentos operacionais legitimos | KnowledgeAdmin | LOW | Baixo | AI-KNOWLEDGE-ADMIN-1A |
| Comentario do registry diz 17 tools, codigo tem 19 | Confusao em manutencao | Docs/codigo | LOW | Baixo | AI-ASSISTANT-UX-1 |
| Historico limitado a 5 itens e sem memoria semantica | Pouco util para continuidade | Drawer/session | LOW | Medio | AI-ASSISTANT-CONTEXT-1 |
| Sem captura de screenshots nesta fase | UX visual nao foi validada em browser | Auditoria | LOW | Baixo | Fase de design review |

## Gaps tecnicos faltantes por categoria

### Contexto automatico

Necessario para o assistente deixar de depender de botoes soltos. O contexto minimo deveria incluir rota, entidade atual, role, pagina, IDs relacionados e capacidades permitidas.

### Free text controlado

Deve existir apenas com classificador/roteador de intents permitidas, sem LLM geral livre. O texto deve virar intent read-only com argumentos validados.

### Multi-tool read-only

Necessario para respostas como "o que falta para exportar", "quem precisa de acao hoje" e "essa vaga esta boa". O planner deve ser deterministico/limitado, com allowlist de tool chains.

### Ranking de acoes

O drawer deve mostrar acoes mais relevantes por pagina e estado. Exemplo: caso admissional com blocker deve sugerir "Ver bloqueadores de exportacao" antes de "Resumo".

### Memory/session history

O historico atual guarda resultados, mas nao alimenta proximas respostas. Uma memoria curta e read-only poderia guardar contexto da pagina e ultimas perguntas sem dados sensiveis brutos.

### Citacoes/fonte

RAG tem fontes. Tools operacionais nao tem citacao de campos/telas. Respostas ideais deveriam dizer "Dados usados: checklist, documentos, pipeline".

### Limites

Antes de ampliar free text/RAG, adicionar limites por feature/role/usuario e metricas do assistant estruturado.

