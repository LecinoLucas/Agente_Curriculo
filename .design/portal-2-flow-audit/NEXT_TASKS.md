# Next Tasks

## Próxima fase recomendada: OP-6F-B

Objetivo pequeno: corrigir apenas a retomada de `CandidateApplication` no Conversation Engine, sem tocar em pipeline, IA/matching, pré-admissão ou massa operacional.

## Escopo proposto

1. Criar uma função de decisão de retomada de application.
2. Reusar a busca atual de application ativa.
3. Interpretar status e pendências da application.
4. Retornar mensagem pública segura e próximo estado.
5. Adicionar testes de integração para os cenários de status.
6. Manter anti-enumeração e mascaramento atuais.

## Contrato interno sugerido

Função pura, testável:

```python
def derive_application_resume(application: CandidateApplicationModel) -> ApplicationResumeDecision:
    ...
```

Saída sugerida:

- `state`: próximo estado seguro.
- `message`: mensagem pública.
- `context_updates`: apenas chaves seguras/necessárias.
- `link_application_id`: boolean.
- `requires_otp_before_status`: boolean, se a decisão for revelar status sensível.

## Regras mínimas

| Application | Próximo comportamento |
| --- | --- |
| `linked_to_pipeline` | Não pedir cidade. Informar análise pelo RH de forma segura. |
| `submitted` | Não pedir cidade. Informar enviada para análise. |
| `started/qualified` sem localidade | Pedir cidade/localidade. |
| `started/qualified` com localidade e sem preferência de unidade | Ir para `CHOOSE_UNIT_OR_ANY` ou pedir unidade/qualquer posto. |
| `started/qualified` com localidade/unidade e sem função | Ir para `CHOOSE_FUNCTION`. |
| `started/qualified` com função e sem turno | Ir para `CHOOSE_SHIFT`. |
| `started/qualified` com dados principais completos | Ir para `COLLECT_RESUME` ou `CONFIRM_APPLICATION`, conforme regra de produto. |
| application com `job_id` | Não chamar de candidatura genérica; preservar vaga internamente e não criar nova application. |

## Testes mínimos

Backend:

- CPF existente + application `started` sem localidade -> pede cidade.
- CPF existente + application `started` com localidade -> não pede cidade.
- CPF existente + application `submitted` -> status seguro, sem coleta.
- CPF existente + application `linked_to_pipeline` -> status seguro, sem coleta.
- WhatsApp existente segue as mesmas regras.
- Sessão ativa continua tendo prioridade sobre application.
- `pending_application_id` não aparece no público.
- `conversation.application_id` só é vinculado quando a regra de segurança permitir.
- Não cria segunda application ao retomar application existente e concluir OTP.

Frontend:

- Renderiza mensagem de status sem fluxo quebrado.
- "Começar nova conversa" continua limpando localStorage.
- Reload por `session_id` continua preservando histórico.

## Decisões de produto/segurança antes de implementar

1. Pode revelar `submitted`/`linked_to_pipeline` antes de OTP, ou deve exigir OTP antes de status?
2. Se application existente tem `job_id`, o bot pode mencionar "vaga" sem nome da vaga?
3. Para `linked_to_pipeline`, deve encerrar em `DONE` ou oferecer contato com RH?
4. Para `qualified`, qual é a próxima ação operacional esperada?
5. Se Candidate existente não tem LGPD/WhatsApp/nome, qual pendência tem prioridade?

## Fora do escopo da próxima fase

- Criar pipeline automaticamente.
- Selecionar vaga pelo bot.
- Alterar matching/IA.
- Criar dados dos 51 postos.
- Alterar pré-admissão.
- Refatorar frontend inteiro.
- Alterar Admin do Assistente além do necessário para evitar divergência de prompt, se escolhido.

## Ordem segura de implementação

1. Escrever testes que congelam o comportamento desejado de retomada de application.
2. Introduzir helper de decisão sem alterar outros fluxos.
3. Integrar helper apenas no branch `_resume_prompt_if_available` quando application existe.
4. Garantir que contexto público continua sem ids/PII.
5. Garantir que `_sync_application` atualiza application retomada, não cria duplicata.
6. Rodar testes de conversa/OTP/lead/application/pipeline link.

## Comandos de verificação sugeridos para a fase de implementação

```bash
.venv/bin/python -m pytest backend/tests/integration/test_conversation_identity.py
.venv/bin/python -m pytest backend/tests/integration/test_conversation_application_integration.py
.venv/bin/python -m pytest backend/tests/integration/test_conversation_lead_registration.py
.venv/bin/python -m pytest backend/tests/integration/test_conversation_otp.py
.venv/bin/python -m pytest backend/tests/integration/test_link_application_pipeline.py
```
