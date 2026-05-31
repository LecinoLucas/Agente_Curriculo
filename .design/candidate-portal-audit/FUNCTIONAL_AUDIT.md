# C-Check — Auditoria Funcional do Candidate Portal

**Data:** 2026-05-31  
**Branch:** save/behavioral-ai-and-wips  
**Builds:** ✓ candidate-portal + ✓ frontend

---

## ⚠️ WIP fora de `candidate-portal/` e `.design/`

Detectados na branch antes desta auditoria. **Não foram modificados nesta fase.**

| Arquivo | Tipo | Nota |
|---|---|---|
| `backend/src/interface/api/routers/candidaturas.py` | unstaged | WIP pré-existente |
| `backend/src/interface/api/schemas/candidaturas_schemas.py` | unstaged | WIP pré-existente |
| `backend/tests/integration/test_candidaturas_import.py` | unstaged | WIP pré-existente |
| `frontend/src/features/candidates/components/AddCandidateModal.tsx` | unstaged | WIP pré-existente |
| `frontend/src/pages/AgendaPage.tsx` | unstaged | WIP pré-existente |
| `frontend/src/pages/__tests__/CandidaturasPage.test.tsx` | unstaged | WIP pré-existente |
| `frontend/src/services/candidaturasService.ts` | unstaged | WIP pré-existente |
| `frontend/src/pages/LoginPage.tsx` | staged | WIP pré-existente |
| `e2e/smoke-c5.spec.ts` | staged new | WIP pré-existente |
| `e2e/smoke.config.ts` | staged new | WIP pré-existente |
| `scripts/dev-full.sh` | staged | WIP pré-existente |

**Ação necessária:** decidir se esses WIPs devem ser commitados ou descartados antes de fazer merge.

---

## Parte 1 — Estado real do `candidate-portal/`

### Status de integração por rota

| Rota | Endpoint(s) consumido(s) | Status |
|---|---|---|
| `/vagas` | `GET /public/jobs` | ✅ 100% real |
| `/vagas/:identifier` | `GET /public/jobs/{job_id}` | ✅ 100% real |
| `/candidatar/:identifier` | `POST /public/candidates/apply` | ✅ 100% real |
| `/sucesso` | (sem fetch) | ✅ estático, correto |
| `/login` | `POST /public/auth/login` | ✅ 100% real |
| `/minha-area` | `GET /public/candidate-portal/overview` | ✅ 100% real |
| `/avaliacao` | `GET /public/candidate-portal/behavioral-assessments` + `/{id}` + `/start` + `/answers` + `/submit` | ✅ 100% real |
| `/pre-admissao` | `GET /public/candidate-portal/pre-admission` + `POST …/documents` + `GET …/download` | ✅ 100% real |
| Logout (header) | `POST /public/auth/logout` | ✅ 100% real |

### Verificação de `credentials: 'include'`

Todos os 4 métodos de `publicApiClient.ts` (`get`, `put`, `post`, `postForm`) usam `credentials: 'include'`. ✓

### Verificação de exposição de path interno em erros

`get()` corrigido na C4 para parsear `detail` do backend em vez de expor o path. ✓

### Arquivos mock restantes no `candidate-portal/`

| Arquivo | Status |
|---|---|
| `mockCandidatePortalService.ts` | ✅ Deletado |
| `mockCandidatePortal.ts` | ✅ Deletado |
| `DocumentChecklist.tsx` | ✅ Deletado |
| `UploadMockCard.tsx` | ✅ Deletado |
| `ProcessStepper.tsx` | ✅ Deletado |
| `StatusCard.tsx` | ✅ Deletado |
| `data/` directory | ✅ Vazio/removido |

### Tipos sem uso em `types/candidatePortal.ts`

Os tipos abaixo foram criados para o protótipo mock e não são mais usados por nenhuma página ou serviço:
- `MockCandidate`, `HRMessage`, `CandidateApplication`, `CandidateProfile`
- `AssessmentQuestion`, `AssessmentAnswers`
- `DocumentItem`, `DocumentStatus`
- `ApplicationFormStep1`, `ApplicationFormData`
- `ProcessStep`, `ApplicationStatus`

**Impacto:** zero (TypeScript não bloqueia exports não utilizados). Podem ser removidos em limpeza futura.

**Tipos que DEVEM permanecer:**
- `PublicJob`, `JobArea`, `WorkModel`, `SeniorityLevel` → usados por páginas e `publicJobsService`
- `JOB_AREA_LABELS`, `WORK_MODEL_LABELS`, `SENIORITY_LABELS` → usados por 3 páginas
- `PROCESS_STEPS` → usado por `ApplicationSuccessPage` e `PublicJobPage`

