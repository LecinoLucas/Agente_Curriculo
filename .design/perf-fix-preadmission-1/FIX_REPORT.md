# PERF-FIX-PREADMISSION-1 — Fix Report

## Causa raiz

O `AdmissionCaseWorkspacePanel` fazia reload amplo de `overview + documents` apos mutacoes de documento e checklist, mesmo quando a resposta da propria mutacao ja era suficiente para refletir o item alterado.

## Arquivos alterados

- `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx`
- `frontend/src/pages/__tests__/AdmissionCasePage.test.tsx`

## Decisao tecnica

- Manter a carga inicial paralela.
- Introduzir patch local para documento/checklist quando a mutacao retorna dados suficientes.
- Recarregar `overview` uma vez apos mutacoes bem-sucedidas.
- Usar fallback para `GET /documents` apenas quando o retorno da mutacao nao suporta sincronizacao local.
- Preservar `events` fora do fluxo de approve/reject/request-correction.
- Nao tocar no painel Protheus nem no backend.

## Impacto esperado

- Menor call-count apos acoes frequentes de revisao.
- Menos renderizacao desnecessaria da lista inteira de documentos.
- Menor risco de reabrir fetches do painel Protheus por reconstrucoes do workspace.

## Riscos restantes

- `reviewed_by_name` nao vem no contrato de approve/reject; o estado local fica funcional, mas esse campo pode permanecer com o valor anterior ate refresh manual.
- Se o backend mudar o shape da resposta de mutacao, o fluxo depende do fallback para `GET /documents`.
- Existem mudancas locais preexistentes em `frontend/src/pages/PipelinePage.tsx` e `frontend/src/pages/__tests__/PipelinePage.test.tsx`, fora do escopo desta fase.
