# Design Brief: IA Comportamental

## 1. Problema

Admins e recrutadores conseguem solicitar e ver a IA comportamental dentro do perfil do candidato, mas nao existe uma visao central para operar a fila. Quando uma avaliacao fica pendente, processando, falha, entra em retry ou sofre erro de credencial/rate limit, o usuario precisa investigar em telas diferentes e perde clareza sobre o que esta parado, o que esta resolvido e o que exige acao.

O atrito principal nao e gerar a analise; isso ja funciona. O problema e acompanhar a operacao de forma confiavel e segura.

## 2. Objetivo

Criar uma tela operacional dedicada em `/analises-ia/comportamental` para acompanhar avaliacoes comportamentais IA com foco em:

- status da fila;
- falhas seguras e acionaveis;
- provider/modelo usado;
- tentativas e retries;
- navegacao contextual para candidato e vaga;
- reprocessamento quando permitido;
- ausencia de vazamento de segredo, prompt, resposta bruta ou stack trace.

## 3. Publico

Publico primario:
- `admin`
- `recruiter`

Jobs to be done:
- Recrutador: entender rapidamente se a IA comportamental de uma vaga/candidato esta pendente, processando, concluida ou com falha.
- Admin: diagnosticar falhas operacionais por credencial, provider, rate limit ou resposta invalida sem acessar dados sensiveis.

## 4. Escopo

Inclui:
- nova tela `IA Comportamental`;
- rota planejada `/analises-ia/comportamental`;
- listagem paginada de avaliacoes comportamentais IA;
- KPIs operacionais;
- filtros por status, erro, provider, modelo, periodo, candidato e vaga;
- acoes seguras: ver detalhes, abrir candidato, abrir vaga, reprocessar quando permitido;
- estados de loading, vazio, erro, sem permissao, retry solicitado e detalhe aberto;
- padrao visual coerente com o sistema atual.

## 5. Fora de Escopo

Nao inclui:
- implementar codigo;
- alterar backend;
- alterar frontend;
- alterar endpoints;
- alterar permissoes;
- criar migration;
- alterar pipeline;
- alterar score;
- alterar ranking;
- alterar matching;
- alterar `current_analysis_id`;
- alterar `active_job_id`;
- criar acao destrutiva;
- exibir ou editar resultado bruto da IA;
- substituir a aba Avaliacoes do perfil do candidato.

## 6. Principios de UX

1. Clareza operacional sobre detalhe tecnico -- o usuario deve saber o estado e a proxima acao sem interpretar logs ou payloads.
2. Seguranca por padrao -- a interface deve mostrar codigos/mensagens seguras, nunca dados sensiveis ou respostas brutas.
3. Densidade organizada -- a tela deve suportar monitoramento recorrente com filtros, tabela e KPIs compactos, sem virar uma landing page ou dashboard decorativo.

## 7. Direcao Visual

- Filosofia: painel operacional corporativo, denso e calmo.
- Tom: claro, preciso, confiavel, sem urgencia artificial.
- Referencias internas: `AnalisesIaPage`, `SystemHealthPage`, `AdminAiProviderCredentialsPage`, `DataTable`, `MetricCard`, badges de status e filtros existentes.
- Anti-referencias: pagina promocional, hero visual, cards grandes decorativos, tabela tecnica crua sem hierarquia, cores excessivas.

Usar tokens existentes:
- superficies: `--bg`, `--surface`, `--surface-muted`;
- texto: `--text`, `--text-muted`;
- bordas: `--border`;
- acao/foco: `--primary`;
- semantica: `--success`, `--warning`, `--danger`;
- fontes: `Plus Jakarta Sans` para UI e `Sora`/`font-heading` quando ja usado em headings.

Direcao de cor:
- verde apenas para concluida;
- azul/discreto ou primary moderado para processando;
- neutro para pendente/na fila;
- amarelo/laranja para retry/rate limit;
- vermelho semantico `danger`, nao vermelho de marca, para falhas;
- evitar carnaval visual.

## 8. Estrutura da Tela

Rota:
- `/analises-ia/comportamental`

Menu:
- grupo: `IA & Automacao`
- item: `IA Comportamental`
- caption: `Fila e avaliacoes`

Layout recomendado:

1. Header fixo da pagina
   - titulo: `IA Comportamental`;
   - subtitulo dinamico com total e estado dos filtros;
   - botao `Atualizar`;
   - link admin-only opcional para `Credenciais IA`.

2. Barra de filtros
   - busca;
   - status;
   - tipo de erro;
   - provider;
   - modelo;
   - periodo;
   - limpar filtros.

3. KPIs operacionais
   - cards compactos, 4 a 8 conforme espaco;
   - devem usar altura estavel e numeros em destaque.

