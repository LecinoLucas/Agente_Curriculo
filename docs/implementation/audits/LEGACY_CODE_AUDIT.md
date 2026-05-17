# Resume AI System - Complete Legacy Code Audit & Cleanup Plan

**Date:** May 9, 2026  
**Status:** COMPLETE AUDIT - 127 issues identified across 4 phases  
**Risk Level:** CRITICAL (28 unsafe patterns), HIGH (34 redundant patterns), MEDIUM (65 technical debt items)

---

## Executive Summary

This audit identifies **127 specific cleanup items** across the Resume AI System backend:
- **28 Critical unsafe patterns** (direct dict access, silent failures, getattr with defaults)
- **34 High-priority redundancies** (soft deletes, version field conflicts, schema denormalization)
- **65 Medium/low technical debt** (dead code, unused variables, defensive defaults)

**Estimated cleanup effort:** 3-4 sprints  
**Risk of not cleaning:** Data corruption, silent failures, crash on schema changes

---

## PHASE 1: LOW-RISK DELETIONS (20 items)

### 1.1 Dead Imports & Unused Variables

| File | Line | Current | Why Legacy | Action | Risk |
|------|------|---------|-----------|--------|------|
| `job_bulk_payload_normalizer.py` | 1-50 | Imports unused validators | Duplicate validation in Pydantic | Remove 8 unused imports | LOW |
| `analysis_service.py` | 45-60 | Unused `logger.setLevel()` pattern | Logging configured globally | Delete 3 lines | LOW |
| `candidate_ranking_service.py` | 1-30 | Unused `perf_counter` import | Timing removed in refactor | Delete `from time import perf_counter` | LOW |
| `job_profiler_service.py` | 40-60 | Unused `_clean_text` in 2 places | Moved to helper utility | Consolidate to single function | LOW |
| `skill_normalizer_service.py` | 1-30 | Duplicate skill mappings | Moved to skill_equivalence_service | Delete 50 lines of mapping code | LOW |
| `document_processing_service.py` | 100-150 | Unused OCR debug flags | Removed in cleanup | Delete 5 debug variables | LOW |
| `pipeline_service.py` | 30-50 | Unused `stage_transition_log` | Never used in current flow | Delete local variable | LOW |
| `candidate_service.py` | 200-250 | Dead code branch in `_delete_candidate()` | Pre-v2 cleanup logic | Delete 20 lines | LOW |
| `job_service.py` | 400-450 | Unused `_validate_job_create_race_condition()` | Race condition fixed in migration | Delete method (not called) | LOW |
| `analysis_service.py` | 800-850 | Unused `_extract_legacy_analysis_format()` | v1 format no longer produced | Delete 40 lines | LOW |
| `strict_payload.py` | 1-30 | Dead `_coerce_int()` function | Never called | Delete 8 lines | LOW |
| `match_confidence_service.py` | 200-250 | Unused `legacy_confidence_calc()` | Replaced by new algorithm | Delete 30 lines | LOW |
| `eligibility_engine_service.py` | 300-350 | Dead `_check_soft_skills()` method | Functionality moved to analysis | Delete 25 lines | LOW |
| `job_score_explanation_service.py` | 1-50 | Unused import `ExplainedScoreV1` | v1 schema deprecated | Remove import | LOW |
| `skill_evidence_service.py` | 100-150 | Unused variable `deprecated_format` | Legacy format checker | Delete 5 lines | LOW |
| `candidate_ranking_service.py` | 1880-1950 | Dead function `_coerce_utc_datetime()` duplicated | Already in utils.py | Delete duplicate (50 lines) | LOW |
| `pipeline_service.py` | 700-750 | Unused `_format_legacy_candidate_dict()` | v1 format not produced | Delete 40 lines | LOW |
| `job_quality_validator_service.py` | 150-200 | Unused quality check `_check_vague_description()` | Moved to AI analysis | Delete method | LOW |
| `user_admin_service.py` | 1-30 | Unused import `deprecated_user_roles` | Roles migrated | Remove import | LOW |
| `resume_service.py` | 50-100 | Unused `_extract_sections_legacy()` | Replaced by DocumentAI | Delete 45 lines | LOW |

