# Runbook Local: Admissão RH + Protheus Bridge

## Objetivo

Validar localmente a integração read-only entre o Admissão RH e a Protheus Bridge sem Docker no ATS e sem qualquer ação mutável na bridge a partir do workspace.

## Pré-requisitos

- `Node.js` e `npm`
- `Python 3`
- backend e frontend do Admissão RH configurados
- repositório `protheus-admission-bridge` disponível em `/Users/lecinolucas/Developer/protheus-admission-bridge`

## Portas

- Protheus Bridge frontend: `5180`
- Protheus Bridge backend: `8010`
- STUB local ADVPL: `8999`
- Admissão RH backend: `8000`
- Admissão RH frontend: `5173`

## Variáveis do backend do Admissão RH

Configure no backend do Admissão RH:

```env
PROTHEUS_BRIDGE_ENABLED=true
PROTHEUS_BRIDGE_BASE_URL=http://127.0.0.1:8010
PROTHEUS_BRIDGE_INTERNAL_API_KEY=dev-bridge-key-local
PROTHEUS_BRIDGE_DASHBOARD_URL=http://localhost:5180
PROTHEUS_BRIDGE_TIMEOUT_SECONDS=2
```

Regra de segurança:

- `PROTHEUS_BRIDGE_INTERNAL_API_KEY` fica apenas no backend.
- Não criar `VITE_*` com chave interna da bridge.

## Subindo a Protheus Bridge em memory mode

Terminal 1:

```bash
cd /Users/lecinolucas/Developer/protheus-admission-bridge
npm run dev:memory
```

Terminal 2:

```bash
cd /Users/lecinolucas/Developer/protheus-admission-bridge
npm run check:memory-runtime
```

O resultado esperado inclui:

- frontend da bridge em `http://localhost:5180`
- backend da bridge em `http://127.0.0.1:8010`
- `storage_mode=memory`

## Subindo o Admissão RH

Terminal 3:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo
npm run dev:full
```

Opcional:

```bash
npm run check:protheus-bridge-readonly
```

Com case configurado:

```bash
ADMISSION_CASE_ID_FOR_BRIDGE_CHECK=<case_id> npm run check:protheus-bridge-readonly
```

Se quiser validar o retorno autenticado via script, informe uma sessão de staff sem imprimir o valor:

```bash
ADMISSION_CASE_ID_FOR_BRIDGE_CHECK=<case_id> \
ADMISSION_BRIDGE_CHECK_COOKIE='access_token=...' \
npm run check:protheus-bridge-readonly
```

## Validação manual: bridge online

1. Abra o frontend do Admissão RH em `http://localhost:5173`.
2. Entre com uma sessão staff.
3. Abra um workspace de pré-admissão de um case válido.
4. Confirme o card `Status Protheus`.
5. Valide:
   - `enabled=true`
   - `available=true`
   - `status=ready` ou `warning`
   - `environment`
   - `storage_mode=memory`
   - `latest_trace`, quando existir
6. Clique em `Abrir cockpit técnico`.
7. Confirme a abertura de `http://localhost:5180`.

## Validação manual: bridge offline

1. Pare a bridge:

```bash
cd /Users/lecinolucas/Developer/protheus-admission-bridge
npm run dev:memory:stop
```

2. Recarregue o workspace no Admissão RH.
3. O card deve mostrar `Bridge indisponível` ou `unavailable`.
4. O workspace não deve quebrar.
5. Não deve haver stacktrace crua.

## Validação manual: bridge disabled

1. No backend do Admissão RH, ajuste:

```env
PROTHEUS_BRIDGE_ENABLED=false
```

2. Reinicie o Admissão RH.
3. Reabra o workspace.
4. O card deve mostrar `disabled`.
5. O workspace não deve quebrar.
6. O backend não deve depender da bridge para montar o card.

## Validação manual: blocked

1. Suba a bridge novamente em `dev:memory`.
2. No cockpit técnico da bridge, rode o cenário `malicious_would_execute`.
3. Volte ao Admissão RH e recarregue o workspace.
4. O card deve mostrar status `blocked` quando o `latest_trace` da bridge estiver bloqueado.

## O que validar no HTML/UI

Não deve aparecer:

- `dev-bridge-key-local`
- `X-Internal-Api-Key`
- `Authorization`
- token bruto
- CPF/PIS/RG/CTPS crus
- payload bruto
- stacktrace crua

## O que nunca acontece neste fluxo

- O Admissão RH não chama `precheck` na bridge.
- O Admissão RH não chama `dry-run` na bridge.
- O Admissão RH não chama `cleanup` na bridge.
- O Admissão RH não chama export na bridge.
- O Admissão RH não conecta ao Protheus real.
- O Admissão RH não executa `ExecAuto`, `MsExecAuto` ou `GPEA010`.
- O Admissão RH não cadastra funcionário.

## Troubleshooting

### Bridge não sobe em `8999`

- Rode `npm run dev:memory:stop` no repositório `protheus-admission-bridge`.
- Revise o runbook local da bridge.

### Card mostra unavailable com bridge online

- Confirme `npm run check:memory-runtime` na bridge.
- Confirme `PROTHEUS_BRIDGE_BASE_URL=http://127.0.0.1:8010`.
- Confirme `PROTHEUS_BRIDGE_INTERNAL_API_KEY=dev-bridge-key-local`.

### Script read-only responde 401/403

- Isso indica que o backend do Admissão RH está online e protegendo a rota.
- Faça a validação visual com uma sessão staff autenticada ou passe um cookie de staff no shell.

### Workspace não abre para o case

- Confirme que o case possui pipeline ativo.
- O workspace bloqueia corretamente casos com pipeline terminal ou inativo.

### Bridge offline quebra o card

- Isso é regressão.
- O comportamento correto é `unavailable` com mensagem humana, sem stacktrace.
