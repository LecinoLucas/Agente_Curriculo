// Resolve the public API base URL.
// Priority: VITE_PUBLIC_API_BASE_URL > VITE_API_URL+/public > hardcoded default.
const { VITE_PUBLIC_API_BASE_URL, VITE_API_URL } =
  (import.meta as ImportMeta & {
    env?: { VITE_PUBLIC_API_BASE_URL?: string; VITE_API_URL?: string };
  }).env ?? {};
const RAW_BASE_URL =
  VITE_PUBLIC_API_BASE_URL ??
  (VITE_API_URL ? `${VITE_API_URL}/public` : 'http://localhost:8000/api/v1/public');

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * Keep the API host aligned with the host the portal page is served from.
 *
 * The candidate session lives in a cookie (candidate_portal_token) that is
 * HttpOnly, host-only and SameSite=Lax. When the page and the API are served
 * from different hosts (e.g. the portal opened on http://127.0.0.1:5174 but the
 * API pinned to http://localhost:8000), the browser treats the API call as
 * cross-site, so it sets the cookie on login but never re-sends it on the
 * fetch() to /me — every authenticated request then returns 401.
 *
 * In development we therefore rewrite ONLY the hostname of a local API base
 * (localhost/127.0.0.1) to match window.location.hostname, so the session
 * cookie stays same-host and is actually sent. Scheme, port and path are kept.
 * A non-local (intentionally remote) API base is never rewritten, and the
 * behaviour is a no-op in production builds.
 *
 * Exported for testing.
 */
export function alignApiHostToPage(
  rawBase: string,
  pageHost: string | null,
  isDev: boolean,
): string {
  if (!isDev || !pageHost) return rawBase;
  try {
    const url = new URL(rawBase);
    if (LOCALHOST_HOSTS.has(url.hostname) && pageHost !== url.hostname) {
      url.hostname = pageHost;
      const aligned = url.toString();
      // URL.toString() can append a trailing slash; preserve the original shape.
      return aligned.endsWith('/') && !rawBase.endsWith('/')
        ? aligned.slice(0, -1)
        : aligned;
    }
  } catch {
    /* URL inválida — ignorar; usar a base original */
  }
  return rawBase;
}

const ENV = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
const PAGE_HOST = typeof window === 'undefined' ? null : window.location.hostname;
const BASE_URL = alignApiHostToPage(RAW_BASE_URL, PAGE_HOST, Boolean(ENV?.DEV));

// Residual guard: if the API host is intentionally remote (not localhost-class)
// and still differs from the page host, the SameSite=Lax session cookie cannot
// be sent and /me will return 401. We warn (hostnames only — never tokens).
(() => {
  if (!ENV?.DEV || !PAGE_HOST) return;
  try {
    const apiHost = new URL(BASE_URL).hostname;
    if (apiHost && apiHost !== PAGE_HOST) {
      console.warn(
        `[candidate-portal] Host inconsistente: página em "${PAGE_HOST}" mas API em "${apiHost}". ` +
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
