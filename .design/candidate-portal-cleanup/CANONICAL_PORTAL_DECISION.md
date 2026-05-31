# C-Clean-1 — Decisão: Portal Canônico do Candidato

**Data:** 2026-05-31  
**Branch:** save/behavioral-ai-and-wips

---

## Decisão tomada

**O novo `candidate-portal/` (standalone, porta 5174) é o portal canônico.**

O portal antigo embutido no `frontend/` (rotas `/candidato/*`) foi desativado por substituição: todas as rotas `/candidato/*` agora renderizam `CandidatePortalRedirectPage`, que aponta os candidatos para o novo portal.

O código antigo **não foi deletado** nesta fase — a remoção acontece em C-Clean-2, após aprovação.

---

## Rotas antigas encontradas e como foram tratadas

| Rota antiga | Componente antigo | Ação | Destino no novo portal |
|---|---|---|---|
| `/candidato` | `CandidateEntryPage` | ✅ Substituída por `CandidatePortalRedirectPage` | `/vagas` |
| `/candidato/cadastro` | `PublicApplicationPage` | ✅ Substituída por `CandidatePortalRedirectPage` | `/vagas` |
| `/candidato/login` | `CandidateEntryPage` | ✅ Substituída por `CandidatePortalRedirectPage` | `/login` |
| `/candidato/portal` | `CandidatePortalPage` | ✅ Substituída por `CandidatePortalRedirectPage` | `/minha-area` |
| `/candidato/pre-admissao` | `CandidatePreAdmissionPage` | ✅ Substituída por `CandidatePortalRedirectPage` | `/pre-admissao` |

Antes, `/candidato/portal` e `/candidato/pre-admissao` usavam `candidatePage()` (com `CandidateThemeGuard`). Na transição, foram trocados para `publicPage()`, pois a página de redirect não precisa de autenticação.

---

## Como a transição funciona

### `CandidatePortalRedirectPage`

```
frontend/src/pages/CandidatePortalRedirectPage.tsx
```

- Lê `location.pathname` para determinar qual sub-rota o candidato tentou acessar
- Mapeia para a rota equivalente no novo portal (tabela acima)
- Exibe uma mensagem amigável explicando a mudança
- Oferece um botão CTA: **"Acessar novo portal"** → link externo para o novo portal
- **Não faz redirect automático** (evita problemas em dev e preserva histórico de navegação)

### Variável de ambiente

```
VITE_CANDIDATE_PORTAL_URL=http://localhost:5174
```

Definida em `frontend/.env.example` e em `frontend/src/vite-env.d.ts`.

- Dev local: padrão `http://localhost:5174` (fallback hardcoded no componente)
- Staging/prod: definir no CI/CD com o domínio real do portal

---

## Arquivos alterados nesta fase

| Arquivo | Ação |
|---|---|
| `frontend/src/pages/CandidatePortalRedirectPage.tsx` | **Criado** — tela de transição |
| `frontend/src/app/AppRouter.tsx` | Rotas `/candidato/*` substituídas; lazy imports antigos mantidos |
| `frontend/src/vite-env.d.ts` | Adicionada `VITE_CANDIDATE_PORTAL_URL` |
| `frontend/.env.example` | Adicionada `VITE_CANDIDATE_PORTAL_URL=http://localhost:5174` |

---

## Arquivos antigos ainda existentes (não deletados)

| Arquivo | Motivo para manter | Remoção em |
|---|---|---|
| `frontend/src/pages/CandidatePortalPage.tsx` | 1417 linhas; remover separadamente com revisão | C-Clean-2 |
| `frontend/src/pages/PublicApplicationPage.tsx` | Form de candidatura antigo integrado | C-Clean-2 |
| `frontend/src/pages/CandidateEntryPage.tsx` | Landing page antiga | C-Clean-2 |
| `frontend/src/pages/CandidatePreAdmissionPage.tsx` | Pré-admissão antiga integrada | C-Clean-2 |
| `frontend/src/features/candidate-portal/` | Componentes usados por `CandidatePortalPage` | C-Clean-2 |
| `frontend/src/features/public-application/` | Componentes usados por `PublicApplicationPage` | C-Clean-2 |
| `frontend/src/services/candidatePortalService.ts` | Usado por `CandidatePortalPage` | C-Clean-2 |
| `frontend/src/app/CandidateThemeGuard.tsx` | Usado apenas pelas rotas antigas | C-Clean-2 (verificar outros usos antes) |
| `frontend/src/components/auth/CandidateLoginAccessCard.tsx` | Usado por `CandidateEntryPage` | C-Clean-2 |

**Os lazy imports desses componentes em `AppRouter.tsx` também são mantidos** até C-Clean-2. O Vite ainda gera chunks separados para eles no build (`CandidatePortalPage-*.js` etc.), mas eles não são mais referenciados por nenhuma rota ativa.

> **Nota:** como os lazy imports existem mas as rotas que os usam foram substituídas, esses chunks são gerados mas nunca carregados em runtime. O build fica levemente maior (~55 KB gzip para `CandidatePortalPage`) mas sem impacto funcional.

---

## Plano para C-Clean-2

1. Remover todos os lazy imports dos componentes antigos do `AppRouter.tsx`
2. Deletar os arquivos listados na tabela acima
3. Verificar se `CandidateThemeGuard` tem outros usos antes de deletar
4. Remover `candidatePortalService.ts` (verificar se tem outros usos no frontend interno)
5. Rodar `npm --prefix frontend run build` — sem erros TypeScript

---

## Riscos

| Risco | Mitigação |
|---|---|
| Candidato que tinha sessão ativa no portal antigo perde acesso silenciosamente | A tela de redirect explica claramente o motivo. Sessão antiga expira normalmente. |
| Link direto para `/candidato/portal` em e-mails antigos quebra | Redirect page informa e oferece CTA. Não é 404. |
| `VITE_CANDIDATE_PORTAL_URL` não definido em produção | Fallback hardcoded `http://localhost:5174` está presente — configurar no CI/CD antes de deploy |
| Dois portais ativos para candidatos que estão no meio de um fluxo antigo | Risco baixo: a sessão do portal antigo ainda funciona se acessada pelo novo portal. O cookie é compartilhado via backend. |
| Build maior (chunks antigos gerados mas não usados) | Removido em C-Clean-2. Impacto aceitável no curto prazo. |

---

## Confirmações

- `backend/` — **zero alterações**
- `candidate-portal/` — **zero alterações**
- Código legado — **não deletado nesta fase**
- `npm --prefix frontend run build` → ✓
- `npm --prefix candidate-portal run build` → ✓ (sem alterações)
