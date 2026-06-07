# ASSISTANT_USEFULNESS_REVIEW

## Diagnostico principal

O assistente esta correto como infraestrutura read-only, mas ainda fraco como produto operacional. Ele consulta dados, mas raramente transforma esses dados em decisao, prioridade ou proximo passo. O usuario final nao quer "ver o JSON da vaga"; ele quer saber se a vaga esta pronta, o que falta, quem merece atencao hoje e qual risco existe antes de agir.

## Por que parece inutil

| Causa | Evidencia no estado atual | Efeito para usuario |
|---|---|---|
| Acoes demais sao consultas obvias | `job.summary`, `candidate.summary`, `job.requirements` repetem dados da propria tela | Parece um espelho da UI |
| Quick actions quebradas | `candidate.active_pipeline` nao existe; admissao envia `admission_id`, mas backend espera `admission_case_id` | Erro ou acao sem valor |
| Tools uteis nao aparecem | `job.ai_draft_context`, `candidate.resume_analysis`, `candidate.profile_context`, `admission.checklist_status`, `admission.events_summary`, `protheus.export_status` nao estao expostas | O que poderia ajudar fica escondido |
| Falta contexto automatico | Drawer so extrai ID de algumas rotas; nao cobre `/pipeline/:jobId`, `/admissao/:caseId` ou tela admin relevante | Acoes somem onde seriam mais uteis |
| Sem raciocinio multi-etapa | Router mapeia 1 intent para 1 tool | Nao cruza vaga + pipeline + candidato + admissao |
| Sem ranking/priorizacao | Tools retornam listas/contagens, mas nao ordenam por urgencia ou risco operacional | Usuario ainda precisa interpretar tudo |
| Sem texto livre controlado para dados operacionais | Texto livre so existe para Knowledge; perguntas operacionais precisam virar botoes predefinidos | Usuario precisa saber qual botao apertar |
| Resposta generica em arvore de dados | `DataNode` mostra campos e arrays; nao gera narrativa de decisao | Baixa legibilidade e baixo valor |
| RAG pequeno e generico | 6 documentos seed, ~879 palavras totais, varios ficticios | Respostas reais ficam superficiais |
| Warnings tecnicos vazam | Alguns warnings aparecem como codigo (`rag_synthesis_disabled_by_flag`, `embedding_provider_error`) em admin/lab | Admin entende, usuario operacional nao |

## Exemplos de respostas pobres provaveis

### Vaga

Pergunta desejada: "Essa vaga esta boa?"

O que existe hoje:

- `job.summary`: titulo, status, area, senioridade, localidade, skills.
- `job.requirements`: skills, requisitos, perguntas, deal breakers.
- `job.ai_draft_context`: existe no backend, mas nao aparece no drawer.

Por que e pobre:

- nao compara campos preenchidos vs criterios de qualidade;
- nao aponta requisitos fracos, discriminatorios ou ausentes;
- nao diz "pronta para publicar" ou "bloqueada por X";
- nao usa RAG de `job_quality_rules` como fonte de avaliacao.

Resposta ideal:

"A vaga ainda nao parece pronta. Faltam responsabilidades claras e as skills obrigatorias misturam requisito essencial com diferencial. Antes de publicar, revise: 1. separar obrigatorios/desejaveis; 2. incluir contexto de experiencia; 3. validar perguntas de triagem contra a politica antidiscriminatoria."

### Candidato

Pergunta desejada: "Esse candidato combina com qual vaga?"

O que existe hoje:

- `candidate.summary`: dados cadastrais seguros.
- `candidate.profile_context`: links, tags e preferencias, nao exposta.
- `candidate.resume_analysis`: status de parse/qualidade, nao exposta.
- Nao ha tool de matching candidato-vaga no assistant.

Por que e pobre:

- nao cruza candidato com vagas;
- nao usa score/ranking ja existente como contexto;
- nao avalia pontos fortes/fracos;
- pode repetir nome, email, tags e status.

### Pipeline

Pergunta desejada: "Onde esta o gargalo?"

O que existe hoje:

- `pipeline.overview`: contagem por etapa e `bottleneck_stage`.

Por que ainda e limitado:

