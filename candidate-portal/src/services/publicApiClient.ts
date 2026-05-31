const BASE_URL =
  (import.meta as ImportMeta & { env?: { VITE_PUBLIC_API_BASE_URL?: string } }).env
    ?.VITE_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1/public';

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
      throw new HttpError(response.status, `HTTP ${response.status}: ${path}`);
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
