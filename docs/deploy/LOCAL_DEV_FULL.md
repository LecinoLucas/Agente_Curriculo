# LOCAL DEV FULL — Desenvolvimento local sem Docker

`npm run dev:full` roda o sistema completo localmente sem Docker.
Docker está preservado em `npm run docker:full` para uso pontual.

## Pré-requisitos

- Python 3.11+ com `python3 -m venv`
- Node.js 20+
- PostgreSQL rodando localmente na porta 5432
- Redis rodando localmente na porta 6379
- `redis-cli` disponível no PATH (para health check)

### Instalar PostgreSQL local (macOS)

```bash
brew install postgresql@16
brew services start postgresql@16
createdb agente_curriculo_dev
```

### Instalar Redis local (macOS)

```bash
brew install redis
brew services start redis
# Verificar:
redis-cli ping   # deve retornar PONG
```

## Configuração inicial

### 1. Criar `backend/.env`

```bash
cp backend/.env.example backend/.env
```

Edite os valores mínimos obrigatórios:

```env
# Banco local
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/agente_curriculo_dev

# Redis local
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

# Chaves de app (dev — gere valores aleatórios)
APP_SECRET_KEY=dev-secret-key-min-32-chars-here-ok
JWT_SECRET_KEY=dev-jwt-secret-key-min-32-chars-ok

# Flags de segurança — NUNCA mudar para true em dev local
PROTHEUS_REAL_SEND_ENABLED=false
ERP_ALLOW_REAL_SEND=false
```

### 2. Migrations locais

```bash
cd backend
.venv/bin/python -m alembic upgrade head
```

Ou pelo script de bootstrap completo (migrations + seed de dados):

```bash
npm run backend:bootstrap
```

### 3. Instalar dependências

O `npm run dev:full` instala dependências automaticamente se necessário.
Para instalar manualmente:

```bash
# Raiz
npm ci

# Frontend
cd frontend && npm ci

# Candidate portal
cd candidate-portal && npm ci

# Backend
cd backend && python3 -m venv .venv && .venv/bin/pip install -e .
```

## Uso

### Iniciar tudo (backend + frontend + candidate-portal)

```bash
npm run dev:full
```

Isso sobe:
- Backend FastAPI em `http://localhost:8000`
- Frontend staff/admin em `http://localhost:5173`
- Candidate portal em `http://localhost:5174`

Celery worker **não** sobe por padrão (ver abaixo).

### Iniciar com worker Celery

```bash
DEV_FULL_WITH_WORKER=1 npm run dev:full
```

O worker Celery é necessário para processamento de análise de currículos, matching e document AI.
Consome ~300–600 MB adicionais.

### Flags disponíveis

```bash
# Modo local (padrão)
npm run dev:full

# Com worker Celery
DEV_FULL_WITH_WORKER=1 npm run dev:full

# Sem candidate-portal (economiza recursos)
npm run dev:full -- --no-candidate

# Modo rede LAN (outros dispositivos acessam pelo IP)
npm run dev:full -- --network

# Ver todas as opções
npm run dev:full -- --help
```

## Quando usar `docker:full`

```bash
npm run docker:full
```

Use Docker apenas quando:
- Precisar replicar o ambiente de produção exato (imagens, volumes, etc.)
- Testar o processo de build das imagens
- Onboarding de um colaborador novo que ainda não tem as ferramentas locais
- CI/CD ou smoke tests de integração

## Parar tudo

Pressione `Ctrl+C` no terminal onde `dev:full` está rodando.
O script encerra todos os processos filhos automaticamente (SIGTERM → SIGKILL).

## Porta ocupada

Se `dev:full` reportar que uma porta está em uso:

```bash
# Descobrir qual processo usa a porta
lsof -nP -iTCP:8000 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN

# Parar o processo pelo PID
kill <PID>

# Ou usar portas alternativas
BACKEND_PORT=8001 FRONTEND_PORT=5174 npm run dev:full
```

## Health check

```bash
bash scripts/diagnostics/dev_full_local_health.sh
```

Verifica:
- Backend `/health` (status, database, redis)
- Frontend porta 5173
- Redis PING
- `DATABASE_URL` configurada e local
- `PROTHEUS_REAL_SEND_ENABLED=false`
- `ERP_ALLOW_REAL_SEND=false`

## Segurança em dev local

As seguintes flags **devem** permanecer `false` em desenvolvimento:

```env
PROTHEUS_REAL_SEND_ENABLED=false
ERP_ALLOW_REAL_SEND=false
```

O `dev:full` bloqueia a inicialização se qualquer uma estiver `true`.

Nunca use `DATABASE_URL` apontando para banco de produção ou staging em dev local.

## Resolução de problemas

### Backend não sobe: `ModuleNotFoundError`

```bash
cd backend
.venv/bin/pip install -e .
```

### Vite com erro de módulo / cache corrompido

```bash
cd frontend
npm run dev:clean   # limpa cache Vite e recomeça
```

### Redis: `ECONNREFUSED`

```bash
brew services start redis
# ou
redis-server --daemonize yes
```

### PostgreSQL: `connection refused`

```bash
brew services start postgresql@16
# Verificar:
psql -U postgres -c "SELECT 1"
```

### Celery: `kombu.exceptions.OperationalError`

Redis não está rodando. Inicie Redis antes de usar `DEV_FULL_WITH_WORKER=1`.

### Migrations falham: `relation does not exist`

```bash
cd backend
.venv/bin/python -m alembic upgrade head
```

## Referência de variáveis de ambiente

| Variável | Padrão dev | Descrição |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://...@localhost:5432/...` | Banco local |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis sessões/cache |
| `CELERY_BROKER_URL` | `redis://localhost:6379/1` | Broker Celery |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6379/2` | Resultados Celery |
| `CELERY_WORKER_MAX_MEMORY_PER_CHILD` | `300000` (KB ≈ 293 MB) | Limite memória worker |
| `PROTHEUS_REAL_SEND_ENABLED` | `false` | Envio ERP real — NUNCA true em dev |
| `ERP_ALLOW_REAL_SEND` | `false` | Permissão ERP real — NUNCA true em dev |
| `BACKEND_PORT` | `8000` | Porta do backend FastAPI |
| `FRONTEND_PORT` | `5173` | Porta do frontend staff |
| `CANDIDATE_PORTAL_PORT` | `5174` | Porta do candidate portal |
| `DEV_FULL_WITH_WORKER` | `""` (desligado) | `=1` para habilitar worker Celery |
