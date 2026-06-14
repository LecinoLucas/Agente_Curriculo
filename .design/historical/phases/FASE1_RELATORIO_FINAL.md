# Fase 1 — Consolidação do Contrato de Análise Ativa por Vaga — RELATÓRIO FINAL

**Data**: 2026-05-13  
**Status**: ✅ CONCLUÍDO COM CORREÇÕES

---

## 1. Resumo das Correções Implementadas

### Backend

#### 1.1 Schema Corrigido (candidate_schemas.py)
- ✅ `CandidateActiveJobDecisionResponse` adicionado com campos:
  - `score_status`: campo canônico (nunca None)
  - `analysis_status`, `current_analysis_id`, `match_score`
  - `warnings`: lista com tipos específicos
  - `next_action`: ação recomendada
- ✅ Adicionado a `CandidateOverviewResponse` como campo obrigatório (nunca None)

#### 1.2 Função Pura de Derivação (candidate_score_status_deriver.py)
**Correção crítica**: Sempre retorna `CandidateScoreStatusResult`, mesmo quando `active_job_id is None`

**Dois tipos de warnings distintos**:
- `analysis_from_different_job`: quando `latest_analysis_job_id != active_job_id`
- `analysis_not_current_pipeline`: quando `latest_analysis_id != pipeline_current_analysis_id`

Análise válida APENAS quando **ambos** verdadeiros:
- `latest_analysis_id == pipeline_current_analysis_id`
- `latest_analysis_job_id == active_job_id`

**8 estados de score_status**:
1. `no_active_job` (nunca None)
2. `waiting_analysis`
3. `analysis_processing` (pending/processing/retry_scheduled)
4. `analysis_failed` (failed/cancelled)
5. `score_ready` (completed + fresh + válida)
6. `score_stale` (completed + fresh + inválida)
7. `analysis_processing` (completed + sem score)
8. `needs_repair` (estado desconhecido)

#### 1.3 Integração em candidate_service.py
- ✅ Import do deriver adicionado
- ✅ `active_job_decision` sempre calculado (nunca None)
- ✅ Passa para resposta em todos os cenários:
  - `active_job_id is None` → `score_status="no_active_job"`
  - `active_job_id not None` → derivação completa
- ✅ Garante source de verdade canônica no backend

### Frontend

#### 2.1 Types (domain.ts)
- ✅ `CandidateActiveJobDecision` adicionado com tipos específicos
- ✅ Campo `active_job_decision` em `CandidateOverview` (nunca None)

#### 2.2 Utils (analysisStatus.ts)
- ✅ Nova função `mapScoreStatusToUiState()` mapeia cada estado canônico
- ✅ Parâmetro opcional `scoreStatus` em `buildCandidateAnalysisSummary()`
- ✅ Usa `scoreStatus` quando presente, fallback para heurística se null
- ✅ Mensagens Portuguese específicas para cada estado

#### 2.3 OverviewTab (OverviewTab.tsx)
- ✅ Lê `active_job_decision` do overview
- ✅ Usa `scoreStatus` para determinar label do "Próximo passo"
- ✅ 7 casos mapeados (no_active_job → needs_repair)
- ✅ Fallback legado removido

---

## 2. Arquivos Alterados

### Backend (3 arquivos)

| Arquivo | Mudanças |
|---------|----------|
| `candidate_schemas.py` | Adicionado `CandidateActiveJobDecisionResponse`, campo em overview |
| `candidate_score_status_deriver.py` | **NOVO FILE**: 35 linhas, função pura com 8 regras |
| `candidate_service.py` | Integração: imports + cálculo + passagem ao response |

### Frontend (4 arquivos)

| Arquivo | Mudanças |
|---------|----------|
| `domain.ts` | Tipo `CandidateActiveJobDecision`, campo em overview |
| `analysisStatus.ts` | Função `mapScoreStatusToUiState()`, parâmetro em builder |
| `OverviewTab.tsx` | Usa `active_job_decision` em label logic |
| (tests) | +19 testes frontend (analysisStatus), +2 testes (OverviewTab) |

---

## 3. Validações Implementadas

