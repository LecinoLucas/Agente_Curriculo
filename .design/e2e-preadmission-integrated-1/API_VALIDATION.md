# API Validation

| Origem | Destino | HTTP | required_action | pre_admission_case_id | Stage final | Resultado |
|---|---|---:|---|---|---|---|
| `final` | `offer` | 200 | `null` | `null` | `offer` | OK |
| `offer` | `hired` | 200 | `null` | `null` | `hired` | OK |
| `hired` | `pre_admission` com checklist padrão | 200 | `open_pre_admission` | UUID válido | `pre_admission` | OK |
| `workspace` por `caseId` válido | `GET /admission/cases/:caseId/workspace` | 200 | n/a | UUID válido | caso carregado | OK |
| `hired` | `pre_admission` sem checklist padrão | 409 | `configure_default_checklist_template` | `null` | `hired` | OK |

## Payloads sanitizados relevantes

### `hired -> pre_admission` com checklist padrão

```json
{
  "stage": "pre_admission",
  "required_action": "open_pre_admission",
  "pre_admission_case_id": "uuid-valido"
}
```

### `hired -> pre_admission` sem checklist padrão

```json
{
  "ok": false,
  "code": "DEFAULT_CHECKLIST_TEMPLATE_REQUIRED",
  "message": "Não há checklist admissional padrão ativo. Configure um checklist padrão antes de iniciar a pré-admissão.",
  "required_action": "configure_default_checklist_template",
  "pre_admission_case_id": null
}
```

## Observações

- o workspace foi aberto com credencial `admin`, refletindo a política atual de autorização
- o recrutador validou as transições de pipeline; a leitura do workspace não foi assumida como permissão automática
- o contrato crítico foi preservado: `open_pre_admission` nunca apareceu sem `pre_admission_case_id`
