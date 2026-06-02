# State Machine Trace

## Estados atuais

Fonte principal: `backend/src/application/services/conversation_state_machine.py`.

| Estado | Prompt hardcoded atual | Quick replies | Próximo estado padrão |
| --- | --- | --- | --- |
| `IDENTIFY` | Pede CPF ou WhatsApp | `cpf`, `whatsapp` | `CHOOSE_LOCATION` |
| `VERIFY_OTP` | Pede código de 6 dígitos | nenhum | `CHOOSE_LOCATION` no mapa, mas o service geralmente vai para `DONE` em OTP ok |
| `CHOOSE_LOCATION` | "Em qual localidade você prefere trabalhar?" | nenhum | `CHOOSE_UNIT_OR_ANY` |
| `CHOOSE_UNIT_OR_ANY` | Pergunta posto específico ou qualquer posto da localidade | `any_in_location`, `choose_unit` | `CHOOSE_FUNCTION` |
| `CHOOSE_FUNCTION` | Pergunta função desejada | nenhum | `CHOOSE_SHIFT` |
| `CHOOSE_SHIFT` | Pergunta turno | `morning`, `afternoon`, `night`, `any` | `SHOW_JOBS` |
| `SHOW_JOBS` | Diz que buscará vagas compatíveis | `continue` | `COLLECT_RESUME` |
| `COLLECT_RESUME` | Pergunta currículo agora ou sem currículo | `send_resume`, `skip_resume` | `CONFIRM_APPLICATION` |
| `COLLECT_LEAD_NAME` | Pede nome completo | nenhum | `COLLECT_LEAD_WHATSAPP` |
| `COLLECT_LEAD_WHATSAPP` | Pede WhatsApp com DDD | nenhum | `COLLECT_LGPD_CONSENT` |
| `COLLECT_LGPD_CONSENT` | Pede autorização LGPD | `aceito`, `nao_aceito` | `CONFIRM_APPLICATION` |
| `CONFIRM_APPLICATION` | Pede confirmação | `confirm`, `review` | `DONE` |
| `DONE` | Informa registro para continuidade nos canais oficiais | nenhum | `DONE` |

## Transições reais do service

O mapa `STATE_TRANSITIONS` não é a verdade completa. `ConversationService.receive_message` intercepta estados especiais.

### `IDENTIFY`

Fluxo real:

1. Se `conversation.candidate_id` já veio preenchido na criação da sessão, avança para `CHOOSE_LOCATION` sem OTP.
2. Se a entrada não é CPF/WhatsApp válido, permanece em `IDENTIFY` e registra falha.
3. Se é CPF/WhatsApp, resolve candidato silenciosamente.
4. Se candidato existe, tenta retomar sessão/application.
5. Se não existe, marca lead não resolvido e avança para `CHOOSE_LOCATION`.

Contexto público após identificação:

- `identifier_type`
- `identity_verified=False`
- `lead_mode=True`
- `cpf_last4` ou `whatsapp_last4`
- `application_in_progress` pode aparecer publicamente quando há application ativa.

Contexto interno não exposto:

- `pending_candidate_id`
- `possible_candidate_id`
- `identifier_unresolved`
- `lead_whatsapp`
- `pending_application_id`
- `pending_application_status`
- `resumed_from_session_id`

### `VERIFY_OTP`

Resultados:

- `ok`: seta `identity_verified=True`, vincula `candidate_id` se houver, cria lead Candidate/Application se necessário, limpa pendências internas e vai para `DONE`.
- `expired`, `no_otp`, `already_consumed`: registra falha, emite novo OTP e permanece em `VERIFY_OTP`.
- `locked`: limpa identificação e volta para `IDENTIFY`.
- `wrong_code`: permanece em `VERIFY_OTP`.

### Estados de coleta principal

Para `CHOOSE_LOCATION`, `CHOOSE_UNIT_OR_ANY`, `CHOOSE_FUNCTION`, `CHOOSE_SHIFT`, o service valida entrada antes de avançar. Se inválida, mantém estado e registra falha.

