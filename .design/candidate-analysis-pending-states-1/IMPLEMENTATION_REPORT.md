# CANDIDATE-ANALYSIS-PENDING-STATES-1

## Objetivo

Corrigir o frontend das telas de candidato e análises para representar corretamente:

- extração em andamento;
- falha de OCR/extração;
- análise IA em processamento;
- rate limit/cooldown do provedor;
- score/ranking ainda indisponível com `409` controlado.

Sem alterar backend, OCR, provider, ranking ou Protheus.

## Estados mapeados

- `waiting_extraction`
- `pending`
- `processing`
- `completed`
- `failed`
- `retry_scheduled`
- `cancelled`
- `extraction_status=pending|processing|failed`
- `provider_error_type`/mensagens compatíveis com `rate_limited`
- `candidate_score_not_ready`
- `ranking_not_ready`

## Mensagens antes/depois

| Caso | Antes | Depois |
|---|---|---|
| waiting_extraction | mensagens genéricas/ambíguas | `Extração do currículo em andamento` + início automático da análise |
| OCR falhou | podia cair em erro genérico de IA | `Não foi possível extrair o texto do currículo.` |
| pending/processing | cópia inconsistente por tela | `Análise IA em processamento.` |
| rate limit | mensagens misturadas com falha genérica | `A IA está temporariamente limitada pelo provedor. Aguarde o cooldown antes de tentar novamente.` |
| score/ranking 409 | podia aparecer como erro inesperado | `Score ainda não disponível.` como estado controlado |
| falha curricular | podia mencionar IA comportamental | `A análise IA falhou.` sem cruzar contexto comportamental |

## Arquivos alterados

- `frontend/src/features/candidates/drawer/hooks/useCandidateData.ts`
- `frontend/src/features/candidates/utils/analysisStatus.ts`
- `frontend/src/features/candidates/profile/components/CandidateProfileScoreTab.tsx`
- `frontend/src/pages/CandidateProfilePage.tsx`
- `frontend/src/features/analyses/utils/analysisFormatters.ts`
- `frontend/src/features/analyses/components/AnalysisRow.tsx`
- `frontend/src/features/candidates/drawer/hooks/__tests__/useCandidateData.test.tsx`
- `frontend/src/features/candidates/utils/__tests__/analysisStatus.test.ts`
- `frontend/src/features/candidates/drawer/components/__tests__/CandidateAnalysisStatusCard.test.tsx`
- `frontend/src/features/candidates/profile/components/__tests__/CandidateProfileScoreTab.test.tsx`
- `frontend/src/pages/__tests__/AnalisesIaPage.test.tsx`
- `frontend/src/pages/__tests__/CandidateWorkspaceFlow.test.tsx`

## Arquivos criados

- `frontend/src/features/analyses/components/__tests__/AnalysisRow.test.tsx`

## Implementação

- `useCandidateData` passou a tratar `409 candidate_score_not_ready` e `409 ranking_not_ready` como estado controlado, sem promover erro inesperado.
- `CandidateProfileScoreTab` agora prioriza corretamente:
  - extração em andamento;
  - falha de extração/OCR;
  - cooldown/rate limit;
  - matching pendente;
  - score ainda indisponível;
  - erro real de análise.
- `CandidateProfilePage` bloqueia nova solicitação indevida quando a extração ainda está em andamento, falhou ou a análise ainda aguarda texto.
- `analysisStatus` e `analysisFormatters` passaram a distinguir melhor falha de OCR vs falha real de IA vs cooldown do provedor.
- `AnalysisRow` não oferece retry de análise IA para falha de extração/OCR em análise curricular.

## Testes rodados

- `cd frontend && npm run test -- --run CandidateProfileScoreTab`
- `cd frontend && npm run test -- --run useCandidateData`
- `cd frontend && npm run test -- --run analysisStatus`
- `cd frontend && npm run test -- --run CandidateAnalysisStatusCard`
- `cd frontend && npm run test -- --run AnalysisRow`
- `cd frontend && npm run test -- --run AnalisesIaPage`
- `cd frontend && npm run test -- --run CandidateWorkspaceFlow`
- `cd frontend && npx tsc --noEmit`

## Resultado

- Todos os testes acima passaram.
- `npm run typecheck` não existe no `package.json`; foi usado `npx tsc --noEmit` como equivalente.

## Confirmações

- Frontend não dispara retry automático de IA.
- `409` de score/ranking vira estado controlado.
- Erro de OCR não vira erro genérico de IA.
- `Falha inesperada na IA comportamental` não aparece no fluxo de análise curricular coberto.
- Backend não foi alterado.
- OCR não foi alterado.
- Provider/modelo não foram alterados.
- Ranking/score não foram alterados.
- Protheus não foi alterado.

## Pendências reais

- Os testes de `CandidateProfileScoreTab` ainda emitem warnings de `act(...)` por atualizações assíncronas do carregamento de `scoreExplanation`; não quebram a suíte, mas vale endurecer o teste depois.
- Não há ação dedicada de reprocessar extração no frontend; o estado agora orienta corretamente, mas eventual CTA específico depende de fluxo próprio.
