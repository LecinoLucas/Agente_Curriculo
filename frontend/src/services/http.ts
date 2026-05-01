import { tokenStorage } from "../utils/storage";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

let refreshInFlight: Promise<void> | null = null;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public data?: unknown,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function statusFallback(status: number): string {
  const messages: Record<number, string> = {
    400: "Requisição inválida",
    401: "Não autorizado",
    403: "Sem permissão para esta operação",
    404: "Recurso não encontrado",
    409: "Conflito: registro já existe ou em uso",
    422: "Dados inválidos — verifique os campos preenchidos",
    429: "Muitas requisições. Aguarde um momento",
    500: "Erro interno do servidor",
    502: "Serviço temporariamente indisponível",
    503: "Serviço temporariamente indisponível",
    504: "Tempo de resposta do servidor esgotado",
  };
  return messages[status] ?? `Não foi possível concluir a solicitação (HTTP ${status})`;
}

function resolveError(status: number, payload: unknown): HttpError {
  if (typeof payload === "object" && payload !== null) {
    if (status === 422) {
      console.error("[422 Validation Error]", JSON.stringify(payload, null, 2));
    }

    const payloadRecord = payload as Record<string, unknown>;
    const detail = payloadRecord.detail;
    if (detail !== undefined) {
      const message = typeof detail === "string" && detail.trim() ? detail : statusFallback(status);
      return new HttpError(status, message, undefined, payload, detail);
    }

    if ("error" in payloadRecord) {
      const errorObj = payloadRecord.error as { code?: string; message?: string; detail?: unknown };
      return new HttpError(
        status,
        errorObj.message ?? statusFallback(status),
        errorObj.code,
        payload,
        errorObj.detail,
      );
    }
  }

  return new HttpError(status, statusFallback(status), undefined, payload);
}

async function parseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function refreshToken(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        tokenStorage.clear();
        throw new HttpError(401, "Sessão expirada. Faça login novamente.", undefined, null);
      }

      const payload = (await response.json()) as { access_token: string };
      tokenStorage.set(payload.access_token);
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  withAuth?: boolean;
  retryOnUnauthorized?: boolean;
};

export async function httpRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, withAuth = true, retryOnUnauthorized = true } = options;
  const isFormData = body instanceof FormData;

  const headers = new Headers();
  if (!isFormData) {
    headers.set("Content-Type", "application/json");
  }

  if (withAuth) {
    const token = tokenStorage.get();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch (error) {
    throw new HttpError(0, "Sem conexão com o servidor. Verifique sua internet.", undefined, error);
  }

  if (response.status === 401 && withAuth && retryOnUnauthorized && !path.includes("/auth/refresh")) {
    await refreshToken();
    return httpRequest<T>(path, { ...options, retryOnUnauthorized: false });
  }

  if (!response.ok) {
    const errorPayload = await parseJson(response);
    throw resolveError(response.status, errorPayload);
  }

  if (response.status === 204) return null as T;

  const payload = (await parseJson(response)) as T;
  return payload;
}
