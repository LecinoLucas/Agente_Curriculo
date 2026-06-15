# Admissão RH + Protheus Bridge Read-Only

## Objetivo

Exibir no workspace de pré-admissão um resumo seguro da Protheus Bridge sem expor a chave interna da bridge e sem executar nenhuma ação operacional.

## Arquitetura

Fluxo:

1. Frontend do Admissão RH chama `GET /api/v1/pre-admission/cases/{case_id}/protheus-bridge-summary`.
2. Backend do Admissão RH valida autenticação e contexto do caso.
3. Backend chama server-side `GET /internal/protheus/dashboard/status` na Protheus Bridge.
4. Backend sanitiza a resposta e devolve apenas o resumo read-only.

O frontend do Admissão RH nunca recebe `X-Internal-Api-Key`.

## Variáveis de ambiente

Backend:

- `PROTHEUS_BRIDGE_ENABLED=true`
- `PROTHEUS_BRIDGE_BASE_URL=http://127.0.0.1:8010`
- `PROTHEUS_BRIDGE_INTERNAL_API_KEY=dev-bridge-key-local`
- `PROTHEUS_BRIDGE_DASHBOARD_URL=http://localhost:5180`
- `PROTHEUS_BRIDGE_TIMEOUT_SECONDS=2`

## O que o endpoint retorna

- `enabled`
- `available`
- `status`
- `message`
- `environment`
- `storage_mode`
- `readiness`
- `latest_trace`
- `safety`
- `next_action`
- `dashboard_url`

## O que nunca é retornado

- `X-Internal-Api-Key`
- `Authorization`
- headers completos da bridge
- payload bruto
- CPF/PIS/RG/CTPS crus
- stacktrace crua

## Garantias de segurança

- Não chama `precheck`.
- Não chama `dry-run`.
- Não chama `cleanup`.
- Não chama export.
- Não conecta ao Protheus real.
- Não executa `ExecAuto`, `MsExecAuto` ou `GPEA010`.
- Não cadastra funcionário.
- O link `Abrir cockpit técnico` apenas abre a URL configurada da bridge.

## Rodando localmente

Terminal 1:

```bash
cd /Users/lecinolucas/Developer/protheus-admission-bridge
npm run dev:memory
```

Terminal 2:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo
npm run dev:full
```

Depois:

1. Abra um caso de pré-admissão.
2. Verifique o card `Status Protheus`.
3. Clique em `Abrir cockpit técnico` para abrir `http://localhost:5180`.

Runbook operacional detalhado:

- `docs/protheus/ADMISSION_RH_BRIDGE_LOCAL_INTEGRATION_RUNBOOK.md`

## Fallbacks

- `disabled`: bridge desativada no ambiente.
- `unavailable`: bridge offline, timeout ou configuração ausente.
- `blocked`: último trace bloqueado por segurança.
- `ready`: bridge operacional para simulações seguras.
