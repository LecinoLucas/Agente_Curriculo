# C4 — Production Readiness do candidate-portal

**Data:** 2026-05-31  
**Branch:** save/behavioral-ai-and-wips

---

## Comandos executados

```bash
# Auditoria de console.log
grep -rn "console\." candidate-portal/src/ --include="*.tsx" --include="*.ts"
# → nenhum encontrado

# Auditoria de campos internos
grep -rn "ai_score|match_score|ranking|quality_score|protheus|review_notes|pipeline_id" \
  candidate-portal/src/pages/ candidate-portal/src/services/
# → pipeline_id apenas em tipos de resposta não renderizados (ApplyResponse); nenhum renderizado na UI

# Auditoria de dangerouslySetInnerHTML / XSS
grep -rn "dangerouslySetInnerHTML|innerHTML" candidate-portal/src/
# → nenhum encontrado

# Auditoria de imports mortos / componentes orphaned
grep -rn "DocumentChecklist|UploadMockCard|ProcessStepper|StatusCard|mockCandidatePortalService|MOCK_CANDIDATE|useMockAuth" \
  candidate-portal/src/pages/ candidate-portal/src/App.tsx candidate-portal/src/routes/
# → nenhum encontrado (todos os imports mortos resolvidos)

# Builds de validação
npm --prefix candidate-portal run build   # ✓
npm --prefix frontend run build           # ✓
```

---

## Arquivos alterados nesta fase

| Arquivo | Ação | Motivo |
|---|---|---|
| `src/services/publicApiClient.ts` | Modificado | `get()` expunha path da API na mensagem de erro (`HTTP 401: /candidate-portal/overview`) → alinhado com os outros métodos (`Erro 401` + `detail` do backend) |
| `src/pages/ApplicationSuccessPage.tsx` | Modificado | Botão "Acessar minha área" apontava para `/login`; backend seta cookie de sessão no `POST /candidates/apply` → corrigido para `/minha-area` |
| `candidate-portal/.env.example` | **Criado** | Documenta `VITE_PUBLIC_API_BASE_URL` e explica CORS em desenvolvimento |
| `src/components/shared/DocumentChecklist.tsx` | **Deletado** | Orphaned — nenhum página importava; substituído por renderização inline em C3E |
| `src/components/shared/UploadMockCard.tsx` | **Deletado** | Orphaned — só usado pelo deletado `DocumentChecklist` |
| `src/components/shared/ProcessStepper.tsx` | **Deletado** | Orphaned — nenhuma página importava; substituído por `ProcessTimeline` inline em `CandidateHomePage` |
| `src/components/shared/StatusCard.tsx` | **Deletado** | Orphaned — nenhuma página importava após reescrita de `CandidateHomePage` |
| `src/services/mockCandidatePortalService.ts` | **Deletado** | Orphaned — nenhuma página importava; todos os fluxos usam serviços reais |
| `src/data/mockCandidatePortal.ts` | **Deletado** | Orphaned — só importado por `mockCandidatePortalService.ts` (deletado) |

---

## Variáveis de ambiente

| Variável | Padrão (fallback) | Obrigatória em prod | Descrição |
|---|---|---|---|
| `VITE_PUBLIC_API_BASE_URL` | `http://localhost:8000/api/v1/public` | Sim | URL base da API pública, sem barra final |

**Arquivo:** `candidate-portal/.env.example`  
**Como usar em dev:** `cp candidate-portal/.env.example candidate-portal/.env.local`

**Em produção:** definir no sistema de CI/CD ou no servidor de build, apontando para o domínio real da API (ex: `https://api.marajo.com.br/api/v1/public`).

---

## Avaliação do proxy Vite

**Decisão: não implementar.**

**Razão técnica:** O Vite proxy intercepta apenas requests com URLs relativas servidas pelo dev server. O `publicApiClient.ts` constrói URLs absolutas (`${VITE_PUBLIC_API_BASE_URL}${path}`). Adicionar `proxy: { '/api': 'http://localhost:8000' }` ao `vite.config.ts` não teria efeito sobre essas chamadas — a fetch vai diretamente ao host de destino, ignorando o proxy.

Para usar o proxy seria necessário mudar o fallback de `http://localhost:8000/api/v1/public` para `/api/v1/public` (relativo), o que:
1. Quebraria o fallback para developers sem `.env.local`
2. Mascararia problemas de CORS que precisam ser corrigidos no backend para produção