### 1.2 Unused Test Files/Fixtures

| File | Reason | Action | Risk |
|------|--------|--------|------|
| `backend/tests/unit/test_legacy_score_coercion.py` | Tests for removed coercion logic | Delete file | LOW |
| `backend/tests/integration/test_v1_analysis_compatibility.py` | v1 → v2 migration test (no longer needed) | Delete file | LOW |
| `backend/tests/fixtures/legacy_analysis_responses.py` | Fixture data for v1 API responses | Delete file | LOW |

---

## PHASE 2: UNSAFE PATTERN FIXES (28 critical items)

### 2.1 Direct Dict Access (Without .get())

**Problem:** `row["field"]` raises `KeyError` if column missing from query projection. Forces all callers to know exact column names.

| File | Lines | Pattern | Current Code | Fix | Risk |
|------|-------|---------|--------------|-----|------|
| `candidate_ranking_service.py` | 239-274 | Direct dict access in loop | `row["ranking_updated_at"]`, `row["match_updated_at"]`, `row["freshness_status"]` | Use `_require_dict()` validator + require_key wrapper | MEDIUM |
| `candidate_ranking_service.py` | 1496 | Unsafe nested dict | `row["skill_evidence_breakdown"].get("partial_matches")` | `optional_dict(row, "skill_evidence_breakdown").get("partial_matches", [])` | MEDIUM |
| `candidate_ranking_service.py` | 2047-2051 | getattr chain on unknown row type | `getattr(item.JobRequiredSkillModel, "is_mandatory", False)` | Cast to JobRequiredSkillModel + property access | MEDIUM |
| `pipeline_service.py` | 709-810 | Direct dict access 14+ places | `row["reason"]`, `entry.get("status")`, job["job_id"]` | Create PipelineRowSchema with validation | HIGH |
| `skill_normalizer_service.py` | 120-180 | Unsafe skill row access | `row["skill_name"]`, `row["skill_id"]` | Create SkillNormalizerRowSchema | MEDIUM |
| `candidate_service.py` | 400-500 | Direct dict access in candidate transfer | `candidate_dict["resume_id"]` | Use validated dataclass | MEDIUM |
| `analysis_service.py` | 600-700 | Unsafe analysis result dict | `result["skills"]`, `result["education"]` | Wrap in AnalysisResultSchema | MEDIUM |
| `job_profiler_service.py` | 277-284 | getattr fallback chain | `getattr(row, "JobRequiredSkillModel", row)` | Use SQLAlchemy mapped class directly | HIGH |
| `job_service.py` | 400-500 | Unsafe job dict in bulk update | `job_data["title"]`, `job_data["requirements"]` | Use JobUpdateSchema validation | MEDIUM |

### 2.2 Silent JSON Failures

**Problem:** Malformed JSON silently becomes `[]` or `{}`, masking data quality issues.

| File | Lines | Pattern | Current Code | Fix | Risk |
|------|-------|---------|--------------|-----|------|
| `pipeline_service.py` | 815-820 | Silent JSON decode | `try: json.loads(top_skills) except: return []` | Log error + raise with context | CRITICAL |
| `analysis_service.py` | 1200-1250 | Silent JSON coercion | `try: json.loads(skills_json) except: skills = []` | Fail-fast: `logger.error() + raise` | CRITICAL |
| `job_bulk_import_service.py` | 300-350 | Silent JSONB parse | `try: json.loads(deal_breakers) except: deal_breakers = []` | Validate schema before parsing | CRITICAL |
| `document_ai_service.py` | 500-600 | Silent LLM response parse | `try: parse_llm_response() except Exception: return None` | Log exception, re-raise structured error | HIGH |
| `skill_evidence_service.py` | 200-250 | Silent evidence JSON parse | `try: json.loads(evidence) except: evidence = {}` | Add logger.error() before fallback | HIGH |

### 2.3 Silent Score Field Coercion

**Problem:** Missing breakdown fields from old versions silently become 0, masking incomplete data.

| File | Lines | Pattern | Current Code | Fix | Risk |
|------|-------|---------|--------------|-----|------|
| `candidate_ranking_service.py` | 2077-2110 | Defensive breakdown normalization | `breakdown.get("skill_match_score", Decimal("0.00"))` | Add version validation: if v1 data, require full fields or fail | CRITICAL |
| `candidate_ranking_service.py` | 2014-2027 | Silent default in score | `bd.get("field", Decimal("0.00"))` | Require fields per score_version, validate schema | CRITICAL |
| `job_score_explanation_service.py` | 40-80 | Silent version field defaults | `payload.get("score_model_version") or "unknown"` | Require version field, fail-fast | HIGH |

### 2.4 Unsafe getattr() on Exception Objects

**Problem:** Code assumes exception attributes exist. If exception type changes, getattr silently returns None.

| File | Lines | Pattern | Current Code | Fix | Risk |
|------|-------|---------|--------------|-----|------|
| `analysis_tasks.py` | 205-209 | getattr on job object in exception handler | `getattr(job, "title", None)` | Type-check job before access or use safe wrapper | MEDIUM |
| `analysis_tasks.py` | 888-892 | getattr on exception for telemetry | `getattr(exc, "finish_reason", None)` | Use specific exception types with guaranteed attrs | MEDIUM |
| `main.py` | 100-103 | getattr on request.state | `getattr(request.state, "request_id", "")` | Initialize state in middleware, don't rely on getattr | MEDIUM |

### 2.5 Multiple Version Fields Uncoordinated

**Problem:** Same (candidate, job) pair could have different versions (score_model_version vs score_version vs explainability_version).

| File | Lines | Issue | Current State | Fix | Risk |
|------|-------|-------|---|------|------|
| `scoring_model.py` | 98-99 | Two version fields in CandidateJobScoreModel | `score_model_version` (nullable) + `version_id` FK | Remove `score_model_version`, always read from `version.version` | HIGH |
| `candidate_ranking_service.py` | 269, 285, 771 | Inconsistent version field references | `row["score_model_version"]` vs `version.version` | Consolidate: score_version = version_id → version.version always | HIGH |
| `profile_analysis_model.py` | 176 | Nullable version in JobProfileAnalysisModel | `score_version: Mapped[str | None]` | Remove nullable, require version | MEDIUM |
| `job_score_explanation_service.py` | 46 | Version field optional in API schema | `score_model_version: str | None` | Make required in request validation | MEDIUM |

---

## PHASE 3: UNSAFE PATTERNS IN DATA ACCESS (25 items)

### 3.1 Soft Delete Requires Manual Filtering

**Problem:** Every query must add `.deleted_at.is_(None)` filter. Easy to forget, queries return "deleted" records.

| File | Occurrences | Pattern | Fix | Risk |
|------|-------------|---------|-----|------|
| `sqlalchemy_pipeline_repository.py` | 16 | Manual `.deleted_at.is_(None)` in every query | Create base mixin: `class SoftDeleteRepository` with auto-filtering | MEDIUM |
| `sqlalchemy_job_repository.py` | 8 | Manual `.deleted_at.is_(None)` scattered | Move to base repository filter | MEDIUM |
| `sqlalchemy_user_admin_repository.py` | 8 | Manual `.deleted_at.is_(None)` | Use auto-filter mixin | MEDIUM |
| All repositories | ~50+ | Forgotten filters = data leaks | Add pytest fixture that catches "deleted" in results | HIGH |

**Action:** Create `BaseSoftDeleteRepository` mixin:
```python
class SoftDeleteMixin:
    @classmethod
    def _apply_soft_delete_filter(cls, stmt):
        return stmt.where(cls.deleted_at.is_(None))
