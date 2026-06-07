# Plano de Riscos e Correções (Risks & Fix Plan)

**Data:** 07/06/2026

Nenhuma destas correções deve ser aplicada nesta etapa, pois estamos apenas documentando. 

## 1. Correções Obrigatórias Antes de Produção (Blockers)

| Risco | Classificação | Área | Ação Exigida |
|-------|---------------|------|--------------|
| **Furo de Upload Anônimo** | CRÍTICO | Segurança | Exigir camada de identidade vinculada ao dono da sessão no `POST /api/v1/conversations/{session_id}/resume`. Adicionar Rate-Limit e Auth. |
| **Sentry Phantom (Morto)** | CRÍTICO | Deploy / Obs. | Inicializar formalmente `sentry_sdk.init()` logo no boot do `main.py` e passar DSN para ter trace error coverage. |
| **Testes Quebrados UI** | CRÍTICO | Frontend | Investigar as 9 falhas ativas de assert no `JobAiDraftPanel.test.tsx`. Consertar mocks ou a renderização. |
| **Worktree Sujo e Impl** | CRÍTICO | Git/UX | Lidar com as alterações soltas no `PreAdmissionChecklistsPage` e `aiAssistantSiteMap.ts` antes de criar a release ou dar tag final. |
| **Dockerfiles sem .dockerignore** | ALTO | Deploy | Adicionar a instrução multi-stage tirando caches do `node_modules`, `.venv`, `.git` do bundle e trocando root user para `nobody`. Fazer deploy das imagens limpadas. |
| **Chave Fernet Hardcoded** | ALTO / MÉDIO | Segurança | Remover fallback de plain text (`cuZ9...`) e forçar erro para qualquer ambiente ou documentar rigorosamente em CI/CD a inclusão da chave. |

## 2. Correções Recomendadas

| Risco | Classificação | Área | Ação Exigida |
|-------|---------------|------|--------------|
| **Redis Health Liveness** | ALTO | Deploy / Obs. | Acoplar a checagem do Ping do redis ao `/health` e não apenas o PostgresSQL para não mascarar incidentes em Celery Queues. |
| **Poetry vs Pip dev** | ALTO | Deploy | Decidir uniformidade entre contêiner e ambiente de desenvolvimento (Docker usa Poetry, dev usa pip install). O ideal seria lockfiles compartilhados. |
| **Ausência do Candidate CI** | ALTO | Deploy/Testes | Adicionar o job de node.js build para o `/candidate-portal` dentro do `.github/workflows/ci.yml`. |
| **Arquivos Desnecessários** | MÉDIO | Segurança | Adicionar `*.dump`, `error.log` e `dump.rdb` no `.gitignore` global de imediato para expurgar vazamentos silenciosos da máquina do desenvolvedor. |
| **ClamAV Desativado** | MÉDIO | Segurança | Estudar habilitar em Produção caso a VM consiga suportar a flag `FILE_SCAN_ENABLED`. |

## 3. Melhorias Futuras (Backlog)
- Exclusão do CPF (`admission_package_service`) em logs sensíveis via auditoria.
- Centralizar instruções num `README.md` base.
- Criar infraestrutura de pipelines de CD.