Atualizações de contexto:

- `CHOOSE_LOCATION` -> `location_hint`
- `CHOOSE_UNIT_OR_ANY` -> `preference`
- `CHOOSE_FUNCTION` -> `desired_function`
- `CHOOSE_SHIFT` -> `desired_shift`
- `SHOW_JOBS` -> `show_jobs_ack`
- `COLLECT_RESUME` -> `resume_choice`
- `CONFIRM_APPLICATION` -> `confirmation`

### `COLLECT_RESUME` para lead não resolvido

O mapa padrão diz `COLLECT_RESUME -> CONFIRM_APPLICATION`, mas o service desvia:

- se `conversation.candidate_id is None`;
- e `lead_mode=True`;
- e `identifier_unresolved=True`;
- então salva `resume_choice` e vai para `COLLECT_LEAD_NAME`.

### Estados de lead

- `COLLECT_LEAD_NAME`: valida nome completo. Se o lead começou por WhatsApp e já tem `lead_whatsapp`, pula `COLLECT_LEAD_WHATSAPP`.
- `COLLECT_LEAD_WHATSAPP`: valida telefone e salva `lead_whatsapp` interno.
- `COLLECT_LGPD_CONSENT`: se aceita, vai para `CONFIRM_APPLICATION`; se recusa, remove PII temporária, vai para `DONE` e marca sessão `cancelled`.

### `CONFIRM_APPLICATION`

- Se conteúdo não normaliza para `confirm`, grava `confirmation` com o texto e avança para `DONE`.
- Se já há `conversation.candidate_id` ou `identity_verified=True`, grava `confirmation=confirm` e vai para `DONE`.
- Caso contrário, grava pendência de confirmação, emite OTP e vai para `VERIFY_OTP`.

## Prompts DB vs hardcoded

Para a maioria dos estados, o service usa `AssistantContentProvider` via `_prompt_for`, caindo para hardcoded se não houver conteúdo ativo. Exceções importantes:

- `create_session` usa `first_prompt()` hardcoded.
- estados de lead (`COLLECT_LEAD_*`) usam `prompt_for()` hardcoded.
- mensagens especiais de identificação, retomada, validação e OTP são constantes hardcoded no service.
- `GET /conversations/{id}` usa `prompt_for()` hardcoded quando não recebe prompt explícito, não o `AssistantContentProvider`.

Risco: o Admin do Assistente pode alterar prompts DB, mas alguns caminhos de resposta e o GET de sessão podem continuar divergentes.

## Estados inseguros para retomada por CPF/WhatsApp

Se a sessão ativa anterior está em um desses estados, a nova sessão cai para `CHOOSE_LOCATION`:

- `IDENTIFY`
- `VERIFY_OTP`
- `COLLECT_LEAD_NAME`
- `COLLECT_LEAD_WHATSAPP`
- `COLLECT_LGPD_CONSENT`
- `DONE`

Essa regra evita retomar estados com dados sensíveis ou parcialmente coletados, mas também perde contexto útil para `DONE`.

## Gaps da máquina de estados

Funciona hoje:

- anti-enumeração em `IDENTIFY`;
- OTP tardio;
- lead novo com LGPD;
- retomada segura de sessão ativa;
- criação de application só após candidato seguro.

Deveria funcionar melhor:

- `VERIFY_OTP` no mapa não representa o fluxo real de OTP ok para `DONE`.
- `CONFIRM_APPLICATION` com qualquer texto diferente de `confirm` vai para `DONE`, embora a quick reply "Revisar" sugira revisão.
- Retomada de application ignora estado derivado da application e sempre vai para `CHOOSE_LOCATION`.
- `GET /conversations` pode mostrar prompt hardcoded diferente do POST quando Admin alterou conteúdo DB.
- Lead states existem no state machine e DB constraint, mas o schema `ConversationState` do backend não lista `COLLECT_LEAD_*`.
