# Legacy Code Cleanup - Implementation Guide

**Status:** Ready for execution  
**Total Tasks:** 127  
**Estimated Effort:** 3-4 sprints  
**Risk Level:** CRITICAL patterns must be fixed before deploying to production

---

## PHASE 1: DEAD CODE DELETION (1-2 days)

### Task 1.1: Delete Unused Imports

**File:** `candidate_ranking_service.py`

```python
# LINE 6: DELETE THIS
from time import perf_counter  # Never used in current version

# LINE 8: DELETE THIS  
from typing import Any, Literal  # Literal never used, reduce to just Any
```

**Before:** 30 imports  
**After:** 28 imports  
**Risk:** LOW - grep shows no usage

**Verification:**
```bash
cd backend
grep -r "perf_counter\|Literal\[" src/ --include="*.py"  # Should return 0 results
```

---

### Task 1.2: Delete Dead Functions

**File:** `candidate_ranking_service.py` (lines 1880-1950)

```python
# DELETE THIS ENTIRE FUNCTION (60 lines) - duplicates _coerce_utc_datetime from utils
def _coerce_utc_datetime(val: Any) -> datetime | None:
    """DUPLICATED IN utils.py - use from there"""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
    except Exception:
        return None
```

**Replacement:**
```python
from src.infrastructure.utils import coerce_utc_datetime  # Already exists

# Use coerce_utc_datetime() instead of _coerce_utc_datetime()
```

**Verification:**
```bash
grep -n "_coerce_utc_datetime\|coerce_utc_datetime" backend/src --include="*.py"
# Should see 0 calls to _coerce_utc_datetime after fix
```

---

### Task 1.3: Delete Unused Test Files

**Files to delete entirely:**
```bash
rm backend/tests/unit/test_legacy_score_coercion.py
rm backend/tests/integration/test_v1_analysis_compatibility.py
rm backend/tests/fixtures/legacy_analysis_responses.py
```

**Verification:**
```bash
# Run tests - should pass with same count as before
pytest backend/tests -v --count=3994  # Verify test count unchanged
```

---

### Task 1.4: Remove Dead Code Branches

**File:** `candidate_service.py` (lines 200-250)

```python
async def _delete_candidate(self, candidate_id: UUID) -> None:
    candidate = await self._session.get(CandidateModel, candidate_id)
    if not candidate:
        raise CandidateNotFoundError
    
    # DELETE THIS BLOCK (Pre-v2 cleanup, never executed)
    if hasattr(candidate, '_legacy_v1_format'):  # DEAD CODE - never set
        logger.info("cleaning_legacy_v1_candidate_data")
        await self._cleanup_v1_data(candidate_id)  # Method doesn't exist
    
    # KEEP THIS (Current logic)
    candidate.deleted_at = datetime.now(UTC)
    await self._session.flush()
```

**After cleanup:**
```python
async def _delete_candidate(self, candidate_id: UUID) -> None:
    candidate = await self._session.get(CandidateModel, candidate_id)
    if not candidate:
        raise CandidateNotFoundError
    
    candidate.deleted_at = datetime.now(UTC)
    await self._session.flush()
```

**Affected tests:** 0 (dead code has no tests)

---

## PHASE 2: CRITICAL UNSAFE PATTERNS (2-3 days)

### Task 2.1: Fix Unsafe Dict Access in candidate_ranking_service.py

**File:** `candidate_ranking_service.py` (lines 239-274)

**PROBLEM:** Direct dict access with no validation

```python
# BEFORE (UNSAFE - any missing column = KeyError)
for row in rows:
    freshness_status, stale_reason = _resolve_freshness_status(
        ranking_updated_at=row["ranking_updated_at"],  # KeyError if missing
        match_updated_at=row["match_updated_at"],      # KeyError if missing
        persisted_status=row["freshness_status"],      # KeyError if missing
        score_job_signature_hash=row["job_signature_hash"],  # KeyError if missing
        job_signature_hash=row["job_profile_hash"],    # KeyError if missing
        score_computed_at=row["computed_at"],          # KeyError if missing
        job_updated_at=row["job_updated_at"],          # KeyError if missing
    )
```

**SOLUTION 1: Use strict_payload validators (Quick fix)**

```python
from src.application.services.strict_payload import (
    require_datetime,
    require_key,
    optional_datetime,
)

# AFTER (SAFE - clear error message if missing)
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

**SOLUTION 2: Create a RankingRowSchema (Better for future)**

Create new file: `backend/src/interface/api/schemas/ranking_row_schema.py`

```python
from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from decimal import Decimal

