# OP-6D Portal 2 + Conversation Engine Smoke

Data: 2026-06-02

Resultado: aprovado.

Fluxo validado:
- `/portal-2` criou conversa via `POST /api/v1/conversations`.
- Estado inicial retornou `IDENTIFY` com quick replies `Informar CPF` e `Informar WhatsApp`.
- Envio de `Informar CPF` avancou para `CHOOSE_LOCATION`.
- Envio de `Peritoro` avancou para `CHOOSE_UNIT_OR_ANY`.
- Quick replies `Qualquer posto em Peritoro` e `Escolher posto` renderizaram.
- Reload retomou pelo `session_id` salvo em `localStorage`.
- `GET /api/v1/conversations/{session_id}` retornou `CHOOSE_UNIT_OR_ANY` e quick replies.
- Historico retornou 5 mensagens ordenadas.

Screenshots:
- `screenshots/portal-2-conversation-desktop-1440.png`
- `screenshots/portal-2-conversation-mobile-390.png`

Revisao visual:
- Desktop e mobile sem sobreposicao de texto ou controles.
- Quick replies ficam visiveis depois da retomada.
- Historico retomado exibe rotulos amigaveis de quick replies, nao valores internos.

Limitacoes:
- Smoke nao busca vagas reais.
- Smoke nao cria candidatura nem pipeline.
- Smoke nao valida WhatsApp real, IA, matching ou pre-admissao.