O CORS deve ser configurado explicitamente no backend para os domínios do portal (desenvolvimento e produção). Isso garante que o comportamento de dev espelha a produção.

---

## Revisão de segurança visual e conceitual

| Campo / informação | Status |
|---|---|
| Score de IA (`ai_score`, `ai_evaluation_status`) | ✓ Não exposto — omitido nos mappers |
| Ranking | ✓ Não retornado pelos schemas candidate-facing |
| Parecer interno (`review_notes`) | ✓ Não está em nenhum schema candidate-facing |
| Comentários internos (`manager_notes`, `internal_notes`) | ✓ Não retornados pelos schemas candidate-facing |
| Pipeline interna (`pipeline_id`) | ✓ Aparece apenas em tipos de resposta de aplicação (não renderizado na UI) |
| Protheus / ERP | ✓ Não presente em nenhum schema candidate-facing |
| Eventos internos | ✓ `PreAdmissionEventResponse` não está em nenhuma resposta candidate-facing |
| `dangerouslySetInnerHTML` / XSS | ✓ Nenhum uso encontrado |
| Open-redirect via input do usuário | ✓ Nenhum — `window.open` usa URL construída internamente |
| Stack traces expostos | ✓ Nenhum — apenas `err.message` (message do `HttpError`) ou mensagens hardcoded |
| Path interno da API exposto | ✓ Corrigido — `get()` alinhado com os outros métodos |

---

## Revisão de mensagens de erro

| Página / contexto | Estratégia de erro | Status |
|---|---|---|
| `PublicJobsPage` — lista de vagas | Mensagem hardcoded; nunca exibe `err.message` | ✓ |
| `PublicJobPage` — detalhe da vaga | Mensagem hardcoded; nunca exibe `err.message` | ✓ |
| `ApplicationFormPage` — submit candidatura | `err.message` = `detail` do backend (ex: "Erro de validação") ou "Erro ao enviar candidatura" | ✓ |
| `CandidateLoginPage` — login | `err.message` = `detail` do backend (ex: "E-mail ou senha inválidos.") | ✓ |
| `CandidateHomePage` — overview | 401 → redirect `/login`; 403 → mensagem hardcoded; outros → mensagem hardcoded | ✓ |
| `CandidateAssessmentPage` — avaliação | 401 → redirect `/login`; 409 start → retry GET; outros → `err.message` | ✓ |
| `CandidatePreAdmissionPage` — pré-admissão | 401 → redirect `/login`; 403 → mensagem hardcoded; upload → `err.message` do backend | ✓ |

---

## Revisão de rotas autenticadas

| Rota | Comportamento em 401 | Comportamento em 403 |
|---|---|---|
| `/minha-area` | Redirect `/login` | Mensagem "perfil incompleto" |
| `/avaliacao` | Redirect `/login` | Mensagem de erro genérica (403 não esperado nessa rota) |
| `/pre-admissao` | Redirect `/login` | Mensagem "perfil incompleto" (`CurrentCompleteCandidateSession`) |

**Refresh em rota autenticada:** React state (`candidateName`) é perdido, mas o cookie HttpOnly persiste. As páginas autenticadas fazem novo GET ao montar → restauram estado corretamente ou redirecionam para `/login`.

---

## Revisão de upload

| Validação | Onde | Status |
|---|---|---|
| Tamanho máximo por item | Client-side via `item.maxFileSizeMb` (dado real da API) | ✓ |
| Tipos de arquivo aceitos | `accept` do `<input>` via `item.allowedFileTypes` (dado real da API) | ✓ |
| Erro de arquivo grande | Mensagem: "Arquivo muito grande. Máximo: X MB." | ✓ |
| Erro de upload na API (422) | `err.message` = `detail` do backend | ✓ |
| Upload em andamento (feedback visual) | Spinner inline por item | ✓ |
| Retry após erro | Zona de upload permanece disponível | ✓ |

---

## Must-fix antes de go-live