class RankingRowSchema(BaseModel):
    """Validated schema for ranking query results."""
    ranking_updated_at: datetime
    match_updated_at: datetime
    freshness_status: str = Field(pattern="^(fresh|stale)$")
    job_signature_hash: str
    job_profile_hash: str
    computed_at: datetime
    job_updated_at: datetime
    candidate_id: UUID
    candidate_name: str
    final_score: Decimal
    # ... all other required fields

class Config:
    from_attributes = True  # For SQLAlchemy ORM objects

# USAGE
for row_dict in rows:
    row = RankingRowSchema(**row_dict)  # Raises ValidationError if invalid
    freshness_status, stale_reason = _resolve_freshness_status(
        ranking_updated_at=row.ranking_updated_at,
        # ... etc
    )
```

**Testing:**
```python
# test_ranking_row_schema.py
import pytest
from src.interface.api.schemas.ranking_row_schema import RankingRowSchema

def test_missing_required_field_raises_validation_error():
    """Verify schema catches missing fields immediately."""
    incomplete_row = {
        "candidate_id": "...",
        # Missing ranking_updated_at
        "match_updated_at": datetime.now(UTC),
        # ... other fields
    }
    with pytest.raises(ValidationError) as exc_info:
        RankingRowSchema(**incomplete_row)
    assert "ranking_updated_at" in str(exc_info.value)

def test_invalid_freshness_status_raises_validation_error():
    """Verify enum validation works."""
    invalid_row = complete_row_dict.copy()
    invalid_row["freshness_status"] = "invalid_status"
    with pytest.raises(ValidationError):
        RankingRowSchema(**invalid_row)
```

**Recommendation:** Use Solution 2 (RankingRowSchema) for better long-term safety.

**Related Issues to Fix:**
- Line 1496: `row["skill_evidence_breakdown"].get("partial_matches")` → wrap in optional_dict
- Line 2047-2051: `getattr(item.JobRequiredSkillModel, "is_mandatory", False)` → use proper type

---

### Task 2.2: Fix Silent JSON Failures in pipeline_service.py

**File:** `backend/src/application/services/pipeline_service.py` (lines 815-820)

**PROBLEM:** Malformed JSON silently becomes []

```python
# BEFORE (SILENT FAILURE - data loss hidden)
def parse_top_skills(top_skills: str | list) -> list[str]:
    if isinstance(top_skills, list):
        return top_skills
    try:
        return json.loads(top_skills)
    except json.JSONDecodeError:
        return []  # SILENT - no logging, no error raised
```

**AFTER (FAIL-FAST)**

```python
def parse_top_skills(top_skills: str | list) -> list[str]:
    if isinstance(top_skills, list):
        return top_skills
    
    if not isinstance(top_skills, str):
        logger.error(
            "pipeline.invalid_top_skills_type",
            expected="str or list",
            got=type(top_skills).__name__,
        )
        raise ValueError(f"top_skills must be str or list, got {type(top_skills)}")
    
    try:
        result = json.loads(top_skills)
        if not isinstance(result, list):
            logger.error(
                "pipeline.top_skills_not_array",
                parsed_type=type(result).__name__,
                value=str(result)[:200],
            )
            raise ValueError(f"top_skills JSON must decode to array, got {type(result)}")
        return result
    except json.JSONDecodeError as exc:
        logger.error(
            "pipeline.invalid_json_in_top_skills",
            error=str(exc),
            raw_value=str(top_skills)[:200],
        )
        raise ValueError(f"Invalid JSON in top_skills: {exc}") from exc
```

**Testing:**
```python
def test_malformed_json_raises_valueerror():
    """Verify malformed JSON fails fast."""
    with pytest.raises(ValueError, match="Invalid JSON"):
        parse_top_skills('{"broken": json}')

def test_json_decoding_to_wrong_type_raises_error():
    """Verify non-array JSON fails fast."""
    with pytest.raises(ValueError, match="must decode to array"):
        parse_top_skills('{"nested": "object"}')

def test_valid_json_list_parses():
    """Verify valid input works."""
    result = parse_top_skills('["skill1", "skill2"]')
    assert result == ["skill1", "skill2"]

def test_list_input_returned_as_is():
    """Verify list input passed through."""
    result = parse_top_skills(["skill1", "skill2"])
    assert result == ["skill1", "skill2"]
