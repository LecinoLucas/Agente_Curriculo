# HARDENING_SEQUENCE

## Objetivo

Preparar uma sequencia de execucao segura para os bloqueadores de producao identificados na auditoria `PROD-READINESS-AUDIT-1`, sem misturar com a trilha de UI/admin ja aberta no worktree.

## Principios

- nao corrigir tudo ao mesmo tempo
- comecar por isolamento e reducao de ruido
- atacar primeiro o que bloqueia seguranca e confiabilidade basica
- validar por teste a cada etapa
- manter mudancas pequenas e revertiveis

## Sequencia Recomendada

### 1. Isolar ou finalizar a documentacao/UI ja concluida

Objetivo:

- impedir que hardening seja misturado com `KnowledgeAdminPage`, `PreAdmissionChecklistsPage` e assistente IA

Saida esperada:

- worktree mais previsivel
- menos risco de conflito de stage/commit acidental

### 2. Proteger dumps, backups e artefatos locais

Arquivos provaveis:

- `.gitignore`
- `.dockerignore`

Escopo:

- ignorar `dump.rdb`
- ignorar `backup_*.dump`
- ignorar `.coverage*`
- ignorar logs locais relevantes

Risco mitigado:

- vazamento acidental de artefatos locais
- build/contexto Docker contaminado

### 3. Corrigir testes do frontend em `JobAiDraftPanel`

Arquivos provaveis:

- `frontend/src/features/jobs/__tests__/JobAiDraftPanel.test.tsx`
- `frontend/src/features/jobs/components/JobAiDraftPanel.tsx`
- mocks/helpers relacionados

Razao da ordem:

- reduzir falso negativo no CI antes de mudar backend/seguranca

### 4. Corrigir upload anonimo de resume

Arquivos provaveis:

- `backend/src/interface/api/routers/conversation_upload.py`
- testes de integracao relacionados

Objetivo:

- exigir protecao/validacao adequada no endpoint `POST /api/v1/conversations/{session_id}/resume`

### 5. Inicializar Sentry

Arquivos provaveis:

- `backend/src/interface/api/main.py`
- `backend/src/core/settings.py`

Objetivo:

- ativar observabilidade minima em producao

### 6. Adicionar Redis ao healthcheck

Arquivos provaveis:

- `backend/src/interface/api/main.py`
- servicos/schemas/health relacionados

Objetivo:

- refletir dependencia real de execucao no estado de saude

### 7. Colocar Candidate Portal no CI

Arquivos provaveis:

- `.github/workflows/ci.yml`
- scripts de teste/build relacionados

Objetivo:

- evitar regressao silenciosa em uma superficie publica

### 8. Docker hardening

Arquivos provaveis:

- `backend/docker/api.Dockerfile`
- `backend/docker/worker.Dockerfile`
- `.dockerignore`

Objetivo:

- remover execucao root desnecessaria
- reduzir superficie e contexto de build
- evoluir para imagem mais segura e enxuta

### 9. Revisao de CPF/payload plain

Arquivos provaveis:

- servicos de admission package e logs relacionados

Objetivo:

- confirmar se dados sensiveis estao sendo trafegados/logados sem redacao adequada

## Ordem Alternativa Nao Recomendada

Evitar começar por Docker hardening ou CI antes de resolver:

- artefatos locais ruidosos
- base de testes instavel
- endpoint de upload anonimo

Isso tende a aumentar ruido e esconder a prioridade de seguranca.

## Criterio de Entrada para a Fase 1

A fase de correcoes deve comecar quando pelo menos estas condicoes estiverem claras:

- trilha de UI em andamento nao sera misturada com hardening
- dumps/backups/logs locais estao mapeados
- arquivos provaveis do hardening estao identificados
- existe sequencia de execucao para nao quebrar validacao

## Criterio de Saida desta Fase 0

Esta fase termina corretamente quando:

- o worktree foi triado
- os grupos de arquivo foram separados
- a sequencia de execucao foi documentada
- nenhum codigo de producao foi alterado
