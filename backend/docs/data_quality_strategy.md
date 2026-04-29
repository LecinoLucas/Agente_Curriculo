# Data Quality Strategy

## Overview

The Resume AI System implements a comprehensive data quality management strategy to ensure ranking and matching decisions are based on clean, valid candidate data. Invalid candidates are flagged rather than deleted, maintaining referential integrity and audit trails.

## Classification Statuses

### Valid
- Candidate has at least one resume with extracted text content
- Extracted text is at least 50 characters
- Resume was successfully parsed
- **Impact**: Candidate is included in ranking and matching

### No Resume
- Candidate has zero resumes attached
- May be test data, imported profile without document, or incomplete onboarding
- **Impact**: Candidate is excluded from ranking; recruiters see "No resume attached"

### Empty Resume
- Candidate has resume(s) but extracted content is empty or too short (< 50 chars)
- May indicate: PDF with only images, corrupted file, or minimal content
- **Impact**: Excluded from ranking; recruiters can review and re-upload

### Parsing Failed
- Resume was uploaded but automatic text extraction failed
- May indicate: unsupported format, encryption, corruption, or language issue
- **Impact**: Excluded from ranking; recruiters receive notification to re-submit

### Invalid (Manual)
- Manually marked as invalid by admin with mandatory reason and audit trail
- Fully reversible: admin can unmark, triggering automatic re-classification
- Reasons recorded with: admin UUID, timestamp, explanation
- **Impact**: Excluded from ranking; flagged in candidate views

### Unknown
- Default status for new candidates before first classification
- Classification not yet run or in progress
- **Impact**: Treated as valid until proven otherwise (safe default)

## Automatic Classification

Classification happens via the `DataQualityClassifier` service:

```python
classification = DataQualityClassifier.classify(
    candidate_id=str(candidate_id),
    has_resume=True,
    resume_text="extracted resume content",
    resume_parsed_successfully=True,
)
# Returns: ClassificationResult(status=DataQualityStatus.VALID, reason="...")
```

### Classification Criteria

1. **No Resume Check**: If no resumes exist → NO_RESUME
2. **Parsing Status Check**: If parsing explicitly failed → PARSING_FAILED
3. **Content Length Check**: If text is None or < 50 chars → EMPTY_RESUME
4. **Default**: All other cases → VALID

## Implementation

### Database Schema

```sql
ALTER TABLE candidates ADD COLUMN data_quality_status VARCHAR(50) DEFAULT 'unknown';
ALTER TABLE candidates ADD COLUMN data_quality_reason TEXT;
ALTER TABLE candidates ADD COLUMN data_quality_marked_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX idx_candidates_data_quality_status ON candidates(data_quality_status);
```

### Services

#### DataQualityService

Main service for managing candidate data quality:

```python
service = DataQualityService(db_session)

# Classify a single candidate based on resume data
status, reason = await service.classify_and_mark_candidate(candidate_id)

# Manually mark as invalid (with audit trail)
await service.mark_invalid(
    candidate_id=candidate_id,
    reason="Resume is corrupted and unreadable",
    marked_by=admin_user_id,
)

# Revert manual marking (re-classifies automatically)
await service.unmark_invalid(candidate_id, marked_by=admin_user_id)

# Batch classify all candidates
counts = await service.reclassify_all_candidates()
# Returns: {
#   "valid": 150, "no_resume": 10, "empty_resume": 5,
#   "parsing_failed": 2, "invalid_manual": 1, "unknown": 32, "failed": 0
# }

# Get candidates with specific status
valid_candidates = await service.get_candidates_by_quality(
    DataQualityStatus.VALID,
    limit=100,
    offset=0,
)

# Filter a list of candidates, excluding invalid ones
filtered_ids = await service.exclude_invalid_from_ranking(candidate_ids)
```

## API Endpoints

### Admin Data Quality Management

All endpoints require admin role (UserRole.ADMIN).

#### POST `/api/v1/admin/data-quality/classify/{candidate_id}`

Classify a single candidate based on resume data.

**Response:**
```json
{
  "candidate_id": "uuid",
  "status": "valid|no_resume|empty_resume|parsing_failed|invalid_manual|unknown",
  "reason": "Explanation of status",
  "marked_at": "2026-04-28T10:30:00Z"
}
```

#### POST `/api/v1/admin/data-quality/mark-invalid/{candidate_id}`

