# CANDIDATE-MATCHING-PENDING-CTA-FIX-1

Data: 2026-06-10

---

## Problema observado

Na aba "Score e análise" do perfil de candidato, quando o estado era `matching_pending`
(análise IA concluída mas ranking ainda não recalculado), o botão exibido era:

**"Reprocessar análise"**

Esse botão chamava `onRequestAnalysis({ force: true })`, que dispara a service de análise IA
(`analysisService.request(..., force: true)`), chamando o provider Gemini desnecessariamente.

O problema: a análise já estava concluída (`analysis_status = "completed"`). O único passo
pendente era o recálculo determinístico de matching/ranking da vaga — uma operação sem custo de IA.

---

## Por que "Reprocessar análise" estava errado

A classificação do estado é:
```
currentAnalysisId != null && status === "completed" && scoreNotReady === true
```

Isso significa: "existe análise válida e completa, mas o score/ranking desta vaga ainda não foi
computado a partir dela". O recálculo de ranking é determinístico — usa os dados já extraídos pela
análise IA para recalcular score, posicionamento e ranking da vaga.

Chamar "Reprocessar análise" forçado nesses candidatos:
1. Chamava Gemini/provider desnecessariamente (custo real)
2. Descartava uma análise já concluída válida
3. Colocava o candidato de volta na fila de análise sem necessidade

---

## Qual endpoint agora é chamado

`POST /api/v1/jobs/{job_id}/recalculate-ranking`

Este endpoint:
- É determinístico (usa apenas dados já extraídos)
- Não chama nenhum provider de IA
- Enfileira o recálculo de matching/ranking para todos os candidatos da vaga
- Retorna `{ queued: boolean, provider_calls: 0, message: string }`

A função `recalculateJobRanking(jobId)` já existia em `jobsService.ts` e aponta para esse endpoint.

---

## Garantia de custo zero de IA

- O endpoint `/recalculate-ranking` tem `provider_calls: 0` na resposta
- O Smart Refresh usa o mesmo endpoint para o grupo `ranking_recalculation`
- `handleRecalculateMatching` nunca chama `analysisService.request()`
- O botão "Recalcular matching" não aparece em estados de análise pending/failed/error —
  nesses, o botão original "Reprocessar análise" ou "Tentar novamente" continua inalterado

---

## Arquivos alterados

### `frontend/src/features/candidates/profile/components/CandidateProfileScoreTab.tsx`

**Prop interface:**
- Adicionado `matchingRecalculating?: boolean` — loading state para recálculo
- Adicionado `onRecalculateMatching?: () => Promise<void>` — handler do recálculo

**Branch `matching_pending`:**
- Texto: `"Esta análise IA já foi concluída. Falta apenas recalcular o matching/ranking desta vaga. Essa ação não usa IA e pode levar alguns instantes."`
- Label do botão: `matchingRecalculating ? "Recalculando..." : "Recalcular matching"`
- Ação: `onRecalculateMatching()` em vez de `onRequestAnalysis({ force: true })`
- Botão desabilitado quando: `matchingRecalculating`, `!activeJobId`, ou `!onRecalculateMatching`

### `frontend/src/pages/CandidateProfilePage.tsx`

- Import de `recalculateJobRanking` adicionado a `jobsService`
- `useState` `matchingRecalculating` adicionado
- `handleRecalculateMatching` — novo `useCallback`:
  - Chama `recalculateJobRanking(profileJobId)`
  - Toast de sucesso: `"Recálculo de matching enfileirado. Nenhum crédito de IA foi usado."`
  - Toast de erro em caso de falha
  - `reloadWorkspace()` após sucesso
- Props `matchingRecalculating` e `onRecalculateMatching` passadas para `CandidateProfileScoreTab`

---

## Testes executados

### Novo: `CandidateProfileScoreTab.test.tsx` — 11 testes passando

**Estado matching_pending:**
1. Mostra título "Matching pendente"
2. NÃO mostra "Reprocessar análise"
3. Mostra botão "Recalcular matching"
4. Mostra "Recalculando..." quando `matchingRecalculating=true`
5. Descrição menciona "não usa IA"
6. Clique chama `onRecalculateMatching`, não `onRequestAnalysis`
7. Botão desabilitado quando `matchingRecalculating=true`
8. Quando `onRecalculateMatching` não fornecido, botão desabilitado
9. Sem vaga ativa: mostra "Candidato sem vaga ativa" (guard anterior), sem "Recalcular matching"

**Outros estados (regressão):**
10. `analysis_failed`: mostra "Tentar novamente", chama `onRequestAnalysis`
11. Sem análise: mostra "Gerar análise agora", chama `onRequestAnalysis`

### TypeScript: sem erros
### Build: `✓ built in 4.39s`
### Regressões: 0 (6 falhas pré-existentes em `CandidatePreviewDrawer.test.tsx`, não relacionadas)

---

## Pré-requisito operacional: worker de ranking

O endpoint `/recalculate-ranking` enfileira o recálculo — ele é assíncrono.
Se o worker de matching não estiver rodando (e.g. ambiente de desenvolvimento sem Celery),
o recálculo será enfileirado mas não executado. O usuário vê o toast de sucesso mas o
score permanece sem atualização até o worker processar a fila.

**Isso já era o comportamento do Smart Refresh** para o grupo `ranking_recalculation`.
Não introduzimos nova dependência operacional — apenas reutilizamos o mesmo endpoint.

---

## Escopo preservado

- Sem alteração ao algoritmo de scoring
- Sem alteração ao Gemini/prompt/provider
- Sem migration de banco de dados
- Sem alteração ao Vite/dev scripts
- Sem alteração ao tema/navbar/Protheus
- Sem alteração ao Smart Refresh backend
- Sem git add . / sem commit
