import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('CandidateLoginPage dev-login', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  function mockAuthLayout() {
    vi.doMock('../components/layout/AuthAccessLayout', () => ({
      AuthAccessLayout: ({ children }: { children: React.ReactNode }) => (
        React.createElement('div', null, children)
      ),
    }));
  }

  it('enables the dev-login block only for dev builds with the explicit flag', async () => {
    mockAuthLayout();
    const { shouldShowDevCandidateLogin } = await import('./CandidateLoginPage');

    expect(
      shouldShowDevCandidateLogin({
        DEV: true,
        VITE_ENABLE_DEV_CANDIDATE_LOGIN: 'true',
      }),
    ).toBe(true);
    expect(
      shouldShowDevCandidateLogin({
        DEV: true,
        VITE_ENABLE_DEV_CANDIDATE_LOGIN: 'false',
      }),
    ).toBe(false);
    expect(
      shouldShowDevCandidateLogin({
        DEV: false,
        VITE_ENABLE_DEV_CANDIDATE_LOGIN: 'true',
      }),
    ).toBe(false);
  });

  it('does not render the dev-login block when the flag is disabled', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_ENABLE_DEV_CANDIDATE_LOGIN', 'false');
    mockAuthLayout();
    const { CandidateLoginPage } = await import('./CandidateLoginPage');

    const html = renderToString(
      React.createElement(MemoryRouter, null, React.createElement(CandidateLoginPage)),
    );

    expect(html).not.toContain('Acesso rápido de desenvolvimento');
    expect(html).toContain('Acesse sua área');
    expect(html).toContain('Recuperar ou criar senha de acesso');
  });
});
