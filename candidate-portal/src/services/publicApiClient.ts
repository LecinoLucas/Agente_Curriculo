// Resolve the public API base URL.
// Priority: VITE_PUBLIC_API_BASE_URL > VITE_API_URL+/public > hardcoded default.
const { VITE_PUBLIC_API_BASE_URL, VITE_API_URL } =
  (import.meta as ImportMeta & {
    env?: { VITE_PUBLIC_API_BASE_URL?: string; VITE_API_URL?: string };
  }).env ?? {};
const BASE_URL =
  VITE_PUBLIC_API_BASE_URL ??
  (VITE_API_URL ? `${VITE_API_URL}/public` : 'http://localhost:8000/api/v1/public');

// Dev-only guard: the session cookie (candidate_portal_token) is SameSite=Lax and
// host-only. If the portal page and the API are served from different hosts
// (e.g. page on 192.168.1.88 but API on localhost), the browser sets the cookie
// but never re-sends it on fetch() — every /me call then returns 401.
// We warn loudly in development so this environment trap is caught early.
// No token, cookie, or secret is ever logged here — only hostnames.
(() => {
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  if (!env?.DEV || typeof window === 'undefined') return;
  try {
    const apiHost = new URL(BASE_URL).hostname;
    const pageHost = window.location.hostname;
    if (apiHost && pageHost && apiHost !== pageHost) {
      console.warn(
        `[candidate-portal] Host inconsistente: página em "${pageHost}" mas API em "${apiHost}". ` +
          'O cookie de sessão (SameSite=Lax) NÃO será enviado para a API e /me retornará 401. ' +
          'Use o MESMO host para o portal e a API (ex.: ambos em localhost).',
      );
    }
  } catch {
    /* URL inválida — ignorar; não bloquear a aplicação */
  }
})();

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const publicApiClient = {
  baseUrl: BASE_URL,

  async get<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new Error('Falha na conexão com o servidor. Verifique sua internet e tente novamente.');
    }
    if (!response.ok) {
      let message = `Erro ${response.status}`;
      try {
        const json = await response.json() as { detail?: unknown };
        if (json?.detail) message = String(json.detail);
      } catch { /* ignore parse error */ }
      throw new HttpError(response.status, message);
    }
    return response.json() as Promise<T>;
  },

  // JSON PUT — for endpoints that require HTTP PUT with a JSON body.
  async put<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('Falha na conexão com o servidor. Verifique sua internet e tente novamente.');
    }
    if (!response.ok) {
      let message = `Erro ${response.status}`;
      try {
        const json = await response.json() as { detail?: unknown };
        if (json?.detail) message = String(json.detail);
      } catch { /* ignore parse error */ }
      throw new HttpError(response.status, message);
    }
    return response.json() as Promise<T>;
  },

  // JSON POST — do NOT use this for FormData (use postForm instead).
  async post<T>(path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('Falha na conexão com o servidor. Verifique sua internet e tente novamente.');
    }
    if (!response.ok) {
      let message = `Erro ${response.status}`;
      try {
        const json = await response.json() as { detail?: unknown };
        if (json?.detail) message = String(json.detail);
      } catch { /* ignore parse error */ }
      throw new HttpError(response.status, message);
    }
    // 204 No Content — logout and similar endpoints
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  },

  // Multipart POST — do NOT set Content-Type; browser adds it with the correct boundary.
  async postForm<T>(path: string, body: FormData): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        credentials: 'include',
        body,
      });
    } catch {
      throw new Error('Falha na conexão com o servidor. Verifique sua internet e tente novamente.');
    }
    if (!response.ok) {
      let message = `Erro ${response.status}`;
      try {
        const json = await response.json() as { detail?: unknown };
        if (json?.detail) message = String(json.detail);
      } catch { /* ignore parse error */ }
      throw new HttpError(response.status, message);
    }
    return response.json() as Promise<T>;
  },
};