---

## Parte 2 — Fluxo candidato → recrutador (análise estática)

Não foi possível rodar com backend real (backend não disponível nesta sessão).  
Documentação baseada em análise de código e contrato de API.

### Fluxo esperado completo

```
[Candidato: candidate-portal/]
1. GET /public/jobs → lista vagas publicadas
2. GET /public/jobs/{id} → detalhe da vaga
3. POST /public/candidates/apply (multipart/form-data)
   → full_name, cpf, email, phone, city, state, salary_expectation,
     desired_contract_type, works_at_marajo_group, job_id, lgpd_consent,
     password, confirm_password, resume_file
   ← backend: cria Candidate + Resume + (Pipeline entry se job_id) + seta cookie de sessão

[Recrutador: frontend/]
4. Candidato aparece em:
   - /candidatos (lista geral)
   - /pipeline/{job_id} (se job_id foi fornecido na candidatura)
   - Análise de currículo é enfileirada automaticamente se auto_dispatch=true

5. GET /public/candidate-portal/overview (candidato autenticado)
   ← retorna: status da candidatura, timeline, avaliação pendente

6. POST /public/candidate-portal/behavioral-assessments/{id}/start
   PUT /public/candidate-portal/behavioral-assessments/{id}/answers
   POST /public/candidate-portal/behavioral-assessments/{id}/submit
   → Recrutador vê na tela de candidatos / pipeline

7. POST /public/candidate-portal/pre-admission/{case_id}/checklist-items/{item_id}/documents
   → Recrutador vê no workspace de admissão
```

### Passos que DEPENDEM de estado de dados

| Passo | Dependência | Como testar |
|---|---|---|
| Vaga aparece em `/vagas` | Vaga deve ter `status=published` | Publicar via sistema interno antes de testar |
| Pipeline entry criado | `job_id` deve ser UUID de vaga publicada existente | Copiar UUID real da vaga publicada |
| Avaliação pendente aparece | RH deve ter atribuído template comportamental ao pipeline stage | Configurar template no sistema interno |
| Pré-admissão ativa | Candidato deve estar no stage de pré-admissão | Pipeline deve ter avançado após entrevista |

---

## Parte 3 — Dois portais simultâneos

**Descoberta crítica:** existem **dois portais do candidato** ativos na branch.

### Portal antigo (em `frontend/`)

| Atributo | Valor |
|---|---|
| URL dev | `http://localhost:5173/candidato/*` |
| Rotas | `/candidato`, `/candidato/cadastro`, `/candidato/login`, `/candidato/portal`, `/candidato/pre-admissao` |
| Estado | ✅ Integrado com API real (usa `candidatePortalService.ts`) |
| Tamanho | `CandidatePortalPage.tsx` = 1417 linhas; é uma single-page com todos os fluxos |
| Diferencial | Inclui Google OAuth, comunicação com RH, atualização de perfil, upload de currículo |
| Endpoints usados | `/public/*` + `/candidate-portal/behavioral-assessments/*` (path original) + `/candidate-portal/pre-admission/*` |

### Portal novo (em `candidate-portal/`)

| Atributo | Valor |
|---|---|
| URL dev | `http://localhost:5174/*` |
| Rotas | `/vagas`, `/vagas/:id`, `/candidatar/:id`, `/login`, `/minha-area`, `/avaliacao`, `/pre-admissao` |
| Estado | ✅ Integrado com API real (usa `publicApiClient.ts`) |
| Tamanho | 8 páginas separadas + 7 serviços |
| Diferencial | UX multi-página, navegação limpa, sem Google OAuth |
| Endpoints usados | `/public/*` (novos aliases) |

### Risco: dois portais públicos simultâneos

⚠️ Em produção, se ambos forem deployados e acessíveis:
- Candidatos podem se cadastrar por qualquer um dos dois
- Sessões são baseadas no mesmo cookie → podem interferir se compartilharem domínio
- UX inconsistente para candidatos

**Decisão necessária (humana):** qual portal será o canônico em produção?  
**Recomendação:** o novo `candidate-portal/` tem UX superior e arquitetura mais limpa. O antigo pode ser mantido temporariamente para não quebrar fluxo já em uso.

---

## Parte 4 — Código legado no `frontend/`

### Páginas legadas do portal antigo

