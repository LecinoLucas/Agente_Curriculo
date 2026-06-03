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

  it('disables Google login on 127.0.0.1 in dev to avoid GSI origin 403', async () => {
    mockAuthLayout();
    const { shouldEnableGoogleLogin } = await import('./CandidateLoginPage');

    expect(
      shouldEnableGoogleLogin('client-id.apps.googleusercontent.com', { DEV: true }, '127.0.0.1'),
    ).toBe(false);
    expect(
      shouldEnableGoogleLogin('client-id.apps.googleusercontent.com', { DEV: true }, 'localhost'),
    ).toBe(true);
    expect(
      shouldEnableGoogleLogin('client-id.apps.googleusercontent.com', { DEV: false }, 'portal.example.com'),
    ).toBe(true);
    expect(shouldEnableGoogleLogin('', { DEV: true }, 'localhost')).toBe(false);
  });

  it('renders the login page correctly without dev tools', async () => {
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
