# DEPLOY-DOCKER-LOCAL-SPLIT-1

Data: 2026-06-10

---

## Arquitetura dos containers

```
┌─────────────────────────────────────────────────────────────────┐
│  HOST (localhost)                                                │
│                                                                  │
│  :5173 ──► frontend-staff (nginx:alpine)                         │
│  :5174 ──► candidate-portal (nginx:alpine)                       │
│  :8000 ──► backend-api (python:3.13-slim)                        │
│  :5432 ──► postgres:16-alpine                                    │
│  :6379 ──► redis:7-alpine                                        │
│                                                                  │
│  [no port] celery-worker (python:3.13-slim)                      │
│  [no port] celery-beat   (python:3.13-slim)                      │
└─────────────────────────────────────────────────────────────────┘
               ↑ todos na rede interna Docker "agente_curriculo_internal"
```

Os frontends são SPAs servidas por Nginx. Todas as chamadas de API vão do
browser do host → `localhost:8000` (não passam por dentro da rede Docker).

---

## Arquivos criados/alterados

### Novos arquivos Docker

| Arquivo | Descrição |
|---------|-----------|
| `backend/Dockerfile` | Build Python 3.13-slim + pip, expõe :8000 |
| `backend/.dockerignore` | Exclui .venv, tests, .env, __pycache__, etc. |
| `backend/requirements.txt` | Deps de produção exportadas do .venv (sem pytest/dev) |
| `frontend/Dockerfile` | Multi-stage: node:22-alpine build + nginx:1.27-alpine serve |
| `frontend/.dockerignore` | Exclui node_modules, dist, .env |
| `frontend/nginx.conf` | SPA fallback (`try_files $uri /index.html`) |
| `candidate-portal/Dockerfile` | Mesmo padrão do frontend-staff |
| `candidate-portal/.dockerignore` | Exclui node_modules, dist, .env.* |
| `candidate-portal/nginx.conf` | SPA fallback idêntico ao frontend |
| `docker-compose.local.yml` | Orquestração de 7 serviços |
| `.env.docker.example` | Template de variáveis — sem secrets reais |

### Arquivos alterados

| Arquivo | Motivo |
|---------|--------|
| `.gitignore` | Adicionado `!.env.docker.example` para versionar o template |
| `backend/alembic/versions/20260607_ai_knowledge_admin_fields.py` | `revision` encurtado de 34 para 21 chars (ver seção "Bloqueio nas migrations") |

---

## Descobertas e bloqueios resolvidos

### 1. `validate-repo-root.js` no build do frontend

O script `npm run build` executa `node ../scripts/validate-repo-root.js` antes do Vite.
Dentro do container, esse script não existe (contexto é apenas `./frontend`). O `candidate-portal`
usa `tsc && vite build` diretamente, sem o validador.

**Solução**: `frontend/Dockerfile` invoca `node_modules/.bin/vite build` diretamente,
ignorando o validador de host. O `candidate-portal` não tem esse problema.

### 2. Self-reference em `requirements.txt`

O `pip freeze` do `.venv` local incluía `resume_ai_system` instalado como editable git:
```
-e git+https://github.com/...@<sha>#egg=resume_ai_system&subdirectory=backend
```
Isso quebrava o build (git não disponível na imagem).

**Solução**: linha removida de `backend/requirements.txt`. O código é copiado via `COPY . .`,
portanto o pacote estará disponível como módulo no `WORKDIR /app`.

### 3. Alembic revision ID > VARCHAR(32)

A migration `20260607_ai_knowledge_admin_fields` tinha `revision = "20260607_ai_knowledge_admin_fields"` 
(34 chars). O Alembic 1.18.4 hardcoda `Column("version_num", String(32))` no `alembic/ddl/impl.py`
— não há parâmetro de configuração para isso.

**Solução**: `revision` encurtado para `"20260607_ai_knowledge"` (21 chars) na migration.
Nenhuma migração downstream referenciava o ID antigo. Mudança é puramente de metadado.

### 4. `FIELD_ENCRYPTION_KEY` ausente

O backend valida na startup a presença de uma chave Fernet válida. O `.env.docker.example`
incluía `FIELD_ENCRYPTION_KEY=your-base64-32-byte-key-change-this` (inválido).

**Solução documentada**: gerar chave válida antes de subir:
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## Resultado das validações

```
docker compose -f docker-compose.local.yml config          ✓ (sem erros de sintaxe)
docker compose build backend-api                           ✓
docker compose build frontend-staff                        ✓
docker compose build candidate-portal                      ✓
docker compose up -d postgres redis                        ✓ (ambos healthy)
docker compose run --rm backend-api alembic upgrade head   ✓ (34 migrações aplicadas)
docker compose up -d                                       ✓ (7 containers running)

curl http://localhost:8000/health   → 200
curl http://localhost:5173          → 200 (nginx SPA)
curl http://localhost:5174          → 200 (nginx SPA)
```

---

## Limitações / próximos passos para produção

| Item | Status |
|------|--------|
| HTTPS | Não — exige Nginx/Traefik com TLS na frente |
| Secrets management | `.env.docker` — não é Vault/Secrets Manager |
| Uploads persistentes | Sem volume mapeado para `/app/uploads` nesta fase |
| VITE_ vars baked-in | Mudanças exigem rebuild dos frontends |
| Workers em produção | Celery beat e worker precisam de monitoramento |
| Healthcheck frontend | Apenas nginx healthcheck implícito via docker |
| Database backup | Sem serviço de backup configurado |
| Scan de imagem | Sem Trivy/Grype configurado |

---

## Escopo preservado

- Sem alteração ao algoritmo de scoring
- Sem alteração ao Gemini/prompt/provider  
- Sem alteração ao ranking
- Sem alteração ao Protheus
- Sem alteração a telas
- Modo local sem Docker (`npm run dev:full`) continua funcionando
- Sem git add . / sem commit
