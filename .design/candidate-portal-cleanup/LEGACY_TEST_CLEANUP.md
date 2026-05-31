# C-Clean-3 — Limpeza de Testes Legados do Portal Antigo

**Data:** 2026-05-31  
**Branch:** save/behavioral-ai-and-wips

---

## Buscas executadas

```bash
# Verificar se CandidateWorkspaceFlow.test.tsx referencia código deletado
grep -n "CandidatePortal|PublicApplication|CandidateEntry|CandidatePreAdmission|\
features/candidate-portal|features/public-application|candidatePortalService" \
  frontend/src/pages/__tests__/CandidateWorkspaceFlow.test.tsx
# → 0 matches — arquivo não toca código deletado → MANTER

# Verificar imports deletados nos 5 arquivos restantes
# → todos importavam diretamente as páginas/services removidos em C-Clean-2
```

---

## Classificação e decisão por arquivo

| Arquivo | Tamanho | Importava código deletado? | Decisão |
|---|---|---|---|
| `CandidatePortalPage.test.tsx` | 54.5 KB | Sim — `CandidatePortalPage`, `candidatePortalService` | **Deletado** |
| `CandidatePortalFlow.test.tsx` | 15.0 KB | Sim — `CandidatePortalPage`, `CandidateEntryPage`, `candidatePortalService` | **Deletado** |
| `CandidateWorkspaceFlow.test.tsx` | 97.3 KB | Não — testa `CandidatesPage`, `CandidateProfilePage` (staff) | **Mantido** |
| `CandidatePreAdmissionPage.test.tsx` | 10.3 KB | Sim — `CandidatePreAdmissionPage`, `candidatePortalService` | **Deletado** |
| `CandidateEntryPage.test.tsx` | 5.3 KB | Sim — `CandidateEntryPage`, `candidatePortalService` | **Deletado** |
| `PublicApplicationPage.test.tsx` | 11.9 KB | Sim — `PublicApplicationPage`, `publicApplicationService` | **Deletado** |

---

## Testes removidos

5 arquivos deletados (total: ~97 KB de código de teste legado).

---

## Teste novo criado

```
frontend/src/pages/__tests__/CandidatePortalRedirectPage.test.tsx
```

**9 casos de teste** — todos passando:

| Teste | Descrição |
|---|---|
| `exibe a tela de transição em /candidato` | Verifica mensagem de transição e CTA |
| `exibe a tela de transição em /candidato/cadastro` | Verifica CTA presente |
| `exibe a tela de transição em /candidato/login` | Verifica CTA presente |
| `exibe a tela de transição em /candidato/portal` | Verifica CTA presente |
| `exibe a tela de transição em /candidato/pre-admissao` | Verifica CTA presente |
| `CTA aponta para o fallback http://localhost:5174/vagas quando env não está definido` | Verifica fallback sem VITE_CANDIDATE_PORTAL_URL |
| `CTA de /candidato/login aponta para /login no novo portal` | Verifica mapeamento de rota |
| `CTA de /candidato/portal aponta para /minha-area no novo portal` | Verifica mapeamento de rota |
| `CTA de /candidato/pre-admissao aponta para /pre-admissao no novo portal` | Verifica mapeamento de rota |

---

## Resultados

```bash
# Novo teste isolado
npm test -- --run --reporter=verbose src/pages/__tests__/CandidatePortalRedirectPage.test.tsx
# → Test Files: 1 passed | Tests: 9 passed

# Suite completa
npm test -- --run
# → Test Files: 102 passed (102) | Tests: 993 passed (993)

# Builds
npm --prefix frontend run build         # ✓ tsc + vite — sem erros
npm --prefix candidate-portal run build # ✓ sem alterações
```

---

## O que foi preservado

- `CandidateWorkspaceFlow.test.tsx` — 97.3 KB, testa `CandidatesPage` e `CandidateProfilePage` (staff/admin, ainda existem)
- Todos os demais 97 arquivos de teste do `frontend/`
- Rotas `/candidato/*` — continuam mostrando `CandidatePortalRedirectPage`

---

## Confirmações

- `backend/` — **zero alterações**
- `candidate-portal/` — **zero alterações**
- Suite Vitest — **993 tests passando, 0 falhando**
