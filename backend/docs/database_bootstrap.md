# Database Bootstrap — Agente Currículo

Este projeto usa o Alembic como fonte oficial do schema. Em um banco vazio,
`python -m alembic upgrade head` deve criar todas as tabelas, índices, constraints,
foreign keys, partições e extensões necessárias.

## Conceitos

| Conceito | Responsabilidade | Produção |
|---|---|---|
| Migration Alembic | Estrutura do banco: extensões, tabelas, índices, constraints, FKs e partições | Sim |
| Seed | Dados iniciais controlados e idempotentes | Só com plano explícito |
| Seed dev/demo | Admin dev, vagas demo, catálogos de teste e atalhos locais | Nunca |

Produção não roda `scripts/bootstrap_dev.py`. Esse script é exclusivo de
desenvolvimento e pode criar credenciais e dados de demonstração.

## Dev do Zero

Execute dentro de `backend/` com o virtualenv ativo.

```bash
createdb agente_curriculo_dev

DATABASE_URL="postgresql+asyncpg://USER:PASS@localhost:5432/agente_curriculo_dev" \
  python -m alembic upgrade head

DATABASE_URL="postgresql+asyncpg://USER:PASS@localhost:5432/agente_curriculo_dev" \
  python scripts/validate_baseline_schema.py

DATABASE_URL="postgresql+asyncpg://USER:PASS@localhost:5432/agente_curriculo_dev" \
  python scripts/bootstrap_dev.py
```

Para pular vagas demo em dev:

```bash
DATABASE_URL="postgresql+asyncpg://USER:PASS@localhost:5432/agente_curriculo_dev" \
  python scripts/bootstrap_dev.py --skip-jobs
```

## Reset Dev

`scripts/reset_dev_db.sh` recria um banco local com proteções contra execução
acidental em ambientes remotos ou com nomes de produção.

```bash
CONFIRM_RESET=1 DB_NAME=agente_curriculo_dev ./scripts/reset_dev_db.sh
CONFIRM_RESET=1 DB_NAME=agente_curriculo_dev SKIP_SEED=1 ./scripts/reset_dev_db.sh
```

Fluxo do reset:

1. Encerra conexões no banco alvo.
2. Executa `dropdb` e `createdb`.
3. Executa `python -m alembic upgrade head`.
4. Executa `scripts/bootstrap_dev.py`, salvo quando `SKIP_SEED=1`.
5. Executa `scripts/validate_baseline_schema.py`.

## Produção e Homologação

O caminho oficial é Alembic primeiro, preflight depois:

```bash
DATABASE_URL="postgresql+asyncpg://user:password@host:5432/agente_curriculo_prod" \
APP_ENV=production \
APP_SECRET_KEY="..." \
JWT_SECRET_KEY="..." \
FIELD_ENCRYPTION_KEY="..." \
REDIS_URL="redis://host:6379/0" \
  python -m alembic upgrade head

DATABASE_URL="postgresql+asyncpg://user:password@host:5432/agente_curriculo_prod" \
APP_ENV=production \
APP_SECRET_KEY="..." \
JWT_SECRET_KEY="..." \
FIELD_ENCRYPTION_KEY="..." \
REDIS_URL="redis://host:6379/0" \
  python scripts/production_preflight.py --verbose
```

