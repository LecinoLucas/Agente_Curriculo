# PROTHEUS-EXPORT-OPERATIONAL-SMOKE-1

**Data:** 2026-06-16  
**Resultado final:** PASS_WITH_NOTES

## Resumo executivo

O fluxo operacional Protheus/ERP foi validado em modo seguro, sem envio real, cobrindo payload, preflight/dry-run, mock controlado, status, fila/histórico, bloqueios por flag, idempotência e tradução operacional no painel RH.

Durante o smoke, o envio real permaneceu bloqueado por configuração e por guardrails de fase. A validação também encontrou um risco real no painel técnico: o JSON expandido do payload ainda expunha CPF/email/salário em texto aberto. O painel foi ajustado para mascarar esses campos antes da renderização.

## Flags confirmadas

- `backend/.env`: `ERP_INTEGRATION_MODE=dry_run`
- `backend/.env`: `PROTHEUS_REAL_SEND_ENABLED=false`
- `backend/.env`: `ERP_ALLOW_REAL_SEND=false`
- `docs/deploy/LOCAL_DEV_FULL.md` confirma o mesmo baseline seguro para dev local.

## Fluxo exercitado

1. Caso admissional preparado com checklist obrigatório aprovado e pacote admissional `approved_for_export`.
2. Payload Protheus montado a partir do snapshot congelado do pacote.
3. Capabilities consultadas para confirmar `dry_run.available=true` e `real_send.available=false`.
4. Dry-run criado e simulado sem tráfego externo real.
5. Mock send exercitado em modo controlado para validar status, retry e idempotência.
6. Workspace admissional e fila/dashboard consultados para validar status humanizado, bridge summary, bloqueios e histórico seguro.
7. Painéis frontend validados para STUB/bloqueio, tradução de erro e ausência de ações perigosas.

## Endpoints e serviços usados

### Workspace / bridge / fila

- `GET /api/v1/pre-admission/cases/{case_id}/protheus-bridge-summary`
- `GET /api/v1/pre-admission/protheus-export-dashboard`
- `GET /api/v1/pre-admission/protheus-export-dashboard/items`
- `POST /api/v1/pre-admission/cases/{case_id}/protheus-export-requests/preflight`
- `POST /api/v1/pre-admission/cases/{case_id}/protheus-export-requests`
- `GET /api/v1/pre-admission/cases/{case_id}/protheus-export-requests/latest`
- `POST /api/v1/pre-admission/cases/{case_id}/protheus-export-requests/{export_id}/cancel`

### ERP / Protheus

- `GET /api/v1/admission-packages/erp/protheus/capabilities`
- `POST /api/v1/admission-packages/{package_id}/erp/protheus/dry-run`
- `POST /api/v1/erp-integration-attempts/{attempt_id}/simulate`
- `POST /api/v1/admission-packages/{package_id}/erp/protheus/mock-send`
- `POST /api/v1/admission-packages/{package_id}/export-erp`
- `POST /api/v1/admission-packages/{package_id}/export-erp/retry`
- `GET /api/v1/admission-packages/{package_id}/erp/attempts`
- `GET /api/v1/erp-integration-attempts/{attempt_id}`
- `POST /api/v1/erp-integration-attempts/{attempt_id}/retry`

### Serviços backend principais

- `backend/src/application/services/erp_integration_service.py`
- `backend/src/application/services/protheus_payload_builder.py`
- `backend/src/application/services/protheus_payload_validator.py`
- `backend/src/application/services/protheus_export_queue_service.py`
- `backend/src/application/services/admission_case_workspace_service.py`

## Resultado do payload

- Payload Protheus é construído a partir de snapshot congelado do pacote, não de dados mutáveis em tempo real.
- Validação exige ao menos:
  - `candidate.name`
  - `candidate.email`
  - `candidate.cpf`
  - `job.title`
  - `admission.start_date`
  - `admission.salary_offer`
  - `decision.hiring_decision_id`
  - ao menos um documento aprovado
- Testes confirmaram:
  - snapshot não é reescrito por alteração posterior do candidato;
  - CPF ausente gera `validation_failed`;
  - pacote inválido não avança para exportação.

## Resultado do preflight / dry-run

- `capabilities` em dev retornou:
  - `integration_mode = dry_run`
  - `dry_run.available = true`
  - `simulation.available = true`
  - `real_send.available = false`
  - `blocking_flags = [PROTHEUS_REAL_SEND_ENABLED, ERP_ALLOW_REAL_SEND]`
