# WORKTREE_AUDIT - REPO-HYGIENE-CHECKPOINT-1

Relatório de auditoria do estado atual do repositório, classificando alterações pendentes (commits locais e stashes) e propondo um plano de limpeza e organização.

## Estado Geral
- **Branch atual**: `save/behavioral-ai-and-wips`
- **Status**: Limpo (nada pendente no worktree/staged).
- **Sincronização**: À frente de `origin/save/behavioral-ai-and-wips` por 11 commits.
- **Stashes**: 9 stashes detectados, contendo WIPs de diversas fases.

## Últimos 11 Commits (Locais)
| Commit | Mensagem | Área |
| :--- | :--- | :--- |
| `a204d4ca` | docs(job-form): document skills subtabs validation | Frontend (Docs) |
| `2f75d3e7` | chore: checkpoint workspace before skills subtabs | **Misto (Backend, Frontend, Infra)** |
| `04ef401e` | docs: add ADVPL specific guidelines and skills | Docs/Skills |
| `78c09b41` | fix(ux): add matching recalculation CTA to candidate profile | Frontend |
| `beec2094` | fix(jobs): allow retrying failed/cancelled analyses | Backend (Tests/Policy) |
| `4801f159` | fix(dev): ensure Vite ports are free before starting | Scripts/Frontend |
| `449c51ab` | fix(jobs): retry failed analyses from smart refresh | Backend/Frontend |
| `d9d35292` | fix(jobs): classify legacy incomplete analyses | Backend/Frontend/Tests |
| `dad50548` | fix(dev): validate Vite module readiness | Scripts/Frontend/E2E |
| `efd22864` | fix(dev): canonicalize local host usage | Scripts/Frontend |
| `5b0765e5` | chore(dev): block scripts outside canonical repository | Scripts |

## Mapeamento de Diffs (Commits Locais + Stashes)

### A. Prontos para Commit (ou Re-organização)
- **Sub-abas de Skills**: Commits `a204d4ca` e parte do `2f75d3e7`.
- **Job AI Draft UX**: Parte do `2f75d3e7` (inclui `IMAGE_MODE_UX_FIX.md`).
- **Smart Refresh de Vagas**: Commits `beec2094`, `449c51ab`, `d9d35292`.
- **Melhorias de Dev/Vite**: Commits `4801f159`, `dad50548`, `efd22864`, `5b0765e5`.
- **Pipeline Header (Stash)**: `stash@{0}` contém ajustes de layout no header da `PipelinePage.tsx`.

### B. Fora do Escopo (Misturados no commit 2f75d3e7)
- **Backend API/Services**: Migrações, serviços de catálogo e testes em `backend/`.
- **Candidate Portal Docker**: Arquivos de infra em `candidate-portal/`.
- **Docker Local**: `docker-compose.local.yml` e scripts relacionados.

### C. Arquivos Perigosos (Ignorados mas presentes)
- `.coverage` / `backend/.coverage`
- `backend/test.db` / `test.db`
- `dump.rdb` (não detectado no momento, mas listado como risco)

### D. Arquivos não rastreados
- Nenhum (worktree 100% limpo conforme `git ls-files`).

---

## Plano de Commits Sugerido (Interactive Rebase)

Para organizar o histórico antes das próximas features, sugere-se realizar um `git rebase -i origin/save/behavioral-ai-and-wips` e quebrar o commit "MEGA" `2f75d3e7`.

### Commit 1: Infra & Docker
- `docker-compose.local.yml`
- `scripts/docker-full.sh`
- `candidate-portal/Dockerfile`
- `backend/Dockerfile`
- `backend/.dockerignore`

### Commit 2: Backend - Skill Catalog & Normalization
- `backend/src/application/services/skill_catalog_normalizer.py`
- `backend/src/application/services/skill_catalog_service.py`
- `backend/src/infrastructure/database/models/skill_catalog_model.py`
- `backend/tests/integration/test_skill_catalog_api.py`

### Commit 3: Frontend - Job AI Draft Image UX
- `frontend/src/features/jobs/components/JobAiDraftPanel.tsx` (parte de imagem)
- `.design/job-ai-fix-2b/IMAGE_MODE_UX_FIX.md`

### Commit 4: Frontend - Skills Subtabs Redesign
- `frontend/src/features/jobs/components/CreateSkillModal.tsx`
- `frontend/src/features/jobs/components/EditSkillModal.tsx`
- `.design/job-form-skills-subtabs-1/SKILLS_SUBTABS_REPORT.md`

---

## Validação Recomendada

### Frontend
```bash
cd frontend && npx tsc --noEmit
cd frontend && npm run test -- --run JobFormPage
cd frontend && npm run test -- --run PipelinePage
```

### Backend
```bash
cd backend && .venv/bin/pytest tests/unit/test_smart_refresh_use_case.py
cd backend && .venv/bin/pytest tests/integration/test_skill_catalog_api.py
```

---

## Riscos
- **Commit 2f75d3e7 atomicity**: Este commit mistura infra, backend e frontend. Se houver um revert necessário em uma área, afetará as outras.
- **Stashes acumulados**: Existem 9 stashes que podem conter código conflitante com os commits recentes. Recomenda-se limpar stashes antigos.

---

## Confirmações
- **Código de produção alterado nesta fase**: NÃO (apenas auditoria).
- **Commit realizado**: NÃO.
- **Arquivos descartados**: NÃO.
- **Backend detectado**: SIM (no histórico local).
- **Candidate Portal detectado**: SIM (no histórico local).

**Status final: CONCLUÍDO**
Relatório gerado e diffs locais classificados.
