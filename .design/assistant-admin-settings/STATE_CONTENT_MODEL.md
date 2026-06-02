# OP-6H-3A — State Content Model — Conteúdo real por estado

Data: 2026-06-02
Status: **Planejamento.** Mapeia o conteúdo **hoje hardcoded** que vira o **seed**
das tabelas, com flags de editabilidade, placeholders e notas de segurança.

Fontes reais:
- `conversation_state_machine.py` → `prompt_for()` (prompt + quick replies).
- `conversation_service.py` → constantes `_INVALID_*`, `_IDENTIFY_*`, e
  `_FAILURE_ATTEMPT_LIMIT = 3`.

Legenda de editabilidade: 🟢 editável · 🟡 editável com guarda · 🔴 não editável.

---

## 1. IDENTIFY (ordem 1) — **sensível (anti-enumeração)**

- **prompt_text** 🟢: "Olá! Vou te ajudar a encontrar uma vaga. Para começar, me
  diga seu CPF ou WhatsApp." (também espelhado em `welcome_message`).
- **quick_replies** 🟢 (rótulo/ordem): `cpf` → "Informar CPF"; `whatsapp` →
  "Informar WhatsApp". Catálogo de `value`: `{cpf, whatsapp}` 🔴.
- **fallback_text** 🟢: `_IDENTIFY_INVALID_MESSAGE` = "Não consegui entender. Digite
  seu CPF ou WhatsApp com DDD para continuar."
- **Transição** 🔴: mensagens de sucesso/não-encontrado
  (`_IDENTIFY_SUCCESS_MESSAGE` / `_IDENTIFY_NOT_FOUND_MESSAGE`) são
  **intencionalmente idênticas** para não revelar se um CPF/WhatsApp existe.
  → **Guard:** ou ficam **não editáveis**, ou edição força ambas iguais. Recomenda-se
  começar **não editável** nesta fase.
- max_attempts 🟢 (1..10). reason de falha: `invalid_identity_input`.
- PII: o campo é texto estático do assistente; validar que o admin **não** cole
  CPF/telefone de exemplo.

## 2. VERIFY_OTP (ordem 2) — **sensível (segurança OTP)**

- **prompt_text** 🟢: "Enviamos um código de verificação. Digite o código de 6
  dígitos para continuar."
- quick_replies: nenhuma (catálogo vazio 🔴).
- **fallback_text** 🟢: copy para código errado.
- max_attempts 🟡: governa `otp_wrong_code` → `otp_attempt_limit`. Limite tem efeito
  de **segurança** (brute force). Faixa restrita recomendada (ex.: 3..6); não pode
  ser desabilitado. reasons: `otp_wrong_code`, `otp_attempt_limit`.
- 🔴 Não editável: a lógica de geração/expiração do OTP (vive no
  `ConversationOtpService`), só o texto.

## 3. CHOOSE_LOCATION (ordem 3)

- **prompt_text** 🟢: "Em qual localidade você prefere trabalhar?"
- quick_replies: nenhuma.
- **fallback_text** 🟢: `_INVALID_LOCATION_MESSAGE` = "Não encontrei essa localidade.
  Digite o nome da cidade ou localidade novamente."
- max_attempts 🟢. reason: `location_not_found` (+ `_attempt_limit` ao atingir 3).

## 4. CHOOSE_UNIT_OR_ANY (ordem 4) — **placeholder**

- **prompt_text** 🟡: "Encontrei `{location_hint}`. Você prefere um posto específico
  ou qualquer posto da localidade?" → **placeholder obrigatório `{location_hint}`**
  deve ser preservado (whitelist).
- **quick_replies** 🟢 (rótulo/ordem): `any_in_location` → "Qualquer posto em
  `{location_hint}`" (label também aceita `{location_hint}`); `choose_unit` →
  "Escolher posto". Catálogo de `value`: `{any_in_location, choose_unit}` 🔴.
- **fallback_text** 🟢: `_INVALID_UNIT_MESSAGE`.
- max_attempts 🟢. reason: `unit_not_found`.

## 5. CHOOSE_FUNCTION (ordem 5)

- **prompt_text** 🟢: "Qual função você deseja procurar?"
- quick_replies: nenhuma.
- **fallback_text** 🟢: `_INVALID_FUNCTION_MESSAGE`.
- max_attempts 🟢. reason: `function_not_understood`.

## 6. CHOOSE_SHIFT (ordem 6)