A baseline ativa cria no começo:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";
```

Em provedores gerenciados, o usuário configurado no `DATABASE_URL` precisa ter
permissão para criar essas extensões, ou elas precisam estar previamente
habilitadas por um operador do banco. As tabelas continuam sendo criadas somente
pelo Alembic; não existe script paralelo de `CREATE TABLE` para produção.

`scripts/production_preflight.py` é read-only e valida:

- `APP_ENV`, `ENVIRONMENT` ou `ENV` compatível com produção/homologação.
- `DATABASE_URL` PostgreSQL, sem aceitar SQLite.
- `APP_SECRET_KEY`, `JWT_SECRET_KEY` e `FIELD_ENCRYPTION_KEY` sem imprimir valores.
- `REDIS_URL`, salvo quando `--skip-redis` for informado explicitamente.
- Diretórios locais obrigatórios: `uploads/`, `private_uploads/`, `reports/` e
  `logs/`.
- Conexão com o banco.
- Sessão do preflight em modo read-only.
- Revisão atual do Alembic igual ao `head`.
- Extensões obrigatórias.
- Tabelas obrigatórias, incluindo `job_areas`, `candidate_job_pipeline`,
  `pipeline_stage_transitions`, `users`, `candidates`, `jobs`, `resumes`,
  `analyses`, `candidate_job_scores` e `candidate_job_match`.

## Baseline Ativa

O diretório `alembic/versions/` deve conter apenas uma migration ativa:

```text
dad2597b8478_baseline_schema.py
```

Essa baseline tem `down_revision = None` e representa o schema atual completo.
Migrations antigas ficam arquivadas em `alembic/archived_versions/` apenas para
referência histórica.

## Reconciliando Bancos Antigos com 20260523_checkpoint

Alguns bancos locais antigos podem ter `alembic_version.version_num` marcado como
`20260523_checkpoint`, uma revision transitória que não existe mais no diretório
ativo de migrations. Nesses casos, `python -m alembic upgrade head` falha antes
de aplicar migrations incrementais.

Use este procedimento somente quando o schema base já existir no banco. Nunca use
em banco vazio e nunca use para esconder erro real de schema.

1. Faça backup antes de alterar o ponteiro Alembic:

```bash
pg_dump -Fc NOME_DO_BANCO > backup_antes_reconcile_$(date +%Y%m%d_%H%M).dump
```

2. Confirme que o banco tem as tabelas base e dados esperados:

```bash
psql NOME_DO_BANCO -c "select * from alembic_version;"
psql NOME_DO_BANCO -c "select count(*) from jobs;"
psql NOME_DO_BANCO -c "select count(*) from candidates;"
psql NOME_DO_BANCO -c "select count(*) from candidate_job_pipeline;"
```

3. Se `alembic_version` estiver em `20260523_checkpoint` e a baseline oficial
ativa for `dad2597b8478`, reconcilie o ponteiro:

```bash
python -m alembic stamp dad2597b8478
```

Se o comando acima falhar porque o Alembic não consegue resolver a revision
antiga, use a forma equivalente com purge:

```bash
python -m alembic stamp --purge dad2597b8478
```

`stamp` altera somente a tabela `alembic_version`: não cria tabelas, não remove
tabelas e não altera dados de negócio. Depois dele, aplique novas alterações
somente por migration incremental:

```bash
python -m alembic upgrade head
python -m alembic current
python scripts/validate_baseline_schema.py
```

Não rode `scripts/reset_dev_db.sh`, `dropdb`, `Base.metadata.create_all` ou SQL
manual de `CREATE TABLE` em bancos com dados úteis.

## Adicionando ou Alterando Models

Sempre que um model SQLAlchemy com `__tablename__` for criado ou removido:

1. Atualize `src/infrastructure/database/models/__init__.py`.
2. Rode `rg "__tablename__" src -n` e compare com os imports do `__init__.py`.
3. Gere/revise a migration Alembic apropriada.
4. Valide em banco vazio com `scripts/validate_baseline_schema.py`.

Se o model não for importado no `models/__init__.py`, o Alembic não o enxerga no
metadata e a migration gerada fica incompleta.

## Validação de Baseline em Banco Vazio

```bash
dropdb agente_curriculo_bootstrap_test --if-exists
createdb agente_curriculo_bootstrap_test

DATABASE_URL="postgresql+asyncpg://USER@localhost/agente_curriculo_bootstrap_test" \
  python -m alembic upgrade head

DATABASE_URL="postgresql+asyncpg://USER@localhost/agente_curriculo_bootstrap_test" \
  python scripts/validate_baseline_schema.py

psql agente_curriculo_bootstrap_test -c "\dt job_areas"
psql agente_curriculo_bootstrap_test -c "\dt candidate_job_pipeline"
psql agente_curriculo_bootstrap_test -c "\dt pipeline_stage_transitions"
```

## Scripts

| Script | Uso |
|---|---|
| `python -m alembic upgrade head` | Aplica o schema oficial |
| `python -m alembic current` | Mostra a revisão aplicada no banco |
| `python -m alembic heads` | Mostra o head ativo nos arquivos |
| `scripts/validate_baseline_schema.py` | Compara metadata SQLAlchemy com tabelas existentes |
| `scripts/bootstrap_dev.py` | Seeds e dados auxiliares de desenvolvimento |
| `scripts/reset_dev_db.sh` | Reset local protegido |
| `scripts/production_preflight.py` | Validação read-only pós-migration para produção/homologação |

`production_preflight.py` aceita `--verbose` para diagnóstico adicional sem
expor secrets. Use `--skip-redis` apenas quando Redis não fizer parte do deploy
validado ou quando a conectividade for checada por outro processo operacional.