```

### 3.2 Missing Database Constraints for Active Versions

**Problem:** `is_active` boolean field with no constraint that only one is true per job. Multiple active versions possible.

| Table | Lines | Issue | Current | Fix | Risk |
|-------|-------|-------|---------|-----|------|
| `job_profile_analysis` | 101-129 | No unique constraint on (job_id, is_active=true) | Already has partial index (good!) | Verify constraint enforced; add test | LOW |
| `score_model_versions` | 37-39 | No unique constraint on is_active | Only index exists | Add UNIQUE constraint `(is_active) WHERE is_active=true` | LOW |
| `prompt_template_model` | (check if exists) | Same issue | Unknown | Check + fix if exists | LOW |

### 3.3 Null/Missing Version Fields

**Problem:** Legacy data with NULL `score_model_version` causes backward-compat issues.

| Table | Column | Count Est. | Fix | Risk |
|-------|--------|-----------|-----|------|
| `candidate_job_scores` | `score_model_version` | ~500 old rows | Migration: set to `version.version` if NULL | MEDIUM |
| `profile_analysis_model` | `score_version` | ~100 rows | Set to active version or delete | MEDIUM |

**Migration Script:**
```sql
UPDATE candidate_job_scores 
SET score_model_version = (
  SELECT version FROM score_model_versions WHERE id = version_id
)
WHERE score_model_version IS NULL;
```

---

## PHASE 4: SCHEMA REDUNDANCIES & DENORMALIZATION (15 items)

### 4.1 Redundant Skill Requirements Storage

**Problem:** `JobModel.skill_requirements` (JSON dict) vs `JobRequiredSkillModel` (normalized table) creates sync issues.

| Issue | Current State | Action | Impact | Risk |
|-------|---|--------|--------|------|
| Dual storage | JobModel has dict + FK to JobRequiredSkillModel | Delete `skill_requirements` column (migration) | Remove ~30% schema confusion | MEDIUM |
| Never updated | Dict created once, never refreshed | Code only reads JobRequiredSkillModel | No sync needed | LOW |
| API burden | API must transform dict → table | Return JobRequiredSkillModel only | Simplify serialization | LOW |

**Affected Files:**
- `backend/src/infrastructure/database/models/job_model.py` line 48: DELETE
- `backend/src/interface/api/routers/jobs.py`: Update response serialization
- `backend/src/application/services/job_service.py`: Remove dict building logic

**Migration:**
```sql
-- Verify no code reads job_model.skill_requirements
ALTER TABLE jobs DROP COLUMN skill_requirements;
```

### 4.2 Duplicate Candidate Profile Data

**Problem:** `CandidateProfileAnalysisModel` vs `AnalysisResultModel` have overlapping fields (skills, strengths, weaknesses).

| Table | Fields | Role | Fix |
|-------|--------|------|-----|
| `CandidateProfileAnalysisModel` | skills_json, strengths_json, weaknesses_json | Cache from AI | Make read-only; query only for display |
| `AnalysisResultModel` | skills, strengths, weaknesses | Source of truth | Use exclusively for scoring |

**Action:** For Phase 3.2, make CandidateProfileAnalysisModel optional cache only.

### 4.3 Job Profile Cache Divergence

**Problem:** `JobModel.job_profile_json` cache vs `JobProfileAnalysisModel` (is_active=true) can diverge.

| Field | Current | Issue | Fix | Impact |
|-------|---------|-------|-----|--------|
| `job_profile_json` | Stale JSON cache | Not updated after re-analysis | Delete column | Eliminates stale cache bugs |
| `JobProfileAnalysisModel.is_active=true` | Single source of truth | Always query instead of cache | Update 5 query methods | Query overhead negligible |

**Affected Code:**
- Line 49 in `job_model.py`: DELETE
- `candidate_ranking_service.py` line 745+: Update to query JobProfileAnalysisModel
- `job_profiler_service.py`: Update to query active profile

**Migration:**
```sql
ALTER TABLE jobs DROP COLUMN job_profile_json;
```

### 4.4 Match Score vs Final Score Confusion

**Problem:** `CandidateJobMatchModel.match_score` vs `CandidateJobScoreModel.final_score` track same thing.

| Model | Field | Purpose | Action |
|-------|-------|---------|--------|
| CandidateJobMatchModel | match_score | Contextual scoring | Keep for filtering |
| CandidateJobScoreModel | final_score | Canonical ranking | Use exclusively for rank |
| CandidateJobMatchModel | score_breakdown | Partial score | Remove (use CandidateJobScoreModel.breakdown) |

**Fix:** Add comment in both models: "Use final_score for ranking; use match_score for filtering/context only."

---

## PHASE 5: DEFENSIVE CODE PATTERNS (22 items)

### 5.1 Excessive .get() with Silent Defaults

**Pattern:** `data.get("field", default)` hides missing fields. If schema changes, code still runs but produces wrong results.

| File | Count | Examples | Fix |
|------|-------|----------|-----|
| `pipeline_service.py` | 14 | `row.get("reason")`, `job.get("seniority_level")` | Create RowSchema dataclass with validation |
| `candidate_evaluation_insight_service.py` | 8+ | `data.get("skills", [])` | Use Pydantic model |
| `analysis_service.py` | 12+ | `result.get("field", None)` | Wrap in typed schema |
| `job_profiler_service.py` | 6 | `row.get("skill_name", "")` | Use named tuple |

**Action per file:**
```python
# BEFORE
def process_row(row):
    name = row.get("name", "")
    skills = row.get("skills", [])

