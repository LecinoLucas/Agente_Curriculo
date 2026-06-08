# Job AI Draft - Frontend UX Audit

Análise da tela `JobAiDraftPanel.tsx` focada em usabilidade, feedbacks de estado, duplo-clique e latência.

| Item | Comportamento atual | Risco UX | Evidência (Teste/Código) | Correção sugerida |
|---|---|---|---|---|
| **Chamadas Duplicadas (Double Click)** | Protegido. O botão desabilita quando `isLoading === true`. | Baixo | `<Button disabled={isLoading}>` | Nenhuma. A proteção é nativa e o teste renderiza estado inerte corretamente. |
| **Loading state** | Feedback visual com o spinner nativo (`Loader2`) e texto alterado para "Gerando rascunho...". Um `div role="status"` também é acionado. | Médio | Se a geração exceder 10-15 segundos, o usuário pode assumir que a página travou, pois não há uma "barra de progresso" ou steps comunicados. | Adicionar mensagens intermitentes ("Lendo sua vaga...", "Extraindo competências...", "Pronto!") simulando streaming ou progresso real por Websocket caso viável. |
| **Mensagem de Erro** | Exibida em banner com ícone de erro (`errorMessage` renderizado). | Baixo | Uso de bloco vermelho `role="alert"` em caso de rejeição da Promise do provedor. | Nenhuma urgente. Garantir que as strings de erro de backend (Timeout) sejam localizadas amigavelmente. |
| **Warnings Visíveis e Safety Checks** | Itens removidos são compilados em Arrays de warnings (`NEEDS_REVIEW_LABELS`, `WARNING_LABELS`) e exibidos via componente `Alert`. | Baixo | Renderização iterativa de `needsReview` e `warnings` usando mapeamentos de string legíveis. | O layout atual atende o propósito, assegurando transparência (RH entende porque a AI apagou o salário). |
| **Edição Paralela (Concorrência)** | O usuário não consegue alterar o texto base de "prompt" enquanto gera, não correndo risco de dessincronizar input/output. A API é acionada isoladamente no `onClick`. | Baixo | `onChange` reage estritamente no estado local, a chamada ao service é isolada em `handleGenerate`. | N/A |
| **Botão de Aplicação e Side-Effects** | Clicar em "Aplicar" ou "Confirmar" chama a função callback do Pai e não invoca novamente o endpoint backend. Nenhuma re-renderização perigosa mapeada. | Baixo | `confirmApply` executa transformadores puramente síncronos locais. | N/A |

**Parecer Geral:**
A tela é altamente reativa e blindada contra duplicação acidental. O principal ofensor de usabilidade é a percepção de demora decorrente do bloqueio síncrono.
