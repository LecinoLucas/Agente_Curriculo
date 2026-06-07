# ASSISTANT_PERSONA_JOURNEYS

## Matriz de utilidade por persona

| Persona | Utilidade atual | Utilidade potencial | Prioridade |
|---|---:|---:|---|
| Admin | Alta para governanca, media para RAG | Alta | Alta |
| RH | Baixa no drawer, media no backend | Muito alta | Alta |
| Recrutador | Media-baixa | Muito alta | Alta |
| Gestor | Baixa | Alta | Media |
| Viewer | Baixa | Baixa-media | Baixa |
| Candidato | Fora do escopo | Baixa para assistant interno | Nao incluir |

## Admin

| Jornada | Perguntas uteis | Resposta ideal | Dados necessarios | Risco |
|---|---|---|---|---|
| Governanca IA | Quanto gastamos hoje? Quais features falharam? | Resumo de chamadas, tokens, erros, custo e top falhas, com acao recomendada | `AIUsageService`, status provider, logs agregados | Baixo, desde que sem prompt/resposta |
| Status provider | Gemini esta funcionando? RAG esta indexado? | Status claro: provider, chave, synthesis, embeddings, pgvector/fallback | `/ai/status`, knowledge docs, embeddings | Medio se expor segredos ou mensagens brutas |
| Base de conhecimento | Quais documentos estao sem embedding ou com erro? | Lista priorizada: documento, status, erro amigavel, ultima indexacao | Knowledge admin service | Medio se preview incluir dado sensivel |
| Limites | Quem consumiu muito? Qual feature deve ter limite? | Recomendacao de limite por feature/role/usuario | Usage por usuario/feature | Medio por vigilancia/privacidade |

## RH

| Jornada | Perguntas uteis | Resposta ideal | Dados necessarios | Risco |
|---|---|---|---|---|
| Admissao | O que falta para exportar? | "Nao esta pronto. Bloqueadores: CPF pendente, comprovante rejeitado. Proximo passo seguro: solicitar correcao." | `admission.case_summary`, checklist, docs, package/protheus | Alto se aprovar ou exportar automaticamente |
| Documentos | Quais documentos travam? | Lista curta por severidade, status e responsavel | `admission.documents_status`, checklist | Medio por dados pessoais |
| Protheus | Por que nao pode enviar? | Explicacao dos erros de validacao sem payload completo | package status, validator errors, RAG Protheus | Alto se expor payload ERP |
| Comunicacao | O que devo pedir ao candidato? | Texto sugerido revisavel, sem envio automatico | docs pendentes/rejeitados | Medio; escrita deve exigir humano |

## Recrutador

| Jornada | Perguntas uteis | Resposta ideal | Dados necessarios | Risco |
|---|---|---|---|---|
| Vaga | Essa vaga esta boa? | Diagnostico de qualidade: campos fortes/fracos, risco de vies, pronto/não pronto | `job.ai_draft_context`, `job.requirements`, RAG qualidade/politica | Medio por vies em recomendacao |
| Candidatos da vaga | Quais candidatos sao melhores? | Ranking explicavel com score, evidencia e cautelas | pipeline candidates, ranking/matching, candidate summaries | Alto por decisao automatizada |
| Pipeline | Quem precisa de acao hoje? | Lista por etapa, tempo parado, proximo passo sugerido | pipeline overview/history, timestamps, agenda | Medio |
| Candidato | Qual proximo passo? | "Avancar para entrevista" ou "revisar curriculo" como recomendacao, nao acao | candidate, resume analysis, pipeline position, job | Alto se mover candidato automaticamente |

## Gestor

| Jornada | Perguntas uteis | Resposta ideal | Dados necessarios | Risco |
|---|---|---|---|---|
| Decisao | Quem esta pronto para decisao? | Comparativo de finalistas com evidencias e pendencias | pipeline, scorecards, candidate summaries | Alto por vies e decisao automatizada |
| Entrevista | O que devo perguntar? | Perguntas baseadas na vaga e lacunas do candidato | job requirements, candidate profile, scorecards | Medio |
| Scorecard | O que falta avaliar? | Lacunas por competencia e recomendacao de coleta | scorecards, template comportamental | Medio |
| Revisao | Esse candidato atende os requisitos? | Avaliacao explicavel, com "insuficiente evidencia" quando aplicavel | matching/analysis, curriculo analisado, vaga | Alto se conclusivo demais |