- Dry-run:
  - cria tentativa `mode=dry_run`;
  - não envia nada para ERP;
  - simulação gera `external_reference` com prefixo `DRY-RUN-`;
  - tentativa inválida fica em `validation_failed`;
  - retry de dry-run continua bloqueado por contrato.

## Status / fila / histórico

- Status backend validados:
  - `ready`
  - `validation_failed`
  - `failed`
  - `simulated`
  - `sent`
- Status do painel/fila validados:
  - `queued`
  - `retry_scheduled`
  - `failed_permanent`
  - `blocked`
  - `success`
- Histórico/auditoria confirmado com eventos ERP genéricos:
  - `erp_export_requested`
  - `erp_export_started`
  - `erp_export_failed`
  - `erp_export_retry_requested`
  - `erp_export_succeeded`
  - `erp_dry_run_attempt_created`
  - `erp_dry_run_simulated`

## Evidência de bloqueio de envio real

- `create_protheus_homolog_attempt()` exige simultaneamente:
  - `APP_ENV != production`
  - `PROTHEUS_REAL_SEND_ENABLED=true`
  - `ERP_ALLOW_REAL_SEND=true`
  - `PROTHEUS_BASE_URL` configurado
- `ErpIntegrationService._ensure_allowed_for_phase()` bloqueia `mode=real` nesta fase.
- Testes confirmaram:
  - `real_send.available=false` por padrão;
  - `mock-send` em `mode=real` retorna bloqueio;
  - dry-run não chama API externa real;
  - bridge summary mostra banner de envio real bloqueado;
  - painel RH não expõe botão de envio real quando capability está bloqueada.

## Segurança validada

- Nenhum `ExecAuto`, `MsExecAuto` ou chamada Protheus real foi executado neste smoke.
- Fila/dashboard sanitizam `blocked_reason` e `last_error_message_redacted`.
- Headers persistidos no mock não expõem `authorization`, `token` ou `password`.
- Falhas técnicas são traduzidas para códigos/mensagens operacionais seguras.
- Idempotência validada:
  - mock-send duplicado retorna a mesma tentativa;
  - export ERP bem-sucedido não duplica tentativa;
  - retry explícito só ocorre após falha retryable.
- Painel técnico ajustado para mascarar CPF/email/telefone e salário também no JSON expandido do payload.

## Testes executados

### Backend

- `cd backend && .venv/bin/python -m pytest tests/integration/test_erp_dry_run.py tests/integration/test_protheus_mock_integration.py tests/integration/test_admission_case_workspace.py tests/integration/test_protheus_export_dashboard.py -vv`
- Resultado: `54 passed`

### Frontend

- `npm --prefix frontend test -- --run src/features/admission-workspace/__tests__/AdmissionProtheusExportQueuePanel.test.tsx src/features/admission-workspace/__tests__/AdmissionProtheusBridgeSummaryPanel.test.tsx src/features/candidates/drawer/components/__tests__/ErpDryRunPanel.test.tsx src/features/candidates/drawer/components/__tests__/AdmissionProtheusIntegrationPanel.test.tsx`
- Resultado: `4 passed (40 tests)`

## Ajustes aplicados durante o smoke

- `backend/tests/integration/test_protheus_mock_integration.py`
  - alinhado ao contrato atual de erro (`response_payload_json.error.code`) e eventos ERP genéricos.
- `frontend/src/features/candidates/drawer/components/ErpPayloadPreview.tsx`
  - payload técnico expandido passou a mascarar CPF/email/telefone e salário.
- `frontend/src/features/candidates/drawer/components/__tests__/ErpDryRunPanel.test.tsx`
  - atualizado para validar a máscara também no JSON expandido.

## Riscos restantes

- A API backend de tentativas ainda retorna `request_payload_json` técnico para usuários staff autorizados; o painel agora mascara a renderização, mas o contrato HTTP continua sendo técnico por desenho.
- O smoke validou a integração segura deste repositório e a camada bridge read-only/queue por contrato e testes; não houve exercício manual contra um serviço Protheus real, por restrição deliberada de segurança.
- O endpoint `homolog-send` continua existente no backend, mas bloqueado por flags e guardrails de fase. Qualquer mudança futura nesses guardrails exige revalidação.

## Conclusão

**PASS_WITH_NOTES**

O fluxo seguro foi validado de ponta a ponta no escopo permitido, com envio real mantido bloqueado, payload/preflight/status operacionais, fila/histórico coerentes e painéis RH cobrindo STUB/bloqueios/traduções. As notas restantes são de contrato técnico interno e de não execução deliberada contra Protheus real.
