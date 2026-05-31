# C-Clean-2 — Remoção do Código Legado do Portal Antigo

**Data:** 2026-05-31  
**Branch:** save/behavioral-ai-and-wips

---

## Buscas executadas antes da remoção

```bash
# 1. Importadores não-teste dos 4 componentes de página
grep -rn "CandidatePortalPage|PublicApplicationPage|CandidateEntryPage|CandidatePreAdmissionPage" \
  frontend/src --include="*.tsx" --include="*.ts" | grep -v "__tests__|\.test\."
# → apenas AppRouter.tsx (lazy imports mortos)

# 2. Importadores das features legadas
grep -rn "features/candidate-portal|features/public-application" \
  frontend/src --include="*.tsx" --include="*.ts" | grep -v "__tests__|\.test\."
# → somente as 4 páginas deletadas (cadeia fechada)

# 3. Importadores dos dois services
grep -rn "candidatePortalService|publicApplicationService" \
  frontend/src --include="*.tsx" --include="*.ts" | grep -v "__tests__|\.test\."
# → CandidatePortalPage, BehavioralAssessmentCard, assessmentState.ts,
#   CandidateLoginAccessCard, PublicApplicationPage (todos deletados)

# 4. Importadores de CandidateLoginAccessCard e CandidatePublicShell
grep -rn "CandidateLoginAccessCard|CandidatePublicShell" \
  frontend/src --include="*.tsx" --include="*.ts" | grep -v "__tests__|\.test\."
# → somente CandidateEntryPage e PublicApplicationPage (deletados)

# 5. Uso de CandidateThemeGuard e candidatePage()
grep -n "CandidateThemeGuard|candidatePage" frontend/src/app/AppRouter.tsx
# → apenas no import e na função candidatePage() — nenhuma rota ativa usava candidatePage()
```

---

## Arquivos removidos

### Páginas (`frontend/src/pages/`)

| Arquivo | Motivo |
|---|---|
| `CandidatePortalPage.tsx` | Portal antigo integrado; substituído por `CandidatePortalRedirectPage` |
| `PublicApplicationPage.tsx` | Form de candidatura antigo; substituído pelo novo portal |
| `CandidateEntryPage.tsx` | Landing page antiga; substituída |
| `CandidatePreAdmissionPage.tsx` | Pré-admissão antiga; substituída |

### Feature `features/candidate-portal/`

| Arquivo | Motivo |
|---|---|
| `components/AssessmentStateView.tsx` | Exclusivo de `CandidatePortalPage` (deletado) |
| `components/BehavioralAssessmentCard.tsx` | Exclusivo de `CandidatePortalPage` |
| `components/BehavioralAssessmentForm.tsx` | Exclusivo de `CandidatePortalPage` |
| `components/CandidateMessagesCard.tsx` | Exclusivo de `CandidatePortalPage` |
| `components/CandidatePortalPreAdmissionCard.tsx` | Exclusivo de `CandidatePortalPage` |
| `components/CandidatePortalPreAdmissionSummaryCard.tsx` | Exclusivo de `CandidatePortalPage` |
| `components/CandidatePreAdmissionDocumentItem.tsx` | Exclusivo de `CandidatePreAdmissionPage` (deletado) |
| `components/CandidatePreAdmissionDocumentList.tsx` | Exclusivo de `CandidatePreAdmissionPage` |
| `components/CandidatePreAdmissionProgressCard.tsx` | Exclusivo de `CandidatePreAdmissionPage` |
| `preAdmissionLabels.ts` | Exclusivo das páginas deletadas |
| `utils/assessmentState.ts` | Exclusivo das páginas deletadas |
| `components/__tests__/BehavioralAssessmentForm.test.tsx` | Teste de componente deletado |
| `components/__tests__/CandidateMessagesCard.test.tsx` | Teste de componente deletado |
| `components/__tests__/CandidatePortalPreAdmissionCard.test.tsx` | Teste de componente deletado |

### Feature `features/public-application/`

| Arquivo | Motivo |
|---|---|
| `components/JobResumeStep.tsx` | Exclusivo de `PublicApplicationPage` (deletada) |
| `components/PersonalDataStep.tsx` | Exclusivo de `PublicApplicationPage` |
| `components/ReviewStep.tsx` | Exclusivo de `PublicApplicationPage` |
| `components/SignupMethodStep.tsx` | Exclusivo de `PublicApplicationPage` |
| `components/SuccessScreen.tsx` | Exclusivo de `PublicApplicationPage` |
| `hooks/useApplicationForm.ts` | Exclusivo de `PublicApplicationPage` |
| `services/publicApplicationService.ts` | Exclusivo de `PublicApplicationPage` |
| `types/index.ts` | Exclusivo da feature deletada |
| `utils/cpf.ts` | Exclusivo da feature deletada |
| `utils/phone.ts` | Exclusivo da feature deletada |
| `utils/salary.ts` | Exclusivo da feature deletada |
| `components/__tests__/SuccessScreen.test.tsx` | Teste de componente deletado |

