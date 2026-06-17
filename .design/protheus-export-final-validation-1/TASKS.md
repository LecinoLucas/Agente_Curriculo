# PROTHEUS-EXPORT-FINAL-VALIDATION-1

## Objetivo

Validação final read-only/safe-first do fluxo operacional Protheus após os ajustes recentes de contrato backend/frontend.

## Checklist

- [x] Confirmar flags seguras em código e `.env`
- [x] Validar que `ERP_INTEGRATION_MODE` permanece em `dry_run`
- [x] Validar que `PROTHEUS_REAL_SEND_ENABLED=false`
- [x] Validar que `ERP_ALLOW_REAL_SEND=false`
- [x] Validar capability `real_send.available=false`
- [x] Validar contrato da fila global e latest
- [x] Validar `unit_name` quando disponível
- [x] Validar fallback seguro quando `unit_name` não existe
- [x] Validar endpoint `request-new`
- [x] Validar permissão, bloqueio por estado e idempotência
- [x] Validar ausência de envio real/ExecAuto real
- [x] Validar masking de payload/UI/timeline
- [x] Rodar testes backend focados
- [x] Rodar testes frontend focados
- [x] Rodar build frontend
- [x] Rodar `git diff --check`
- [x] Registrar relatório final

## Escopo efetivamente tocado

- [x] Documentação da validação final
- [x] Nenhuma mudança funcional necessária
