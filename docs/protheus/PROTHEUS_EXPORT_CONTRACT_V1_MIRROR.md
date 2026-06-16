# PROTHEUS_EXPORT_CONTRACT_V1_MIRROR

Espelho do contrato oficial publicado pela bridge em:
`/Users/lecinolucas/Developer/protheus-admission-bridge/docs/protheus/PROTHEUS_EXPORT_CONTRACT_V1.md`

## Fluxo desta fase

1. Admissão RH monta o `admission_case`.
2. Backend do Admissão RH chama o preflight interno da bridge.
3. Bridge valida o contrato V1 e responde `payload_status`.
4. Apenas com `payload_status=ready` o backend enfileira a exportação na bridge.
5. O worker da bridge processa a fila e chama somente o STUB local.
6. Não existe envio real ao Protheus nesta fase.

## Payload status permitidos

- `ready`
- `incomplete`

## Status de fila permitidos

- `queued`
- `processing`
- `success`
- `retry_scheduled`
- `failed_permanent`
- `blocked`
- `cancelled`

## Regras de UI

- O frontend nunca chama a bridge diretamente.
- O frontend chama apenas o backend do Admissão RH.
- O botão de solicitar exportação só pode ser habilitado quando `payload_status=ready` e não existe solicitação ativa.
- `failed_permanent` orienta revisão manual do caso.
- `blocked` orienta revisão técnica.
- `success` indica conclusão em modo seguro/STUB.
- `retry_scheduled` deve expor a próxima tentativa quando disponível.
- `incomplete` deve expor pendências de forma explícita.
- Status desconhecido deve ser tratado com fallback seguro, sem quebrar a UI.

## Segurança e dados sensíveis

- CPF, PIS, RG e CTPS nunca aparecem crus no frontend.
- Payload operacional não é exposto em responses públicas.
- Payload redigido pode ser exibido apenas de forma segura, sem valores sensíveis crus.
- API key da bridge existe somente no backend.
- Headers internos nunca aparecem no frontend.
- Audit/event/public response não carregam payload bruto sensível.

## Retry

- Máximo de 3 tentativas na fila da bridge.
- `retry_scheduled` continua automático dentro desse limite.
- `failed_permanent` e `blocked` exigem nova ação humana antes de outra solicitação.

## Escopo operacional desta fase

- Sem Protheus real.
- Sem REST real Protheus.
- Sem ExecAuto.
- Sem MsExecAuto.
- Sem GPEA010.
- Sem cadastro real.
- Sem gravação no Protheus.

## Snapshot de contrato

- Snapshot congelado: `docs/protheus/export_status_contract.snapshot.json`
- Comparação cross-repo: `bash /Users/lecinolucas/Developer/protheus-admission-bridge/scripts/compare-export-status-contracts.sh`
- O snapshot só pode mudar com revisão consciente do contrato entre os dois repositórios.
- Sempre que status, labels, permissões ou `max_attempts` mudarem, atualize o snapshot e os testes backend/frontend no mesmo ciclo.
