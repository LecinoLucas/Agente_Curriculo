# LOCAL_ARTIFACT_PROTECTION

## Objetivo

Reduzir risco de vazamento acidental de artefatos locais e impedir que eles entrem no contexto de build do Docker ou em futuros commits por engano.

## Worktree

Esta fase encontrou alteracoes pendentes fora do escopo, principalmente em UI/admin e assistente IA. Nenhum desses arquivos foi tocado aqui.

## Arquivos de risco encontrados

- `dump.rdb`
- `backend/backup_antes_ai_credentials_20260524_1947.dump`
- `backend/.coverage 2`
- `backend/.coverage 3`
- `backend/error.log`
- `frontend/test_output.log`
- `frontend/src/pages/PreAdmissionChecklistsPage.tsx.bak`
- `backend/test_transfer.db`
- `backend/test_run.db`

## Regras adicionadas ao `.gitignore`

- `dump.rdb`
- `**/dump.rdb`
- `backup_*.dump`
- `**/backup_*.dump`
- `*.dump`
- `**/*.dump`
- `*.bak`
- `**/*.bak`
- `*.sqlite`
- `**/*.sqlite`
- `*.db`
- `**/*.db`
- `.coverage*`
- `**/.coverage*`
- `*.log`
- `**/*.log`
- `test_output.log`
- `**/test_output.log`

## Regras adicionadas ao `.dockerignore`

Foi criado um `.dockerignore` na raiz com exclusao para:

- Git metadata e segredos locais (`.git`, `.env`, `**/.env*`)
- dependencias e caches (`node_modules`, `.venv`, `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`)
- artefatos de coverage (`.coverage`, `.coverage*`, `htmlcov`)
- artefatos de build (`dist`, `build`, `.vite`)
- arquivos locais ruidosos/sensiveis (`dump.rdb`, `backup_*.dump`, `*.dump`, `*.bak`, `*.sqlite`, `*.db`, `*.log`, `test_output.log`)

## Por que isso reduz risco

- impede que dumps, backups e logs locais sejam enviados acidentalmente para o contexto de build do Docker
- reduz chance de commit acidental de artefatos locais e sensiveis
- evita crescimento desnecessario do contexto de build
- reduz ruido operacional no repositorio

## Aviso importante

Os arquivos locais existentes nao foram removidos nesta fase.

Eles continuam presentes no disco e devem ser:

- removidos manualmente, ou
- movidos para fora do repositorio

Esta fase alterou apenas regras preventivas para evitar reincidencia.
