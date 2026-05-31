# C3C — Login, Logout e Área do Candidato (candidate-portal)

## Endpoints consumidos

| Método | Endpoint                                        | Usado em                          |
|--------|-------------------------------------------------|-----------------------------------|
| POST   | `/api/v1/public/auth/login`                     | `CandidateLoginPage.tsx`          |
| POST   | `/api/v1/public/auth/logout`                    | `CandidatePortalLayout.tsx`       |
| GET    | `/api/v1/public/candidate-portal/overview`      | `CandidateHomePage.tsx`           |

## Arquivos alterados

| Arquivo | Tipo |
|---|---|
| `src/services/publicApiClient.ts` | Adicionados métodos `post<T>` (JSON) e `postForm<T>` (multipart) |
| `src/services/candidateAuthService.ts` | **Novo** — login e logout |
| `src/services/candidatePortalService.ts` | **Novo** — getOverview + tipos API + mapper |
| `src/App.tsx` | Substituído `MockAuthCtx` por `CandidateSessionCtx` (candidateName real) |
| `src/components/layout/CandidatePortalLayout.tsx` | Usa `useCandidateSession` + logout real |
| `src/pages/CandidateLoginPage.tsx` | Login real; removido demo banner e mock |
| `src/pages/CandidateHomePage.tsx` | Overview real; UI adaptada ao contrato da API |

## Gerenciamento de sessão

O backend usa cookie **HttpOnly** (`candidate_portal_session`). O frontend **não consegue ler** este cookie diretamente.

**Fluxo:**
1. `POST /auth/login` → backend valida credenciais e seta o cookie na response
2. `GET /candidate-portal/overview` → backend lê o cookie, retorna dados do candidato
3. `POST /auth/logout` → backend invalida o cookie (idempotente, sempre retorna 204)

**Estado React (`CandidateSessionCtx`):**
- Armazena apenas `candidateName: string | null` — usado para exibir o nome no header e o botão "Sair"
- Populado em `CandidateHomePage` após fetch do overview bem-sucedido
- Limpo em `handleLogout()` no layout
- Perdido em refresh (React state) — mas o cookie persiste, então `/minha-area` funciona normalmente via nova requisição ao overview

## Mapeamento API → frontend

### `GET /candidate-portal/overview` → `CandidateOverview`

| Campo da API (`CandidatePortalOverviewResponse`) | Campo interno (`CandidateOverview`) |
|---|---|
| `candidate.full_name` | `candidateName` |
| `candidate.email_masked ?? candidate.email` | `candidateEmail` |
| `candidate.phone_masked ?? candidate.phone` | `candidatePhone` |
| `active_application.job_title` | `activeApplication.jobTitle` |
| `active_application.status_public` | `activeApplication.statusPublic` |
| `active_application.is_talent_pool` | `activeApplication.isTalentPool` |
| `current_process_status_label` | `statusLabel` |
| `public_timeline.current_step_key` | `timelineCurrentStep` |
| `public_timeline.steps[].{key,label,status}` | `timelineSteps[]` |
| `application_history.length` | `applicationHistoryCount` |
| `is_process_closed` | `isProcessClosed` |
| `closed_reason_public_label` | `closedReasonLabel` |
| `requires_behavioral_assessment` | `requiresBehavioralAssessment` |
| `talent_pool` | `talentPool` |
| `public_interview.*` | `publicInterview.*` |

Campos **não expostos na UI** (conforme regra — campos internos): `match_score`, `ranking`, `ai_score`, `quality_score`, `pipeline interna`, `commentários internos`.

### Timeline

A API retorna `public_timeline.steps[]` com `status`: `'completed' | 'current' | 'pending'`.  
O componente `ProcessTimeline` (inline em `CandidateHomePage`) renderiza diretamente esses steps sem depender do enum `ProcessStep` do protótipo mock. Isso evita coupling entre nomes internos do backend e constantes do frontend.

### Preferência de campos mascarados

Para email e telefone, o mapper usa `email_masked ?? email` e `phone_masked ?? phone`. Campos mascarados são preferidos para evitar exposição de PII completo no frontend.

## Tratamento de erros

| Status | Causa | Comportamento |
|---|---|---|
| 401 | Sessão inexistente ou expirada | Redirect automático para `/login` |
| 403 | Perfil incompleto (backend: `CandidatePortalIncompleteProfileError`) | Mensagem de erro com instrução de contato com RH |
| Rede | Backend indisponível | Mensagem de erro genérica com link para login |
| Login 401 | Credenciais inválidas | Mensagem de erro da API (`detail`) |
| Login 429 | Conta bloqueada por tentativas | Mensagem de erro da API (`detail`) |

## O que continua mockado

| Fluxo | Página | Mock |
|---|---|---|
| Candidatura pública | `ApplicationFormPage` | `submitMockApplication` do `mockCandidatePortalService` |
| Avaliação comportamental | `CandidateAssessmentPage` | `getAssessmentQuestions` + `submitMockAssessment` |
| Pré-admissão | `CandidatePreAdmissionPage` | `getPreAdmissionDocuments` + `uploadMockDocument` |
| Login do candidato (do formulário de candidatura) | `ApplicationSuccessPage` → `/login` | ✓ agora real |

## Builds executados

```bash
npm --prefix candidate-portal run build   # ✓ tsc + vite — sem erros
npm --prefix frontend run build           # ✓ sem alterações
```

## Próxima fase

**C3D** — avaliação comportamental real (`GET/POST /api/v1/public/candidate-portal/behavioral-assessments/*`).  
A home page já exibe o nudge "Avaliação comportamental pendente" quando `requires_behavioral_assessment = true`, apontando para `/avaliacao`.
