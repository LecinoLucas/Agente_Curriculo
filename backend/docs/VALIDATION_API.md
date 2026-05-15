# Objective Validation API Documentation

## Overview

The `/analyses/{analysis_id}/matches/{job_id}` endpoint now exposes candidate validation results, allowing the frontend to display:
- **PASS** (✓ green) - Candidate meets all requirements
- **FAIL** (✗ red) - Candidate below minimum threshold (hard reject)
- **UNKNOWN** (! yellow) - Missing evidence (flagged for manual review)

## Response Schema

```json
{
  "analysis_id": "uuid",
  "job_id": "uuid",
  "match_score": 67.50,
  "recommendation": "review_manually",
  "mandatory_skills_matched": 2,
  "mandatory_skills_total": 2,
  "optional_skills_matched": 1,
  "optional_skills_total": 1,
  "seniority_score": 100.00,
  "candidate_seniority": "mid",
  "job_seniority": "mid",
  "validation_status": "unknown",
  "missing_evidence": ["education"],
  "rejection_reasons": [
    "Educação não informada (exigido: bachelor)"
  ]
}
```

## Fields Description

### Validation Fields

| Field | Type | Description |
|-------|------|-------------|
| `validation_status` | string | "pass" \| "fail" \| "unknown" |
| `missing_evidence` | array | List of missing fields: ["education", "experience"] |
| `rejection_reasons` | array | Detailed messages explaining rejections or unknowns |

### Validation States

#### PASS (Green)
- Candidate meets all job requirements
- `validation_status`: "pass"
- `missing_evidence`: []
- `rejection_reasons`: []
- Recommendation: "strong_match", "good_match", or "potential"
- Score: Not penalized

**Example Response:**
```json
{
  "validation_status": "pass",
  "missing_evidence": [],
  "rejection_reasons": [],
  "recommendation": "strong_match",
  "match_score": 85.00
}
```

#### FAIL (Red)
- Candidate below minimum threshold (e.g., education or experience insufficient)
- `validation_status`: "fail"
- `missing_evidence`: []
- `rejection_reasons`: ["Educação insuficiente (high_school < bachelor)", "Experiência insuficiente (2.0 < 5.0 anos)"]
- Recommendation: "not_match"
- Score: Capped at 39 (below "potential")

**Example Response:**
```json
{
  "validation_status": "fail",
  "missing_evidence": [],
  "rejection_reasons": [
    "Educação insuficiente (high_school < bachelor)"
  ],
  "recommendation": "not_match",
  "match_score": 39.00
}
```

#### UNKNOWN (Yellow)
- Missing critical evidence (null education or experience when required)
- `validation_status`: "unknown"
- `missing_evidence`: ["education"] or ["experience"] or both
- `rejection_reasons`: ["Educação não informada (exigido: bachelor)"]
- Recommendation: "review_manually"
- Score: Penalized 10% but not hard-capped (> 39)

**Example Response:**
```json
{
  "validation_status": "unknown",
  "missing_evidence": ["education"],
  "rejection_reasons": [
    "Educação não informada (exigido: bachelor)"
  ],
  "recommendation": "review_manually",
  "match_score": 67.50
}
```

## Frontend Display Examples

### PASS State (Green)
```
✓ Atende aos requisitos
- Educação: Master (exigido: Bachelor) ✓
- Experiência: 5.0 anos (exigido: 3.0) ✓
Score: 85% | Recomendação: Strong Match
```

### FAIL State (Red)
```
✗ Não atende aos requisitos
- Educação: High School (exigido: Bachelor) ✗
- Experiência: 2.0 anos (exigido: 5.0) ✗
Score: 39% | Recomendação: Not a Match
```

### UNKNOWN State (Yellow)
```
! Dados insuficientes para validação
- Educação: [missing] (exigido: Bachelor)
- Experiência: [supplied] (exigido: 3.0)
Score: 67% (com penalidade de 10%) | Recomendação: Review Manually
```

## Color Mapping

| Status | Color | Hex | CSS Class |
|--------|-------|-----|-----------|
| pass | Green | #22c55e | `validation-pass` |
| fail | Red | #ef4444 | `validation-fail` |
| unknown | Yellow | #eab308 | `validation-unknown` |

## Score Impact

The validation system **does not change the score calculation**. It only:
- **PASS**: No impact on score
- **FAIL**: Hard-caps score at 39 (prevents high ranking despite failure)
- **UNKNOWN**: Applies 10% penalty (score * 0.90) to indicate uncertainty

## API Endpoints

### Match Analysis to Job
```
POST /api/v1/analyses/{analysis_id}/matches/{job_id}
Authorization: Bearer token

Response: AnalysisMatchResponse (includes validation fields)
```

### Example Request
```bash
curl -X POST \
  https://api.example.com/api/v1/analyses/550e8400-e29b-41d4-a716-446655440000/matches/550e8400-e29b-41d4-a716-446655440001 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Backward Compatibility

- **Existing clients** without validation display will work fine (fields are optional)
- **New clients** can leverage validation_status and missing_evidence
- **Score calculation** remains unchanged
- **Database** has new optional columns with sensible defaults

## Implementation Notes

### Frontend Components

1. **Validation Indicator**
   - Show colored badge: green/red/yellow
   - Display recommendation text

2. **Rejection/Evidence Details**
   - Expandable section showing rejection_reasons
   - List of missing_evidence if applicable

3. **Score Display**
   - Show score with context: "67% (with 10% uncertainty penalty)"
   - For FAIL: "39% (below minimum requirements)"

### Example React Component

```jsx
function ValidationIndicator({ response }) {
  const statusColors = {
    pass: "bg-green-100 text-green-800",
    fail: "bg-red-100 text-red-800",
    unknown: "bg-yellow-100 text-yellow-800"
  };
  
  const statusIcons = {
    pass: "✓",
    fail: "✗",
    unknown: "!"
  };

  return (
    <div className={statusColors[response.validation_status]}>
      <span>{statusIcons[response.validation_status]}</span>
      <span>{response.recommendation}</span>
      
      {response.rejection_reasons.length > 0 && (
        <details>
          <summary>Detalhes</summary>
          <ul>
            {response.rejection_reasons.map(reason => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
```

## Related Endpoints

- `GET /api/v1/analyses/{analysis_id}` - Get analysis results
- `GET /api/v1/analyses/{analysis_id}/ranking` - Get job ranking with validation
- `POST /api/v1/jobs` - Create job with minimum_education_level and minimum_years_experience
