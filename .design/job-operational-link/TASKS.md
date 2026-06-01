# OP-2 - Tasks

Generated from: `.design/job-operational-link/DESIGN_BRIEF.md`

Data: 2026-06-01

## Checklist Implementavel

### 1. Preparar Modelo de Dados

- [ ] Criar migration aditiva para colunas nullable em `jobs`.
- [ ] Criar tabela `job_units`.
- [ ] Adicionar constraints de unicidade, checks e FKs.
- [ ] Adicionar indices para filtros por grupo, localidade e unidade.
- [ ] Validar `alembic upgrade head` em banco limpo.
- [ ] Validar `alembic upgrade head` em banco com vagas existentes.

### 2. Mapear ORM e Repositorio

- [ ] Adicionar campos opcionais ao ORM de `JobModel`.
- [ ] Criar modelo ORM para `JobUnit`.
- [ ] Implementar leitura dos vinculos ativos por vaga.
- [ ] Implementar substituicao transacional de unidades vinculadas.
- [ ] Implementar filtros de repositorio por `operational_group_id`, `location_group_id`, `operational_unit_id` e `allocation_mode`.

### 3. Atualizar Contrato de API de Vagas

- [ ] Adicionar campos opcionais em `CreateJobRequest`.
- [ ] Adicionar campos opcionais em `UpdateJobRequest`.
- [ ] Adicionar campos opcionais em `JobResponse`.
- [ ] Garantir que payloads antigos continuam validos.
- [ ] Definir serializers para resumo de grupo, localidade e unidades.
- [ ] Garantir que campos omitidos em PATCH nao alteram vinculos.
- [ ] Garantir que `null` limpa campos opcionais quando enviado explicitamente.
- [ ] Garantir que `operational_units: []` remove vinculos ativos da vaga.

### 4. Validar Regras de Negocio

- [ ] Rejeitar `operational_group_id` inexistente.
- [ ] Rejeitar `location_group_id` inexistente.
- [ ] Rejeitar `operational_unit_id` inexistente.
- [ ] Rejeitar unidade duplicada no mesmo payload.
- [ ] Validar `single_unit` com exatamente uma unidade ativa.
- [ ] Validar `multi_unit` com uma ou mais unidades ativas.
- [ ] Validar `location_pool` com `location_group_id`.
- [ ] Validar consistencia entre unidade, grupo e localidade.
- [ ] Manter `jobs.location` independente e nao obrigar sincronizacao automatica.

### 5. Preservar Fluxos Existentes

- [ ] Criar teste de create de vaga legada sem campos operacionais.
- [ ] Criar teste de update de vaga legada sem campos operacionais.
- [ ] Criar teste de publish de vaga legada sem campos operacionais.
- [ ] Criar teste de listagem com filtros antigos.
- [ ] Criar teste de busca por `jobs.location`.
- [ ] Garantir que bulk import atual continua aceitando `location` texto livre.
- [ ] Garantir que public/candidate APIs continuam com `location`.

### 6. Testar Multiunidade

- [ ] Criar teste de vaga `single_unit`.
- [ ] Criar teste de vaga `multi_unit`.
- [ ] Criar teste de vaga `location_pool`.
- [ ] Criar teste de filtro por grupo.
- [ ] Criar teste de filtro por localidade.
- [ ] Criar teste de filtro por unidade.
- [ ] Criar teste de limpeza de vinculo operacional por PATCH.
- [ ] Criar teste de substituicao de unidades por PATCH.

### 7. Preparar UI Futura

- [ ] Documentar campos esperados para formulario de vaga.
- [ ] Usar endpoints existentes de cadastro mestre para combos.
- [ ] Planejar modo opcional `Vinculo operacional`.
- [ ] Exibir codigos de grupo/filial para RH.
- [ ] Exibir localidade, nome publico e ponto de referencia para candidato.
- [ ] Evitar criacao automatica de uma vaga por posto.

### 8. Regression-Risk Review

- [ ] Confirmar que nenhum campo operacional entra no quality gate de publicacao.
- [ ] Confirmar que matching/ranking nao recalculam por simples alteracao operacional, salvo decisao futura explicita.
- [ ] Confirmar que pipeline nao exige joins com `job_units`.
- [ ] Confirmar que Candidate Portal nao depende dos novos campos.
- [ ] Confirmar que Pre-admissao, WhatsApp e bot permanecem fora do escopo.
- [ ] Rodar suite focada de jobs.
- [ ] Rodar suite de pipeline.
- [ ] Rodar suite publica/candidate portal.
- [ ] Rodar ruff.

### 9. Git Hygiene

- [ ] Manter alteracoes da OP-2 separadas das alteracoes da OP-1B frontend.
- [ ] Nao tocar `.design/operational-master/`.
- [ ] Nao misturar frontend na primeira entrega backend.
- [ ] Revisar `git diff --name-only` antes de finalizar.
- [ ] Garantir que o diff nao altera Candidate, Pipeline, Matching, Pre-admissao, WhatsApp ou bot.
