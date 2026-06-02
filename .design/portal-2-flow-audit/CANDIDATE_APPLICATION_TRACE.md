# CandidateApplication Trace

## Modelo atual

Fonte: `backend/src/infrastructure/database/models/candidate_application_model.py`.

Campos relevantes:

- `candidate_id`: obrigatório no modelo.
- `job_id`: opcional.
- `source`: `web_portal`, `bot`, `whatsapp`, `staff`.
- `status`: `started`, `qualified`, `submitted`, `linked_to_pipeline`, `abandoned`, `cancelled`.
- `preferred_location_group_id`: opcional.
- `preferred_unit_id`: opcional.
- `accepts_any_unit_in_location`: boolean.
- `desired_job_area`: opcional.
- `desired_shift`: opcional.
- `lgpd_consent_at`, `lgpd_consent_version`: opcionais.

Statuses ativos:

- `started`
- `qualified`
- `submitted`
- `linked_to_pipeline`

Statuses não ativos:

- `abandoned`
- `cancelled`

Não existe `rejected` no modelo atual auditado.

## Criação/atualização pela Conversation Engine

Funciona hoje:

- `_sync_application` não faz nada se `conversation.candidate_id is None`.
- Se já há `conversation.application_id`, atualiza essa application.
- Se não há `application_id`, só cria application se houver algum gatilho real de intake:
  - `location_hint`
  - `preference`
  - `desired_function`
  - `desired_shift`
- Application criada pelo chat sempre tem `job_id=None`.
- `source` é `bot` para web e `whatsapp` para canal WhatsApp.
- Status derivado pelo chat:
  - `submitted` se `context.confirmation == "confirm"`;
  - `started` em qualquer outro caso.
- O chat não gera `qualified` nem `linked_to_pipeline`.
- O chat não cria pipeline.

## Comportamento quando retoma application existente

Funciona hoje:

- Busca application ativa mais recente do candidato.
- Armazena internamente `pending_application_id`, `pending_application_status`.
- Seta `application_in_progress=True`.
- Não seta `conversation.application_id`.
- Não seta `conversation.candidate_id`.
- Não lê ou aplica `job_id`.
- Não lê ou aplica `preferred_location_group_id`, `preferred_unit_id`, `desired_job_area`, `desired_shift`.
- Não consulta se já existe pipeline vinculada.
- Não diferencia status.
- Estado público vira `CHOOSE_LOCATION`.

Consequência: uma application `submitted` ou `linked_to_pipeline` cai no mesmo texto e no mesmo estado de uma `started` sem cidade.

## Pipeline

Fonte: `CandidateApplicationPipelineService`.

Para linkar application à pipeline:

- status precisa ser `submitted` ou `linked_to_pipeline`;
- `candidate_id` precisa existir;
- `job_id` precisa existir;
- não pode haver pipeline ativa conflitante para o candidato;
- se status já é `linked_to_pipeline`, a operação é idempotente.

Como o chat cria `job_id=None`, uma application criada apenas pelo chat não é linkável sem intervenção posterior que defina vaga.

## Matriz status x comportamento atual x recomendado

| Caso | Comportamento atual | Resposta recomendada |
| --- | --- | --- |
| `started` sem `job_id`, sem localidade | Pede cidade/localidade. | "Vamos continuar sua candidatura. Me diga a cidade onde quer trabalhar." |
| `started` sem `job_id`, com localidade, sem função | Pede cidade novamente. | "Já tenho sua cidade. Agora me diga a função que você procura." |
| `started` sem `job_id`, com localidade e função, sem turno | Pede cidade novamente. | "Vou continuar sua candidatura. Qual turno você prefere?" |
| `started` com `job_id`, pendências de dados | Pede cidade novamente. | "Você já iniciou uma candidatura para uma vaga. Vou completar algumas informações." |
| `qualified` | Pede cidade novamente. | "Sua candidatura já passou por uma triagem inicial. Vou verificar se falta alguma informação." |
| `submitted` sem pipeline | Pede cidade novamente. | "Sua candidatura já foi enviada para análise do RH." |
| `submitted` com `job_id` | Pede cidade novamente. | "Sua candidatura já foi enviada para análise do RH para essa vaga." |
| `linked_to_pipeline` | Pede cidade novamente. | "Sua candidatura já está em análise pelo RH." |
| `cancelled` | Não é encontrada pela retomada ativa. | "Essa candidatura foi encerrada. Podemos iniciar uma nova se você quiser." |
| `abandoned` | Não é encontrada pela retomada ativa. | "Encontrei um cadastro anterior, mas não uma candidatura ativa. Vamos iniciar uma nova candidatura." |
| `rejected` | Não existe status no modelo atual. | Se vier a existir: "Esse processo foi encerrado pelo RH. Você pode procurar novas oportunidades." |
| Sem consentimento LGPD | Para lead novo, pede antes de criar Candidate. Para Candidate existente/application existente, retomada não avalia consentimento. | Pedir consentimento antes de prosseguir em qualquer fluxo que coletará dados novos. |
| Sem WhatsApp | Lead por CPF coleta WhatsApp antes de LGPD. Candidate existente sem phone não é avaliado na retomada. | Pedir WhatsApp quando for necessário para contato ou OTP. |
| Sem nome | Lead novo coleta nome. Candidate existente sem nome não é avaliado na retomada. | Pedir nome antes de confirmar ou submeter. |

## Duplicidade de application

Funciona hoje:

- Dentro de uma mesma sessão com `conversation.application_id`, `_sync_application` atualiza a mesma application.
- Para criação via `CandidateApplicationService`, há bloqueio de duplicidade ativa apenas quando `job_id` não é nulo.
- Para application de chat com `job_id=None`, não há unicidade equivalente por candidato/source/status.

Risco:

- Quando a retomada encontra uma application ativa, ela não vincula `conversation.application_id`. Se mais tarde essa sessão for verificada e receber `candidate_id`, `_sync_application` pode criar uma nova application em vez de atualizar a application encontrada.

## Pontos de contrato

Funciona hoje:

- CandidateApplication aceita todos os statuses esperados exceto `rejected`.
- Public API de application expõe `candidate_id` e `job_id` em endpoints administrativos/aplicações, mas o fluxo público de conversa não expõe esses ids.

Gaps:

- A retomada não retorna ao frontend um resumo público seguro da application.
- A session pública expõe `application_in_progress=True`, mas não expõe status seguro nem próxima pendência.
- O `pending_application_id` interno não é promovido para `conversation.application_id`.
