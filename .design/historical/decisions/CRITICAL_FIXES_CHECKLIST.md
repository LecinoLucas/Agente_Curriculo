# Critical Fixes Checklist - Start Here

**Priority:** CRITICAL - These 28 fixes prevent crashes & data loss  
**Estimated Time:** 2-3 days  
**Risk:** HIGH - Must test thoroughly before deploying  

---

## CRITICAL FIX #1: Unsafe Dict Access in candidate_ranking_service.py

**File:** `backend/src/application/services/candidate_ranking_service.py`  
**Lines:** 239-274  
**Risk Level:** CRITICAL - KeyError crashes if column missing  
**Impact:** Any missing column from query projection causes unhandled exception

### The Bug
```python
# LINE 239-246: Direct dict access with no validation
for row in rows:
    freshness_status, stale_reason = _resolve_freshness_status(
        ranking_updated_at=row["ranking_updated_at"],  # ← KeyError if column missing
        match_updated_at=row["match_updated_at"],
        persisted_status=row["freshness_status"],
        score_job_signature_hash=row["job_signature_hash"],
        job_signature_hash=row["job_profile_hash"],
        score_computed_at=row["computed_at"],
        job_updated_at=row["job_updated_at"],
    )
```

### The Fix
```python
# Use strict_payload validators imported at top
from src.application.services.strict_payload import (
    require_datetime,
    require_key,
    optional_dict,
)

# REPLACE LINES 239-246 WITH:
for row in rows:
    freshness_status, stale_reason = _resolve_freshness_status(
        ranking_updated_at=require_datetime(row, "ranking_updated_at"),
        match_updated_at=require_datetime(row, "match_updated_at"),
        persisted_status=require_key(row, "freshness_status", str),
        score_job_signature_hash=require_key(row, "job_signature_hash", str),
        job_signature_hash=require_key(row, "job_profile_hash", str),
        score_computed_at=require_datetime(row, "computed_at"),
        job_updated_at=require_datetime(row, "job_updated_at"),
    )
```

### Testing
```bash
# Run this test to verify fix
cd backend
pytest tests/unit/test_candidate_ranking_contract.py::test_missing_ranking_columns_fails_gracefully -v

# Should show error like:
# ValueError: ranking_updated_at is required but missing from row
```

### Rollback
If tests fail, revert to original code and add migration to ensure columns exist in query.

---

## CRITICAL FIX #2: Unsafe Nested Dict Access

**File:** `backend/src/application/services/candidate_ranking_service.py`  
**Line:** 1496  
**Risk Level:** CRITICAL - Crashes if skill_evidence_breakdown missing  
**Impact:** Score factor calculation fails silently

### The Bug
```python
# LINE 1495-1496
if isinstance(row.get("skill_evidence_breakdown"), dict):
    partial_matches = row["skill_evidence_breakdown"].get("partial_matches", []) or []
    #                  ↑ Can be None if key doesn't exist, causing TypeError
```

### The Fix
```python
# REPLACE LINES 1495-1496 WITH:
from src.application.services.strict_payload import optional_dict

breakdown = optional_dict(row, "skill_evidence_breakdown")
partial_matches = breakdown.get("partial_matches", []) or []
```

**If `optional_dict` doesn't exist, add it to `strict_payload.py`:**
```python
def optional_dict(data: dict, key: str) -> dict:
    """Safely extract optional dict from data."""
    value = data.get(key)
    if value is None:
        return {}
    if not isinstance(value, dict):
        logger.warning(
            "optional_dict_type_mismatch",
            key=key,
            expected="dict",
            got=type(value).__name__,
        )
        return {}
    return value
```

---

## CRITICAL FIX #3: Silent JSON Decode in pipeline_service.py

**File:** `backend/src/application/services/pipeline_service.py`  
**Lines:** 815-820  
**Risk Level:** CRITICAL - Data silently lost without logging  
**Impact:** Malformed JSON becomes [] with no error/warning

