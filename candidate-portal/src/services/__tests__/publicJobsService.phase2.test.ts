/**
 * Phase 2 — multi-branch unit visibility (candidate portal).
 *
 * Tests:
 * 1. mapDetail maps job_units from the API response
 * 2. mapDetail falls back to empty array when job_units is absent
 * 3. mapDetail uses coalesced name from public_name
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Intercept the publicApiClient module so no real HTTP calls are made.
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
    }
  },
}));

import { publicApiClient } from '../publicApiClient';
import { publicJobsService } from '../publicJobsService';

const mockedGet = vi.mocked(publicApiClient.get);

const BASE_JOB = {
  id: 'job-uuid-1',
  title: 'Operador de Caixa',
  description: 'Descrição completa.',
  requirements: null,
  responsibilities: null,
  location: 'São Paulo, SP',
  job_area: 'comercial',
  work_model: null,
  seniority_level: null,
  benefits: [],
  working_hours: null,
  published_at: null,
};

describe('publicJobsService phase 2 – job_units mapping', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps job_units when the API returns them', async () => {
    mockedGet.mockResolvedValueOnce({
      ...BASE_JOB,
      job_units: [
        {
          id: 'unit-uuid-1',
          public_name: 'Centro',
          city: 'São Paulo',
          state: 'SP',
          address: 'Rua X, 100',
          reference_point: 'Próx. ao metrô',
        },
        {
          id: 'unit-uuid-2',
          public_name: 'Norte',
          city: 'São Paulo',
          state: 'SP',
          address: null,
          reference_point: null,
        },
      ],
    });

    const job = await publicJobsService.getJobById('job-uuid-1');
    expect(job).not.toBeNull();
    expect(job!.job_units).toHaveLength(2);

    const first = job!.job_units![0];
    expect(first.id).toBe('unit-uuid-1');
    expect(first.public_name).toBe('Centro');
    expect(first.city).toBe('São Paulo');
    expect(first.reference_point).toBe('Próx. ao metrô');
  });

  it('returns empty job_units when the API omits the field', async () => {
    mockedGet.mockResolvedValueOnce({ ...BASE_JOB });

    const job = await publicJobsService.getJobById('job-uuid-1');
    expect(job).not.toBeNull();
    expect(job!.job_units).toEqual([]);
  });

  it('preserves public_name from the API as-is', async () => {
    mockedGet.mockResolvedValueOnce({
      ...BASE_JOB,
      job_units: [
        {
          id: 'unit-uuid-3',
          public_name: 'Loja Paulista',
          city: null,
          state: null,
          address: null,
          reference_point: null,
        },
      ],
    });

    const job = await publicJobsService.getJobById('job-uuid-1');
    expect(job!.job_units![0].public_name).toBe('Loja Paulista');
  });
});