4. Listagem principal
   - tabela operacional com linhas compactas;
   - status muito visivel;
   - erro seguro truncado com detalhe expandivel;
   - acoes contextuais.

5. Painel/modal de detalhes seguros
   - abre ao clicar em `Ver detalhes`;
   - mostra metadados e timeline;
   - nunca mostra prompt, resposta bruta ou segredo.

## 9. KPIs

KPIs desejados:

| KPI | Definicao |
| --- | --- |
| Pendentes | `status = pending` |
| Processando | `status = processing` |
| Concluidas hoje | `status = completed` e `completed_at` no dia atual |
| Falhas | `status = failed` |
| Rate limited | `provider_error_type = ai_rate_limited` ou equivalente |
| Credencial invalida | `provider_error_type = ai_credential_invalid` |
| Proximos retries | `status = retry_scheduled` com `next_retry_at` futuro |
| Fila behavioral_ai | tamanho da fila, apenas se houver endpoint seguro |

Se o endpoint nao entregar todos os KPIs, a primeira versao deve:
- usar metricas disponiveis do endpoint existente;
- nao inventar contagens via heuristica insegura;
- deixar indicador ausente como `-` ou ocultar o card.

## 10. Tabela / Listagem

Colunas:

| Coluna | Conteudo |
| --- | --- |
| Candidato | nome do candidato, identificador secundario seguro se ja permitido |
| Vaga | titulo da vaga |
| Status | badge: Na fila, Processando, Concluida, Falhou, Retry agendado, Rate limit, Credencial invalida |
| Provider | provider normalizado, ex.: google |
| Modelo | model_id, ex.: gemini-2.5-flash |
| Tentativas | retry_count/attempts |
| Criado em | created_at/requested_at |
| Enfileirado em | queued_at |
| Iniciado em | started_at |
| Concluido em | completed_at |
| Proxima tentativa | next_retry_at |
| Erro seguro | provider_error_type + mensagem sanitizada |
| Acoes | detalhes, abrir candidato, abrir vaga, reprocessar |

Comportamento:
- linhas com `failed`, `retry_scheduled` e `processing` devem ser mais faceis de escanear;
- erro seguro deve truncar em tabela e aparecer completo no detalhe;
- datas devem usar formato local consistente com o restante do app;
- quando provider/modelo estiver ausente, mostrar `-`, nao `undefined`.

Ordenacao padrao:
1. itens que exigem atencao: failed, retry_scheduled, processing, pending;
2. depois mais recentes por `updated_at` ou `created_at`.

## 11. Filtros

Filtros obrigatorios:
- busca por candidato/vaga;
- status;
- erro operacional;
- provider;
- modelo;
- periodo;
- pagina/paginacao.

Valores de status:
- Todos;
- Na fila;
- Processando;
- Concluida;
- Falhou;
- Retry agendado;
- Rate limit;
- Credencial invalida.

Valores de erro:
- Todos;
- Credencial indisponivel;
- Credencial invalida;
- Rate limit;
- Timeout;
- Resposta invalida;
- Enqueue falhou;
- Erro inesperado.

Regras:
- filtros devem ser refletidos na URL por query params quando viavel;
- limpar filtros deve preservar a rota;
- busca deve ter debounce ou submit explicito, seguindo padrao atual do app;
- filtros nao devem depender de dados sensiveis.

## 12. Acoes

Permitidas:
- Ver detalhes;
- Abrir candidato;
- Abrir vaga;
- Reprocessar quando endpoint existir e permissao permitir;
- Atualizar lista.

Reprocessar:
- aparece apenas quando permitido pelo backend;
- bloqueia duplo clique;
- mostra loading na acao da linha;
- apos sucesso, refaz fetch e atualiza KPIs;
- nao aparece para `completed`;
- nao aparece para `processing` recente;
- nao cria avaliacao duplicada por inferencia do frontend.

Nao permitidas nesta fase:
- excluir avaliacao;
- editar status manualmente;
- editar resultado;
- descartar avaliacao;
- forcar completed/failed;
- alterar pipeline, score, ranking ou matching.

## 13. Estados

### Loading

- Skeleton de KPIs e tabela;
- filtros visiveis, mas desabilitados ou com estado carregando;
- layout nao deve saltar.

### Vazio sem avaliacoes

Mensagem:
`Nenhuma avaliacao comportamental com IA foi solicitada ainda.`

Acao secundaria:
- link para pipeline/candidatos apenas se fizer sentido; nao disparar IA automaticamente.

### Vazio com filtros

Mensagem:
`Nenhuma IA comportamental encontrada para os filtros atuais.`

Acao:
- `Limpar filtros`.

### Erro de API

Mensagem:
`Nao foi possivel carregar a fila de IA comportamental.`

Acoes:
- `Tentar novamente`;
- link para `Saude do sistema` se usuario for admin.

### Sem permissao

