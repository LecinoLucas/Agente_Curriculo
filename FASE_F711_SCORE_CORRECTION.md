# FASE F7.1.1 — CORREÇÃO DE INFLAÇÃO DE SCORES ✅

**Status:** CORRIGIDO E VALIDADO  
**Data:** 2026-05-06  
**Testes:** 762 passando (755 anterior + 7 novos)

---

## 1. RAIZ DO PROBLEMA

**Causa Identificada:** Legacy binary equivalence mappings em `skill_normalizer_service.py` (linha 58)

```python
_DIRECTIONAL_EQUIVALENCES: dict[str, set[str]] = {
    "postgresql": {"sql"},      # ← Causa do problema
    "sql server": {"sql"},      # ← Idem
    ...
}
```

**Fluxo do Erro:**
1. `_compute_skill_scores()` chamava `_skill_matches("postgresql", "SQL")`
2. `_skill_matches()` usava `candidate_satisfies_job_requirement()` (linha 628)
3. `candidate_satisfies_job_requirement()` checava `_normalized_equivalence_targets()` (linha 112-113)
4. Isso retornava **True** para PostgreSQL → SQL
5. Score era setado para **1.0** (exact match)
6. SkillEquivalenceService nunca era consultado, portanto score de 0.85-0.90 era perdido

**Impacto:**
- PostgreSQL → SQL = 100% em vez de 90%
- PySpark → Spark = 100% em vez de ~90%
- Candidatos com equivalências eram inflados para "perfect match"

---

## 2. SOLUÇÃO IMPLEMENTADA

### 2.1 Nova Função: `_skill_matches_exact_and_aliases_only()`

```python
def _skill_matches_exact_and_aliases_only(
    candidate_skill_name: str,
    job_skill_name: str,
    job_skill_aliases: list[str] | None = None,
) -> bool:
    """F7.1.1: Only exact/alias matches, NOT legacy equivalences."""
```

**O que foi removido:**
- ❌ Legacy equivalence mappings
- ❌ Token containment
- ❌ Levenshtein distance
- ❌ Phrase containment

**O que foi mantido:**
- ✅ Exact string match (Python == Python)
- ✅ Alias match (Node in aliases)

### 2.2 Mudança em `_compute_skill_scores()`

**Agora usa:** `_skill_matches_exact_and_aliases_only()` + SkillEquivalenceService

---

## 3. TABELA ANTES/DEPOIS

| Caso | Score Antes | Score Depois | Motivo |
|------|---|---|---|
| PostgreSQL → SQL | 100.00% | **90.00%** | 0.9 (strong equiv) via SkillEquivalenceService |
| PostgreSQL + Python + PySpark → SQL + Python + Spark | 100.00% | **91.67%** | Avg(0.9 + 1.0 + 0.85) |
| Python + Java (exact) | 100.00% | **100.00%** | Mantido (ambos exatos) |
| Protheus + PostgreSQL + Python → SAP MM + SQL + Python | ~75% | **78.33%** | Avg(0.45 + 0.9 + 1.0) |

---

## 4. TESTES ADICIONADOS (7 NOVOS)

✅ `test_postgresql_sql_should_be_085_not_10`  
✅ `test_mixed_exact_and_equivalence_scores`  
✅ `test_exact_only_equals_100`  
✅ `test_strong_coverage_vs_mandatory_score_distinction`  
✅ `test_partial_with_exact_mixed`  
✅ `test_skill_matches_exactness`  
✅ `test_equivalence_service_scores`

---

## 5. MÉTRICAS

```
Backend Tests:       762 passando (755 + 7 novos)
Test Coverage:       80%
Regression:          0 (todos 755 testes anteriores passam)
```

---

**FASE F7.1.1 APROVADA** ✅

Score inflation corrected. SkillEquivalenceService agora tem controle total sobre scoring.