| Arquivo | Tipo | Status atual | Recomendação |
|---|---|---|---|
| `frontend/src/pages/CandidatePortalPage.tsx` | 1417 linhas, portal antigo integrado | ✅ Em uso via rota `/candidato/portal` | **Manter** até decisão de substituição pelo novo portal |
| `frontend/src/pages/PublicApplicationPage.tsx` | Form de candidatura antigo | ✅ Em uso via `/candidato/cadastro` | **Manter** por ora — funcional e diferente do novo |
| `frontend/src/pages/CandidatePreAdmissionPage.tsx` | Pré-admissão antiga | ✅ Em uso via `/candidato/pre-admissao` | **Manter** por ora |
| `frontend/src/pages/CandidateEntryPage.tsx` | Landing page antiga | ✅ Em uso via `/candidato` e `/candidato/login` | **Manter** por ora |

### Features legadas

| Diretório | Descrição | Status |
|---|---|---|
| `frontend/src/features/candidate-portal/` | Componentes do portal antigo (BehavioralAssessmentForm, PreAdmissionCard, etc.) | ✅ Usados por `CandidatePortalPage` |
| `frontend/src/features/public-application/` | Formulário de candidatura antigo | ✅ Usado por `PublicApplicationPage` |
| `frontend/src/services/candidatePortalService.ts` | Service do portal antigo | ✅ Usado por `CandidatePortalPage` |

**Nota:** `CandidatePortalPage` usa `/api/v1/candidate-portal/behavioral-assessments/*` (path original) enquanto o novo portal usa `/api/v1/public/candidate-portal/behavioral-assessments/*` (alias). Ambos funcionam — o backend mantém os dois caminhos.

### Componentes do `frontend/` que podem ser confusos

| Arquivo | Confunde com? | Recomendação |
|---|---|---|
| `frontend/src/services/candidatePortalService.ts` | `candidate-portal/src/services/candidatePortalService.ts` | Mesmo nome, arquivos diferentes, contextos distintos. Documentar claramente. |
| `frontend/src/components/auth/CandidateLoginAccessCard.tsx` | Login do novo portal | Componente da landing antiga. Manter. |

---

## Parte 5 — Rotas do AppRouter (frontend interno)

### Rotas `/candidato/*` existentes

```typescript
// AppRouter.tsx
<Route path="/candidato"              element={publicPage(<CandidateEntryPage />)} />
<Route path="/candidato/cadastro"     element={publicPage(<PublicApplicationPage />)} />
<Route path="/candidato/login"        element={publicPage(<CandidateEntryPage />)} />
<Route path="/candidato/portal"       element={candidatePage(<CandidatePortalPage />)} />
<Route path="/candidato/pre-admissao" element={candidatePage(<CandidatePreAdmissionPage />)} />
```

**Conclusão:** rotas ativas, páginas integradas com API real. **Não remover nesta fase.**

**Risco:** candidatos que estiverem usando `/candidato/*` (portal antigo) continuarão fazendo isso. Se o novo `candidate-portal/` for deployed em subdomínio diferente, não há conflito de rota. Se for no mesmo domínio mas em path diferente (`/vagas` vs `/candidato`), também não há conflito.

---

## Parte 6 — Endpoints do backend

### Endpoints públicos oficiais (`/api/v1/public/*`)

| Endpoint | Origem | Usado por |
|---|---|---|
| `GET /public/jobs` | `public.py` (original) | candidate-portal + frontend old |
| `GET /public/jobs/{job_id}` | `public_candidate_portal.py` (alias) | candidate-portal |
| `POST /public/candidates/apply` | `public.py` (original) | candidate-portal + frontend old |
| `GET /public/candidates/check-exists` | `public.py` (original) | frontend old |
| `POST /public/candidate-auth/login` | `public.py` (original) | frontend old |
| `POST /public/candidate-auth/logout` | `public.py` (original) | frontend old |
| `POST /public/candidate-auth/google` | `public.py` (original) | frontend old |
| `POST /public/auth/login` | `public_candidate_portal.py` (alias) | candidate-portal |
| `POST /public/auth/logout` | `public_candidate_portal.py` (alias) | candidate-portal |
| `POST /public/auth/google` | `public_candidate_portal.py` (alias) | (Google OAuth — não integrado no novo portal) |
| `GET /public/candidate-portal/overview` | `public.py` (original) | candidate-portal + frontend old |
| `PATCH /public/candidate-portal/profile` | `public.py` (original) | frontend old |
| `POST /public/candidate-portal/resume` | `public.py` (original) | frontend old |
| `GET /public/candidate-portal/behavioral-assessments` | `public_candidate_portal.py` (alias) | candidate-portal |
| `GET /public/candidate-portal/behavioral-assessments/{id}` | `public_candidate_portal.py` (alias) | candidate-portal |
| `POST /public/candidate-portal/behavioral-assessments/{id}/start` | `public_candidate_portal.py` (alias) | candidate-portal |
| `PUT /public/candidate-portal/behavioral-assessments/{id}/answers` | `public_candidate_portal.py` (alias) | candidate-portal |
| `POST /public/candidate-portal/behavioral-assessments/{id}/submit` | `public_candidate_portal.py` (alias) | candidate-portal |
| `GET /public/candidate-portal/pre-admission` | `public_candidate_portal.py` (alias) | candidate-portal |
| `GET /public/candidate-portal/pre-admission/{case_id}` | `public_candidate_portal.py` (alias) | candidate-portal |
| `POST /public/candidate-portal/pre-admission/{case_id}/checklist-items/{item_id}/documents` | `public_candidate_portal.py` (alias) | candidate-portal |
| `GET /public/candidate-portal/pre-admission/documents/{document_id}/download` | `public_candidate_portal.py` (alias) | candidate-portal |

