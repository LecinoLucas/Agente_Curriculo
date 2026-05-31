/**
 * Tests for getOverview() in-flight deduplication.
 *
 * When App.tsx hydration and CandidateHomePage both call getOverview() in the
 * same render cycle, only one HTTP request must be dispatched. After resolution
 * or rejection the cache is cleared so polling always gets a fresh call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../publicApiClient', () => ({
  publicApiClient: {
    get: vi.fn(),
  },
  HttpError: class HttpError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
      this.name = 'HttpError';
    }
  },
}));

import { candidatePortalService } from '../candidatePortalService';
import { publicApiClient } from '../publicApiClient';

// Minimal API response that mapOverview can process without errors.
const MOCK_RESPONSE = {
  candidate: {
    id: 'test-id',
    full_name: 'Ana Teste',
    cpf_masked: null,
    email: 'ana@test.com',
    email_masked: 'a**@test.com',
    phone: null,
    phone_masked: null,
    city: null,
    state: null,
    application_source_label: 'Portal público',
  },
  active_application: null,
  application_history: [],
  public_interview: null,
  talent_pool: false,
  status_public: 'Sem candidatura',
  application_status: 'no_active_application',
  current_process_status_label: 'Sem candidatura',
  is_process_closed: false,
  closed_reason_public_label: null,
  can_request_contact: true,
  can_apply_to_other_jobs: true,
  public_timeline: null,
  requires_behavioral_assessment: false,
};

describe('candidatePortalService.getOverview — in-flight deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('concurrent callers share a single HTTP request', async () => {
    let resolveHttp!: (value: unknown) => void;
    vi.mocked(publicApiClient.get).mockReturnValueOnce(
      new Promise((res) => { resolveHttp = res; }),
    );

    const p1 = candidatePortalService.getOverview();
    const p2 = candidatePortalService.getOverview();

    // Only one network call dispatched for two callers
    expect(vi.mocked(publicApiClient.get)).toHaveBeenCalledTimes(1);
    // Exact same Promise instance returned to both callers
    expect(p1).toBe(p2);

    resolveHttp(MOCK_RESPONSE);
    const result = await p1;
    expect(result.candidateName).toBe('Ana Teste');
  });

  it('makes a fresh request after the previous one resolved', async () => {
    vi.mocked(publicApiClient.get)
      .mockResolvedValueOnce(MOCK_RESPONSE)
      .mockResolvedValueOnce(MOCK_RESPONSE);

    await candidatePortalService.getOverview();
    await candidatePortalService.getOverview();

    // Each sequential call after resolution must hit the network again
    expect(vi.mocked(publicApiClient.get)).toHaveBeenCalledTimes(2);
  });

  it('clears in-flight cache after a rejection so next call retries', async () => {
    vi.mocked(publicApiClient.get)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(MOCK_RESPONSE);

    try {
      await candidatePortalService.getOverview();
    } catch {
      // expected first call to fail
    }

    // After rejection the cache must be cleared — next call should succeed
    const result = await candidatePortalService.getOverview();
    expect(result.candidateName).toBe('Ana Teste');
    expect(vi.mocked(publicApiClient.get)).toHaveBeenCalledTimes(2);
  });

  it('propagates errors to all concurrent callers', async () => {
    const networkError = new Error('timeout');
    let rejectHttp!: (reason: unknown) => void;
    vi.mocked(publicApiClient.get).mockReturnValueOnce(
      new Promise((_, rej) => { rejectHttp = rej; }),
    );

    const p1 = candidatePortalService.getOverview();
    const p2 = candidatePortalService.getOverview();

    rejectHttp(networkError);

    await expect(p1).rejects.toThrow('timeout');
    await expect(p2).rejects.toThrow('timeout');
    expect(vi.mocked(publicApiClient.get)).toHaveBeenCalledTimes(1);
  });
});
