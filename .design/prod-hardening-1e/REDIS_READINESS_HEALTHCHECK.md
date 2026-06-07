# PROD-HARDENING-1E — Redis no readiness healthcheck

## Problema encontrado

O backend expunha apenas `GET /health` com validação de banco de dados. Redis, usado por filas e tarefas assíncronas, não participava do readiness. Isso deixava o serviço "verde" mesmo quando a fila podia estar indisponível.

## Estratégia adotada

Foi aplicada a menor mudança segura com separação de liveness e readiness:

- `GET /health/live`
  - valida apenas se o processo está vivo
  - responde `200 OK`
- `GET /health/ready`
  - valida PostgreSQL e Redis
  - responde `200 OK` quando ambos estão disponíveis
  - responde `503 Service Unavailable` quando alguma dependência crítica falha
- `GET /health`
  - mantido como alias backward-compatible do readiness

## Endpoints afetados

- `GET /health`
- `GET /health/live`
- `GET /health/ready`

## Comportamento com Redis OK

- payload inclui `database` e `redis`
- `status` geral fica `ok`
- readiness retorna HTTP `200`

## Comportamento com Redis falho

- payload inclui `redis.status = "down"`
- mensagem é sanitizada como `Redis indisponível`
- nenhuma URL/senha é exposta
- readiness retorna HTTP `503`

## Compatibilidade preservada

- `version` continua presente no payload
- `database.connected` foi mantido
- `/health` continua existindo
- headers de segurança continuam aplicados mesmo em respostas `503`

## Testes executados

### Focados

- `backend/tests/integration/test_readiness_healthcheck.py`
- `backend/tests/integration/test_security_headers.py`

Coberturas principais:

- liveness continua funcionando
- readiness fica `ok` com banco + Redis disponíveis
- readiness fica `503` com Redis indisponível
- readiness fica `503` com banco indisponível
- `/health` segue o contrato de readiness
- erros de Redis não expõem URL nem senha
- headers de segurança continuam presentes

### Suíte completa

A suíte completa não ficou verde neste ambiente por causa de um E2E não relacionado ao endpoint de health:

- `tests/e2e/test_demo_full_flow.py::test_demo_full_flow_20_1`
- falha ao tentar conectar em Redis/Celery local (`localhost:6379`) no ambiente sandboxado

## Riscos restantes

- o readiness agora depende explicitamente de Redis; ambientes sem Redis válido passarão a responder `503` em `/health` e `/health/ready`
- alguns E2Es locais assumem infraestrutura auxiliar disponível; isso continua fora do escopo desta fase