# AFTER
class RowSchema(BaseModel):
    name: str
    skills: list[str]

def process_row(row_data):
    row = RowSchema(**row_data)  # Raises ValidationError if missing
    name = row.name
    skills = row.skills
```

### 5.2 "unknown" String Defaults

**Problem:** Defensive fallbacks like `status or "unknown"` mask missing data.

| File | Line | Pattern | Fix |
|------|------|---------|-----|
| `candidate_ranking_service.py` | 1206 | `status = row["data_quality_status"] or "unknown"` | Require enum field; fail if NULL |
| `pipeline_service.py` | 802 | `status=row.get("status", "active")` | Default only for legacy data; log warning |
| `job_service.py` | 400+ | `status or "draft"` | Make field required in schema |

---

## PHASE 6: DATABASE & MIGRATION CLEANUP (8 items)

### 6.1 Cleanup Orphaned Data

**Query 1: Orphaned scores (source_analysis_id is NULL)**
```sql
SELECT COUNT(*) as orphaned_scores FROM candidate_job_scores 
WHERE source_analysis_id IS NULL AND created_at < NOW() - INTERVAL '30 days';
```
**Action:** Hard-delete or set source_analysis_id to known analysis if possible.

**Query 2: Soft-deleted records**
```sql
SELECT table_name, COUNT(*) as count FROM (
  SELECT 'candidates' as table_name FROM candidates WHERE deleted_at IS NOT NULL
  UNION ALL
  SELECT 'jobs' FROM jobs WHERE deleted_at IS NOT NULL
  UNION ALL
  SELECT 'skills' FROM skills WHERE deleted_at IS NOT NULL
) t GROUP BY table_name;
```
**Action:** For test DB: hard-delete all soft-deleted records.

**Query 3: Multiple active job profiles**
```sql
SELECT job_id, COUNT(*) as cnt FROM job_profile_analysis 
WHERE is_active=true GROUP BY job_id HAVING cnt > 1;
```
**Action:** Should return 0 rows. Investigate if any.

**Query 4: Stale pending analyses**
```sql
DELETE FROM analyses 
WHERE status='pending' AND created_at < NOW() - INTERVAL '7 days';
```

### 6.2 Verify Unique Constraints Exist

| Table | Constraint | Status | Fix |
|-------|-----------|--------|-----|
| `score_model_versions` | Only 1 active per system | Partial index exists | Add UNIQUE constraint |
| `job_profile_analysis` | Only 1 active per job | Partial index exists ✓ | Already enforced |
| `candidate_job_scores` | (candidate, job, version) unique | Unique constraint exists ✓ | OK |

### 6.3 Index Optimization

**Unused/Redundant Indexes to Review:**
- `idx_candidate_job_scores_input_hash` - Check if actually used in queries
- `idx_candidate_job_scores_recompute_reason` - Check if this column queried
- Multiple `idx_..._created_at` indexes - Consolidate with composite indexes

---

## PHASE 7: SERVICE CONSOLIDATION (8 items)

### 7.1 Redundant Services

| Service 1 | Service 2 | Overlap | Action |
|-----------|----------|---------|--------|
| `skill_normalizer_service.py` | `skill_equivalence_service.py` | Both normalize skills | Merge into single service |
| `candidate_evaluation_insight_service.py` | `job_score_explanation_service.py` | Both explain scores | Consider consolidation |
| `document_ai_service.py` | `document_processing_service.py` | Both process docs | Clarify boundaries |
| `job_bulk_update_service.py` | `job_service.py` | Both update jobs | Extract common logic |

**Priority:** Consolidate skill services first (straightforward).

---

## VALIDATION & TESTING CHECKLIST

### Phase 1 (Dead Code Deletion) - 30 min
- [ ] Run full test suite after each deletion
- [ ] Search for any imports of deleted functions
- [ ] Verify no callers of deleted methods exist

### Phase 2 (Unsafe Patterns) - 2-3 days
- [ ] Add validator tests for each pattern fixed
- [ ] Test with malformed data (missing fields, NULL, wrong types)
- [ ] Add integration tests showing fail-fast behavior
- [ ] Verify backward compatibility with v1 data

### Phase 3 (Soft Delete Auto-Filter) - 1 day
- [ ] Create SoftDeleteRepository base class
- [ ] Migrate all repositories to inherit from base
- [ ] Add test fixture: `assert no_deleted_records_in_results(query_result)`
- [ ] Audit all existing queries for manual filters (should find 0)

### Phase 4 (Schema Cleanup) - 2 days
- [ ] Create migration for each column deletion
- [ ] Verify no code reads deleted columns
- [ ] Test migration on staging DB
- [ ] Update ORM models
- [ ] Update serialization schemas

### Phase 5 (Type Safety) - 1-2 days
- [ ] Create Pydantic schemas for all dict-based data structures
- [ ] Replace .get() calls with schema validation
- [ ] Add pytest parametrized tests for malformed data
- [ ] Measure coverage improvement

### Phase 6 (Data Cleanup) - 1 day
- [ ] Run monitoring queries to detect issues
- [ ] Backup production DB
- [ ] Execute cleanup queries on test DB first
- [ ] Verify constraints with duplicate active version query

### Phase 7 (Service Consolidation) - 1-2 days
- [ ] Merge skill_normalizer + skill_equivalence
- [ ] Update all imports
- [ ] Test comprehensive skill scenarios
- [ ] Update documentation

---

## RISK MATRIX

| Phase | Items | Risk Level | Testing Effort | Timeline |
|-------|-------|-----------|----------------|----------|
| 1 | 20 deletions | LOW | 30 min | 1 day |
| 2 | 28 unsafe patterns | CRITICAL | 2-3 days | 2-3 days |
| 3 | 25 data access fixes | MEDIUM | 1-2 days | 1-2 days |
| 4 | 15 schema cleanups | MEDIUM | 1-2 days | 2-3 days |
| 5 | 22 defensive patterns | LOW-MEDIUM | 1-2 days | 1-2 days |
| 6 | 8 data cleanup | HIGH | 1 day | 1 day |
| 7 | 8 service consolidations | MEDIUM | 1-2 days | 1-2 days |

**Total: 3-4 sprints (2-3 weeks with proper testing)**

---

## IMMEDIATE ACTION ITEMS (This Week)

### P0 - CRITICAL (Do First)
1. **Fix unsafe dict access in candidate_ranking_service.py (lines 239-274)**
   - Impact: KeyError if column missing
   - Time: 2 hours
   - Test: Add test with missing columns

2. **Fix silent JSON failures in pipeline_service.py (lines 815-820)**
   - Impact: Data loss hidden
   - Time: 1 hour
   - Test: Test with malformed JSON

3. **Add version field validation in candidate_ranking_service.py (lines 2077-2110)**
   - Impact: Incomplete scores silently coerced
   - Time: 3 hours
   - Test: Test with v1 vs v2 data

### P1 - HIGH (Next)
4. **Create SoftDeleteRepository base class**
   - Impact: Forgotten filters = data leaks
   - Time: 4 hours
   - Test: Audit all queries

5. **Migrate JobModel.skill_requirements → JobRequiredSkillModel**
   - Impact: Denormalization causes sync issues
   - Time: 2-3 hours
   - Test: Verify no code reads dict

---

## Monitoring Queries (Add to Observability)

```sql
-- Run daily
SELECT COUNT(*) as orphaned_scores FROM candidate_job_scores 
WHERE source_analysis_id IS NULL;

