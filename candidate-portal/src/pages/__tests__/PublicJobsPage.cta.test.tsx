// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../components/layout/CandidatePortalLayout', () => ({
  CandidatePortalLayout: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../App', () => ({
  useCandidateSession: () => ({ candidateName: null, setCandidateName: () => {} }),
}));

vi.mock('../../services/publicJobsService', () => ({
  publicJobsService: { listJobs: vi.fn(() => Promise.resolve([])) },
}));

import { PublicJobsPage } from '../PublicJobsPage';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PublicJobsPage assistant CTA', () => {
  it('shows a CTA linking to Portal 2', async () => {
    render(
      <MemoryRouter>
        <PublicJobsPage />
      </MemoryRouter>,
    );

    const cta = await screen.findByRole('link', { name: /Encontrar vaga com assistente/i });
    expect(cta.getAttribute('href')).toBe('/portal-2');
  });
});
