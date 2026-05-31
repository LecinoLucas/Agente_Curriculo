# C3A — Integração de Vagas Públicas (candidate-portal)

## Endpoints consumidos

| Método | Endpoint                        | Usado em              |
|--------|---------------------------------|-----------------------|
| GET    | `/api/v1/public/jobs`           | `PublicJobsPage.tsx`  |
| GET    | `/api/v1/public/jobs/{job_id}`  | `PublicJobPage.tsx`   |

## Arquivos alterados

- `src/services/publicApiClient.ts` — implementação real (VITE_PUBLIC_API_BASE_URL + fallback http://localhost:8000/api/v1/public)
- `src/services/publicJobsService.ts` — novo; tipos de resposta da API, mappers snake_case → frontend, funções `listJobs()` e `getJobById()`
- `src/pages/PublicJobsPage.tsx` — substituído `mockCandidatePortalService` por `publicJobsService`, adicionado estado de erro com retry
- `src/pages/PublicJobPage.tsx` — param `:slug` renomeado para `:identifier`, busca por ID real, estados: loading / notFound / error
- `src/routes/CandidatePortalRouter.tsx` — rota `/vagas/:slug` → `/vagas/:identifier`

## O que continua mockado

Todos os outros fluxos não fazem chamadas reais:
- Candidatura (`ApplicationFormPage`) — mock
- Login / área do candidato (`CandidateLoginPage`, `CandidateHomePage`) — mock
- Avaliação comportamental (`CandidateAssessmentPage`) — mock
- Pré-admissão (`CandidatePreAdmissionPage`) — mock

## Decisões de design

### Sem slug na API
O backend não retorna campo `slug` em nenhum dos dois endpoints. As rotas do portal usam o `id` (UUID) como identificador:
- Links na lista: `/vagas/{job.id}`
- Detalhe: lê `useParams<{ identifier }>()` e chama `getJobById(identifier)`
- Botão "Candidatar-se": navega para `/candidatar/{job.id}` (será integrado na C3B)

### Campos ausentes no endpoint de lista
`GET /public/jobs` retorna apenas: `id`, `title`, `location`, `job_area`.
Campos **não disponíveis na lista**: `work_model`, `seniority_level`, `description`, `applicants_count`, `published_at`.

Decisões tomadas:
- Badge de modelo de trabalho removido da lista (dado não disponível; exibi-lo como padrão seria enganoso)
- Filtro por modelo de trabalho removido da lista pela mesma razão
- Filtro por área mantido (campo disponível)
- `short_description` vazia na lista (sem texto de resumo no endpoint de lista)

O endpoint de detalhe (`/public/jobs/{id}`) retorna `work_model`, `seniority_level`, `description`, `requirements`, `responsibilities`, `benefits`, `published_at` — todos exibidos corretamente na `PublicJobPage`.

### Parsing de campos de texto
`requirements` e `responsibilities` chegam como string (`\n`-separated) do banco. O `publicJobsService` os converte para `string[]` via `splitTextBlock()`, removendo marcadores de lista e linhas vazias.

`benefits` já chega como array do backend.

### Mapeamento de tipos da API → frontend
O `PublicJob` interno exige `JobArea`, `WorkModel`, `SeniorityLevel`. Valores recebidos da API são cast; valores ausentes usam string vazia para evitar acessos incorretos ao `Record<X, string>`. As páginas verificam a presença do label antes de renderizar o badge/campo.

### credentials: include
`publicApiClient.get()` usa `credentials: 'include'` para preparar cookies de sessão nas fases futuras (C3B em diante).

### CORS em desenvolvimento
O `vite.config.ts` do `candidate-portal` **não tem proxy** para `/api`. As chamadas vão diretamente ao `VITE_PUBLIC_API_BASE_URL` (padrão `http://localhost:8000/api/v1/public`). O backend deve ter CORS configurado para `http://localhost:5174`. Verificar antes de testar manualmente.

## Validação executada

```bash
npm --prefix candidate-portal run build   # OK
npm --prefix frontend run build           # OK (sem alterações)
```

## O que NÃO foi alterado

- `backend/` — zero alterações
- `frontend/` (internal) — zero alterações
- Nenhum mock removido dos fluxos que não são vagas públicas
- Nenhum endpoint novo criado no backend
- Candidatura, login e área do candidato permanecem totalmente mockados

## Próxima fase

**C3B** — integração da candidatura pública (`/candidatar/:identifier`), que já navega para `/candidatar/{job.id}` após esta fase.
