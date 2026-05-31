import { describe, it, expect } from 'vitest';
import {
  shouldPollAnalysis,
  IN_PROGRESS_ANALYSIS_STATUSES,
  getAnalysisStatusInfo,
} from '../candidatePortalService';

describe('shouldPollAnalysis', () => {
  it('returns true for every in-progress status', () => {
    for (const status of IN_PROGRESS_ANALYSIS_STATUSES) {
      expect(shouldPollAnalysis(status), `expected true for "${status}"`).toBe(true);
    }
  });

  it('returns true for waiting_extraction', () => {
    expect(shouldPollAnalysis('waiting_extraction')).toBe(true);
  });

  it('returns true for pending', () => {
    expect(shouldPollAnalysis('pending')).toBe(true);
  });

  it('returns true for processing', () => {
    expect(shouldPollAnalysis('processing')).toBe(true);
  });

  it('returns true for retry_scheduled', () => {
    expect(shouldPollAnalysis('retry_scheduled')).toBe(true);
  });

  it('returns false for completed — polling must stop on success', () => {
    expect(shouldPollAnalysis('completed')).toBe(false);
  });

  it('returns false for failed', () => {
    expect(shouldPollAnalysis('failed')).toBe(false);
  });

  it('returns false for cancelled', () => {
    expect(shouldPollAnalysis('cancelled')).toBe(false);
  });

  it('returns false for not_requested', () => {
    expect(shouldPollAnalysis('not_requested')).toBe(false);
  });

  it('returns false for null — no active analysis', () => {
    expect(shouldPollAnalysis(null)).toBe(false);
  });

  it('returns false for undefined — no activeApplication', () => {
    expect(shouldPollAnalysis(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(shouldPollAnalysis('')).toBe(false);
  });

  it('returns false for unknown status — defensive against future values', () => {
    expect(shouldPollAnalysis('unknown_future_status')).toBe(false);
  });
});

describe('IN_PROGRESS_ANALYSIS_STATUSES', () => {
  it('contains exactly the four in-progress statuses', () => {
    expect(IN_PROGRESS_ANALYSIS_STATUSES.has('waiting_extraction')).toBe(true);
    expect(IN_PROGRESS_ANALYSIS_STATUSES.has('pending')).toBe(true);
    expect(IN_PROGRESS_ANALYSIS_STATUSES.has('processing')).toBe(true);
    expect(IN_PROGRESS_ANALYSIS_STATUSES.has('retry_scheduled')).toBe(true);
  });

  it('does not include terminal statuses', () => {
    for (const s of ['completed', 'failed', 'cancelled', 'not_requested']) {
      expect(IN_PROGRESS_ANALYSIS_STATUSES.has(s), `"${s}" must not trigger polling`).toBe(false);
    }
  });
});

describe('getAnalysisStatusInfo', () => {
  it('returns null for null', () => {
    expect(getAnalysisStatusInfo(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(getAnalysisStatusInfo(undefined)).toBeNull();
  });

  it('returns null for not_requested — nothing to display', () => {
    expect(getAnalysisStatusInfo('not_requested')).toBeNull();
  });

  it('returns null for unknown status — defensive', () => {
    expect(getAnalysisStatusInfo('some_future_status')).toBeNull();
  });

  it('returns progress variant for every in-progress status', () => {
    for (const s of ['waiting_extraction', 'pending', 'processing', 'retry_scheduled']) {
      expect(getAnalysisStatusInfo(s)?.variant, `expected progress for "${s}"`).toBe('progress');
    }
  });

  it('returns done variant for completed', () => {
    expect(getAnalysisStatusInfo('completed')?.variant).toBe('done');
  });

  it('returns muted variant for failed and cancelled', () => {
    expect(getAnalysisStatusInfo('failed')?.variant).toBe('muted');
    expect(getAnalysisStatusInfo('cancelled')?.variant).toBe('muted');
  });

  it('all in-progress statuses have a non-empty label', () => {
    for (const s of ['waiting_extraction', 'pending', 'processing', 'retry_scheduled']) {
      const info = getAnalysisStatusInfo(s);
      expect(info?.label.length, `label must not be empty for "${s}"`).toBeGreaterThan(0);
    }
  });

  it('completed has a label', () => {
    expect(getAnalysisStatusInfo('completed')?.label).toBeTruthy();
  });

  it('failed and cancelled both return muted with a label', () => {
    const failed = getAnalysisStatusInfo('failed');
    const cancelled = getAnalysisStatusInfo('cancelled');
    expect(failed?.variant).toBe('muted');
    expect(cancelled?.variant).toBe('muted');
    expect(failed?.label.length).toBeGreaterThan(0);
    expect(cancelled?.label.length).toBeGreaterThan(0);
  });
});
