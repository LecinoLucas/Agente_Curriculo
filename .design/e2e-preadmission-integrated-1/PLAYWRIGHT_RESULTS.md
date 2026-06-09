# Playwright Results

## Arquivo

- `frontend/e2e/pipeline-pre-admission-flow.spec.ts`

## Objetivo do spec

- abrir `/admissao/:caseId` com um `caseId` real do ambiente local
- validar que o workspace carrega
- validar que a UI não exibe `null`, `undefined`, `payload_json`, `vector_json`, `content_hash` ou stack trace

## Pré-requisito explícito

O spec depende de:

- frontend local acessível em `http://localhost:5173`
- backend local funcional por trás do frontend
- credenciais válidas
- `PREADMISSION_E2E_CASE_ID` apontando para um caso admissional real e acessível

## Execução

Comando executado:

```bash
npx playwright test e2e/pipeline-pre-admission-flow.spec.ts --project chromium --reporter=line
```

Resultado observado no ambiente atual:

```text
PASS (0) FAIL (0)
Time: <1s
exit code: 1
```

## Interpretação

- não houve cenário executável de fato no ambiente atual
- a automação de UI real ficou **pendente de massa/local env explícito**
- a validação desta fase ficou sustentada por integração backend e pelo contrato frontend já coberto pelos testes de resolver/navegação de pré-admissão

## Limitação

Sem `PREADMISSION_E2E_CASE_ID` real, um E2E útil de workspace vira teste vazio. Nesta fase isso foi documentado em vez de mascarado como cobertura real.
