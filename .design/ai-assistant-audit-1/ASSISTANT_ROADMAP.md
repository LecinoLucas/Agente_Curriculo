# ASSISTANT_ROADMAP

## Principio de evolucao

Manter o assistente read-only e orientado a evidencias. A prioridade nao e "chat livre"; e entregar respostas operacionais melhores com os dados e tools ja existentes.

## Fase 1: AI-ASSISTANT-UX-1

Objetivo: fazer o drawer parar de quebrar e responder de forma legivel.

Escopo:

- Corrigir intents/argumentos das quick actions atuais.
- Remover ou substituir `candidate.active_pipeline`.
- Usar `admission_case_id` nas acoes admissionais.
- Expor actions ja existentes e seguras: resume analysis, profile context, checklist status, events summary, Protheus status quando houver contexto.
- Criar presenters por dominio em vez de renderizar tudo como arvore generica.
- Traduzir warnings tecnicos para mensagens acionaveis.
- Ocultar/desabilitar acoes por role quando a permissao for conhecida no frontend.

Nao fazer:

- Nao ativar free text operacional.
- Nao criar tool de escrita.
- Nao acionar Protheus real.

## Fase 2: AI-ASSISTANT-CONTEXT-1

Objetivo: contexto automatico da tela.

Escopo:

- Criar modelo frontend de `AssistantPageContext`.
- Cobrir rotas: `/vagas/:jobId`, `/vagas/:jobId/editar`, `/pipeline/:jobId`, `/candidatos/:candidateId`, `/admissao/:caseId`, `/admission/cases/:caseId`, `/admin/ia`, `/admin/conhecimento`.
- Passar entity IDs relacionados quando a tela ja tiver esses dados carregados.
- Mostrar empty states especificos: "Abra uma vaga", "Abra um caso admissional", "Esta tela so permite Knowledge".
- Persistir session_id por drawer/sessao sem armazenar PII extra.

## Fase 3: AI-ASSISTANT-INTENT-1

Objetivo: texto livre controlado para intents read-only.

Escopo:

- Campo "Pergunte sobre esta tela" sem provider generativo livre.
- Classificador deterministico ou LLM restrito com schema para mapear texto para intents permitidas.
- Allowlist por dominio/role/pagina.
- Validacao de argumentos antes de executar.
- Fallback: "Nao consigo responder isso ainda; tente uma destas acoes".

Exemplos:

- "O que falta para publicar?" -> `job.ai_draft_context` + presenter de qualidade.
- "Quais documentos travam?" -> `admission.documents_status`.
- "Onde esta o gargalo?" -> `pipeline.overview`.

## Fase 4: AI-ASSISTANT-MULTITOOL-1

Objetivo: respostas multi-tool read-only e limitadas.

Escopo:

- Planner read-only com chains fixas por jornada.
- Limite de steps, timeout, budget e allowlist.
- Respostas compostas:
  - vaga: contexto + requisitos + RAG qualidade;
  - candidato: resumo + analise curriculo + pipeline position;
  - admissao: caso + checklist + documentos + Protheus;
  - pipeline: overview + candidates + history.
- Citar dados usados e lacunas.

Nao fazer:

- Planner generico sem allowlist.
- Tool de escrita.
- Decisao automatica final.

## Fase 5: AI-ASSISTANT-NEXT-ACTIONS-1

Objetivo: transformar dados em proximos passos.

Escopo:

- Biblioteca de recomendacoes read-only por dominio.
- Saidas padronizadas:
  - status;
  - evidencias;
  - riscos;
  - proximos passos humanos;
  - acoes bloqueadas.
- Ranking de acoes sugeridas no drawer por contexto.
- Cautelas para decisao de candidato: "recomendacao assistiva, revisao humana obrigatoria".

## Fase 6: AI-KNOWLEDGE-ADMIN-1A

Objetivo: tornar a base RAG operacional.

Escopo:

- Expandir base com documentos reais aprovados: politicas RH, checklists, Protheus, pipeline, qualidade de vaga, LGPD, scorecards.
- Painel de cobertura por dominio/persona.
- Documentos com erro de indexacao em destaque.
- Busca teste mostrando fontes, trechos e score, nao apenas intent/warnings.
- Filtros por status, dominio, role, sensitivity.
- Revisar controle por `allowed_roles` no retrieval.
- Melhorar mensagens quando provider/embedding falhar.

## Fase 7: AI-USAGE-LIMITS-1

Objetivo: governanca antes de ampliar IA.

Escopo:

- Logar chamadas do assistant estruturado por intent/tool/status/role sem payload sensivel.
- Limites por feature, usuario, role e periodo.
- Alertas para erro alto, provider indisponivel, uso anormal.
- Dashboard de custo estimado por feature.
- Politica de retencao de historico.

## Fase 8: AI-ASSISTANT-SECURITY-1

Objetivo: hardening antes de qualquer ampliacao de escopo.

Escopo:

- Revisar mensagens de erro para remover user_id/tool interna do payload final.
- Garantir filtro por role/documento no RAG.
- Testes de prompt injection em Knowledge.
- Testes de dados sensiveis em tools e presenters.
- Confirmar que candidato nunca acessa assistant interno.
- Threat model de free text controlado.

## Ordem recomendada

1. `AI-ASSISTANT-UX-1`
2. `AI-ASSISTANT-CONTEXT-1`
3. `AI-KNOWLEDGE-ADMIN-1A`
4. `AI-ASSISTANT-INTENT-1`
5. `AI-ASSISTANT-MULTITOOL-1`
6. `AI-ASSISTANT-NEXT-ACTIONS-1`
7. `AI-USAGE-LIMITS-1`
8. `AI-ASSISTANT-SECURITY-1`

Motivo: primeiro corrigir o que esta visivel e quebrado, depois ampliar contexto e base de conhecimento, depois liberar texto livre controlado e composicao de tools.

