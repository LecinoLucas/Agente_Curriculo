import { afterEach, describe, expect, it, vi } from 'vitest';

describe('candidateAuthService.devLoginCandidate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('posts to the real public dev-login endpoint with credentials included', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          message: 'ok',
          redirect_to: '/candidato/portal',
          session_expires_at: '2026-06-01T12:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const { candidateAuthService } = await import('../candidateAuthService');

    await candidateAuthService.devLoginCandidate({
      email: 'dev-candidato@local.test',
      name: 'Candidato Teste',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/public/auth/dev-login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          email: 'dev-candidato@local.test',
          name: 'Candidato Teste',
        }),
      }),
    );
  });

  it('keeps the real email/password and Google login endpoints unchanged', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          message: 'ok',
          redirect_to: '/candidato/portal',
          session_expires_at: '2026-06-01T12:00:00Z',
          status: 'authenticated',
          candidate: {},
          missing_fields: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const { candidateAuthService } = await import('../candidateAuthService');

    await candidateAuthService.login('pessoa@example.com', 'SenhaSegura123');
    await candidateAuthService.loginWithGoogle('google-token');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8000/api/v1/public/auth/login',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/api/v1/public/auth/google',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
});
