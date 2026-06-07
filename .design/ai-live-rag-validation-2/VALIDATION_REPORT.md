# AI Live RAG Validation 2

## Objetivo

Robustecer o fluxo de `knowledge.answer` com Gemini synthesis para erros transitórios (`503`, `429`, timeout), melhorar a classificação do erro e revalidar o comportamento live sem expor segredos.

## Alterações implementadas

### `backend/src/ai_orchestration/rag/gemini_rag_synthesis_provider.py`

- introduzida exceção tipada `GeminiSynthesisError`
- classificação de falhas:
  - `503` -> `PROVIDER_UNAVAILABLE`
  - `429` -> `PROVIDER_RATE_LIMITED`
  - timeout -> `PROVIDER_TIMEOUT`
  - `4xx` restantes -> `PROVIDER_BAD_REQUEST`
  - `5xx` restantes -> `PROVIDER_UNAVAILABLE`
- retry curto com backoff:
  - até `2` retries
  - apenas para `503`, `429`, timeout e falhas de rede transitórias
- mensagens sanitizadas sem expor API key
- logs internos com código e status, sem prompt/resposta

### `backend/src/ai_orchestration/rag/rag_answer_service.py`

- tratamento explícito de `GeminiSynthesisError`
- resposta amigável ao usuário em vez de `RuntimeError` cru
- persistência do erro de uso com classificação embutida em `error_message`
  - formato: `ERROR_CODE: provider_message_sanitized`
- manutenção do caminho de sucesso com tokens reais quando `usageMetadata` vier do provider

## Decisão de persistência

O schema atual de `ai_usage_logs` não possui coluna `error_code`.

Para evitar migration nesta fase, a classificação foi persistida em `error_message`, por exemplo:

```text
PROVIDER_UNAVAILABLE: Temporary outage
```

Isso preserva:

- `provider`
- `model`
- `operation=rag_synthesis`
- `status=error`
- `tokens=0`

Sem armazenar:

- prompt bruto
- resposta bruta
- chunks
- API key

## Testes atualizados

### `backend/tests/unit/test_ai_rag_gemini_synthesis_provider.py`

Cobre:

- extração de `usageMetadata`
- fallback sem `usageMetadata`
- sanitização de API key em erro de rede
- `503` classificado como `PROVIDER_UNAVAILABLE`
- `429` classificado como `PROVIDER_RATE_LIMITED`
- retry por timeout seguido de sucesso

### `backend/tests/unit/test_ai_rag_answer_service.py`

Cobre:

- mensagem amigável para erro do provider
- persistência de erro classificado em `rag_synthesis`
- manutenção de tokens reais no caminho de sucesso
- ausência de prompt/resposta no log

### `backend/tests/unit/test_ai_knowledge_tools.py`

Cobre:

- propagação de erro amigável/classificado pelo `answer_knowledge`
- garantia de não retornar `RuntimeError` cru ao cliente

## Resultado dos testes executados

Passaram:

- `pytest tests/unit/test_ai_rag_gemini_synthesis_provider.py -v`
- `pytest tests/unit/test_ai_rag_answer_service.py -v`
- `pytest tests/unit/test_ai_usage_endpoint.py -v`
- `pytest tests/unit/test_ai_knowledge_tools.py -v`

Observação:

- foi necessário limpar artefatos locais `.coverage` corrompidos antes de rerodar `test_ai_usage_endpoint.py`
- isso não alterou código nem comportamento da feature

## Revalidação live

### Status

Não concluída nesta rodada.

### Motivo

O ambiente recusou o comando escalado necessário para falar novamente com Gemini em modo live, com rejeição automática por limite de uso/créditos do ambiente de execução.

### Impacto

Foi possível validar localmente:

- tratamento tipado de erro
- retry curto
- mensagem amigável
- sanitização
- classificação persistida
- regressão dos testes

Não foi possível reexecutar nesta rodada:

- `seed --force` live após o hardening
- `knowledge.answer` live contra Gemini
- verificação nova em `ai_usage_logs` com tentativa real pós-ajuste

## Estado funcional esperado após a correção

Se o Gemini responder:

- `knowledge.answer` deve retornar `ok=true`
- com `answer`
- com `sources`
- e `ai_usage_logs` deve registrar `status=success` e `total_tokens > 0` quando `usageMetadata` vier do provider

Se o Gemini continuar em `503`:

- `knowledge.answer` deve retornar erro amigável
- sem `RuntimeError` cru
- com `error_code=PROVIDER_UNAVAILABLE`
- e `ai_usage_logs.error_message` deve conter algo como:
  - `PROVIDER_UNAVAILABLE: ...`

Se o Gemini responder `429`:

- `knowledge.answer` deve retornar erro amigável
- com `error_code=PROVIDER_RATE_LIMITED`

Se houver timeout:

- `knowledge.answer` deve retornar erro amigável
- com `error_code=PROVIDER_TIMEOUT`

## Segurança confirmada

- nenhuma API key é retornada ao usuário
- mensagens do provider são sanitizadas
- não há stack trace na resposta ao cliente
- não há persistência de prompt/resposta/chunks
- `Protheus` real permanece desligado
- `free text` geral permanece desligado

## Risco restante

O único critério ainda não provado nesta rodada é a revalidação live pós-ajuste, bloqueada por limitação do ambiente e não por falha do código alterado.