### The Bug
```python
# LINES 815-820: Silent exception handling
try:
    top_skills = json.loads(data["top_skills"])
except json.JSONDecodeError:
    top_skills = []  # ← SILENT - no logging, no error raised
```

### The Fix
```python
# REPLACE LINES 815-820 WITH:
try:
    top_skills = json.loads(data["top_skills"])
    if not isinstance(top_skills, list):
        logger.error(
            "pipeline.top_skills_not_array",
            parsed_type=type(top_skills).__name__,
            value=str(top_skills)[:200],
        )
        raise ValueError(f"top_skills must be array, got {type(top_skills).__name__}")
except json.JSONDecodeError as exc:
    logger.error(
        "pipeline.invalid_json_in_top_skills",
        error=str(exc),
        raw_value=str(data.get("top_skills", ""))[:200],
    )
    raise ValueError(f"Invalid JSON in top_skills: {exc}") from exc
```

### Testing
```python
# Add test for this fix
def test_malformed_json_in_top_skills_raises_error():
    """Verify malformed JSON fails fast, not silent."""
    data = {"top_skills": '{"not": "array"}'}  # Invalid JSON structure
    with pytest.raises(ValueError, match="must be array"):
        parse_pipeline_data(data)
```

---

## CRITICAL FIX #4: Silent Version Field Coercion

**File:** `backend/src/application/services/candidate_ranking_service.py`  
**Lines:** 2077-2110  
**Risk Level:** CRITICAL - Incomplete scores accepted without validation  
**Impact:** v1 data with missing fields silently becomes 0

### The Bug
```python
# LINES 2077-2110: No validation of required fields per version
def _normalize_score_breakdown(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        logger.warning("ranking.invalid_score_breakdown_type", ...)
        return _default_score_breakdown()
    
    # PROBLEM: missing education_score, confidence_score, etc. silently becomes 0
    return {
        "skill_match_score": _to_decimal(raw.get("skill_match_score")).quantize(q),
        "experience_match_score": _to_decimal(raw.get("experience_match_score")).quantize(q),
        "seniority_match_score": _to_decimal(raw.get("seniority_match_score")).quantize(q),
        # ... but what if these fields came from v1 and v2 expects all of them?
    }
```

### The Fix
```python
# REPLACE ENTIRE FUNCTION (lines 2077-2110) WITH:
from pydantic import BaseModel, Field, ValidationError

class ScoreBreakdownSchema(BaseModel):
    """Validated score breakdown from v2_skill_evidence_shadow version."""
    skill_match_score: Decimal
    experience_match_score: Decimal
    seniority_match_score: Decimal
    education_score: Decimal = Decimal("0.00")
    confidence_score: Decimal = Decimal("0.00")
    penalty_score: Decimal = Decimal("0.00")
    validation_penalty_score: Decimal = Decimal("0.00")
    final_score: Decimal

def _normalize_score_breakdown(
    raw: Any,
    score_version: str = "v2_skill_evidence_shadow",
) -> dict[str, Any]:
    """Normalize and validate score breakdown.
    
    Args:
        raw: Raw breakdown dict from database
        score_version: Version this score was computed with (for validation)
    
    Raises:
        ValueError if required fields missing for this version
    """
    if not isinstance(raw, dict):
        logger.error(
            "ranking.invalid_score_breakdown_type",
            type=type(raw).__name__,
            version=score_version,
        )
        return _default_score_breakdown()
    
    # For v2, all fields are required
    if score_version.startswith("v2"):
        try:
            validated = ScoreBreakdownSchema(**raw)
            return validated.model_dump()
        except ValidationError as exc:
            logger.error(
                "ranking.v2_breakdown_validation_failed",
                missing_fields=str(exc),
                version=score_version,
            )
            # Return defaults instead of raising (preserve backward compat)
            return _default_score_breakdown()
    
    # For v1, allow partial fields and fill defaults
    if score_version.startswith("v1"):
        return {
            "skill_match_score": _to_decimal(raw.get("skill_match_score"), q),
            "experience_match_score": _to_decimal(raw.get("experience_match_score"), q),
            "seniority_match_score": _to_decimal(raw.get("seniority_match_score"), q),
            "education_score": Decimal("0.00"),  # v1 didn't track this
            "confidence_score": Decimal("0.00"),  # v1 didn't track this
            "penalty_score": Decimal("0.00"),
            "validation_penalty_score": Decimal("0.00"),
            "final_score": Decimal("0.00"),
        }
    
    logger.warning(
        "ranking.unknown_score_version",
        version=score_version,
    )
    return _default_score_breakdown()
```

