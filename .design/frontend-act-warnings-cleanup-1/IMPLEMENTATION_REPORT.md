# FRONTEND-ACT-WARNINGS-CLEANUP-1

## Warning original

Os testes de `CandidateProfileScoreTab.test.tsx` passavam, mas emitiam warnings de React:

- `Warning: An update to CandidateProfileScoreTab inside a test was not wrapped in act(...)`

O warning aparecia nos cenários de:

- falha de OCR;
- rate limit/cooldown.

## Causa

`CandidateProfileScoreTab` dispara o efeito de carregamento de `scoreExplanation` quando existe `current_analysis_id` e o fluxo não está em `scoreNotReady` nem em estado de processamento.

Nos testes afetados:

- o componente montava;
- o `useEffect` executava `scoreExplanationService.get(...)`;
- o teste encerrava suas asserções sem aguardar esse efeito assíncrono.

Isso deixava atualizações internas do componente ocorrendo fora do ciclo observado pelo Testing Library.

## Arquivos alterados

- `frontend/src/features/candidates/profile/components/__tests__/CandidateProfileScoreTab.test.tsx`

## Como foi corrigido

- O mock de `scoreExplanationService.get` passou a ser controlado por `vi.hoisted`.
- O comportamento padrão do mock foi trocado para uma promise pendente, evitando resolução assíncrona irrelevante para a maioria dos cenários.
- Nos testes que validam falha de OCR e rate limit, foi adicionado `await waitFor(...)` para aguardar explicitamente a execução do efeito assíncrono antes do fim do teste.

Nenhuma regra de negócio do componente foi alterada.

## Testes rodados

- `cd frontend && npm run test -- --run CandidateProfileScoreTab`
- `cd frontend && npm run test -- --run CandidateWorkspaceFlow`
- `cd frontend && npm run test -- --run AnalisesIaPage`
- `cd frontend && npx tsc --noEmit`

## Resultado

- Todos os comandos acima passaram.
- Os warnings de `act(...)` deixaram de aparecer em `CandidateProfileScoreTab.test.tsx`.

## Confirmações

- Nenhum backend foi alterado.
- Nenhuma regra de ranking/score foi alterada.
- Nenhum provider/modelo/prompt/OCR foi alterado.
- Nenhuma migration foi criada.
- Nenhum ajuste em Protheus foi feito.
- Os warnings de `act(...)` foram removidos nos testes de `CandidateProfileScoreTab`.

## Pendências reais

- Nenhuma pendência adicional identificada neste escopo.
