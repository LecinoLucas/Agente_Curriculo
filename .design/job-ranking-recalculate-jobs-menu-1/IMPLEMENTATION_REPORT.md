# Implementation Report: JOB-RANKING-RECALCULATE-JOBS-MENU-1

## Motivação
A ação de recalcular o ranking de uma vaga foi implementada anteriormente por meio do endpoint `POST /jobs/{job_id}/recalculate-ranking`, que utiliza as análises já existentes dos candidatos sem gastar tokens de IA. No entanto, para oferecer uma melhor experiência ao usuário, tornou-se necessário disponibilizar essa funcionalidade diretamente na listagem de vagas (`JobsPage` / `VagasPage.tsx`), permitindo que o usuário recalcule o ranking de uma vaga rapidamente sem a necessidade de acessar perfil por perfil.

## Endpoint Utilizado
- **Ação:** `jobsService.recalculateJobRanking(jobId)`
- **Endpoint:** `POST /jobs/{job_id}/recalculate-ranking`
- **Garantia de `provider_calls=0`:** A rota já implementada no backend apenas enfileira as requisições de recálculo baseando-se nos dados que já foram extraídos e avaliados, sem envolver chamadas a modelos de linguagem (Gemini) neste processo.

## Implementação no Frontend
1. A função `recalculateJobRanking` foi exportada pelo `jobsService.ts`.
2. A funcionalidade de chamada (`handleRecalculateRanking`) foi acoplada no hook `useJobsList.ts`, providenciando o acionamento via `toast` do resultado (com a mensagem: *"Recálculo de ranking enfileirado. Nenhum token de IA foi usado."*).
3. O item de ação "Recalcular ranking" foi posicionado após "Abrir pipeline" e antes de "Pausar" no menu de ações (três pontinhos) através da utilidade `buildJobActionItems`.
4. Uma lógica de restrição foi adicionada: o botão é desabilitado caso `hasCandidates` seja falso (validado usando o dado extraído em tela `jobOperationalData[job.id]?.totalCandidates > 0`).
5. O botão do menu recebeu um `title` para agir como tooltip: *"Usa dados já analisados dos candidatos — sem nova chamada de IA."*

## Testes Executados
Foram inseridos testes unitários no frontend que comprovam:
- Que o menu exibe a opção de recalcular e chama corretamente o hook (`JobsPage.test.tsx`).
- Que o acionamento do `handleRecalculateRanking` no hook `useJobsList` emite a chamada para `recalculateJobRanking` e exibe o toast amigável confirmando que nenhum token foi gasto (`useJobsList.test.tsx`).
- O código TypeScript compila sem erros (`npx tsc --noEmit`).
- A build foi gerada corretamente (`npm run build`).
- Nenhuma das ações antigas do menu foi alterada ou afetada.

## O Que Não Foi Alterado
- Nenhuma refatoração geral da tela de Vagas foi executada.
- O endpoint backend permaneceu inalterado.
- Os processos de scoring, providers e as diretrizes do Protheus continuaram intocadas, mantendo a garantia de ser uma "mudança cirúrgica".
- A lógica do reprocessamento de currículo dos candidatos se manteve sem alterações no backend.

## Pendência: CTA “Reprocessar análise” (Tela de Candidato/Score)
Foi feita uma auditoria no componente `CandidateProfileScoreTab.tsx`. Nele existe a lógica que exibe um alerta de "Matching pendente" ou "Análise interrompida", oferecendo um CTA escrito "Reprocessar análise".

Atualmente, essa ação aciona a função `onRequestAnalysis({ force: true })`, que dependendo da profundidade e status, pode disparar uma nova extração. Trocar essa chamada isolada pela requisição `recalculateJobRanking(jobId)` envolveria um gerenciamento de contexto de carregamento (loading states) e notificações específicas adicionais naquele componente.

Por este motivo, para manter a segurança desta entrega e a precisão das alterações solicitadas, a correção/atualização deste botão não foi efetuada agora. Esta ação fica documentada como pendência para a próxima fase:
**Próxima Fase Sugerida:** `JOB-RANKING-MATCHING-PENDING-CTA-1`
