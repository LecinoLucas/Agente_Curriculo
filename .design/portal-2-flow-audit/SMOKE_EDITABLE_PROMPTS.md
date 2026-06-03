# OP-6H-3G - Smoke de prompts editaveis

Data: 2026-06-02

## Objetivo

Validar em fluxo real que a edicao de `CHOOSE_LOCATION` no Admin do Assistente e consumida pelo Portal 2 apos identificacao por CPF/WhatsApp, incluindo comportamento em reload.

## Ambiente

- Backend real: `http://127.0.0.1:8000`
- Frontend staff/admin real: `http://127.0.0.1:5173`
- Candidate Portal real: `http://127.0.0.1:5174`
- Usuario admin dev autenticado pela UI.

## Alteracao temporaria testada

- Texto original antes do smoke: `Em qual localidade você prefere trabalhar, qual posto ?`
- Texto temporario aplicado no Admin: `TESTE SMOKE: informe a cidade desejada.`
- Texto restaurado ao final: `Em qual localidade você prefere trabalhar, qual posto ?`

## Resultado do cenario 1 - fluxo novo

Passou.

Fluxo executado:

1. Admin > Assistente do Candidato > Fluxo de perguntas.
2. Estado `CHOOSE_LOCATION` selecionado.
3. Texto da pergunta alterado para `TESTE SMOKE: informe a cidade desejada.`
4. Portal 2 aberto em nova sessao.
5. Nova conversa iniciada.
6. Identificacao feita por WhatsApp de teste.
7. Portal 2 respondeu: `Certo. TESTE SMOKE: informe a cidade desejada.`

Observacoes LGPD:

- O Portal 2 mostrou apenas final mascarado do WhatsApp.
- O identificador completo nao apareceu na tela.
- Nenhum CPF, nome, email ou telefone completo foi exposto no smoke.

## Resultado do cenario 2 - reload

Passou.

Com a sessao em `CHOOSE_LOCATION`, o reload de `/portal-2` exibiu:

- Estado visual: `Escolhendo a cidade`.
- Mensagem de retomada da UI: `Continuamos de onde você parou.`
- Historico com o prompt editado: `Certo. TESTE SMOKE: informe a cidade desejada.`

O Portal 2 persiste o `session_id` em `localStorage` e usa `GET /conversations/{id}` mais `GET /conversations/{id}/messages` para repintar a sessao no reload. A evidencia visual valida que esse caminho preserva a sessao correta e nao volta para texto hardcoded antigo.

## Resultado do cenario 3 - retomada de candidatura

Nao testado em fluxo real.

Consulta leitura ao banco local mostrou apenas uma `CandidateApplication` com status `submitted` e nenhuma candidatura `started`, `qualified` ou `linked_to_pipeline` disponivel para retomada operacional sem criar/alterar dados. Para cumprir o escopo, nenhuma candidatura foi criada e nenhum identificador real foi usado.

## Correcao minima encontrada

Durante o smoke, a aba Admin ainda exibia a mensagem antiga: "A engine ainda nao usa estes textos em producao." O fluxo real comprovou o contrario, entao a copia foi corrigida para:

`A engine usa estes textos nos estados editáveis com fallback seguro. A topologia do fluxo (estados e transições) não pode ser alterada.`

Tambem foi tratado um erro de regressao focada: duas chamadas assíncronas do `FlowPanel` podiam gerar rejeicao nao tratada quando a carga do fluxo falhava. A UI ja mostrava erro amigavel; a correcao apenas evita rejeicao global.

Nao houve alteracao de estado, transicao, backend, pipeline, CandidateApplication, WhatsApp, matching/IA ou pre-admissao.

## Screenshots

- `screenshots/smoke-editable-prompts-admin-edited-desktop.png`
- `screenshots/smoke-editable-prompts-portal-new-flow-desktop.png`
- `screenshots/smoke-editable-prompts-portal-reload-desktop.png`
- `screenshots/smoke-editable-prompts-portal-reload-tablet.png`
- `screenshots/smoke-editable-prompts-portal-reload-mobile.png`
- `screenshots/smoke-editable-prompts-admin-restored-desktop.png`

## Design review

- Admin: fluxo editavel localizado e operavel via teclado/mouse; a copia de contrato foi corrigida para refletir o comportamento real.
- Portal 2 desktop: mensagem editada aparece no historico sem quebra visual e com identificador mascarado.
- Portal 2 tablet/mobile: reload mantem estado e historico sem sobreposicao critica no painel do assistente.

## Validacao executada

- `npm --prefix frontend run build` - passou antes e depois da correcao minima.
- `npm --prefix candidate-portal run build` - passou.
- `npm --prefix frontend test -- AssistantAdminPage` - passou, 40 testes.
- Smoke visual real com Playwright headless em `localhost`, com screenshots.

## Fora do escopo

- Nao foi criada funcionalidade nova.
- Nao foi criada migration.
- Nao foram criados dados falsos dos 51 postos.
- Nao foi alterada state machine.
- Nao foram editados `IDENTIFY` ou `VERIFY_OTP`.
- Nao foram alterados backend, candidate-portal, pipeline, WhatsApp, matching/IA ou pre-admissao.

## Limitacoes

- O cenario de retomada com `CandidateApplication` em andamento depende de dado real retomavel. Como nao havia aplicacao `started`, `qualified` ou `linked_to_pipeline` no banco local, o teste foi limitado ao fluxo novo e ao reload.
