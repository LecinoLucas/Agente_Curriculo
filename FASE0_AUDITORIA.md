# Fase 0 — Auditoria e Limpeza Mínima

**Data**: 2026-05-13  
**Status**: EM EXECUÇÃO

---

## 1. Resumo do que foi encontrado

### 1.1 Convergência Correta (Backend → Frontend)

✅ **Pipeline ativo é a única fonte canônica**
- Backend: `CandidateJobPipelineModel` com constraints únicos (max 1 ativo por candidato)
- Backend: `current_analysis_id` referencia análise vinculada ao pipeline ativo
- Backend: `active_job_id` = `job_id` do pipeline ativo
- Frontend: `candidateActiveJobId` = `active_job_id` do backend (derivado do pipeline ativo)
- Conclusão: ✅ Contrato backend-frontend para vaga ativa está correto

✅ **Status/Score no backend está correto**
- `candidate_ranking_service.py`: Scores são sempre computados/fetched via pipeline ativo
- `source_analysis_id` no score sempre referencia `current_analysis_id` do pipeline
- Auto-repair em `get_ranking()` marca scores como stale se desalinhados de `current_analysis_id`
- Conclusão: ✅ Score sempre pertence à vaga ativa

### 1.2 Divergências Detectadas

#### Divergência 1: `latest_analysis` Global (CRÍTICA)

**Padrão legado encontrado**:
- Backend: Retorna `latest_analysis` no overview que é a análise mais recente de **qualquer vaga**
- Frontend: `analysisStatus.ts` usa `latest_analysis` para decidir UI state
- **Problema**: Se candidato tiver pipeline ativo em Vaga A mas `latest_analysis` é de Vaga B (concluída há dias), o UI pode mostrar estado desatualizado

**Exemplos de divergência**:
- Vaga A ativa (sem análise concluída) + Vaga B antiga (análise concluída há 3 dias)
  - Backend `latest_analysis` = Vaga B (completed)
  - Frontend mostra "Aderência pronta" (errado!)
  - Realidade = Aguardando análise da Vaga A

**Arquivos afetados**:
- `backend/src/application/services/candidate_service.py` (linha ~200): Retorna `latest_analysis` global
- `frontend/src/features/candidates/utils/analysisStatus.ts` (linha 29-35): Usa `latest_analysis` sem filtro de job
- `frontend/src/features/candidates/drawer/tabs/ScoreTab.tsx` (linha 122-125): Chama `getLatestAnalysisForActiveJob()` que **filtra corretamente**
- `frontend/src/features/candidates/drawer/tabs/OverviewTab.tsx` (linha 39-47): Usa `latest_analysis` sem filtro

**Avaliação de risco**:
- ⚠️ **MÉDIO**: Afeta UI state e podem levar a cliques em links de "análise pronta" que não existem na vaga ativa
- Impacto mínimo em funcionalidade crítica (ranking, scoring)

#### Divergência 2: Print solto no jobs.py

**Padrão encontrado**:
- `backend/src/interface/api/routers/jobs.py`: `print(f"RAW BULK IMPORT BODY: ...")` (SEM LOG ESTRUTURADO)
- Problema: Log de debug em production que não aparece em centralized logging

**Avaliação de risco**:
- 🟢 **BAIXO**: Apenas logging cosmético, não afeta lógica

#### Divergência 3: Legacy logging.getLogger no analysis_service.py

**Padrão encontrado**:
- `backend/src/application/services/analysis_service.py` (linha 45): `logger = logging.getLogger(__name__)`
- Projeto usa `structlog` em toda parte (e.g., `candidate_ranking_service.py`)
- Problema: Inconsistência, log pode não aparecer em centralized logging estruturado

**Avaliação de risco**:
- 🟢 **BAIXO**: Análise_service é pouco usada agora (ranking foi migrado para candidate_ranking_service)

#### Divergência 4: Uso de `latest_analysis` em OverviewTab

**Padrão encontrado**:
- `frontend/src/features/candidates/drawer/tabs/OverviewTab.tsx` (linhas 38-47): Mostra label de análise baseado em `latest_analysis` global
- Problema: Se vaga ativa é recente (sem análise) mas há análise velha de outra vaga, mostra label enganoso

**Avaliação de risco**:
- 🟡 **MÉDIO**: Afeta apenas UI display do status, mas pode confundir recruiter

---

## 2. Validação da Fonte Canônica (candidate_job_pipeline)