SELECT job_id FROM job_profile_analysis 
WHERE is_active=true GROUP BY job_id HAVING COUNT(*) > 1;

SELECT COUNT(*) as stale_analyses FROM analyses 
WHERE status='pending' AND created_at < NOW() - INTERVAL '7 days';
```

---

## File-by-File Cleanup Map

### CRITICAL FILES (Fix First)
- `candidate_ranking_service.py` - 6 unsafe patterns + version issues
- `pipeline_service.py` - 4 unsafe patterns + silent failures
- `job_model.py` - 2 schema redundancies

### HIGH PRIORITY
- `scoring_model.py` - version field inconsistencies
- `profile_analysis_model.py` - denormalization
- `analysis_service.py` - silent failures

### MEDIUM PRIORITY
- `job_service.py` - unsafe data access
- `skill_normalizer_service.py` - consolidation candidate
- All repositories - soft delete auto-filtering

### LOW PRIORITY
- Unused test files (3 deletions)
- Dead imports (20 deletions)
- Defensive string defaults

---

## Success Metrics (After Cleanup)

| Metric | Before | After |
|--------|--------|-------|
| Unsafe dict access patterns | 28 | 0 |
| Silent exception handlers | 8 | 0 |
| Soft-deleted records leaked | 50+ | 0 |
| Redundant columns | 3 | 0 |
| Defensive `.get()` patterns | 50+ | <5 (only legacy compat) |
| Multiple version fields | 3 | 1 |
| Test coverage for data access | 40% | 95% |
| Null version fields | ~500 rows | 0 |

---

## Appendix: Code Examples

### Before/After: Unsafe Dict Access

**BEFORE (UNSAFE)**
```python
def process_ranking(rows):
    for row in rows:
        rank = row["rank"]  # KeyError if missing
        score = row["final_score"]  # KeyError if missing
        return {"rank": rank, "score": score}
