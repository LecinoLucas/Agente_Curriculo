# DEPLOY-DOCKER-FULL-SCRIPT-AUDIT-1

Data: 2026-06-10

---

## Objetivo

Criar `scripts/docker-full.sh` que automatiza o startup completo do stack Docker local,
com flags `--build`, `--fresh`, `--skip-bootstrap`, `--logs`. Adicionar `npm run docker:full`
ao root `package.json`. Atualizar `docs/deploy/DOCKER_LOCAL.md`.

---

## Auditoria: scripts existentes

### `scripts/dev-full.sh` (`npm run dev:full`)

Modo **sem Docker** — sobe serviços diretamente no host:
- Valida repo root via `validate-repo-root.js`
- Instala dependências (stamps em `node_modules/.deps-stamp`, `.venv/.deps-stamp`)
- Modes: `--local` (127.0.0.1), `--network` (0.0.0.0 + IP da LAN)
- Opções: `--no-candidate`, `--no-celery`
- Sobe backend (uvicorn), frontend-staff (Vite), candidate-portal (Vite), celery-worker/beat
- Usa `concurrently` para gerenciar processos

### `backend/scripts/bootstrap_dev.py`

- `ROOT_DIR = Path(__file__).resolve().parents[1]` → resolve para `/app` dentro do container
- `SAFE_DEV_HOSTS` inclui `"postgres"` → compatível com hostname do Docker
- `load_dotenv(ROOT_DIR / ".env", override=False)` → usa env vars já injetadas pelo `env_file:`
- Roda `alembic upgrade head` internamente
- Seeds idempotentes: AI Models, Scoring Version, Admin Dev, Skill Catalog, Áreas de vagas, Vagas demo
- Flags: `--skip-jobs`, `--verbose`

### `docker-compose.local.yml`

- 7 serviços: postgres, redis, backend-api, celery-worker, celery-beat, frontend-staff, candidate-portal
- `x-backend-common` anchor: contexto `./backend`, `env_file: .env.docker.local`
- Healthchecks em postgres, redis, backend-api
- `backend-api` expõe `:8000`, frontends expõem `:5173` e `:5174`

---

## Arquivos criados/alterados

| Arquivo | Operação | Descrição |
|---------|----------|-----------|
| `scripts/docker-full.sh` | Criado | Script principal com 8 etapas |
| `package.json` (root) | Alterado | Adicionado `"docker:full"` |
| `docker-compose.local.yml` | Alterado | `env_file` trocado de `.env.docker` → `.env.docker.local` |
| `docs/deploy/DOCKER_LOCAL.md` | Alterado | Seção de início rápido + opções do script |

---

## Fluxo do `docker-full.sh`

```
1. validate-repo-root.js          (garante execucao no raiz do repo)
2. Verificar .env.docker.local
   ├── se ausente + .env.docker existe → cp (compat fase anterior)
   ├── se ausente + .env.docker.example → cp + aviso
   └── se ausente + nenhum template → exit 1
3. [--fresh] down -v --remove-orphans (com confirmacao interativa ou CONFIRM_FRESH=1)
4. [--build] docker compose build
5. up -d --wait postgres redis     (aguarda healthchecks)
6. [sem --skip-bootstrap] run --rm backend-api python scripts/bootstrap_dev.py
7. up -d                           (sobe stack completa)
8. Poll curl http://localhost:8000/health/live (max 30 tentativas × 2s)
9. Sumario com URLs e comandos uteis
10. [--logs] docker compose logs -f
```

---

## Idempotência

- **Segunda execução sem `--fresh`**: `up -d` é idempotente (containers já rodando ficam intactos).
  `bootstrap_dev.py` verifica existência antes de criar (alembic já aplicado = no-op; admin já existe = no-op).
- **`--fresh`**: destrói e recria — intencionalmente destrutivo, protegido por confirmação.
- **`--build`**: reconstrói imagens, recria containers com nova imagem.

---

## `.env.docker.local` e gitignore

A entrada `.env.*` na linha 30 do `.gitignore` já cobre `.env.docker.local` (e `.env.docker`).
Não foi necessário adicionar entrada redundante. Verificado com `git check-ignore -v`.

---

## Compatibilidade retroativa

- `npm run dev:full` (sem Docker) continua funcionando sem alteração.
- `.env.docker` (fase anterior) ainda é lido pelo script como fallback ao criar `.env.docker.local`.
- A renomeação `env_file: .env.docker` → `.env.docker.local` no compose file é safe porque:
  - `.env.docker` não estava versionado (coberto por `.env.*`)
  - `.env.docker.local` é criado automaticamente pelo script se ausente

---

## Escopo preservado

- Sem alteração ao algoritmo de scoring
- Sem alteração ao Gemini/prompt/provider
- Sem alteração ao ranking
- Sem alteração ao Protheus
- Sem alteração a telas
- Sem git add . / sem commit
- Sem seed novo (reutiliza `bootstrap_dev.py` existente)
- Sem secret real versionado
