# OP-2 - Migration Plan

Data: 2026-06-01

## Estrategia

A migracao deve ser estritamente aditiva:

- Adicionar colunas nullable em `jobs`.
- Criar tabela nova `job_units`.
- Criar indices e constraints.
- Nao fazer backfill automatico de `jobs.location`.
- Nao alterar dados existentes.
- Nao tornar grupo/localidade/filial obrigatorios.

## Passos da Migration

1. Adicionar colunas em `jobs`:
   - `operational_group_id UUID NULL`
   - `location_group_id UUID NULL`
   - `allocation_mode VARCHAR(30) NULL`
2. Adicionar FKs:
   - `jobs.operational_group_id -> operational_groups.id`
   - `jobs.location_group_id -> location_groups.id`
3. Adicionar check constraint de `allocation_mode`:
   - valores permitidos: `single_unit`, `multi_unit`, `location_pool`, `corporate`
   - `NULL` permitido para vagas legadas.
4. Criar `job_units` com UUID, FKs, `openings_count`, `is_active`, `priority`, timestamps.
5. Adicionar constraints:
   - `UNIQUE (job_id, operational_unit_id)`
   - `openings_count > 0` quando nao null.
   - `priority >= 0` quando nao null.
6. Adicionar indices de filtro.

## Backfill

Nao executar backfill automatico na OP-2.

Justificativa:

- `jobs.location` e texto livre.
- Pode haver abreviacoes, cidades, bairros, nomes comerciais e valores historicos misturados.
- Um match textual errado pode vincular vaga a filial incorreta e afetar RH/Protheus.

Backfill futuro recomendado:

1. Gerar relatorio de vagas com `allocation_mode IS NULL`.
2. Sugerir correspondencias com base em localidade/unidade somente como rascunho.
3. Exigir revisao humana antes de persistir.
4. Gravar auditoria de quem confirmou cada vinculo.

## Rollout Recomendado

1. Rodar migration em ambiente de desenvolvimento limpo.
2. Rodar migration em banco com dados existentes.
3. Adicionar backend com campos opcionais e responses compativeis.
4. Rodar suite focada de vagas legadas.
5. Rodar suite de pipeline/matching/public/candidate portal para regressao.
6. So depois habilitar UI de cadastro operacional em vaga.

## Rollback

Antes da UI usar os campos:

- Remover tabela `job_units`.
- Remover colunas e constraints novas de `jobs`.

Depois da UI usar os campos:

- Exportar dados de `job_units` e campos operacionais antes de rollback.
- Remover dependencias de frontend/backend que leem esses campos.
- Reverter migration somente depois de preservar dados ou aceitar perda controlada.

## Riscos de Migracao

- FK falhar se nomes de tabelas da OP-1A divergirem do esperado.
- Constraint de `allocation_mode` bloquear valor futuro se frontend enviar string nao prevista.
- Indice novo em banco grande pode impactar deploy; avaliar criacao concorrente em producao se necessario.
- Backfill automatico por texto pode gerar vinculos errados; por isso nao recomendado.
- Validacao mal implementada pode transformar campo operacional em requisito de publicacao de vaga, o que deve ser evitado.
- Atualizacao parcial pode deixar `jobs` e `job_units` inconsistentes se nao houver transacao unica.

## Regression Check

Testes obrigatorios na implementacao futura:

- Criar vaga legada sem campos operacionais.
- Atualizar vaga legada sem campos operacionais.
- Publicar vaga legada sem campos operacionais.
- Listar vagas com filtros antigos.
- Buscar por `jobs.location`.
- Criar vaga `single_unit`.
- Criar vaga `multi_unit`.
- Criar vaga `location_pool`.
- Limpar vinculo operacional em PATCH.
- Filtrar por `operational_group_id`.
- Filtrar por `location_group_id`.
- Filtrar por `operational_unit_id`.
- Garantir que public/candidate APIs continuam retornando `location`.
- Garantir que pipeline carrega vagas existentes sem joins obrigatorios.
- Garantir que matching/ranking nao exigem dados operacionais.

## Git Hygiene

Na OP-2, manter o diff pequeno e revisavel:

- Um commit para migration/modelo.
- Um commit para schemas/contrato de API.
- Um commit para service/repository/filtros.
- Um commit para testes.
- Frontend em fase separada, se possivel.

Nao misturar OP-2 com alteracoes em Candidate, Pipeline, Matching, Pre-admissao, WhatsApp ou bot.