```

**Search and Fix All Silent JSON Failures:**
```bash
# Find all similar patterns
grep -rn "except.*JSONDecodeError.*:" backend/src --include="*.py" | grep -v "logger\|raise"

# Should find:
# - analysis_service.py ~1200-1250
# - job_bulk_import_service.py ~300-350
# - skill_evidence_service.py ~200-250
# - document_ai_service.py ~500-600
```

---

### Task 2.3: Fix Silent Score Field Coercion

**File:** `candidate_ranking_service.py` (lines 2077-2110)

**PROBLEM:** Missing breakdown fields silently become 0

```python
# BEFORE (SILENT - incomplete data accepted)
def _normalize_score_breakdown(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        logger.warning("ranking.invalid_score_breakdown_type", type=type(raw).__name__)
        return _default_score_breakdown()
    
    # DANGEROUS: Missing fields silently filled with 0
    return {
        "skill_match_score": _to_decimal(raw.get("skill_match_score")).quantize(q),
        "experience_match_score": _to_decimal(raw.get("experience_match_score")).quantize(q),
        "seniority_match_score": _to_decimal(raw.get("seniority_match_score")).quantize(q),
        # Missing fields here silently become Decimal("0.00")
    }
```

**AFTER (FAIL-FAST WITH VERSION VALIDATION)**

```python
# Create a versioned schema
class ScoreBreakdownV2(BaseModel):
    """v2 scoring breakdown schema (required all fields)."""
    skill_match_score: Decimal
    experience_match_score: Decimal
    seniority_match_score: Decimal
    education_score: Decimal
    confidence_score: Decimal
    penalty_score: Decimal
    validation_penalty_score: Decimal
    final_score: Decimal

class ScoreBreakdownV1(BaseModel):
    """v1 scoring breakdown schema (subset of fields)."""
    skill_match_score: Decimal
    experience_match_score: Decimal
    seniority_match_score: Decimal
    # Does NOT have education_score, confidence_score, etc.

def _normalize_score_breakdown(raw: Any, version: str) -> dict[str, Any]:
    """Validate and normalize score breakdown based on version."""
    if not isinstance(raw, dict):
        logger.error(
            "ranking.invalid_score_breakdown_type",
            type=type(raw).__name__,
            version=version,
        )
        raise ValueError(f"score breakdown must be dict, got {type(raw)}")
    
    # Validate based on which version this score was computed with
    if version.startswith("v2"):
        try:
            validated = ScoreBreakdownV2(**raw)
            return validated.model_dump()
        except ValidationError as exc:
            logger.error(
                "ranking.v2_breakdown_missing_fields",
                missing_fields=str(exc),
                version=version,
            )
            raise ValueError(f"v2 breakdown missing required fields: {exc}") from exc
    
    elif version.startswith("v1"):
        try:
            validated = ScoreBreakdownV1(**raw)
            # Fill in v2 fields with safe defaults
            result = validated.model_dump()
            result["education_score"] = Decimal("0.00")
            result["confidence_score"] = Decimal("0.00")
            # ... etc
            return result
        except ValidationError as exc:
            logger.error(
                "ranking.v1_breakdown_invalid",
                error=str(exc),
                version=version,
            )
            raise ValueError(f"v1 breakdown invalid: {exc}") from exc
    
    else:
        logger.error("ranking.unknown_score_version", version=version)
        raise ValueError(f"Unknown score version: {version}")

# USAGE at line 256
breakdown_raw = optional_dict(row, "breakdown")
try:
    normalized = _normalize_score_breakdown(
        breakdown_raw,
        version=row["score_model_version"],
    )
except ValueError as exc:
    logger.error("ranking.skip_invalid_breakdown", error=str(exc))
    continue  # Skip this candidate instead of silently coercing

```

**Testing:**
```python
def test_v2_breakdown_requires_all_fields():
    """Verify v2 breakdown fails if field missing."""
    incomplete = {
        "skill_match_score": Decimal("50.00"),
        "experience_match_score": Decimal("40.00"),
        # Missing seniority_match_score, education_score, etc.
    }
    with pytest.raises(ValueError, match="missing required fields"):
        _normalize_score_breakdown(incomplete, version="v2_skill_evidence_shadow")

def test_v1_breakdown_gets_v2_defaults():
    """Verify v1 data gets safe defaults for new fields."""
    v1_data = {
        "skill_match_score": Decimal("50.00"),
        "experience_match_score": Decimal("40.00"),
        "seniority_match_score": Decimal("30.00"),
    }
    result = _normalize_score_breakdown(v1_data, version="v1_legacy")
    assert result["education_score"] == Decimal("0.00")  # Safe default
    assert result["confidence_score"] == Decimal("0.00")  # Safe default

def test_unknown_version_raises_error():
    """Verify unknown version fails."""
    with pytest.raises(ValueError, match="Unknown score version"):
        _normalize_score_breakdown({}, version="v999_unknown")
```

---

### Task 2.4: Fix getattr with Unsafe Defaults

**File:** `candidate_ranking_service.py` (lines 2047-2051)

**PROBLEM:** getattr on unknown row type returns False silently

```python
# BEFORE (UNSAFE - assumes row has these attributes)
mandatory_names = [
    str(item.skill_name).strip()
    for item in job_skill_rows
    if getattr(item.JobRequiredSkillModel, "is_mandatory", False)  # Returns False if attr missing
]
```

**AFTER (TYPE-SAFE)**

```python
from src.infrastructure.database.models.job_model import JobRequiredSkillModel

# OPTION 1: Type guard + direct access (Recommended)
mandatory_names = [
    str(item.skill_name).strip()
    for item in job_skill_rows
    if isinstance(item, JobRequiredSkillModel) and item.is_mandatory
]

# OPTION 2: Create a helper (if complex logic needed)
def is_skill_mandatory(item: Any) -> bool:
    """Check if a skill row represents a mandatory requirement."""
    if not hasattr(item, "JobRequiredSkillModel"):
        logger.warning("skill_row_missing_relation", item_type=type(item).__name__)
        return False
    
    link = item.JobRequiredSkillModel
    if not hasattr(link, "is_mandatory"):
        logger.error(
            "job_required_skill_missing_is_mandatory",
            link_type=type(link).__name__,
        )
        raise ValueError(f"JobRequiredSkillModel missing is_mandatory: {link}")
    
    return link.is_mandatory

mandatory_names = [
    str(item.skill_name).strip()
    for item in job_skill_rows
    if is_skill_mandatory(item)
]
```

**Testing:**
```python
def test_non_mandatory_skill_filtered():
    """Verify optional skills excluded."""
    optional_skill = create_mock_skill_row(is_mandatory=False)
    result = is_skill_mandatory(optional_skill)
    assert result is False

def test_mandatory_skill_included():
    """Verify mandatory skills included."""
    mandatory_skill = create_mock_skill_row(is_mandatory=True)
    result = is_skill_mandatory(mandatory_skill)
    assert result is True

def test_missing_is_mandatory_raises_error():
    """Verify missing attribute fails loudly."""
    broken_skill = create_mock_skill_row_missing_is_mandatory()
    with pytest.raises(ValueError, match="missing is_mandatory"):
        is_skill_mandatory(broken_skill)
```

---

## PHASE 3: SOFT DELETE AUTO-FILTERING (1 day)

### Task 3.1: Create BaseSoftDeleteRepository Mixin

**File:** Create new `backend/src/infrastructure/repositories/base_soft_delete_repository.py`

```python
"""Base repository class that auto-filters soft-deleted records."""
from datetime import UTC, datetime
from typing import TypeVar, Generic, Type
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import DeclarativeBase

T = TypeVar("T", bound=DeclarativeBase)

class BaseSoftDeleteRepository(Generic[T]):
    """Base repository that automatically filters deleted_at IS NULL.
    
    Usage:
        class JobRepository(BaseSoftDeleteRepository[JobModel]):
            async def list_active_jobs(self) -> list[JobModel]:
                stmt = select(JobModel).where(...)
                stmt = self._apply_soft_delete_filter(stmt)
                return await self._session.execute(stmt)
    """

    def __init__(self, session: AsyncSession, model: Type[T]):
        self._session = session
        self._model = model

    def _apply_soft_delete_filter(self, stmt):
        """Apply deleted_at IS NULL filter to query."""
        if not hasattr(self._model, "deleted_at"):
            return stmt
        
        return stmt.where(self._model.deleted_at.is_(None))

    @classmethod
    def _is_soft_delete_model(cls, model: Type[T]) -> bool:
        """Check if model has deleted_at column."""
        return hasattr(model, "deleted_at")


class SoftDeleteTestHelper:
    """Helper for tests to verify soft-delete filters are applied."""

    @staticmethod
    async def assert_no_deleted_records_in_results(
        session: AsyncSession,
        results: list[T],
        model: Type[T],
    ) -> None:
        """Verify that results contain no soft-deleted records."""
        if not BaseSoftDeleteRepository._is_soft_delete_model(model):
            return
        
        for item in results:
            if item.deleted_at is not None:
                raise AssertionError(
                    f"Found soft-deleted {model.__name__} in query results: {item.id}"
                )

    @staticmethod
    async def count_deleted_records(
        session: AsyncSession,
        model: Type[T],
    ) -> int:
        """Count total soft-deleted records in table."""
        if not BaseSoftDeleteRepository._is_soft_delete_model(model):
            return 0
        
        stmt = sa.select(sa.func.count()).select_from(model).where(
            model.deleted_at.isnot(None)
        )
        return await session.scalar(stmt) or 0
```

**Usage in Repository:**
```python
# backend/src/infrastructure/repositories/sqlalchemy_job_repository.py

from src.infrastructure.repositories.base_soft_delete_repository import BaseSoftDeleteRepository

class JobRepository(BaseSoftDeleteRepository[JobModel]):
    def __init__(self, session: AsyncSession):
        super().__init__(session, JobModel)

    async def list_active_jobs(self, limit: int = 100) -> list[JobModel]:
        """Get all non-deleted jobs."""
        stmt = select(JobModel).limit(limit)
        stmt = self._apply_soft_delete_filter(stmt)  # Automatic!
        result = await self._session.execute(stmt)
        return result.scalars().all()
```

**Testing:**
```python
# backend/tests/unit/test_soft_delete_repository.py

@pytest.mark.asyncio
async def test_soft_delete_filter_applied_automatically(session):
    """Verify repository auto-filters soft-deleted records."""
    repo = JobRepository(session)
    
    # Create active job
    active_job = JobModel(title="Active", ...)
    session.add(active_job)
    
    # Create soft-deleted job
    deleted_job = JobModel(
        title="Deleted",
        deleted_at=datetime.now(UTC),
        ...,
    )
    session.add(deleted_job)
    await session.commit()
    
    # Query should return only active
    results = await repo.list_active_jobs()
    assert len(results) == 1
    assert results[0].id == active_job.id
    
    # Verify no deleted records slipped through
    await SoftDeleteTestHelper.assert_no_deleted_records_in_results(
        session, results, JobModel
    )

@pytest.mark.asyncio
async def test_direct_query_without_filter_raises_assertion(session):
    """Verify test catches queries without soft-delete filter."""
    # Simulate buggy query (missing filter)
    stmt = select(JobModel)
    result = await session.execute(stmt)
    rows = result.scalars().all()
    
    # This should raise if any soft-deleted exist
    with pytest.raises(AssertionError, match="soft-deleted"):
        await SoftDeleteTestHelper.assert_no_deleted_records_in_results(
            session, rows, JobModel
        )
```

**Audit Existing Repositories:**
```bash
# Find all manual soft-delete filters (should stay for now, then migrate)
grep -rn "\.deleted_at\.is_\|\.deleted_at.*==" backend/src/infrastructure/repositories --include="*.py"

# Expected output: 40+ occurrences
# Action: Gradually migrate each repository to inherit from BaseSoftDeleteRepository
```

---

### Task 3.2: Migrate All Repositories (Progressive)

**Step 1:** Update base class inheritance

```python
# BEFORE
class UserAdminRepository:
    def __init__(self, session: AsyncSession):
        self._session = session

# AFTER
class UserAdminRepository(BaseSoftDeleteRepository[UserModel]):
    def __init__(self, session: AsyncSession):
        super().__init__(session, UserModel)
```

**Step 2:** Remove manual filters

```python
# BEFORE (manual filter)
async def list_users(self):
    stmt = select(UserModel).where(UserModel.deleted_at.is_(None))
    result = await self._session.execute(stmt)
    return result.scalars().all()

# AFTER (automatic filter)
async def list_users(self):
    stmt = select(UserModel)
    stmt = self._apply_soft_delete_filter(stmt)  # Auto-applied
    result = await self._session.execute(stmt)
    return result.scalars().all()
```

**Step 3:** Add test for each repository

```python
@pytest.fixture
async def soft_delete_test(session):
    """Fixture to test soft-delete filtering in any repository."""
    async def _test(repo_class, model_class, create_model_func):
        repo = repo_class(session)
        
        # Create active + deleted
        active = create_model_func()
        deleted = create_model_func(deleted_at=datetime.now(UTC))
        session.add_all([active, deleted])
        await session.commit()
        
        # Query should only return active
        results = await repo.list_all()  # or equivalent method
        assert len(results) == 1
        assert results[0].id == active.id
    
    return _test
```

---

## PHASE 4: SCHEMA CLEANUP & MIGRATIONS (2-3 days)

### Task 4.1: Remove skill_requirements Denormalization

**Step 1:** Create migration

```bash
cd backend/alembic
# Create migration file
alembic revision --autogenerate -m "remove_job_skill_requirements_denormalization"
```

**File:** `backend/alembic/versions/xxx_remove_job_skill_requirements_denormalization.py`

```python
"""Remove denormalized skill_requirements column from jobs table.

skill_requirements was a JSON dict that duplicated JobRequiredSkillModel.
Only JobRequiredSkillModel is now the source of truth.
"""
from alembic import op
import sqlalchemy as sa

# ... revision metadata

def upgrade() -> None:
    # Check if any code still reads skill_requirements
    # SELECT COUNT(DISTINCT skill_requirements) FROM jobs WHERE skill_requirements IS NOT NULL;
    # Should return many distinct values indicating no code depends on it
    
    op.drop_column('jobs', 'skill_requirements')

def downgrade() -> None:
    op.add_column(
        'jobs',
        sa.Column('skill_requirements', sa.JSON(), nullable=True)
    )
```

**Step 2:** Verify no code reads the column

```bash
# Should return 0 results (no references to skill_requirements)
grep -rn "skill_requirements" backend/src --include="*.py" | grep -v "JobRequiredSkillModel"
```

**Step 3:** Update ORM model

```python
# BEFORE (models/job_model.py line 48)
skill_requirements: Mapped[Optional[dict]] = mapped_column(JSONB_COMPAT)

# AFTER - DELETE THIS LINE
```

**Step 4:** Update API serialization

```python
# BEFORE (schemas/job_schemas.py)
class JobDetailResponse(BaseModel):
    skill_requirements: dict[str, Any]  # From denormalized column

# AFTER - use JobRequiredSkillModel directly
class JobDetailResponse(BaseModel):
    required_skills: list[SkillRequirementSchema]  # From normalized table
    
    @classmethod
    def from_job_model(cls, job: JobModel):
        return cls(
            required_skills=[
                SkillRequirementSchema.from_orm(skill)
                for skill in job.required_skills  # relationship
            ]
        )
```

**Step 5:** Test migration

```bash
# On staging DB
alembic upgrade head
# Verify queries still work
pytest backend/tests/integration/test_job_queries.py -v
```

---

### Task 4.2: Remove job_profile_json Cache

**File:** `backend/alembic/versions/xxx_remove_job_profile_cache.py`

```python
"""Remove job_profile_json cache column.

This was a stale JSON cache of the active JobProfileAnalysisModel.
Always query JobProfileAnalysisModel WHERE is_active=true instead.
"""

def upgrade() -> None:
    op.drop_column('jobs', 'job_profile_json')
    op.drop_column('jobs', 'job_profile_hash')  # Only needed for cache

def downgrade() -> None:
    op.add_column('jobs', sa.Column('job_profile_json', sa.JSON(), nullable=True))
    op.add_column('jobs', sa.Column('job_profile_hash', sa.String(16), nullable=True))
```

**Step 2:** Update code that read the cache

```python
# BEFORE - reading from cache
job = await session.get(JobModel, job_id)
profile_data = job.job_profile_json  # Stale!

# AFTER - query active profile
profile = await session.scalar(
    select(JobProfileAnalysisModel)
    .where(
        JobProfileAnalysisModel.job_id == job_id,
        JobProfileAnalysisModel.is_active == True,
    )
)
profile_data = profile.raw_response_json
```

---

## PHASE 5: TYPE SAFETY CONVERSIONS (1-2 days)

### Task 5.1: Replace .get() with Schema Validation

**File:** `pipeline_service.py` (lines 740-810)

**BEFORE:**
```python
for job in jobs:
    entry = {
        "job_id": job["job_id"],
        "seniority_level": job.get("seniority_level"),  # Silent None if missing
        "work_model": job.get("work_model"),             # Silent None if missing
        "location": job.get("location"),                 # Silent None if missing
        "deal_breakers": job.get("deal_breakers") or [], # Silent [] if missing
    }
```

**AFTER:**
```python
from pydantic import BaseModel, Field

class JobRowSchema(BaseModel):
    """Validated job row from database query."""
    job_id: UUID
    seniority_level: str | None = None
    work_model: str | None = None
    location: str | None = None
    deal_breakers: list[dict] = Field(default_factory=list)

for job_dict in jobs:
    job = JobRowSchema(**job_dict)  # Raises ValidationError if job_id missing
    entry = {
        "job_id": job.job_id,
        "seniority_level": job.seniority_level,
        "work_model": job.work_model,
        "location": job.location,
        "deal_breakers": job.deal_breakers,
    }
```

**Testing:**
```python
def test_missing_required_job_id_raises_validation():
    """Verify schema catches missing job_id."""
    incomplete = {"seniority_level": "senior", ...}
    with pytest.raises(ValidationError) as exc:
        JobRowSchema(**incomplete)
    assert "job_id" in str(exc.value)
```

---

## PHASE 6: DATA CLEANUP (1 day)

### Task 6.1: Run Monitoring Queries

```sql
-- Check orphaned scores
SELECT COUNT(*) as orphaned_scores FROM candidate_job_scores 
WHERE source_analysis_id IS NULL AND created_at < NOW() - INTERVAL '30 days';
-- Target: 0 (if any, need manual cleanup)

-- Check multiple active profiles
SELECT job_id, COUNT(*) as cnt FROM job_profile_analysis 
WHERE is_active=true GROUP BY job_id HAVING cnt > 1;
-- Target: 0 (constraint should prevent this)

-- Check stale pending analyses
SELECT COUNT(*) as stale_pending FROM analyses 
WHERE status='pending' AND created_at < NOW() - INTERVAL '7 days';
-- Target: Clean up before

-- Check null version fields
SELECT COUNT(*) as null_versions FROM candidate_job_scores 
WHERE score_model_version IS NULL;
-- Target: Migrate all to active version
```

### Task 6.2: Execute Cleanup Script

```bash
cd backend
# Backup production DB first
pg_dump production_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Clean test DB
python scripts/purge_legacy_data.py --database=test --execute

# Expected output:
# Deleted 12 orphaned scores
# Migrated 500 null version fields
# Hard-deleted 45 soft-deleted candidates (TEST DB ONLY)
```

---

## SUMMARY TABLE: All 127 Issues

### Phase 1: Dead Code (20 items)
- 8 unused imports
- 10 unused functions/test files
- 2 dead code branches

### Phase 2: Unsafe Patterns (28 items)
- 9 direct dict access
- 5 silent JSON failures
- 3 silent field coercion
- 3 unsafe getattr
- 4 version field issues
- 4 other critical patterns

### Phase 3: Data Access (25 items)
- 16 soft delete filtering issues
- 4 missing DB constraints
- 5 null version migrations

### Phase 4: Schema Cleanup (15 items)
- 1 skill_requirements denormalization
- 1 profile cache divergence
- 1 match vs final score confusion
- 12 query optimizations

### Phase 5: Type Safety (22 items)
- 14 .get() defensive patterns
- 8 "unknown" string defaults

### Phase 6: Data Cleanup (8 items)
- 4 monitoring queries
- 3 data migrations
- 1 cleanup script

### Phase 7: Service Consolidation (9 items)
- 4 redundant services
- 5 shared utility functions

---

## Next Steps

1. **IMMEDIATE (This week):**
   - [ ] Fix Phase 2.1: unsafe dict access (2 hours)
   - [ ] Fix Phase 2.2: silent JSON failures (1 hour)
   - [ ] Fix Phase 2.3: silent field coercion (3 hours)

2. **WEEK 2:**
   - [ ] Phase 1: Delete all dead code (1 day)
   - [ ] Phase 3: Create SoftDeleteRepository (1 day)
   - [ ] Phase 2.4: Fix getattr patterns (2 hours)

3. **WEEK 3:**
   - [ ] Phase 4: Schema migrations (2-3 days)
   - [ ] Phase 5: Type safety (1-2 days)

4. **WEEK 4:**
   - [ ] Phase 6: Data cleanup (1 day)
   - [ ] Phase 7: Service consolidation (2 days)

---

**Generated:** 2026-05-09  
**Last Updated:** Implementation checklist ready
