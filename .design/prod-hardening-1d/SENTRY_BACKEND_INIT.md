# SENTRY_BACKEND_INIT

## Problema encontrado

O backend ja possuia `SENTRY_DSN` em `settings`, e a dependencia `sentry-sdk` ja estava presente no projeto, mas nao havia chamada para `sentry_sdk.init(...)`.

Impacto:

- excecoes graves nao eram enviadas ao Sentry
- producao/homologacao ficavam sem esse canal de observabilidade

## Estrategia adotada

Foi criada uma inicializacao condicional e idempotente no backend FastAPI:

- funcao `configure_sentry()` em `backend/src/interface/api/main.py`
- chamada durante o `lifespan`
- guarda interna para evitar inicializacao duplicada

Regras aplicadas:

- se `SENTRY_DSN` estiver vazio, nao inicializa
- se `APP_ENV == "test"`, nao inicializa
- nao loga DSN
- nao altera respostas HTTP
- usa `environment=settings.APP_ENV`
- usa `release=APP_VERSION`
- `traces_sample_rate=0.0` para nao ativar tracing agressivo por padrao

## Quando o Sentry liga

- `SENTRY_DSN` preenchido
- ambiente diferente de `test`

## Quando nao liga

- `SENTRY_DSN` vazio
- `APP_ENV == "test"`
- chamadas repetidas apos a primeira inicializacao

## Testes executados

Teste unitario especifico:

```bash
cd backend
../backend/.venv/bin/python -m pytest tests/unit/test_sentry_backend_init.py -v
```

Resultado:

- `6 passed`

Coberturas verificadas:

- DSN vazio nao chama `sentry_sdk.init`
- ambiente `test` nao chama `sentry_sdk.init`
- DSN preenchido chama `sentry_sdk.init` com `environment` e `release`
- duplicacao de init e bloqueada
- `lifespan` inicia com e sem DSN fake

Suíte completa:

```bash
cd backend
../backend/.venv/bin/python -m pytest -x
```

Resultado:

- falha nao relacionada em `tests/e2e/test_demo_full_flow.py::test_demo_full_flow_20_1`
- motivo: `no_ai_credential_available`

## Riscos restantes

- o projeto ainda nao expoe configuracao explicita de sample rate via settings; nesta fase foi adotado valor conservador fixo
- se houver futura inicializacao do app em mais de um processo/worker, a protecao contra duplicacao continua sendo apenas por processo, o que e suficiente para este contexto