Manually mark candidate as invalid with audit trail.

**Request:**
```json
{
  "reason": "Explanation of why marking as invalid (min 10 chars)"
}
```

**Response:** Same as classify endpoint

#### POST `/api/v1/admin/data-quality/unmark-invalid/{candidate_id}`

Revert manual invalid marking and re-classify.

**Response:** Same as classify endpoint

#### POST `/api/v1/admin/data-quality/batch-classify`

Batch classify all candidates (may take time on large datasets).

**Response:**
```json
{
  "total": 200,
  "valid": 150,
  "no_resume": 10,
  "empty_resume": 5,
  "parsing_failed": 2,
  "invalid_manual": 1,
  "unknown": 32,
  "failed": 0
}
```

#### GET `/api/v1/admin/data-quality/candidates/by-status/{status}`

Fetch candidates with specific status (paginated).

**Query params:**
- `limit`: Results per page (default: 100)
- `offset`: Pagination offset (default: 0)

**Response:**
```json
[
  {
    "candidate_id": "uuid",
    "status": "valid",
    "reason": "Has valid resume",
    "marked_at": "2026-04-28T10:30:00Z"
  }
]
```

## Ranking Integration

The ranking service automatically excludes invalid candidates:

```python
# In CandidateRankingService._fetch_persisted_scores():
.where(
    CandidateJobScoreModel.job_id == job_id,
    CandidateModel.data_quality_status.in_(["valid", "unknown"]),
    # ... other filters
)
```

Valid candidates are included; invalid statuses are excluded:
- ✅ Valid
- ✅ Unknown (safe default)
- ❌ No Resume
- ❌ Empty Resume
- ❌ Parsing Failed
- ❌ Invalid (Manual)

## Scripts

### Batch Classification

Classify all candidates based on resume data:

```bash
python scripts/classify_candidates.py
```

Output:
```
===================================================
Classification Complete
===================================================
Time elapsed: 45.3 seconds
Total processed: 200
  Valid: 150
  No resume: 10
  Empty resume: 5
  Parsing failed: 2
  Invalid (manual): 1
  Unknown: 32
  Failed to process: 0
===================================================
```

### Dev Environment Truncation

Safely remove all test data from dev environment:

```bash
# Requires confirmation
python scripts/dev_truncate_candidates.py

# Force without confirmation
python scripts/dev_truncate_candidates.py --force
```

**Safety**: Only works if DATABASE_URL contains "localhost" or "test".

## Logging

All operations are logged with context:

```python
logger.info(
    "Classified candidate {candidate_id}: {status}",
    extra={"candidate_id": str(candidate_id), "status": "valid"}
)

logger.warning(
    "Candidate {candidate_id} manually marked as invalid",
    extra={
        "candidate_id": str(candidate_id),
        "marked_by": str(admin_id),
        "reason": "..."
    }
)
```

## Testing

### Unit Tests
- `tests/unit/test_data_quality_classifier.py`
  - Classification logic for each status
  - Edge cases (boundary conditions, unicode, etc.)

### Integration Tests
- `tests/integration/test_data_quality_service.py`
  - Database operations
  - Audit trails
  - Batch operations
  - Filtering

## FAQ

### Can I delete invalid candidates?

No, invalid candidates are flagged, not deleted. This maintains:
- Referential integrity (scores, pipeline entries, history)
- Audit trails (who marked them, when, why)
- Ability to unmark and reconsider

### What happens to their scores?

Scores remain in database but candidates are excluded from ranking results via the data_quality_status filter.

### Can a recruiter unmark invalid candidates?

No, only admins can unmark. This prevents accidental inclusion of bad data in ranking.

### What if I manually mark a candidate invalid, then change my mind?

Call the unmark endpoint. The candidate will be automatically re-classified based on current resume data.

### How do I initialize data quality for existing candidates?

Run the batch classification script:
```bash
python scripts/classify_candidates.py
```

This will classify all candidates based on their resumes.

## Future Enhancements

1. **Automatic re-classification**: Trigger on resume upload/update
2. **Quality metrics**: Dashboard showing quality distribution
3. **Bulk operations**: Mark multiple candidates at once via CSV
4. **Webhooks**: Notify external systems when candidates marked invalid
5. **Recovery suggestions**: Auto-suggestions for marked candidates (e.g., "ask for resume re-upload")
