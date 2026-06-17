# PROTHEUS-EXPORT-CONTRACT-GAPS-1

## Resumo

Os dois gaps de contrato foram fechados com ajuste mínimo:

- a listagem global da fila agora devolve `unit_name` quando o caso possui vínculo ativo com unidade operacional;
- a UI passou a ter um endpoint backend explícito e seguro para solicitar nova exportação em modo STUB/dry-run.

Nenhum caminho de envio real foi aberto. O fluxo novo continua passando pelos mesmos guardrails de bridge interna, preflight, permissão e validação de status.

## Gap 1: `unit_name` no snapshot/listagem global

### Causa

O endpoint global de dashboard consumia o snapshot seguro da bridge, mas a resposta sanitizada não enriquecia o item com o nome da unidade já disponível no domínio local do caso admissional.

### Correção aplicada

- adicionado `unit_name` aos DTOs de resposta de fila/dashboard;
- enriquecimento backend no serviço da fila com join leve entre:
  - `PreAdmissionCaseModel`
  - `JobUnitModel`
  - `OperationalUnitModel`
- o enriquecimento só roda para os `case_id` da página atual e só usa vínculos ativos;
- `get_latest_by_case_id(...)` também passou a devolver `unit_name` quando houver sessão disponível.

### Resultado

O dashboard global e o painel por caso conseguem exibir a unidade sem exigir backend novo pesado nem fallback inseguro.

## Gap 2: endpoint seguro de nova solicitação/retry

### Causa

A UI já respeitava `can_request_new`, mas ainda chamava a criação genérica. Faltava um contrato backend explícito para “nova solicitação segura”, com semântica de retry/manual request e idempotência controlada.

### Correção aplicada

- criado endpoint:
  - `POST /api/v1/pre-admission/cases/{case_id}/protheus-export-requests/request-new`
- o endpoint:
  - exige permissão `PreAdmissionWriteStaff`;
  - busca a última solicitação do caso;
  - bloqueia quando `can_request_new=false`;
  - reaproveita o fluxo seguro de `enqueue(...)`;
  - continua dependente do preflight;
  - usa `idempotency_key` determinística baseada em caso + último export conhecido;
  - em duplicidade segura, devolve a solicitação existente sem criar novo risco operacional.

### Garantias preservadas

- nenhum endpoint novo chama Protheus real diretamente;
- nenhum ExecAuto real é acionado;
- o fluxo continua marcado como `is_stub_mode` quando `PROTHEUS_REAL_SEND_ENABLED=false` e `ERP_ALLOW_REAL_SEND=false`;
- mensagens de erro continuam seguras, sem payload sensível bruto.

## Frontend mínimo ajustado

- a ação existente “Solicitar nova exportação segura” passou a chamar o endpoint dedicado;
- o painel e o dashboard passaram a aproveitar `unit_name` quando disponível;
- não foi criado botão novo de envio real;
- nenhum payload sensível foi exposto.

## Arquivos alterados

- `backend/src/application/services/protheus_export_queue_service.py`
- `backend/src/interface/api/routers/pre_admission.py`
- `backend/src/interface/api/schemas/pre_admission_schemas.py`
- `backend/tests/integration/test_protheus_export_dashboard.py`
- `backend/tests/integration/test_protheus_export_queue.py`
- `frontend/src/services/admissionWorkspaceService.ts`
- `frontend/src/types/domain.ts`
- `frontend/src/features/admission-workspace/AdmissionProtheusExportQueuePanel.tsx`
- `frontend/src/features/admission-workspace/ProtheusExportQueueDashboardPage.tsx`
- `frontend/src/features/admission-workspace/__tests__/AdmissionProtheusExportQueuePanel.test.tsx`
- `frontend/src/features/admission-workspace/__tests__/ProtheusExportQueueDashboardPage.test.tsx`

## Testes executados

### Backend

- `cd backend && .venv/bin/python -m pytest tests/integration/test_protheus_export_queue.py tests/integration/test_protheus_export_dashboard.py -vv`
  - resultado: `27 passed`

### Frontend

- `npm --prefix frontend test -- --run src/features/admission-workspace/__tests__/AdmissionProtheusExportQueuePanel.test.tsx src/features/admission-workspace/__tests__/ProtheusExportQueueDashboardPage.test.tsx`
  - resultado: `33 passed`
- `npm --prefix frontend run build`
  - resultado: build OK

## Riscos restantes

- `unit_name` só é entregue quando existir vínculo ativo e confiável entre vaga/caso e unidade operacional; não foi adicionado fallback heurístico.
- a idempotência de `request-new` é intencionalmente conservadora e baseada na última exportação conhecida do caso; isso evita duplicidade insegura, mas não amplia o domínio funcional além do contrato atual.

## Conclusão

`PASS`