| # | Problema | Impacto | Ação necessária |
|---|---|---|---|
| 1 | Cookie `secure: False` em dev — backend define `secure=request.url.scheme == "https"`. Em produção sem HTTPS o cookie não é enviado | Bloqueio em produção sem HTTPS | Garantir TLS end-to-end antes de expor ao público |
| 2 | CORS não configurado explicitamente para os domínios do portal em produção | Todas as chamadas da API falham com CORS error | Backend deve adicionar o domínio de produção do portal em `CORS_ORIGINS` |
| 3 | Sem headers de segurança HTTP (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) | XSS, clickjacking | Configurar no proxy/CDN ou no servidor web que serve o portal |
| 4 | Sem rate limiting client-side no formulário de candidatura | Submissões em loop (backend já tem rate limit, mas o feedback é melhorável) | Desabilitar botão após submit enquanto loading (já está com `loading={submitting}`) ✓ |
| 5 | Sem validação de CPF format antes de enviar (apenas strip de não-dígitos) | Backend pode recusar CPF com número errado de dígitos | Adicionar validação de 11 dígitos + dígito verificador client-side |

---

## Should-fix futuro

| # | Problema | Arquivo | Prioridade |
|---|---|---|---|
| 1 | Auto-save na avaliação comportamental — respostas perdidas se aba fechada | `CandidateAssessmentPage.tsx` | Alta |
| 2 | `types/candidatePortal.ts` contém tipos mock não usados (`MockCandidate`, `HRMessage`, `AssessmentQuestion`, `DocumentItem`, etc.) — podem causar confusão | `src/types/candidatePortal.ts` | Baixa |
| 3 | Upload sem indicador de progresso de bytes — apenas spinner | `CandidatePreAdmissionPage.tsx` | Baixa |
| 4 | Filtro de modelo de trabalho removido da lista de vagas (API não retorna esse campo na lista) — considerar adicionar ao backend | backend | Baixa |
| 5 | Sem testes automatizados de integração | N/A | Alta para produção |
| 6 | `ApplicationSuccessPage` usa `PROCESS_STEPS` hardcoded (constante local) em vez de timeline dinâmica da API | `ApplicationSuccessPage.tsx` | Baixa |
| 7 | Download de documento pré-admissão usa `window.open` — em produção verificar que `SameSite=Lax` permite o cookie em navegação cross-origin (deve funcionar, mas testar em produção) | `CandidatePreAdmissionPage.tsx` | Média |

---

## Estado final do candidate-portal

### Integração por fluxo

| Fluxo | Status | Fase |
|---|---|---|
| Vagas públicas (lista + detalhe) | ✓ Real | C3A |
| Candidatura pública (FormData + File real) | ✓ Real | C3B.1 |
| Login / Logout | ✓ Real | C3C |
| Área do candidato (overview real) | ✓ Real | C3C |
| Avaliação comportamental | ✓ Real | C3D |
| Pré-admissão e upload/download | ✓ Real | C3E |

### Arquivos mortos removidos

```
src/components/shared/DocumentChecklist.tsx   ← C3E substituiu por inline
src/components/shared/UploadMockCard.tsx      ← dependia do DocumentChecklist
src/components/shared/ProcessStepper.tsx      ← C3C substituiu por ProcessTimeline inline
src/components/shared/StatusCard.tsx          ← C3C reescreveu CandidateHomePage
src/services/mockCandidatePortalService.ts    ← substituído pelos serviços reais
src/data/mockCandidatePortal.ts               ← dependia do mockCandidatePortalService
```

### Build final

```bash
npm --prefix candidate-portal run build
# → tsc (strict, noUnusedLocals, noUnusedParameters) + vite ✓
# → 1603 módulos, 305 KB JS (gzip: 88 KB), sem erros

npm --prefix frontend run build
# → ✓ sem alterações — hash idêntico ao anterior
```

---

## Confirmações

- `backend/` — **zero alterações** em toda a série C3A–C4
- `frontend/` (interno) — **zero alterações** em toda a série C3A–C4
- Nenhum endpoint novo criado
- Nenhuma feature fora do escopo implementada
- `noUnusedLocals: true` + `strict: true` passando ✓

---

## Próxima fase

**C5 (sugestão) — Produção e monitoramento:**
- Configurar CORS no backend para domínio de produção do portal
- Garantir TLS no servidor de produção
- Adicionar headers de segurança HTTP via proxy/CDN (CSP, HSTS, X-Frame-Options)
- Implementar auto-save de respostas na avaliação comportamental
- Adicionar testes de integração automatizados (Playwright E2E)