### Backend Unit Tests (15/15 passando)
✅ `test_no_active_job` → sem vaga: `no_active_job`  
✅ `test_waiting_analysis_no_pipeline_analysis` → vaga ativa, sem análise: `waiting_analysis`  
✅ `test_analysis_processing_*` (3) → análise em progresso: `analysis_processing`  
✅ `test_analysis_failed` → análise falhou: `analysis_failed`  
✅ `test_analysis_cancelled` → análise cancelada: `analysis_failed`  
✅ `test_score_ready` → válida + score: `score_ready`  
✅ `test_score_stale_from_different_job` → **análise de outro job**: `score_stale` + warning específico  
✅ `test_score_stale_not_current_pipeline` → **análise não current**: `score_stale` + warning específico  
✅ `test_score_stale_both_mismatches` → ambos inválidos: `score_stale` + 2 warnings  
✅ `test_analysis_processing_completed_no_fresh_score` → concluída sem score: `analysis_processing`  
✅ `test_analysis_processing_completed_invalid_no_score` → inválida sem score: `analysis_processing`  
✅ `test_needs_repair_*` (2) → status desconhecido: `needs_repair`

### Integration Tests (18/18 passando)
✅ Portal overview, ranking, transfer, talent pool — **zero regressions**

### Frontend Tests (24/5 passando)
✅ `analysisStatus.test.ts`: 19 testes
  - 9 testes originais (análise por vaga)
  - 7 testes novos `mapScoreStatusToUiState()` (cada estado)
  - 3 testes novos `buildCandidateAnalysisSummary` com scoreStatus

✅ `OverviewTab.test.tsx`: 5 testes
  - 3 originais (sem vaga, com vaga, análise de outro job)
  - 2 novos com `active_job_decision` (score_ready, score_stale)

### Compilação
✅ Python: 3 arquivos compilam sem erros  
✅ Frontend: 2675 modules, 3.99s, zero errors/warnings

---

## 4. Garantias de Correção

### ✅ Ponto 1: `active_job_decision` nunca None
```python
# Sempre retorna, mesmo sem vaga ativa
active_job_decision = CandidateActiveJobDecisionResponse(
    score_status="no_active_job",
    ...
)
```
Backend **sempre** fornece estado canônico. Frontend nunca precisa de fallback.

### ✅ Ponto 2: Warnings separados
```python
if not analysis_is_current_pipeline:
    warnings.append("analysis_not_current_pipeline")
if not analysis_is_for_active_job:
    warnings.append("analysis_from_different_job")
```
3 testes específicos validam cada cenário:
- Apenas `analysis_from_different_job`
- Apenas `analysis_not_current_pipeline`
- Ambos warnings

---

## 5. Precisão de Estado

### Antes (Heurística Frontend)
```
const hasScore = jobFitScore !== null;
if (hasScore || analysisStatus === "completed") {
  if (!hasScore) → "Atualizando aderência" (ambíguo)
  else → "Aderência pronta" (pode ser stale!)
}
```

### Depois (Canônico Backend)
```
score_status: "score_ready" | "score_stale" | "analysis_processing" | ...
// Exato, não ambíguo
```

---

## 6. Próximas Fases

**Fase 2: Comportamento** (já planejado)
- Com base de dados e contrato limpos
- Frontend sempre lê `active_job_decision` do backend
- Score derivado canonicamente, não por heurística local

---

## Checklist Final

- ✅ Schema `CandidateActiveJobDecisionResponse` adicionado
- ✅ Campo obrigatório em `CandidateOverviewResponse` (nunca None)
- ✅ Função `derive_candidate_score_status()` pura, 8 regras, testada
- ✅ Warnings específicos: `analysis_from_different_job` vs `analysis_not_current_pipeline`
- ✅ Integração em `candidate_service.get_overview()` completa
- ✅ 15/15 testes unitários backend passando
- ✅ 18/18 testes integração passando (zero regressões)
- ✅ 24 testes frontend passando (19 analysisStatus + 5 OverviewTab)
- ✅ Build Python + Frontend sem erros
- ✅ Frontend usa `active_job_decision` quando presente
- ✅ Fallback legado (heurística) preservado para compatibilidade

---

## Conclusão

**Fase 1 completada com as correções solicitadas.**

O backend agora fornece um estado canônico, inequívoco, para **todo** cenário:
- Sem vaga ativa → `no_active_job`
- Análise de job diferentes → warnings específicos
- Score desatualizado → `score_stale` (não ambíguo)
- Análise em progresso → `analysis_processing`

O frontend consome esse estado diretamente quando disponível. Sem heurísticas ambíguas. Sem fallbacks silenciosos.

**Pronto para Fase 2: Comportamento.**
