# WORKTREE_TRIAGE

## Resumo

Esta fase nao corrige bloqueadores de producao. O objetivo aqui foi apenas mapear o estado atual do worktree, separar trilhas de mudanca e reduzir risco de conflito antes do hardening.

Status observado:

- o worktree atual esta sujo
- as mudancas locais ativas estao concentradas em UI/admin e assistente IA
- os arquivos provaveis do hardening backend/Docker/CI ainda nao aparecem como alterados localmente
- existem artefatos locais sensiveis/ruidosos no repositorio (`dump.rdb`, `backup_*.dump`, `.coverage*`, logs)

## Git Status Completo

Comando:

```bash
git status
```

Resultado:

```text
On branch save/behavioral-ai-and-wips
Your branch is ahead of 'origin/save/behavioral-ai-and-wips' by 18 commits.

Changes to be committed:
  modified:   frontend/src/pages/KnowledgeAdminPage.tsx
  modified:   frontend/src/pages/PreAdmissionChecklistsPage.tsx
  new file:   frontend/src/pages/PreAdmissionChecklistsPage.tsx.bak
  modified:   frontend/src/pages/__tests__/KnowledgeAdminPage.test.tsx
  modified:   frontend/src/pages/__tests__/PreAdmissionChecklistsPage.test.tsx

Changes not staged for commit:
  modified:   frontend/src/features/ai-assistant/__tests__/AiAssistantDrawer.test.tsx
  modified:   frontend/src/features/ai-assistant/utils/aiAssistantIntentClassifier.ts
  modified:   frontend/src/pages/PreAdmissionChecklistsPage.tsx
  modified:   frontend/src/pages/__tests__/PreAdmissionChecklistsPage.test.tsx

Untracked files:
  .design/prod-readiness-audit-1/
  .design/ui-admin-framework-1/
  frontend/src/features/ai-assistant/utils/aiAssistantSiteMap.test.ts
  frontend/src/features/ai-assistant/utils/aiAssistantSiteMap.ts
```

Tambem foi executado:

```bash
git status --short
```

Resultado:

```text
 M frontend/src/features/ai-assistant/__tests__/AiAssistantDrawer.test.tsx
 M frontend/src/features/ai-assistant/utils/aiAssistantIntentClassifier.ts
M  frontend/src/pages/KnowledgeAdminPage.tsx
MM frontend/src/pages/PreAdmissionChecklistsPage.tsx
A  frontend/src/pages/PreAdmissionChecklistsPage.tsx.bak
M  frontend/src/pages/__tests__/KnowledgeAdminPage.test.tsx
MM frontend/src/pages/__tests__/PreAdmissionChecklistsPage.test.tsx
?? .design/prod-readiness-audit-1/
?? .design/ui-admin-framework-1/
?? frontend/src/features/ai-assistant/utils/aiAssistantSiteMap.test.ts
?? frontend/src/features/ai-assistant/utils/aiAssistantSiteMap.ts
```

## Arquivos Agrupados

### Grupo A - PROD-HARDENING

Arquivos provaveis do hardening:

- `backend/src/interface/api/routers/conversation_upload.py`
- `backend/src/interface/api/main.py`
- `backend/src/core/settings.py`
- `backend/docker/api.Dockerfile`
- `backend/docker/worker.Dockerfile`
- `.dockerignore`
- `.gitignore`
- `.github/workflows/ci.yml`
- `frontend/src/features/jobs/__tests__/JobAiDraftPanel.test.tsx`
- `frontend/src/features/jobs/components/JobAiDraftPanel.tsx`
- arquivos de testes relacionados

Estado atual no worktree:

- nenhum desses arquivos aparece alterado localmente neste momento
- isso e bom para iniciar hardening, mas a trilha ainda nao esta isolada

Arquivos dentro do escopo do hardening:

- todos os listados acima

### Grupo B - UI em andamento

Arquivos localmente alterados/ativos:

- `frontend/src/pages/KnowledgeAdminPage.tsx`
- `frontend/src/pages/PreAdmissionChecklistsPage.tsx`
- `frontend/src/pages/PreAdmissionChecklistsPage.tsx.bak`
- `frontend/src/pages/__tests__/KnowledgeAdminPage.test.tsx`
- `frontend/src/pages/__tests__/PreAdmissionChecklistsPage.test.tsx`
- `frontend/src/features/ai-assistant/__tests__/AiAssistantDrawer.test.tsx`
- `frontend/src/features/ai-assistant/utils/aiAssistantIntentClassifier.ts`
- `frontend/src/features/ai-assistant/utils/aiAssistantSiteMap.ts`
- `frontend/src/features/ai-assistant/utils/aiAssistantSiteMap.test.ts`
- `.design/ui-admin-framework-1/`

Fora do escopo do hardening:

- todos os itens acima, exceto se alguma correcao critica depender diretamente deles

### Grupo C - Job AI / backend IA

Arquivos esperados nessa trilha:

- `backend/src/ai_orchestration/jobs/job_ai_draft_graph.py`
- `backend/src/ai_orchestration/jobs/job_ai_draft_state.py`
- `backend/src/application/services/job_ai_draft_service.py`
- `backend/src/interface/api/routers/jobs.py`
- `backend/src/interface/api/schemas/job_schemas.py`
- `frontend/src/features/jobs/components/JobAiDraftPanel.tsx`
- `frontend/src/features/jobs/services/jobAiDraftService.ts`

Estado atual no worktree:

