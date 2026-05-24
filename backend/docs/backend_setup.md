# Backend Setup

O backend deve rodar com Python `>=3.12,<3.14`. Não use Python 3.14 para o
ambiente local deste projeto.

## Criar `.venv` do zero

No macOS com Homebrew:

```bash
cd backend
brew install python@3.13
rm -rf .venv
/opt/homebrew/opt/python@3.13/bin/python3.13 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install -e .
./.venv/bin/python -m pip install \
  "pytest>=8.3,<9.0" \
  "pytest-asyncio>=0.24,<0.25" \
  "pytest-cov>=5,<6" \
  "aiosqlite>=0.20,<0.21" \
  "factory-boy>=3.3,<4.0" \
  "ruff>=0.6,<0.7" \
  "mypy>=1.11,<2.0"
```

Se você usa Poetry:

```bash
cd backend
poetry env use /opt/homebrew/opt/python@3.13/bin/python3.13
poetry install --with dev
```

## Validar ambiente

```bash
cd backend
./.venv/bin/python --version
./.venv/bin/python -m pytest --version
./.venv/bin/python -m pytest --no-cov -q --tb=short
```

Para rodar com coverage, omita `--no-cov`.

## Preparar uma base nova de desenvolvimento

Use o bootstrap do backend para preparar uma base vazia ou recém-criada sem
resetar dados nem dropar o banco. O script:

- bloqueia execução fora de `development`/`test`;
- valida `DATABASE_URL`;
- roda `alembic upgrade head`;
- cria `uploads/`, `private_uploads/` e `reports/`;
- exibe `alembic current`;
- roda os seeds de desenvolvimento já existentes;
- preserva dados existentes por padrão.

Exemplo:

```bash
cd backend
./.venv/bin/python scripts/bootstrap_dev.py
```

Para diagnóstico mais detalhado:

```bash
cd backend
./.venv/bin/python scripts/bootstrap_dev.py --verbose
```

Para pular as vagas demo:

```bash
cd backend
./.venv/bin/python scripts/bootstrap_dev.py --skip-jobs
```

Pré-requisitos mínimos no `.env`:

- `APP_ENV=development` ou `APP_ENV=test`
- `DATABASE_URL` apontando para PostgreSQL

O script não cria migration, não apaga dados e não executa `dropdb`.
