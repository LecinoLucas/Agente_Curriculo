---
name: database-migrations
description: Migrations de banco de dados — constraints, índices, integridade, rollback e proteção da regra central do domínio.
---

## Objetivo

Garantir que mudanças no schema sejam seguras, reversíveis e reforcem as regras de domínio no banco.

## Quando usar

- Ao criar ou alterar tabelas, colunas, índices ou constraints.
- Ao adicionar ou remover relacionamentos entre entidades.
- Ao corrigir ou migrar dados legados.

## Regras principais

- Toda migration deve ter rollback definido.
- Constraints e índices únicos devem reforçar regras de negócio quando possível.
- Usar índice único parcial para garantir no banco: no máximo 1 pipeline ativo por candidato.
- Novas colunas obrigatórias devem ter valor default ou ser adicionadas em etapas (nullable primeiro, depois constraint).
- Migrations que alteram dados devem ser testadas com volume real antes de executar em produção.
- Dados legados devem ser tratados explicitamente — nunca ignorar silenciosamente.
- Não renomear colunas usadas por queries sem atualizar o código junto.
- Migrations devem ser idempotentes quando possível.

## Exemplo de índice único parcial (pipeline ativo)

```sql
CREATE UNIQUE INDEX unique_active_pipeline_per_candidate
ON candidate_job_pipelines (candidate_id)
WHERE is_active = true;
```

## Nunca fazer

- Não criar migration sem rollback.
- Não adicionar constraint NOT NULL em coluna existente sem valor default ou migration de dados.
- Não remover coluna sem verificar se ainda é usada no código.
- Não ignorar dados legados que possam violar novas constraints.
- Não criar estrutura que permita múltiplos pipelines ativos no banco.
- Não criar relacionamento candidato-vaga fora da tabela de pipeline.
- Não quebrar a regra central: 1 candidato = no máximo 1 pipeline ativo.

## Checklist antes de concluir

- [ ] Migration tem rollback definido?
- [ ] Novas constraints respeitam dados existentes?
- [ ] Índice único parcial impede múltiplos pipelines ativos?
- [ ] Dados legados foram tratados explicitamente?
- [ ] Colunas removidas ou renomeadas foram atualizadas no código?
- [ ] Migration foi testada em ambiente seguro antes de produção?
- [ ] A regra central (1 candidato = 1 pipeline ativo) é reforçada pelo schema?
