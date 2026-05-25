# Information Architecture: IA Comportamental Operacional

## Recommendation

Use a dedicated route: `/analises-ia/comportamental`.

Rationale:
- Behavioral AI has a different operational lifecycle than resume/matching analysis.
- Recruiters need a direct queue view for assessment evaluations, retries, credential failures, and provider limits.
- Keeping this as a tab inside `/analises-ia` would keep overloading a page whose primary mental model is resume/matching.
- The existing `/analises-ia` page can remain the resume/matching queue and optionally link to the behavioral route.

## Site Map

- IA & Automacao
  - Curriculos e matching `/analises-ia`
  - IA Comportamental `/analises-ia/comportamental`
  - Importacao de curriculos `/importar`
  - Importacao por formulario `/importar-formulario`

Admin-only operational/support pages remain under Admin:
- Credenciais IA `/admin/ai-provider-credentials`
- Saude do sistema `/admin/health`

## Navigation Model

### Primary Navigation

Keep the top-level menu: `IA & Automacao`.

### Secondary Navigation

Menu items:

| Label | Caption | Route | Roles |
| --- | --- | --- | --- |
| Curriculos e matching | Fila de analises de curriculo | `/analises-ia` | admin, recruiter |
| IA Comportamental | Fila e avaliacoes | `/analises-ia/comportamental` | admin, recruiter |
| Importacao de curriculos | Carga de CVs | `/importar` | admin, recruiter |
| Importacao por formulario | Google Forms / Drive | `/importar-formulario` | admin, recruiter |

Recommended final label: `IA Comportamental`.

Avoid label `Analisador comportamental`, because the page is not only analysis output; it is queue/operations.

## Roles

Initial access:
- `admin`: full visibility and retry actions.
- `recruiter`: operational visibility for candidates/jobs they can access, plus retry where the existing endpoint permits.

Do not expose to:
- `candidate`
- `viewer`
- `manager`
- `hr`, unless product later defines read-only operational access.

## Page Structure

### Page Header

Title: `IA Comportamental`

Subtitle: `Acompanhe fila, processamento, falhas e retries das avaliacoes comportamentais com IA.`

Primary actions:
- Refresh
- Optional link: `Credenciais IA`, admin only

### KPI Row

Show small operational cards:

| KPI | Definition |
| --- | --- |
| Na fila | `pending` |
| Processando | `processing` |
| Concluidas hoje | `completed` with `completed_at` today |
| Falhas | `failed` |
| Retry agendado | `retry_scheduled` |
| Rate limit | `provider_error_type = ai_rate_limited` or equivalent |
| Credencial invalida | `provider_error_type = ai_credential_invalid` |

If space is tight, group into four cards:
- Aguardando: pending + retry_scheduled
- Processando: processing
- Concluidas hoje: completed today
- Atencao: failed + rate_limited + credential_invalid

### Filters

Required filters:
- Status: all, pending, processing, retry_scheduled, completed, failed
- Error type: all, ai_credential_invalid, no_ai_credential_available, ai_rate_limited, provider_timeout, provider_response_invalid, enqueue_failed, unexpected_error
- Provider: google, anthropic, etc.
- Model: model_id
- Search: candidate name/email and job title
- Date range: created_at or requested_at

Useful later:
- Only stale processing
- Only retry due now
- Only my jobs

### Table Columns

| Column | Content |
| --- | --- |
| Status | Badge with status and safe label |
| Candidate | Candidate name plus safe secondary info if already used elsewhere |
| Job | Job title |
| Provider / model | Provider and model_id |
| Attempts | `retry_count` or attempts label |
| Requested | `requested_at` or `created_at` |
| Started / duration | `started_at`, `completed_at - started_at` when available |
| Next retry | `next_retry_at` |
| Error | Safe `provider_error_type` label plus sanitized `error_message` |
| Actions | Open candidate, retry when allowed |

Default sort:
- Non-terminal first: processing, pending, retry_scheduled, failed
- Then newest `updated_at` or `created_at`

## Status Model

Display statuses:

| Backend status / condition | UI label | Tone |
| --- | --- | --- |
| `pending` | Na fila | neutral |
| `processing` | Processando | blue |
| `completed` | Concluida | green |
| `failed` | Falhou | red |
| `retry_scheduled` | Retry agendado | amber |
| `provider_error_type = ai_rate_limited` | Rate limit temporario | amber |
| `provider_error_type = ai_credential_invalid` | Credencial IA invalida | red |
| `provider_error_type = no_ai_credential_available` | Credencial IA indisponivel | red |
| stale processing | Interrompida | amber/red depending action |

Do not show `Evaluation failed`.

## Actions

Allowed:
- Open candidate profile: `/candidatos/:candidateId?tab=assessments`
- Retry failed/stale/retry_scheduled due evaluations when backend says retry is allowed
- Refresh list