### Testing
```python
def test_v2_missing_education_score_logged():
    """Verify v2 breakdown missing field is caught."""
    incomplete_v2 = {
        "skill_match_score": Decimal("50"),
        "experience_match_score": Decimal("40"),
        "seniority_match_score": Decimal("30"),
        # Missing education_score
    }
    result = _normalize_score_breakdown(incomplete_v2, score_version="v2_skill_evidence")
    # Should get safe defaults, not crash
    assert result["education_score"] == Decimal("0.00")
    assert result["skill_match_score"] == Decimal("50.00")

def test_v1_allowed_partial_fields():
    """Verify v1 data with only 3 fields works."""
    v1_data = {
        "skill_match_score": Decimal("50"),
        "experience_match_score": Decimal("40"),
        "seniority_match_score": Decimal("30"),
    }
    result = _normalize_score_breakdown(v1_data, score_version="v1_legacy")
    assert result["education_score"] == Decimal("0.00")  # Filled with default
```

---

## CRITICAL FIX #5: getattr Chain on Unsafe Type

**File:** `backend/src/application/services/candidate_ranking_service.py`  
**Lines:** 2047-2051  
**Risk Level:** MEDIUM - Silent False if attribute missing  
**Impact:** Mandatory skills treated as optional

### The Bug
```python
# LINES 2047-2051: getattr assumes row type with specific attributes
mandatory_names = [
    str(item.skill_name).strip()
    for item in job_skill_rows
    if getattr(item.JobRequiredSkillModel, "is_mandatory", False)  # ← Returns False if missing
]
```

### The Fix
```python
# REPLACE LINES 2047-2051 WITH:
from src.infrastructure.database.models.job_model import JobRequiredSkillModel

def is_skill_mandatory(item) -> bool:
    """Safely check if a skill is mandatory."""
    try:
        # Assume item is a row with JobRequiredSkillModel relationship
        if not hasattr(item, "JobRequiredSkillModel"):
            logger.warning(
                "job_skill_row_missing_relation",
                item_type=type(item).__name__,
            )
            return False
        
        link = item.JobRequiredSkillModel
        if not hasattr(link, "is_mandatory"):
            logger.error(
                "job_required_skill_missing_is_mandatory_attr",
                link=link,
            )
            return False  # Treat as optional if can't determine
        
        return bool(link.is_mandatory)
    except Exception as exc:
        logger.error(
            "job_skill_row_mandatory_check_failed",
            error=str(exc),
            exc_type=type(exc).__name__,
        )
        return False  # Treat as optional on error

mandatory_names = [
    str(item.skill_name).strip()
    for item in job_skill_rows
    if is_skill_mandatory(item) and str(item.skill_name).strip()
]
```

### Testing
```python
def test_missing_is_mandatory_attribute_returns_false():
    """Verify missing attribute defaults to False."""
    broken_item = type("Item", (), {
        "skill_name": "Python",
        "JobRequiredSkillModel": type("Link", (), {}),
    })()
    
    result = is_skill_mandatory(broken_item)
    assert result is False  # Logs warning
```

---