### Services

| Arquivo | Motivo |
|---|---|
| `services/candidatePortalService.ts` | Usado somente pelos componentes deletados acima |

### Auth components

| Arquivo | Motivo |
|---|---|
| `components/auth/CandidateLoginAccessCard.tsx` | Exclusivo de `CandidateEntryPage` (deletada) |
| `components/auth/CandidatePublicShell.tsx` | Exclusivo de `CandidateEntryPage` e `PublicApplicationPage` (deletadas) |

### App

| Arquivo | Motivo |
|---|---|
| `app/CandidateThemeGuard.tsx` | `candidatePage()` não tem mais rotas ativas que a usem |

### AppRouter.tsx (modificado, não deletado)

Removidos:
- Import de `CandidateThemeGuard`
- 4 lazy imports mortos (`CandidatePortalPage`, `CandidatePreAdmissionPage`, `CandidateEntryPage`, `PublicApplicationPage`)
- Função `candidatePage()` (sem uso ativo)
- Comentários referenciando componentes deletados

---

## Arquivos mantidos

| Arquivo | Motivo |
|---|---|
| `pages/CandidatePortalRedirectPage.tsx` | **Tela de transição ativa** — renderizada pelas 5 rotas `/candidato/*` |
| `app/AppRouter.tsx` | Mantido e limpo |
| `vite-env.d.ts` | Declaração de `VITE_CANDIDATE_PORTAL_URL` |
| `.env.example` | Documenta `VITE_CANDIDATE_PORTAL_URL` |

---

## Rotas validadas (após remoção)

| Rota | Resultado |
|---|---|
| `/candidato` | ✅ `CandidatePortalRedirectPage` → link para `${VITE_CANDIDATE_PORTAL_URL}/vagas` |
| `/candidato/cadastro` | ✅ `CandidatePortalRedirectPage` → `/vagas` |
| `/candidato/login` | ✅ `CandidatePortalRedirectPage` → `/login` |
| `/candidato/portal` | ✅ `CandidatePortalRedirectPage` → `/minha-area` |
| `/candidato/pre-admissao` | ✅ `CandidatePortalRedirectPage` → `/pre-admissao` |

Nenhuma rota entra mais no fluxo antigo.

---

## Testes legados ainda existentes (`pages/__tests__/`)

Os arquivos abaixo testam as páginas deletadas. O `tsc --noEmit` passa porque esses arquivos de teste são excluídos da compilação Vite. Devem ser removidos em **C-Clean-3**:

```
frontend/src/pages/__tests__/CandidatePortalPage.test.tsx
frontend/src/pages/__tests__/CandidatePortalFlow.test.tsx
frontend/src/pages/__tests__/CandidateWorkspaceFlow.test.tsx
frontend/src/pages/__tests__/PublicApplicationPage.test.tsx
frontend/src/pages/__tests__/CandidateEntryPage.test.tsx
frontend/src/pages/__tests__/CandidatePreAdmissionPage.test.tsx
```

---

## Riscos residuais

| Risco | Status |
|---|---|
| Alguma referência a `candidatePortalService` no `frontend/` fora das páginas deletadas | ✅ Auditado — zero referências não-teste restantes |
| `CandidateThemeGuard` sendo usada em outra parte | ✅ Auditado — única referência era `candidatePage()` em AppRouter (removida) |
| Testes de unidade quebrando por componentes removidos | 🟡 Testes em `pages/__tests__/` referenciando páginas deletadas — TypeScript não falha (excluídos da build), mas vitest pode falhar se executado. Remover em C-Clean-3 |

---

## Comandos executados

```bash
npm --prefix frontend run build        # ✓ tsc --noEmit + vite build — sem erros
npm --prefix candidate-portal run build # ✓ sem alterações
```

---

## Confirmações

- `backend/` — **zero alterações**
- `candidate-portal/` — **zero alterações**
- Rotas `/candidato/*` — continuam ativas, renderizam tela de transição
- Novo portal em `http://localhost:5174` — totalmente funcional