Admin-only recommended:
- Open credential admin
- Detect stuck evaluations, if endpoint remains admin-only

Not allowed:
- Manually edit result
- Change pipeline stage
- Change score/ranking/matching
- Trigger resume/matching analysis from this page
- Delete completed evaluations from normal UI

## Existing Backend Endpoints

Known existing endpoints:
- `POST /api/v1/jobs/{job_id}/candidates/{candidate_id}/behavioral-assessment/evaluate`
- `POST /api/v1/jobs/{job_id}/candidates/{candidate_id}/behavioral-assessment/evaluate?retry_failed=true`
- `GET /api/v1/jobs/{job_id}/candidates/{candidate_id}/behavioral-assessment/evaluation`
- `GET /api/v1/admin/behavioral-ai/evaluations`
- `POST /api/v1/admin/behavioral-ai/{evaluation_id}/retry`
- `GET /api/v1/admin/behavioral-ai/metrics`
- `POST /api/v1/admin/behavioral-ai/stuck/detect`

## Backend Gaps To Confirm

Before implementation, confirm whether the list endpoint supports:
- status filter
- provider filter
- model filter
- error type filter
- date range
- search by candidate/job
- pagination
- explicit `can_retry`
- explicit `retry_reason`
- stale flag
- duration fields

If missing, add to admin list response rather than making the frontend infer from raw timestamps.

## Data Safety

Never render:
- `api_key`
- `encrypted_api_key`
- Authorization headers
- provider request headers
- raw prompt
- raw provider response
- complete behavioral answers
- stack trace
- full exception repr
- secrets embedded in error strings

Safe to render:
- provider name
- model id
- safe error code
- sanitized operational message
- status
- timestamps
- retry count
- candidate/job identifiers already visible in recruiter context

Frontend must sanitize unknown error strings defensively, but backend should remain the source of truth for safe messages.

## Empty, Loading, And Error States

### Empty

When no records:
`Nenhuma IA comportamental encontrada para os filtros atuais.`

If no filters:
`Nenhuma avaliacao comportamental com IA foi solicitada ainda.`

### Loading

Use table skeleton plus disabled filters. Keep KPI placeholders stable.

### Error

Safe message:
`Nao foi possivel carregar a fila de IA comportamental.`

Actions:
- Retry fetch
- If admin, link to System Health

Do not show backend stack/details.

## Critical User Flows

### Recruiter Monitors Behavioral AI

1. Recruiter opens `IA & Automacao`.
2. Selects `IA Comportamental`.
3. Sees KPIs and active queue items.
4. Filters by failed or retry.
5. Opens candidate profile or retries an eligible evaluation.

### Recruiter Resolves Failed Evaluation

1. Page shows `Falhou` with safe error.
2. If retry allowed, recruiter clicks `Tentar novamente`.
3. Button enters loading state.
4. Row updates to `Na fila` or `Processando`.
5. Page refetches KPIs and list.

### Admin Diagnoses Credential Failure

1. Admin filters by `Credencial IA invalida`.
2. Confirms affected provider/model.
3. Opens `Credenciais IA`.
4. Fixes credential outside this page.
5. Returns and retries eligible evaluations.

## Naming Conventions

| Concept | UI Label | Notes |
| --- | --- | --- |
| Resume/matching AI | Curriculos e matching | Avoids ambiguity with behavioral AI |
| Behavioral AI | IA Comportamental | Main menu label |
| Queue item pending | Na fila | More operational than pending |
| Retry scheduled | Retry agendado | Keep retry term because it is operational |
| Credential invalid | Credencial IA invalida | Safe and actionable |
| No credential | Credencial IA indisponivel | Safe and actionable |
| Rate limit | Rate limit temporario | Common operational term |

## URL Strategy

Route:
- `/analises-ia/comportamental`

Query parameters:
- `status`
- `error_type`
- `provider`
- `model`
- `search`
- `date_from`
- `date_to`
- `page`
- `page_size`

Example:
`/analises-ia/comportamental?status=failed&error_type=ai_credential_invalid`

## Next Prompt

Use this for the next phase:

```text
/design-brief

Crie o design brief da tela /analises-ia/comportamental seguindo a arquitetura em .design/behavioral-ai-operations/INFORMATION_ARCHITECTURE.md.

Escopo:
- apenas UX/UI da tela IA Comportamental;
- usar os endpoints existentes quando suficiente;
- nao alterar pipeline, score, ranking, matching, current_analysis_id ou active_job_id;
- nao renderizar prompt, resposta bruta, stack trace, api_key, encrypted_api_key ou headers;
- definir layout operacional com KPIs, filtros, tabela, estados vazios/erro/loading e acoes contextuais.
```