## Viewer

| Jornada | Perguntas uteis | Resposta ideal | Dados necessarios | Risco |
|---|---|---|---|---|
| Leitura agregada | Como esta o pipeline geral? | Resumo sem PII e sem detalhes sensiveis | dashboards agregados | Baixo-medio |
| Vagas | Quais vagas estao abertas? | Lista sem dados sensiveis | jobs | Baixo |
| Knowledge | Qual politica interna se aplica? | Hoje e negado; poderia ser liberado por role se fizer sentido | RAG com roles | Medio por politica interna |

## Candidato

O candidato nao deve acessar o assistant interno. Se houver assistente no portal do candidato, deve ser outro produto, com escopo limitado a:

- status proprio;
- documentos proprios;
- instrucoes de envio;
- suporte sem revelar criterios internos, rankings, notas ou comparacoes.

## Jornadas prioritarias futuras

### 1. Vaga

Perguntas:

- "Essa vaga esta boa?"
- "Quais requisitos estao fracos?"
- "Quais candidatos sao melhores?"
- "O que falta para publicar?"

Resposta ideal:

- status: pronta / precisa revisao / bloqueada;
- 3 principais problemas;
- impacto operacional;
- proximo passo;
- fontes/dados usados.

Dados necessarios:

- `job.ai_draft_context`;
- `job.requirements`;
- RAG `job_quality_rules` e `anti_discrimination_policy`;
- pipeline/ranking quando houver candidatos.

### 2. Candidato

Perguntas:

- "Esse candidato combina com qual vaga?"
- "Quais pontos fortes/fracos?"
- "O curriculo tem problema?"
- "Qual proximo passo?"

Resposta ideal:

- avaliacao por vaga ou lista de vagas candidatas;
- evidencias do curriculo/analise;
- lacunas;
- riscos de decisao;
- proximo passo humano.

Dados necessarios:

- `candidate.profile_context`;
- `candidate.resume_analysis`;
- pipeline position/history;
- job requirements;
- matching/ranking existente.

### 3. Pipeline

Perguntas:

- "Onde esta o gargalo?"
- "Quem esta parado?"
- "Quem precisa de acao hoje?"
- "Quais candidatos estao prontos para decisao?"

Resposta ideal:

- gargalo com criterio claro;
- lista de candidatos por prioridade;
- tempo parado;
- acao recomendada;
- alerta de ausencia de SLA se nao houver dado.

Dados necessarios:

- `pipeline.overview`;
- `pipeline.search_candidates`;
- `pipeline.history`;
- timestamps e status.

### 4. Admissao

Perguntas:

- "O que falta para exportar?"
- "Quais documentos travam?"
- "Quem esta pendente?"
- "Qual proximo passo seguro?"

Resposta ideal:

- readiness;
- bloqueador principal;
- documentos pendentes/rejeitados;
- proximo passo;
- sem mostrar documento bruto.

Dados necessarios:

- `admission.case_summary`;
- `admission.checklist_status`;
- `admission.documents_status`;
- `admission.events_summary`;
- package/protheus status.

### 5. Protheus

Perguntas:

- "Esta pronto para exportar?"
- "Por que nao pode enviar?"
- "Qual erro precisa corrigir?"

Resposta ideal:

- status do pacote;
- erros de validacao agrupados;
- campo/processo responsavel;
- proximo passo seguro;
- nunca enviar real por IA.

Dados necessarios:

- `protheus.export_status`;
- validation errors;
- RAG Protheus;
- flags de capability.

### 6. Admin/IA

Perguntas:

- "Quanto gastamos de tokens?"
- "Gemini esta funcionando?"
- "RAG esta indexado?"
- "Quais documentos estao com erro?"

Resposta ideal:

- resumo executivo;
- riscos ativos;
- top falhas;
- documentos com erro;
- recomendacao de acao administrativa.

Dados necessarios:

- `/ai/status`;
- `/ai/usage/summary`;
- knowledge admin list;
- system health usage.