### ✅ Confirmado
- `candidate_job_pipeline` é **única fonte runtime** de vínculo candidato-vaga ativo
- Constraint único parcial garante max 1 ativo por candidato (index `uq_candidate_job_pipeline_one_active_per_candidate`)
- Todas as operações críticas (score, ranking, análise) usam `current_analysis_id` do pipeline

### ✅ Legado removido
- `candidate_job_links`: ✅ Dropped em migration `7e0b4c9d2f21`
- `resume_job_matches`: ✅ Dropped em migration `5c7e2a1b9d04`
- Nenhum import ativo desses modelos no código

### ⚠️ Legado documentado (audit-only)
- Eventos históricos em `candidate_job_pipeline_events` são apenas histórico
- `latest_analysis` no backend é apenas informativo, não define vaga ativa
- Confirmado: Frontend e backend **não usam** esses para decidir vaga ativa

---

## 3. Diagnóstico de Fluxo (admin_candidate_job_diagnostics_service.py)

✅ **Existe sistema de diagnóstico robusto que valida**:
- Active pipeline existe
- `current_analysis_id` do pipeline existe e está completo
- Score referencia `current_analysis_id` correto
- Match aponta para job_profile_analysis ativo
- Candidato está em ranking

Avaliação: ✅ Diagnóstico está correto e abrangente

---

## 4. Estado Canônico de Aderência (Frontend)

### Mensagens encontradas

| Mensagem | Arquivo | Origem | ✓/✗ |
|----------|---------|--------|-----|
| "Sem currículo" | analysisStatus.ts | `!hasResume` | ✅ Correto |
| "Aguardando vaga" | analysisStatus.ts | `!activeJobId` | ✅ Correto |
| "Aderência pronta" | analysisStatus.ts | `hasScore && normalizedStatus === "completed"` | ⚠️ Usa `latest_analysis` global |
| "Analisando com IA" | analysisStatus.ts | `normalizedStatus === "pending"\|"processing"` | ⚠️ Usa `latest_analysis` global |
| "Falha na análise" | analysisStatus.ts | `normalizedStatus === "failed"` | ⚠️ Usa `latest_analysis` global |
| "Limite temporário" | analysisStatus.ts | `normalizedStatus === "retry_scheduled"` | ⚠️ Usa `latest_analysis` global |

**Problema**: Função `buildCandidateAnalysisSummary()` chama `getLatestAnalysisForActiveJob()` que **filtra corretamente**, mas ainda assim a lógica em `getCandidateAnalysisUiState()` pode usar análise de vaga **diferente** se `latestAnalysis` for de outra vaga.

---

## 5. Testes Existentes Relevantes

### Backend
- ✅ `test_candidate_portal_and_public_analysis.py`: Valida fluxo end-to-end
- ✅ `test_assessments.py`: Testa linking candidates
- ✅ `test_job_structural_fields.py`: Testa validação de campos
- Faltam testes específicos de:
  - ⚠️ Análise global vs análise de vaga ativa
  - ⚠️ Score stale detection
  - ⚠️ Candidato sem vaga (aguardando vaga)

### Frontend
- ✅ `ScoreTab.test.tsx`: Testa rendering do score
- ✅ `OverviewTab.test.tsx`: Testa rendering overview
- Faltam testes de:
  - ⚠️ analysisStatus com vaga ativa vs análise velha
  - ⚠️ Comportamento quando candidato sem vaga

---

## 6. Próximas Ações (Fase 0)

### ✅ Já Correto (não mexer)
1. Pipeline ativo como fonte canônica
2. Score sempre tied a vaga ativa
3. Contrato backend-frontend para `active_job_id`
4. System diagnóstico funcionando

### 🔧 Corrigir Agora (Fase 0)
1. **Remover print solto** em `jobs.py`
2. **Migrar logger** em `analysis_service.py` para `structlog`
3. **Corrigir analysisStatus.ts** para usar sempre análise filtrada por `activeJobId`
4. **Corrigir OverviewTab.tsx** para não usar `latest_analysis` sem filtro

### 📝 Apenas Mapear (para Fase 1)
1. Revisar se `latest_analysis` global ainda é necessário no overview
2. Se não, remover do backend
3. Considerar consolidar `latest_analysis` como sempre-for-active-job

---

## 7. Riscos Restantes

- 🟡 Candidato pode ver "Aderência pronta" quando análise é de vaga antiga
- 🟢 Logging cosmético em production (jobs.py print)
- 🟢 Inconsistência de logger (analysis_service.py)

Nenhum risco crítico na lógica de negócio (pipeline, score, ranking).