### Endpoints originais (não-public prefix)

| Endpoint | Origem | Usado por |
|---|---|---|
| `GET /api/v1/candidate-portal/behavioral-assessments` | `candidate_behavioral_assessments.py` | frontend old |
| `GET /api/v1/candidate-portal/behavioral-assessments/{id}` | idem | frontend old |
| `POST /api/v1/candidate-portal/behavioral-assessments/{id}/start` | idem | frontend old |
| `PUT /api/v1/candidate-portal/behavioral-assessments/{id}/answers` | idem | frontend old |
| `POST /api/v1/candidate-portal/behavioral-assessments/{id}/submit` | idem | frontend old |
| `GET /api/v1/candidate-portal/pre-admission` | `pre_admission.py` | frontend old |
| `POST /api/v1/candidate-portal/pre-admission/{case_id}/…/documents` | `pre_admission.py` | frontend old |
| `GET /api/v1/candidate-portal/pre-admission/documents/{doc_id}/download` | `pre_admission.py` | frontend old |

**Conclusão:** os endpoints originais (`/candidate-portal/*`) são ativamente usados pelo portal antigo. **Não remover.**

---

## Parte 7 — Limpeza executada nesta fase

| Arquivo | Ação | Confirmação |
|---|---|---|
| `src/components/ui/Stepper.tsx` | **Deletado** | Confirmado zero importadores; build passa ✓ |

Os 6 arquivos mortos anteriores (DocumentChecklist, UploadMockCard, ProcessStepper, StatusCard, mockCandidatePortalService, mockCandidatePortal) já foram removidos nas fases C3F/C4.

---

## Must-fix

| # | Problema | Impacto | Quem decide |
|---|---|---|---|
| 1 | **Dois portais simultâneos** — `/candidato/*` (old, port 5173) e novo (port 5174). Em produção podem criar confusão para candidatos | Alto | **Decisão de produto** |
| 2 | **WIP não commitado** no backend, frontend e e2e fora do escopo desta branch | Risco de perda ou conflito de merge | Equipe |
| 3 | `ApplicationSuccessPage` usa `PROCESS_STEPS` hardcoded (mock) em vez de timeline da API | Baixo (cosmético) | Tech |

## Should-fix

| # | Problema | Arquivo | Prioridade |
|---|---|---|---|
| 1 | Tipos mock não usados em `types/candidatePortal.ts` | `candidate-portal/src/types/candidatePortal.ts` | Baixa |
| 2 | `Stepper.tsx` em `components/ui/` — verificar se é dead code | `candidate-portal/src/components/ui/Stepper.tsx` | Baixa |
| 3 | Portal antigo não tem `useSessionRestore` (header perde nome no refresh de `/candidato/portal`) — se for mantido, aplicar mesma correção | `frontend/src/pages/CandidatePortalPage.tsx` | Média |
| 4 | Sem testes automatizados para o novo `candidate-portal/` | — | Alta para produção |
| 5 | Auto-save de respostas de avaliação | `CandidateAssessmentPage.tsx` | Média |

---

## Próximos passos recomendados

1. **Decisão de produto:** definir qual portal é canônico. Opções:
   - **A)** Novo `candidate-portal/` substitui o antigo. Redirecionar `/candidato/*` para o novo.
   - **B)** Ambos coexistem temporariamente. Documentar para candidatos qual URL usar.
   - **C)** Migrar features faltantes do antigo para o novo (Google OAuth, update de perfil, upload de currículo) e então deprecar o antigo.

2. **Commitar ou descartar WIPs** fora de `candidate-portal/` antes de merge.

3. **Remover `Stepper.tsx`** se confirmado como dead code.

4. **Limpeza de tipos mock** em `types/candidatePortal.ts`.

---

## Confirmações finais

- `backend/` — **zero alterações por esta sessão**
- `frontend/` — **zero alterações por esta sessão**
- `npm --prefix candidate-portal run build` → ✓
- `npm --prefix frontend run build` → ✓
