/**
 * Phase 2 — multi-branch unit visibility (staff pipeline).
 *
 * Tests:
 * 1. readPipelineBoardFilters reads operational_unit_id from URL
 * 2. readPipelineBoardFilters returns undefined when param is absent
 * 3. operational_unit_id is preserved through the filters round-trip
 */
import { describe, expect, it } from 'vitest';
import { readPipelineBoardFilters } from '../pipelinePageUtils';

describe('pipelinePageUtils phase 2 – operational_unit_id filter', () => {
  it('reads operational_unit_id from search params', () => {
    const params = new URLSearchParams('operational_unit_id=some-uuid-here');
    const filters = readPipelineBoardFilters(params);
    expect(filters.operational_unit_id).toBe('some-uuid-here');
  });

  it('returns undefined when operational_unit_id is absent', () => {
    const params = new URLSearchParams('entered_from=2024-01-01');
    const filters = readPipelineBoardFilters(params);
    expect(filters.operational_unit_id).toBeUndefined();
  });

  it('returns undefined when operational_unit_id is empty string', () => {
    const params = new URLSearchParams('operational_unit_id=');
    const filters = readPipelineBoardFilters(params);
    expect(filters.operational_unit_id).toBeUndefined();
  });
});