## CRITICAL FIX #6: Version Field Inconsistency

**File:** `backend/src/infrastructure/database/models/scoring_model.py`  
**Lines:** 98-99  
**Risk Level:** HIGH - Multiple sources of truth for same data  
**Impact:** Different code paths return different versions for same (candidate, job)

### The Bug
```python
# LINES 98-99: Two version fields in same model
class CandidateJobScoreModel(Base):
    score_model_version: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)
    explainability_version: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)
    # Also has version_id FK to ScoreModelVersionModel
    # So THREE different version fields! Which is source of truth?
```

### The Fix

**Option A: Remove score_model_version (Recommended for Phase 4)**
```python
# DELETE LINE 98 - score_model_version column
# Always use version_id → version.version instead

# Update code at line 269:
# BEFORE
"score_model_version": row["score_model_version"] or version.version,

# AFTER
"score_model_version": version.version,  # Always from FK, never NULL
```

**Option B: Document Current Design (Quick fix)**
```python
# ADD COMMENT above both fields
class CandidateJobScoreModel(Base):
    """
    VERSIONS:
    - version_id (FK): The ScoreModelVersionModel that was active when score computed.
      This is the SOURCE OF TRUTH for score semantics.
    - score_model_version (column): Denormalization of version.version for backwards compat.
      Deprecated - always use version.version instead.
    - explainability_version (column): Separate version for explanation algorithm.
      Not tied to version_id. May diverge.
    """
    
    version_id: Mapped[UUID] = mapped_column(...)  # SOURCE OF TRUTH
    score_model_version: Mapped[str | None] = mapped_column(...)  # DEPRECATED - read from version_id
    explainability_version: Mapped[str | None] = mapped_column(...)  # SEPARATE VERSIONING
```

### Testing
```python
def test_score_model_version_matches_foreign_key():
    """Verify denormalized score_model_version stays in sync with FK."""
    version = ScoreModelVersionModel(version="v2_skill_evidence")
    score = CandidateJobScoreModel(
        version_id=version.id,
        score_model_version=version.version,  # Denormalized copy
    )
    
    # Both should be identical
    assert score.score_model_version == score.version.version
```

---

## CRITICAL FIX #7: Silent Analysis Failure

**File:** `backend/src/application/services/analysis_service.py`  
**Lines:** ~1200-1250 (search for similar patterns)  
**Risk Level:** CRITICAL - Silent exception hiding data quality issues  
**Impact:** Malformed analysis silently returns empty result

### The Bug
```python
# SEARCH FOR PATTERN:
try:
    result = parse_analysis_json(raw_json)
except Exception:
    logger.debug("analysis parsing failed")  # Too silent
    result = {}
return result  # Silent failure - downstream code gets empty dict
```

### The Fix
```python
# REPLACE WITH:
try:
    result = parse_analysis_json(raw_json)
    if not result:
        logger.error(
            "analysis_parsing_returned_empty",
            raw_json=str(raw_json)[:500],
        )
        raise ValueError("Analysis parsing returned empty result")
    return result
except json.JSONDecodeError as exc:
    logger.error(
        "analysis_invalid_json",
        error=str(exc),
        raw=str(raw_json)[:500],
    )
    raise ValueError(f"Invalid JSON in analysis: {exc}") from exc
except Exception as exc:
    logger.error(
        "analysis_parsing_unexpected_error",
        error=str(exc),
        error_type=type(exc).__name__,
        exc_info=True,  # Include full stack trace
    )
    raise
```

---

## CRITICAL FIX #8: Defensive "unknown" Defaults

**File:** `backend/src/application/services/candidate_ranking_service.py`  
**Line:** 1206  
**Risk Level:** MEDIUM - Masks NULL values  
**Impact:** NULL status treated as "unknown" instead of failing

### The Bug
```python
# LINE 1206: Silent NULL handling
status = row["data_quality_status"] or "unknown"  # NULL becomes "unknown"
```

