---
name: api-endpoints
description: Implementação de endpoints — validação no backend, permissões, respostas consistentes, transações e proteção das regras de domínio.
---

## Objetivo

Garantir que endpoints sejam seguros, validados no backend e respeitem as regras do domínio.

## Quando usar

- Ao criar ou modificar qualquer endpoint da API.
- Ao definir contratos de resposta entre backend e frontend.
- Ao implementar operações que afetam candidato, vaga, pipeline, score ou análise.

## Regras principais

- Validação de dados acontece no backend, não apenas no frontend.
- Todo endpoint verifica autenticação e autorização antes de executar.
- Operações que afetam múltiplas tabelas devem usar transação.
- Respostas de sucesso e erro devem ter estrutura consistente.
- Erros de validação retornam 400 com detalhes úteis.
- Erros de autorização retornam 403 sem expor internals.
- Erros inesperados retornam 500 com mensagem genérica.
- Backend é a autoridade — nunca confiar em decisões vindas do frontend.
- Endpoints de pipeline respeitam: máximo de 1 pipeline ativo por candidato.
- Ao adicionar candidato à vaga ou transferir: criar análise IA e calcular score no backend.

## Nunca fazer

- Não criar endpoint paralelo que crie vínculo candidato-vaga fora do pipeline.
- Não permitir que o frontend decida vaga ativa, score ou análise.
- Não executar operações críticas sem transação quando necessário.
- Não retornar dados de outros tenants.
- Não criar endpoint que permita múltiplos pipelines ativos.
- Não confiar em campos enviados pelo frontend para definir tenant ou permissão.
- Não manter endpoints legados que contradizem a regra central.

## Checklist antes de concluir

- [ ] Endpoint valida autenticação e autorização?
- [ ] Dados são validados no backend antes de processar?
- [ ] Operações críticas estão dentro de transação?
- [ ] Resposta segue estrutura consistente (sucesso e erro)?
- [ ] Endpoint não permite múltiplos pipelines ativos?
- [ ] Nenhum dado de outro tenant é retornado?
- [ ] Análise IA e score são criados no backend nos fluxos oficiais?