- nenhum desses arquivos aparece alterado localmente neste snapshot
- isso nao invalida a auditoria anterior; apenas indica que o estado atual do checkout nao esta carregando mudancas locais nesses caminhos

### Grupo D - lixo/risco local

Arquivos encontrados:

- `dump.rdb`
- `backend/backup_antes_ai_credentials_20260524_1947.dump`
- `backend/.coverage 2`
- `backend/.coverage 3`
- `backend/error.log`
- `frontend/test_output.log`

Observacoes:

- sao artefatos locais e sensiveis/ruidosos
- representam risco operacional e aumentam a chance de vazamento acidental ou ruido em review/build
- ainda nao foram alterados nesta fase

## Auditorias Sem Alterar Codigo

### `.gitignore` / `.dockerignore`

Comando:

```bash
grep -R "dump.rdb\|backup_.*\.dump\|\.env" .gitignore .dockerignore -n || true
```

Resultado:

```text
grep: .dockerignore: No such file or directory
.gitignore:8:.env
.gitignore:9:.env.local
.gitignore:10:.env.development
.gitignore:11:.env.production
.gitignore:12:backend/.env
.gitignore:13:frontend/.env
.gitignore:29:.env
.gitignore:30:.env.*
.gitignore:31:!.env.example
.gitignore:32:!.env.test.example
.gitignore:33:!.env.homolog.example
```

Leitura:

- `.gitignore` ja cobre `.env`
- nao ha evidencia de ignore para `dump.rdb` ou `backup_*.dump`
- nao existe `.dockerignore` na raiz no estado atual

### Sentry

Comando:

```bash
grep -R "SENTRY_DSN\|sentry_sdk.init" backend/src backend/tests -n || true
```

Resultado relevante:

```text
backend/src/core/settings.py:156:    SENTRY_DSN: str = ""
```

Leitura:

- ha configuracao para `SENTRY_DSN`
- nao apareceu inicializacao de `sentry_sdk.init` no backend pesquisado

### Upload de resume por conversa

Comando:

```bash
grep -R "conversation.*resume\|session_id.*resume" backend/src backend/tests -n || true
```

Resultado relevante:

```text
backend/src/interface/api/routers/conversation_upload.py:79:@router.post("/{session_id}/resume", status_code=200)
backend/src/interface/api/routers/conversation_upload.py:80:async def upload_conversation_resume(
backend/tests/integration/test_conversation_endpoints.py:370:        f"/api/v1/conversations/{session_id}/resume",
backend/tests/integration/test_conversation_endpoints.py:380:        f"/api/v1/conversations/{uuid4()}/resume",
```

Leitura:

- o endpoint alvo esta claramente localizado
- a trilha de teste correspondente tambem existe

### Redis

Comando:

```bash
grep -R "Redis\|redis" backend/src/interface/api backend/src/core backend/tests -n || true
```

Resultado relevante:

```text
backend/src/interface/api/main.py:24:from src.infrastructure.cache.redis_client import close_redis
backend/src/interface/api/main.py:90:    await close_redis()
backend/src/core/settings.py:35:    REDIS_URL: str = "redis://localhost:6379/0"
backend/src/interface/api/schemas/system_health_schemas.py:53:    redis: ComponentStatusResponse
backend/src/interface/api/schemas/system_health_schemas.py:106:    redis: ComponentStatusResponse
backend/tests/unit/test_production_preflight.py:106:def test_check_redis_url_requires_redis_unless_skipped(monkeypatch: pytest.MonkeyPatch) -> None:
backend/tests/integration/test_admin_notifications.py:49:async def test_redis_down_generates_critical_alert(
```

Leitura:

- Redis existe como dependencia estrutural
- ha esquemas/testes relacionados a health/preflight/alerta
- isso sugere que a correcao de healthcheck pode ser localizada sem ampla refatoracao

## Riscos de Conflito

- `PreAdmissionChecklistsPage.tsx` e seu teste estao com `MM`, ou seja, ha alteracoes staged e unstaged no mesmo arquivo
- `KnowledgeAdminPage.tsx` ja esta staged, entao qualquer operacao global de staging/commit pode misturar UI com hardening
- existe trilha paralela em assistente IA ainda aberta
- a ausencia de `.dockerignore` e a presenca de dumps/logs tornam facil empacotar lixo local por acidente quando a trilha Docker comecar
- o branch local esta 18 commits a frente do remoto; qualquer publicacao apressada mistura assuntos

## Recomendacao de Sequencia

1. Isolar ou finalizar a trilha de UI/documentacao ja em andamento antes de tocar hardening.
2. Proteger artefatos locais (`dump.rdb`, `backup_*.dump`, `.coverage*`, logs) via `.gitignore` e `.dockerignore` em uma fase dedicada do hardening.
3. Corrigir a base de testes do frontend afetada por `JobAiDraftPanel` antes de mexer em seguranca/backend.
4. Corrigir o upload anonimo em `conversation_upload.py` com cobertura de teste.
5. Inicializar Sentry no backend.
6. Incluir Redis no healthcheck de producao.
7. Colocar Candidate Portal no CI.
8. Fazer Docker hardening.
9. Revisar CPF/payload plain em `admission_package_service`.

## Conclusao

O repositório esta em estado utilizavel para iniciar o hardening, mas nao em estado seguro para misturar trilhas. A prioridade desta fase nao e corrigir, e sim evitar colisao entre:

- UI/admin em andamento
- assistente IA em andamento
- futuro hardening backend/Docker/CI

A proxima fase segura deve partir de uma trilha limpa ou explicitamente isolada.