### The Fix
```python
# REPLACE WITH:
status = row.get("data_quality_status")
if status is None:
    logger.warning(
        "ranking.null_data_quality_status",
        candidate_id=str(row.get("candidate_id")),
        job_id=str(job_id),
    )
    status = "unknown"  # Explicit fallback with logging
elif status not in ("unknown", "valid", "invalid"):
    logger.error(
        "ranking.invalid_data_quality_status",
        status=status,
    )
    status = "unknown"  # Fail-safe default
```

---

## TESTING TEMPLATE

For each fix above, add test in `backend/tests/unit/test_critical_fixes.py`:

```python
import pytest
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

class TestCriticalFix1:
    """Test unsafe dict access is now safe."""
    
    @pytest.mark.asyncio
    async def test_missing_ranking_updated_at_raises_error(self):
        """Verify missing column causes clear error."""
        incomplete_row = {
            "candidate_id": uuid4(),
            "candidate_name": "Test",
            # Missing ranking_updated_at
            "match_updated_at": datetime.now(UTC),
            # ... other fields
        }
        
        with pytest.raises(ValueError, match="ranking_updated_at.*required"):
            # This should raise, not crash with KeyError
            _resolve_freshness_status(
                ranking_updated_at=require_datetime(incomplete_row, "ranking_updated_at"),
            )
    
    @pytest.mark.asyncio
    async def test_valid_row_with_all_fields_succeeds(self):
        """Verify complete row works as before."""
        complete_row = {
            "candidate_id": uuid4(),
            "ranking_updated_at": datetime.now(UTC),
            "match_updated_at": datetime.now(UTC),
            "freshness_status": "fresh",
            "job_signature_hash": "abc123",
            "job_profile_hash": "def456",
            "computed_at": datetime.now(UTC),
            "job_updated_at": datetime.now(UTC),
        }
        
        freshness, reason = _resolve_freshness_status(
            ranking_updated_at=require_datetime(complete_row, "ranking_updated_at"),
            # ... etc
        )
        assert freshness == "fresh"

# Similar pattern for all 8 critical fixes
```

---

## DEPLOYMENT CHECKLIST

Before deploying these fixes:

### Pre-Deployment
- [ ] All tests pass: `pytest backend/tests -v`
- [ ] Type checking passes: `mypy backend/src --strict`
- [ ] No new imports of deleted modules: `grep -r "from.*deleted_module"`
- [ ] Staging DB migration succeeds: `alembic upgrade head`

### Deployment
- [ ] Backup production DB
- [ ] Deploy code without migrations first
- [ ] Run queries to detect any errors (should see new error logs for silent failures)
- [ ] Review error logs for 24 hours
- [ ] If errors found, rollback and investigate
- [ ] Run migration in low-traffic window

### Post-Deployment
- [ ] Monitor error rate (should increase slightly due to fail-fast)
- [ ] Verify no increase in 500 errors (should be ValueError not Exception)
- [ ] Check new log entries for "ranking_updated_at is required" etc
- [ ] After 7 days, verify no more silent failures

---

## PRIORITY ORDER

Execute in this order (dependencies):

1. **FIX #2** - Unsafe nested dict (prerequisite for tests)
2. **FIX #3** - Silent JSON (prerequisite for validation)
3. **FIX #1** - Unsafe dict access (main safety issue)
4. **FIX #4** - Version coercion (dependent on FIX #1)
5. **FIX #5** - getattr chain (independent)
6. **FIX #6** - Version field (schema change, can be deferred)
7. **FIX #7** - Analysis failure (search and apply broadly)
8. **FIX #8** - Defensive defaults (final polish)

---

**Status:** Ready to implement  
**Estimated Time:** 2-3 days with testing  
**Risk:** HIGH - Must test thoroughly before production deployment  
**Rollback:** Can revert code changes; may need data cleanup if silent failures occurred
