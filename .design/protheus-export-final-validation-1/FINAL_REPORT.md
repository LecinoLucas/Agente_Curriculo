# PROTHEUS-EXPORT-FINAL-VALIDATION-1

## 1. Resumo executivo

O fluxo operacional Protheus foi validado em modo seguro, sem envio real e sem abertura de novo caminho funcional. Os contratos recentes de fila/dashboard e `request-new` estão coerentes entre backend e frontend, e os testes focados passaram.

Resultado final: `PASS_WITH_NOTES`.

## 2. Fases validadas

- `PROTHEUS-EXPORT-OPERATIONAL-SMOKE-1`
- `ERP-PAYLOAD-PRIVACY-GUARD-1`
- `PROTHEUS-EXPORT-QUEUE-DASHBOARD-2`
- `PROTHEUS-EXPORT-CONTRACT-GAPS-1`

## 3. Segurança / flags

### Evidência de configuração segura

- `backend/.env`: `ERP_INTEGRATION_MODE=dry_run`
- `backend/.env`: `PROTHEUS_REAL_SEND_ENABLED=false`
- `backend/.env`: `ERP_ALLOW_REAL_SEND=false`
- `backend/src/core/settings.py`: defaults mantidos em `ERP_INTEGRATION_MODE="dry_run"`, `PROTHEUS_REAL_SEND_ENABLED=False`, `ERP_ALLOW_REAL_SEND=False`

### Evidência de bloqueio de envio real

- `backend/src/application/services/erp_integration_service.py` mantém `real_send.available=false` quando flags/configuração real não estão completas.
- `tests/integration/test_erp_dry_run.py::test_protheus_capabilities_default_blocks_real_send` passou e valida explicitamente:
  - `integration_mode == "dry_run"`
  - `dry_run.available is True`
  - `real_send.available is False`
  - flags bloqueadoras incluem `PROTHEUS_REAL_SEND_ENABLED` e `ERP_ALLOW_REAL_SEND`

### Conclusão de segurança

- nenhum envio real Protheus foi acionado;
- nenhum `ExecAuto` real foi executado;
- os fluxos validados permaneceram em STUB / dry-run / mock controlado.

## 4. Contrato backend

### Fila global / latest

- a fila global retorna status humanizado e sanitizado;
- `unit_name` aparece quando existe vínculo confiável caso -> vaga -> unidade operacional;
- o latest também retorna `unit_name` quando disponível;
- quando o vínculo não existe, o frontend permanece com fallback sem quebrar o contrato.

### Endpoint `request-new`

- `POST /api/v1/pre-admission/cases/{case_id}/protheus-export-requests/request-new`
- validado como:
  - permitido quando `can_request_new=true`;
  - bloqueado quando `can_request_new=false`;
  - protegido por permissão de escrita;
  - idempotente em duplicidade segura;
  - sem envio real.

### Evidência por testes

- `tests/integration/test_protheus_export_queue.py::test_09a_request_new_permitido_quando_can_request_new_true`
- `tests/integration/test_protheus_export_queue.py::test_09b_request_new_bloqueado_quando_can_request_new_false`
- `tests/integration/test_protheus_export_queue.py::test_09c_request_new_idempotente_retorna_existente_ativo`
- `tests/integration/test_protheus_export_queue.py::test_09d_request_new_exige_permissao_de_escrita`
- `tests/integration/test_protheus_export_dashboard.py::test_items_enriquece_unit_name_quando_disponivel_no_caso`

## 5. Comportamento frontend

### Dashboard global

- métricas operacionais renderizadas;
- filtros locais funcionando;
- status humanizado visível;
- selo STUB / dry-run visível;
- `unit_name` aproveitado quando disponível.

### Painel do caso

- status e ação recomendada exibidos;
- banner explícito de bloqueio de envio real visível;
- ação existente de nova exportação segura continua sem criar botão novo de envio real.

### Bridge summary / dry-run panel

- banner seguro e mensagens humanizadas preservadas;
- capability de envio real continua bloqueando ação homolog/real;
- nenhum botão de envio real foi introduzido nesta fase.

## 6. Privacidade

### UI / payload

- JSON expandido permanece mascarado;
- CPF, email, telefone e salário continuam mascarados na UI;
- timeline de eventos renderiza payload redigido com `redactSensitivePayload`;
- nenhum payload técnico sensível foi exposto em texto aberto nas telas auditadas.

### Evidência por testes

- `src/features/candidates/drawer/components/__tests__/ErpPayloadPreview.test.tsx`
- `src/shared/utils/__tests__/sensitiveDataMasking.test.ts`
- `src/features/candidates/drawer/components/__tests__/PreAdmissionEventTimeline.test.tsx`
- `src/features/candidates/drawer/components/__tests__/ErpDryRunPanel.test.tsx`

## 7. Testes executados

### Backend

- `cd backend && .venv/bin/python -m pytest tests/integration/test_protheus_export_queue.py tests/integration/test_protheus_export_dashboard.py -vv`
  - resultado: `27 passed`
- `cd backend && .venv/bin/python -m pytest tests/integration/test_erp_dry_run.py tests/integration/test_protheus_mock_integration.py -vv`
  - resultado: `30 passed`

### Frontend

- `npm --prefix frontend test -- --run src/features/admission-workspace/__tests__/AdmissionProtheusExportQueuePanel.test.tsx src/features/admission-workspace/__tests__/ProtheusExportQueueDashboardPage.test.tsx`
  - resultado: `33 passed`
- `npm --prefix frontend test -- --run src/features/admission-workspace/__tests__/AdmissionProtheusBridgeSummaryPanel.test.tsx`
  - resultado: `5 passed`
- `npm --prefix frontend test -- --run src/features/candidates/drawer/components/__tests__/ErpDryRunPanel.test.tsx`
  - resultado validado junto com `ErpPayloadPreview`: `12 passed`
- testes adicionais de privacidade:
  - `npm --prefix frontend test -- --run src/features/candidates/drawer/components/__tests__/ErpPayloadPreview.test.tsx`
  - `npm --prefix frontend test -- --run src/shared/utils/__tests__/sensitiveDataMasking.test.ts`
  - `npm --prefix frontend test -- --run src/features/candidates/drawer/components/__tests__/PreAdmissionEventTimeline.test.tsx`
  - resultados: `1 passed`, `7 passed`, `1 passed`
- `npm --prefix frontend run build`
  - resultado: build OK

### Integridade do diff

- `git diff --check`
  - resultado: sem problemas de whitespace/merge markers

## 8. Resultado final

`PASS_WITH_NOTES`

## 9. Riscos residuais

- o worktree local ainda contém mudanças não commitadas das fases Protheus anteriores; a validação foi feita sobre esse estado atual.
- `unit_name` só aparece quando existe vínculo confiável ativo; não há fallback heurístico adicional.
- permaneceram warnings não bloqueantes já existentes:
  - warnings de future flags do React Router nos testes;
  - warnings/deprecations do backend (`PydanticDeprecatedSince20`, `datetime.utcnow()`).

## 10. Próximos passos recomendados

- consolidar e commitar o pacote atual das mudanças Protheus antes de nova frente funcional;
- tratar warnings deprecatórios do backend em tarefa separada, sem misturar com fluxo Protheus;
- se o RH precisar de operação manual adicional no futuro, manter a mesma disciplina: endpoint seguro, idempotência explícita e ausência total de caminho de envio real por UI.
