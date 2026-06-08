# PRE-ADMISSION-CASE-AUTO-FIX-1 - Decisão de contrato

## Problema atual

Ao mover um candidato de `hired` para `pre_admission`, o backend tentava criar automaticamente o caso admissional. Quando não existia checklist admissional padrão ativo, a criação falhava com `ValidationException`, mas o serviço capturava a falha e retornava `pre_admission_case_id = null`.

Mesmo assim, a resposta continuava trazendo `required_action = "open_pre_admission"`, criando um contrato ambíguo: a UI recebia uma ação de abrir pré-admissão sem um caso real para abrir.

## Opções avaliadas

### Bloquear a transição sem checklist padrão

- Mantém o candidato em `hired`.
- Não cria caso parcial.
- Retorna ação clara para configurar checklist padrão.
- Evita estado de `pre_admission` sem caso admissional.

### Permitir a transição e exigir configuração depois

- Move o candidato para `pre_admission`.
- Retorna `required_action = "configure_default_checklist_template"`.
- Mantém `pre_admission_case_id = null`.
- Ainda deixa o RH com um candidato em pré-admissão sem caso aberto.

## Decisão escolhida

Foi escolhida a opção recomendada: bloquear a transição antes de mover o candidato quando não houver checklist admissional padrão ativo.

Motivo: o stage `pre_admission` representa início operacional da pré-admissão. Sem caso admissional, o estado fica incompleto e a UI não tem recurso válido para abrir.

## Contrato final

Quando existir checklist padrão ativo e a decisão de contratação estiver válida:

```json
{
  "stage": "pre_admission",
  "required_action": "open_pre_admission",
  "pre_admission_case_id": "uuid-valido"
}
```

Quando não existir checklist padrão ativo:

```json
{
  "ok": false,
  "code": "DEFAULT_CHECKLIST_TEMPLATE_REQUIRED",
  "message": "Não há checklist admissional padrão ativo. Configure um checklist padrão antes de iniciar a pré-admissão.",
  "required_action": "configure_default_checklist_template",
  "pre_admission_case_id": null
}
```

## Garantias

- `required_action = "open_pre_admission"` só é retornado com `pre_admission_case_id` válido.
- Sem checklist padrão ativo, o candidato permanece em `hired`.
- Sem checklist padrão ativo, nenhum caso admissional é criado.
- O fluxo `final -> offer -> hired` não foi alterado.
- Nenhuma integração real com Protheus é acionada por esta correção.
