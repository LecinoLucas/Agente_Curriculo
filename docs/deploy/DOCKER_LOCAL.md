# Docker Local — Quick Start

## Pré-requisitos

- Docker Desktop ≥ 4.x (com Compose v2)
- 4 GB RAM disponível
- Portas livres: 5432, 6379, 8000, 5173, 5174

---

## Início rápido (script automático)

```bash
# 1. Criar .env.docker.local (ou copiar manualmente de .env.docker.example)
cp .env.docker.example .env.docker.local
# Edite .env.docker.local com secrets reais (veja seção "Variáveis obrigatórias")

# 2. Subir tudo de uma vez
npm run docker:full
```

O script `docker:full` faz automaticamente:
1. Verifica/cria `.env.docker.local`
2. Sobe postgres + redis e aguarda ficarem healthy
3. Executa migrations + seed (`bootstrap_dev.py`)
4. Sobe todos os serviços
5. Aguarda o backend API responder

### Opções do script

```bash
npm run docker:full -- --build           # Rebuild das imagens antes de subir
npm run docker:full -- --fresh           # Apaga volumes e recria do zero (pede confirmação)
npm run docker:full -- --skip-bootstrap  # Pula migrations/seed
npm run docker:full -- --logs            # Fica com logs ao vivo após subir

CONFIRM_FRESH=1 npm run docker:full -- --fresh  # Fresh sem confirmação interativa
```

---

## Passo a passo manual

### 1 — Configurar variáveis de ambiente

```bash
cp .env.docker.example .env.docker.local
# Edite .env.docker.local e preencha os campos obrigatórios (ver abaixo)
```

### 2 — Subir infraestrutura

```bash
docker compose -f docker-compose.local.yml --env-file .env.docker.local up -d --wait postgres redis
```

### 3 — Rodar migrations + seed

```bash
docker compose -f docker-compose.local.yml --env-file .env.docker.local run --rm backend-api python scripts/bootstrap_dev.py
```

### 4 — Subir sistema completo

```bash
docker compose -f docker-compose.local.yml --env-file .env.docker.local up -d
```

### 5 — Validar

```bash
curl -I http://localhost:8000/health      # backend API
curl -I http://localhost:5173             # staff/admin frontend
curl -I http://localhost:5174             # candidate portal
```

---

## Variáveis obrigatórias em `.env.docker.local`

| Variável | Como gerar |
|----------|-----------|
| `FIELD_ENCRYPTION_KEY` | `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `GOOGLE_API_KEY_1` | Chave real do Gemini (necessária para análise IA) |
| `APP_SECRET_KEY` | Qualquer string longa e aleatória (≥ 32 chars) |
| `JWT_SECRET_KEY` | Qualquer string longa e aleatória (≥ 32 chars) |

---

## Portas

| Serviço           | Porta host | Porta container |
|-------------------|-----------|----------------|
| PostgreSQL        | 5432      | 5432           |
| Redis             | 6379      | 6379           |
| Backend API       | 8000      | 8000           |
| Frontend staff    | 5173      | 80 (nginx)     |
| Candidate portal  | 5174      | 80 (nginx)     |

---

## Comandos úteis

```bash
COMPOSE="docker compose -f docker-compose.local.yml --env-file .env.docker.local"

# Status dos serviços
$COMPOSE ps

# Logs de um serviço
$COMPOSE logs -f backend-api
$COMPOSE logs -f celery-worker

# Shell no container
$COMPOSE exec backend-api bash

# Parar sem remover volumes
$COMPOSE down

# Parar e remover volumes (reset completo)
$COMPOSE down -v

# Rebuild de um serviço
$COMPOSE build backend-api
$COMPOSE up -d backend-api

# Rebuild dos frontends (necessário ao mudar VITE_ vars)
$COMPOSE build frontend-staff candidate-portal
$COMPOSE up -d frontend-staff candidate-portal
```

---

## Rebuild obrigatório dos frontends

As variáveis `VITE_*` são **compiladas no bundle** em tempo de build. Se você alterar
`VITE_API_BASE_URL` ou qualquer outra `VITE_` em `.env.docker.local`, precisará
fazer rebuild dos frontends antes que a mudança tenha efeito:

```bash
docker compose -f docker-compose.local.yml --env-file .env.docker.local \
  build frontend-staff candidate-portal
docker compose -f docker-compose.local.yml --env-file .env.docker.local \
  up -d frontend-staff candidate-portal
```

---

## Modo de desenvolvimento (sem Docker)

O stack local sem Docker continua funcionando exatamente como antes:

```bash
npm run dev:full          # sobe backend + frontends + celery localmente
```

O Docker é uma alternativa, não um substituto obrigatório.

---

## Limitações desta fase

- Sem HTTPS (apenas HTTP local)
- Sem reverse proxy (Nginx/Traefik) na frente
- `VITE_*` vars baked in no build — mudanças exigem rebuild dos frontends
- Uploads de arquivo mapeados apenas em memória (sem volume para `/app/uploads`)
- Não é configuração de produção — secrets gerenciados via `.env.docker.local` local
