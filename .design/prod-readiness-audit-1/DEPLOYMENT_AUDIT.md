# Auditoria de Deployment (Infraestrutura)

**Data:** 07/06/2026

## 1. Estado da Pipeline e CI/CD
- **RISCO ALTO**: O projeto suporta a execução de Actions para Testes mas peca pela **falta completa de uma esteira CD (Continuous Deployment)**. Não há scripts automatizados de provisionamento, push de registry do Docker ou pipelines pra staging.
- **ALERTA MÉDIO**: Candidate-portal encontra-se fora dos passos das actions Github CI.

## 2. Configurações de Servidor (Dockerfiles)
- **RISCO CRÍTICO / ALTO**: As imagens atuais (como `api.Dockerfile`) são feitas em Single-Stage (e não multi-stage), mantendo bibliotecas GCC e deps de build em produção, inchando imagens e aumentando vulnerabilidades (attack surface).
- **RISCO ALTO**: Rodam nativamente como `root`. Não há cláusulas `USER nobody/appuser`.
- **RISCO ALTO**: Inconsistência de Gerenciadores. O script `dev-full.sh` prioriza `pip install -e .` mas o `Dockerfile` força o uso estrito do `poetry`. Se o `poetry.lock` defasar, o build estoura.
- **RISCO CRÍTICO / ALTO**: Falta de arquivos globais como `.dockerignore`. Várias lixeiras locais serão adicionadas no contêiner produtivo se os COPY forem mal executados.

## 3. Observabilidade Pós-Deploy
- **RISCO CRÍTICO**: Apesar da variável `.env` `SENTRY_DSN` e sua importação no `pyproject.toml`, o método `sentry_sdk.init()` é lenda: não é evocado em `main.py` nem nos middlewares, deixando o servidor essencialmente cego a panics ou trace errors em produção sem ter que logar nas máquinas remotas.
- **APROVADO**: O `structlog` com injeções UTC ISO e JSON logging foram implantados corretamente.
- **ALERTA MÉDIO**: Redis Health não compõe o painel `/health` público do Liveness Probe, apenas a base SQL. Em LoadBalancers isso é perigoso (o tráfego segue rolando se o Redis cair no celery).

**Conclusão**: O deploy atual baseia-se em instâncias arcaicas de Dockerfile sem as práticas maduras para entrar em orquestradores (Kubernetes ou ECS).