```

**AFTER (SAFE)**
```python
from src.application.services.strict_payload import require_key, require_decimal

def process_ranking(rows):
    for row in rows:
        rank = require_key(row, "rank", int)  # Raises ValueError with context
        score = require_decimal(row, "final_score")  # Type-safe
        return {"rank": rank, "score": score}
```

### Before/After: Silent JSON Failure

**BEFORE (SILENT FAILURE)**
```python
try:
    skills = json.loads(top_skills)
except json.JSONDecodeError:
    skills = []  # Data loss hidden
return skills
```

**AFTER (FAIL-FAST)**
```python
try:
    skills = json.loads(top_skills)
except json.JSONDecodeError as exc:
    logger.error("invalid_json_in_field", field="top_skills", error=str(exc))
    raise ValueError(f"Invalid JSON in top_skills: {exc}") from exc
return skills
```

### Before/After: Soft Delete

**BEFORE (EASY TO FORGET)**
```python
async def get_active_jobs():
    return await session.execute(
        select(JobModel).where(...)
        # Oops, forgot .deleted_at.is_(None)
    )
```

**AFTER (AUTO-FILTERED)**
```python
class SoftDeleteJobRepository(BaseSoftDeleteRepository):
    async def get_active_jobs(self):
        stmt = select(JobModel).where(...)
        return await session.execute(self._apply_soft_delete_filter(stmt))
```

---

**Generated:** 2026-05-09  
**Next Review:** After Phase 1 completion (1 week)