- gargalo e apenas "etapa com mais candidatos", sem SLA, tempo parado, prioridade ou proximo passo;
- nao lista quem esta parado;
- nao separa gargalo benigno de gargalo critico;
- nao sugere acao de hoje.

### Admissao

Pergunta desejada: "O que falta para exportar?"

O que existe hoje:

- `admission.case_summary`: ja traz `main_blocker`, `next_action`, progresso e readiness.
- `admission.documents_status`: lista docs.
- `admission.checklist_status`: existe, mas nao exposta.
- `protheus.export_status`: existe, mas nao exposta.

Por que a UI perde valor:

- drawer nao cobre rotas reais `/admissao/:caseId` e `/admission/cases/:caseId`;
- argumentos enviados nao batem com backend;
- a melhor pergunta ("faltas e bloqueadores") nao aparece como acao clara.

### Knowledge

Pergunta desejada: "Quando posso exportar para Protheus?"

O que existe hoje:

- busca e resposta com fontes.

Por que pode frustrar:

- se synthesis esta desligada, "Responder" retorna mensagem de feature desligada;
- se embedding provider falha, busca retorna vazio com warning tecnico;
- base seed e curta/ficticia;
- fontes nao sao apresentadas como politica operacional robusta.

## Lacunas por persona

| Persona | O que espera | O que recebe hoje | Lacuna |
|---|---|---|---|
| Admin | status IA, custo, provider, base, falhas | Boa cobertura em `/admin` e `/admin/ia` | Falta qualidade de documentos, documentos com erro e limite por usuario/feature |
| RH | pendencias admissionais, documentos travando, Protheus | Tools existem, drawer nao aciona direito | Falta jornada "pronto para exportar" contextual |
| Recrutador | qualidade da vaga, candidatos prioritarios, gargalo | Resumo de vaga/pipeline/candidato | Falta recomendacao e cruzamento vaga-candidato-pipeline |
| Gestor | decisao sobre candidatos e scorecards | Permissao backend permite candidates/jobs/pipeline, mas telas de gestor nao tem contexto no drawer | Falta assistente de decisao com evidencias |
| Viewer | leitura agregada | Drawer aparece, Knowledge negado | UX confusa; deveria esconder/descrever limitacao |
| Candidato | fora do escopo interno | Sem permissao | Deve continuar fora do assistant interno |

## Lacunas por jornada

### Jornada de vaga

Atual:

- Resumo, requisitos e overview do pipeline.

Falta:

- "esta pronta para publicar?";
- "quais campos estao fracos?";
- "quais requisitos podem gerar vies?";
- "qual acao antes de publicar?";
- uso combinado de `job.ai_draft_context` + RAG de qualidade + politica antidiscriminatoria.

### Jornada de candidato

Atual:

- Resumo basico.

Falta:

- fit por vaga;
- pontos fortes/fracos baseados em analise;
- problemas de curriculo;
- proximo passo no pipeline;
- historico do candidato em uma vaga especifica.

### Jornada de pipeline

Atual:

- Contagem por etapa e gargalo simples.

Falta:

- candidatos parados;
- tempo em etapa;
- candidatos prontos para decisao;
- prioridades de hoje;
- comparacao entre etapas e vagas.

### Jornada de admissao

Atual:

- Backend tem bom material de caso, checklist, docs e eventos.

Falta:

- exposicao correta no drawer;
- resposta consolidada "o que falta para exportar";
- explicacao segura do bloqueador;
- relacao checklist/documentos/pacote Protheus.

### Jornada Protheus

Atual:

- Tool existe para status de pacote.

Falta:

- acao no drawer;
- extracao de `package_id` a partir do caso;
- explicacao "por que nao pode enviar";
- orientacao por erro de validacao.

### Jornada Admin/IA

Atual:

- Boa visibilidade de status, flags, usage e testes RAG.

Falta:

- diagnostico agregado de documentos RAG com erro;
- qualidade/cobertura da base;
- indice de documentos sem embeddings;
- alertas traduzidos para acao.

## Conclusao de utilidade

O maior problema nao e falta de arquitetura. E falta de "produto de assistente": contexto automatico, perguntas certas, respostas sintetizadas por jornada, e composicao de tools. O proximo ciclo deveria priorizar utilidade read-only antes de qualquer escrita por IA.

