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
};
