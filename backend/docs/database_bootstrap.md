# Database Bootstrap — Agente Currículo

Guia completo para criar e inicializar o banco de dados em desenvolvimento e produção.

---

## Conceitos fundamentais

| Conceito | O que faz | Quando usar |
|---|---|---|
| **Migration** (Alembic) | Cria/altera a **estrutura** do banco (tabelas, índices, constraints) | Sempre que o schema muda |
| **Seed mínimo** | Insere **dados obrigatórios** para o sistema funcionar (modelos de AI, categorias, admin dev) | Após cada `upgrade head` em dev |
| **Dados demo** | Vagas e candidatos fictícios para teste manual | Somente em dev (`--skip-jobs` para omitir) |

> **Regra de ouro**: migrations nunca entram em produção com dados embutidos.
> Seeds mínimos podem ir para produção se forem idempotentes e não incluírem dados sensíveis.
> Dados demo **nunca** vão para produção.

---

## Fluxo dev — do zero

Execute dentro de `backend/` com o virtualenv ativo.

```bash
# 1. Criar o banco
createdb agente_curriculo_dev

# 2. Aplicar todas as migrations
DATABASE_URL="postgresql+asyncpg://USER:PASS@localhost:5432/agente_curriculo_dev" \
    python -m alembic upgrade head

# 3. Validar schema (opcional mas recomendado)
DATABASE_URL="postgresql+asyncpg://USER:PASS@localhost:5432/agente_curriculo_dev" \
    python scripts/validate_baseline_schema.py

# 4. Rodar seeds de desenvolvimento
DATABASE_URL="postgresql+asyncpg://USER:PASS@localhost:5432/agente_curriculo_dev" \
    python scripts/bootstrap_dev.py

# Para pular as vagas demo:
#   python scripts/bootstrap_dev.py --skip-jobs
```

Ao final do passo 4 você terá:
- Estrutura completa do banco (61 tabelas)
- Modelos de AI cadastrados
- Versão de scoring ativa
- Admin de desenvolvimento criado (`admin@dev.local` / `admin123` — **nunca em produção**)
- Catálogo de skills carregado
- Áreas de vagas configuradas
- Vagas demo (a menos que `--skip-jobs`)

---

## Fluxo reset dev

O script `reset_dev_db.sh` automatiza os passos acima de forma segura:
- Requer `CONFIRM_RESET=1` para evitar execução acidental
- Bloqueia nomes de banco que sugerem produção (`prod`, `staging`, `railway`, etc.)
- Só funciona contra `localhost`

```bash
# Reset completo (recria banco + migrations + seeds)
CONFIRM_RESET=1 DB_NAME=agente_curriculo_dev ./scripts/reset_dev_db.sh

# Reset sem vagas demo
CONFIRM_RESET=1 DB_NAME=agente_curriculo_dev SKIP_SEED=1 ./scripts/reset_dev_db.sh

# Testar numa cópia limpa sem afetar o banco principal
CONFIRM_RESET=1 DB_NAME=agente_curriculo_test ./scripts/reset_dev_db.sh
```

O script faz, nessa ordem:
1. Encerra conexões ativas no banco alvo
2. `dropdb` → `createdb`
3. `alembic upgrade head`
4. `python scripts/bootstrap_dev.py` (ou pula se `SKIP_SEED=1`)
5. `python scripts/validate_baseline_schema.py`

---

## Fluxo produção

### Pré-requisitos
- `DATABASE_URL` configurada como variável de ambiente apontando para o banco de produção
- Superusuário PostgreSQL disponível para criar extensões (apenas na primeira vez)

### Primeira implantação

```bash
# 1. Criar banco (execute como superusuário postgres)
createdb agente_curriculo_prod

# 2. Criar extensões necessárias (execute como superusuário postgres)
psql agente_curriculo_prod -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
psql agente_curriculo_prod -c 'CREATE EXTENSION IF NOT EXISTS "pg_trgm";'
psql agente_curriculo_prod -c 'CREATE EXTENSION IF NOT EXISTS "pgcrypto";'
psql agente_curriculo_prod -c 'CREATE EXTENSION IF NOT EXISTS "unaccent";'

# 3. Aplicar migrations
DATABASE_URL="postgresql+asyncpg://..." python -m alembic upgrade head

# 4. Validar antes de subir a aplicação
DATABASE_URL="postgresql+asyncpg://..." python scripts/production_preflight.py

# 5. Criar o primeiro admin (escolha UMA das opções)
#    Opção A: via psql (mais seguro)
#    psql agente_curriculo_prod -c "INSERT INTO users ..."
#
#    Opção B: via endpoint /admin/bootstrap (se disponível e protegido por BOOTSTRAP_SECRET)
```

> **Nunca** execute `bootstrap_dev.py` em produção — ele cria um admin com senha conhecida.

### Deploys subsequentes

```bash
# 1. Aplicar novas migrations
DATABASE_URL="postgresql+asyncpg://..." python -m alembic upgrade head

# 2. Validar
DATABASE_URL="postgresql+asyncpg://..." python scripts/production_preflight.py

# 3. Subir a aplicação
```

O preflight verifica:
- `DATABASE_URL` configurada
- Banco acessível
- Extensões PostgreSQL instaladas
- Alembic está no `head`
- Tabelas críticas presentes

Sai com código `0` se tudo OK, `1` se houver erro crítico.

---

## Adicionando um novo model

Quando você cria um novo model SQLAlchemy, siga esta ordem:

```bash
# 1. Criar o arquivo do model em src/infrastructure/database/models/

# 2. Importar no __init__.py dos models (OBRIGATÓRIO para autogenerate funcionar)
#    src/infrastructure/database/models/__init__.py

# 3. Gerar a migration
python -m alembic revision --autogenerate -m "add_nome_da_tabela"

# 4. Revisar o arquivo gerado em alembic/versions/
#    Confirme que a tabela aparece corretamente

# 5. Aplicar
python -m alembic upgrade head

# 6. Validar
python scripts/validate_baseline_schema.py
```

> Se o model não estiver importado em `models/__init__.py`, o Alembic não o enxerga e
> a migration gerada estará incompleta (isso causou o bug do `job_areas` / `candidate_pipeline`).

---

## Scripts de referência

| Script | Descrição |
|---|---|
| `alembic upgrade head` | Aplica todas as migrations pendentes |
| `alembic current` | Mostra a revisão atual do banco |
| `alembic heads` | Mostra a revisão mais recente nos arquivos |
| `scripts/validate_baseline_schema.py` | Compara metadata vs banco — reporta tabelas faltando/extras |
| `scripts/bootstrap_dev.py` | Roda todos os seeds de dev (idempotente) |
| `scripts/reset_dev_db.sh` | Recria banco dev do zero com proteções |
| `scripts/production_preflight.py` | Valida ambiente de produção (read-only) |

---

## Referência de tabelas críticas

As seguintes tabelas são obrigatórias para o sistema funcionar:

```
users, candidates, jobs, job_areas,
resumes, analyses, analysis_results,
candidate_job_pipeline, candidate_job_scores,
ai_models, score_model_versions, audit_logs
```

Se qualquer uma dessas faltar após `alembic upgrade head`, verifique:
1. Se o model está importado em `src/infrastructure/database/models/__init__.py`
2. Se a migration foi gerada corretamente com `--autogenerate`
3. Se `alembic heads` == `alembic current` no banco alvo