- **prompt_text** 🟢: "Qual turno você prefere?"
- **quick_replies** 🟢 (rótulo/ordem): `morning`→"Manhã", `afternoon`→"Tarde",
  `night`→"Noite", `any`→"Qualquer turno". Catálogo de `value`:
  `{morning, afternoon, night, any}` 🔴.
- **fallback_text** 🟢: `_INVALID_SHIFT_MESSAGE`.
- max_attempts 🟢. reason: `shift_not_understood`.

## 7. SHOW_JOBS (ordem 7)

- **prompt_text** 🟢: "Já tenho as informações principais. Na próxima etapa vou buscar
  vagas compatíveis para você."
- **quick_replies** 🟢: `continue`→"Continuar". Catálogo: `{continue}` 🔴.
- fallback_text 🟢 (raro: estado dirigido por botão).

## 8. COLLECT_RESUME (ordem 8)

- **prompt_text** 🟢: "Você quer enviar seu currículo agora ou continuar sem
  currículo?"
- **quick_replies** 🟢: `send_resume`→"Enviar currículo",
  `skip_resume`→"Continuar sem currículo". Catálogo:
  `{send_resume, skip_resume}` 🔴.

## 9. CONFIRM_APPLICATION (ordem 9)

- **prompt_text** 🟢: "Confirma que deseja seguir com essas informações?"
- **quick_replies** 🟢: `confirm`→"Confirmar", `review`→"Revisar". Catálogo:
  `{confirm, review}` 🔴.

## 10. DONE (ordem 10) — terminal

- **prompt_text** 🟢: "Tudo certo. Suas informações foram registradas para
  continuidade nos canais oficiais."
- quick_replies: nenhuma. 🔴 transição: `DONE → DONE` (sem avanço).

---

## Mensagens globais (settings, não por estado)

| Setting | Seed | Editável |
| --- | --- | --- |
| `welcome_message` | = prompt de IDENTIFY | 🟢 |
| `global_fallback_message` | "Não consegui entender…" (fallback genérico) | 🟢 |
| `talk_to_hr_message` | (novo) ex.: "Vou te encaminhar para o RH para te ajudar melhor." | 🟢 |
| `offer_hr_after_attempts` | `2` | 🟢 (1..10) |
| `default_max_attempts` | `3` | 🟡 (admin, 1..10) |

## Mapa estado → reason de falha (referência da Aba 4)

| Estado | reasons |
| --- | --- |
| IDENTIFY | `invalid_identity_input` |
| VERIFY_OTP | `otp_wrong_code`, `otp_attempt_limit` |
| CHOOSE_LOCATION | `location_not_found`(+`_attempt_limit`) |
| CHOOSE_UNIT_OR_ANY | `unit_not_found`(+`_attempt_limit`) |
| CHOOSE_FUNCTION | `function_not_understood`(+`_attempt_limit`) |
| CHOOSE_SHIFT | `shift_not_understood`(+`_attempt_limit`) |

`{reason}_attempt_limit` é gravado quando `attempts_count >= default_max_attempts` e o
reason não começa com `otp_` (lógica atual de `_record_failure`). Editar
`default_max_attempts` muda **quando** o sufixo `_attempt_limit` aparece — incluir no
regression review.

## Resumo de campos editáveis por estado

| Estado | prompt | helper | fallback | max_attempts | quick replies | placeholder |
| --- | --- | --- | --- | --- | --- | --- |
| IDENTIFY | 🟢 | 🟢 | 🟢 | 🟢 | 🟢(label) | — |
| VERIFY_OTP | 🟢 | 🟢 | 🟢 | 🟡 | — | — |
| CHOOSE_LOCATION | 🟢 | 🟢 | 🟢 | 🟢 | — | — |
| CHOOSE_UNIT_OR_ANY | 🟡 | 🟢 | 🟢 | 🟢 | 🟢(label) | `{location_hint}` |
| CHOOSE_FUNCTION | 🟢 | 🟢 | 🟢 | 🟢 | — | — |
| CHOOSE_SHIFT | 🟢 | 🟢 | 🟢 | 🟢 | 🟢(label) | — |
| SHOW_JOBS | 🟢 | 🟢 | 🟢 | 🟢 | 🟢(label) | — |
| COLLECT_RESUME | 🟢 | 🟢 | 🟢 | 🟢 | 🟢(label) | — |
| CONFIRM_APPLICATION | 🟢 | 🟢 | 🟢 | 🟢 | 🟢(label) | — |
| DONE | 🟢 | 🟢 | — | 🔴 | — | — |