Mensagem:
`Voce nao tem permissao para acessar a fila de IA comportamental.`

Nao mostrar dados parciais.

### Lista carregada

Tabela com KPIs, filtros e acoes contextuais.

### Detalhe aberto

Painel/modal com:
- status;
- candidato;
- vaga;
- provider/modelo;
- attempts;
- timestamps;
- erro seguro;
- timeline operacional;
- acoes permitidas.

### Retry solicitado

- botao da linha em loading;
- linha pode mostrar `Reprocessando...`;
- apos resposta, atualizar para `Na fila`, `Processando`, `Retry agendado` ou `Falhou`.

### Falha segura

- badge vermelho;
- mensagem segura;
- nenhum detalhe tecnico cru;
- acao de retry apenas se backend permitir.

## 14. Seguranca e Dados Proibidos

Nunca renderizar:
- API key;
- `encrypted_api_key`;
- `Authorization`;
- Bearer token;
- prompt bruto;
- resposta bruta do provider;
- stack trace;
- payload sensivel;
- dados internos de criptografia;
- headers de provider;
- conteudo completo das respostas comportamentais;
- exception repr completa.

Permitido renderizar:
- provider;
- model_id;
- status;
- retry_count;
- timestamps;
- safe error code;
- mensagem sanitizada;
- candidato/vaga dentro do mesmo nivel de acesso ja existente para admin/recruiter.

Regras de seguranca:
- backend deve continuar sendo a fonte de mensagens seguras;
- frontend deve manter sanitizacao defensiva para strings inesperadas;
- detalhes devem preferir `provider_error_type` a texto livre;
- logs visuais e tooltips nao podem expor dados proibidos.

## 15. Criterios de Aceite

Funcionais:
- A rota `/analises-ia/comportamental` esta definida no plano de navegacao.
- O menu `IA & Automacao` inclui `IA Comportamental`.
- A tela apresenta KPIs operacionais.
- A tela lista avaliacoes comportamentais IA.
- A tela diferencia pending, processing, completed, failed, retry_scheduled, rate_limited e credential_invalid.
- A tela permite filtrar por status, erro, provider, modelo, periodo e busca.
- A tela oferece `Abrir candidato` e `Abrir vaga`.
- A tela oferece `Reprocessar` somente quando permitido.
- Retry bloqueia duplo clique e refaz fetch apos sucesso.
- Estados vazio/loading/erro/sem permissao estao especificados.

Seguranca:
- Nao aparece `Evaluation failed`.
- Nao aparece API key.
- Nao aparece `encrypted_api_key`.
- Nao aparece Authorization/Bearer.
- Nao aparece prompt bruto.
- Nao aparece resposta bruta do provider.
- Nao aparece stack trace.
- Erros usam codigo operacional seguro.

Produto:
- A tela nao mistura IA comportamental com analise de curriculo/matching.
- A tela nao altera pipeline.
- A tela nao altera score.
- A tela nao altera ranking.
- A tela nao altera matching.
- A tela nao altera `current_analysis_id`.
- A tela nao altera `active_job_id`.
- A tela nao cria processamento automaticamente.

## 16. Riscos

- O endpoint de listagem pode nao expor todos os filtros/KPIs; implementar sem contrato claro levaria a heuristicas no frontend.
- Se `can_retry` nao vier do backend, o frontend pode habilitar retry em estado indevido.
- Provider/modelo podem estar ausentes em registros antigos; a UI precisa tratar valores nulos.
- Mensagens antigas de erro podem conter texto livre; a UI precisa sanitizar.
- KPIs calculados apenas na pagina atual podem enganar; idealmente devem vir de endpoint de metricas.
- Se recruiter tiver escopo por vaga/candidato no futuro, o backend deve aplicar autorizacao no endpoint, nao o frontend.

## 17. Proximo Passo Recomendado

Antes de implementar a UI, confirmar contrato backend para:
- `GET /api/v1/admin/behavioral-ai/evaluations`;
- `GET /api/v1/admin/behavioral-ai/metrics`;
- `POST /api/v1/admin/behavioral-ai/{evaluation_id}/retry`.

Prompt recomendado para a proxima fase:

```text
/brief-to-tasks

Quebre o design brief .design/behavioral-ai-queue/DESIGN_BRIEF.md em tarefas implementaveis.

Regras:
- nao alterar pipeline, score, ranking, matching, current_analysis_id ou active_job_id;
- criar a rota /analises-ia/comportamental;
- adicionar item de menu IA Comportamental;
- usar endpoints existentes quando suficientes;
- se faltar contrato backend para filtros/KPIs/can_retry, criar tarefa backend separada antes da UI;
- nao renderizar api_key, encrypted_api_key, Authorization, Bearer, prompt bruto, resposta bruta, stack trace ou payload sensivel;
- incluir testes frontend e backend conforme necessario.
```
