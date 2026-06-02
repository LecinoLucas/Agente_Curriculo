# OP-6H-2C — Review Visual da Aba Falhas do Assistente

Data: 2026-06-02

## Escopo

Tela revisada: `/admin/assistente-candidato`, aba `Falhas`.

O backend local estava disponível (`/health` OK), mas os endpoints administrativos protegidos não tinham sessão válida para o smoke. Para não alterar banco, seed, backend ou dados operacionais, as capturas foram feitas no frontend Vite real com interceptação controlada apenas dos endpoints necessários da tela (`/users/me`, `/admin/assistant/sessions`, `/admin/assistant/failures` e detalhe da falha).

## Screenshots

Arquivos finais em `.design/assistant-admin-review/screenshots/`:

- `op6h2c-final-falhas-list-desktop-1280.png`
- `op6h2c-final-falhas-list-tablet-768.png`
- `op6h2c-final-falhas-list-mobile-375.png`
- `op6h2c-final-falhas-detail-desktop-1280.png`
- `op6h2c-final-falhas-detail-mobile-375.png`
- `op6h2c-final-falhas-empty-mobile-375.png`
- `op6h2c-final-falhas-error-mobile-375.png`
- `op6h2c-final-falhas-loading-mobile-375.png`
- `op6h2c-final-metrics.json`

## Problemas encontrados

- A tabela desktop da aba `Falhas` gerava overflow horizontal no viewport 1280px com a sidebar: `scrollWidth` inicial chegou a `1310`.
- O cabeçalho da tabela ficava comprimido depois de reduzir a largura, juntando visualmente colunas como classificação/tentativas.
- Os filtros tinham altura visual abaixo do alvo de toque recomendado em algumas combinações mobile/tablet.

## Correções feitas

- Aumentei os filtros `select`/`input` para `min-h-11`, mantendo os estilos existentes.
- Aumentei o alvo de toque do botão `Limpar` nos filtros.
- Ajustei a tabela desktop de falhas para `table-fixed` com `w-full` e `colgroup`, evitando que ela amplie a largura do documento.
- Compactei apenas os rótulos do cabeçalho desktop (`Class.`, `Tent.`, `Candid.`, `Data`) para preservar legibilidade em 1280px.

## Resultado visual

- Lista, detalhe, empty, loading e error state da aba `Falhas` ficaram legíveis nos breakpoints testados.
- As métricas finais indicaram `overflowX: false` em desktop, tablet, mobile, detalhe, empty, loading e error.
- O detalhe da falha mantém mensagem sanitizada, status/classificação editáveis e descrição acessível do modal.
- A UI continua sem exibir `raw_message`, CPF completo, telefone completo ou `context_json`.

## Validação

- `npm --prefix frontend test -- --run src/pages/__tests__/AssistantAdminPage.test.tsx src/services/__tests__/assistantAdminService.test.ts`: 25 testes passaram.
- `npm --prefix frontend run build`: passou.
- Smoke visual com Playwright no frontend real em `http://127.0.0.1:5173/admin/assistente-candidato?tab=falhas`.

Observação: permanecem warnings conhecidos de `act(...)` nos testes de `AssistantAdminPage`; eles não foram introduzidos nesta fase.

## Confirmação de escopo

- Não alterei backend.
- Não criei endpoint.
- Não alterei candidate-portal.
- Não alterei Conversation Engine.
- Não alterei CandidateApplication.
- Não alterei pipeline.
- Não alterei WhatsApp.
- Não alterei matching/IA.
- Não alterei pré-admissão.
- Não implementei settings, intents ou handoff.
- Não criei dados falsos dos 51 postos.
