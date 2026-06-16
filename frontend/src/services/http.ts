import { tokenStorage } from "../utils/storage";

const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isPrivateIpv4Host(hostname: string): boolean {
  return (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function isLocalDevHost(hostname: string): boolean {
  return isLoopbackHost(hostname) || isPrivateIpv4Host(hostname);
}

export function resolveApiBaseUrl(
  configuredBaseUrl: string,
  currentHostname?: string,
  isDev = import.meta.env.DEV,
  currentOrigin?: string,
): string {
  if (!isDev || !currentHostname) {
    return configuredBaseUrl;
  }

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(configuredBaseUrl);
  } catch {
    return configuredBaseUrl;
  }

  if (
    currentOrigin &&
    isLocalDevHost(parsedBaseUrl.hostname) &&
    isLocalDevHost(currentHostname)
  ) {
    try {
      const parsedOrigin = new URL(currentOrigin);
      if (isLocalDevHost(parsedOrigin.hostname)) {
        return parsedOrigin.origin;
      }
    } catch {
      return configuredBaseUrl;
    }
  }

  if (
    parsedBaseUrl.hostname === currentHostname ||
    !isLocalDevHost(parsedBaseUrl.hostname) ||
    !isLocalDevHost(currentHostname)
  ) {
    return configuredBaseUrl;
  }

  parsedBaseUrl.hostname = currentHostname;
  return parsedBaseUrl.toString().replace(/\/$/, "");
}

export const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000",
  typeof window !== "undefined" ? window.location.hostname : undefined,
  import.meta.env.DEV,
  typeof window !== "undefined" ? window.location.origin : undefined,
);

let refreshInFlight: Promise<void> | null = null;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public data?: unknown,
    public detail?: unknown,
    public retryAfterSeconds?: number,
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

function parseRetryAfterHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;

  const asNumber = Number(normalized);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return asNumber;
  }

  const asDate = Date.parse(normalized);
  if (!Number.isNaN(asDate)) {
    const seconds = Math.ceil((asDate - Date.now()) / 1000);
    return Math.max(0, seconds);
  }

  return undefined;
}

function parseRetryAfterFromText(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const retryMatch = value.match(/retry in\s+([0-9]+(?:[.,][0-9]+)?)s/i);
  if (!retryMatch) return undefined;
  const parsed = Number(retryMatch[1].replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

function parseRetryAfterPayload(payload: unknown): number | undefined {
  if (typeof payload === "string") return parseRetryAfterFromText(payload);
  if (!payload || typeof payload !== "object") return undefined;

  const record = payload as Record<string, unknown>;
  const detail = record.detail;
  if (typeof detail === "string") {
    const parsed = parseRetryAfterFromText(detail);
    if (parsed != null) return parsed;
  }

  const message = typeof record.message === "string" ? record.message : undefined;
  const parsedMessage = parseRetryAfterFromText(message);
  if (parsedMessage != null) return parsedMessage;

  const errorObj = record.error;
  if (errorObj && typeof errorObj === "object") {
    const errorMessage =
      typeof (errorObj as Record<string, unknown>).message === "string"
        ? ((errorObj as Record<string, unknown>).message as string)
        : undefined;
    const parsedErrorMessage = parseRetryAfterFromText(errorMessage);
    if (parsedErrorMessage != null) return parsedErrorMessage;
  }

  return undefined;
}

function resolveError(response: Response, payload: unknown): HttpError {
  const status = response.status;
  const retryAfterSeconds =
    parseRetryAfterHeader(response.headers.get("retry-after")) ??
    parseRetryAfterPayload(payload);

  if (typeof payload === "object" && payload !== null) {
    if (status === 422) {
      console.error("[422 Validation Error]", JSON.stringify(payload, null, 2));
    }

    const payloadRecord = payload as Record<string, unknown>;
    const detail = payloadRecord.detail;
    if (detail !== undefined) {
      if (typeof detail === "object" && detail !== null) {
        const detailRecord = detail as Record<string, unknown>;
        const detailMessage = typeof detailRecord.message === "string" ? detailRecord.message : statusFallback(status);
        const detailCode = typeof detailRecord.code === "string" ? detailRecord.code : undefined;
        return new HttpError(status, detailMessage, detailCode, payload, detail, retryAfterSeconds);
      }
      const message = typeof detail === "string" && detail.trim() ? detail : statusFallback(status);
      return new HttpError(status, message, undefined, payload, detail, retryAfterSeconds);
    }

    if ("error" in payloadRecord) {
      const errorObj = payloadRecord.error as { code?: string; message?: string; detail?: unknown };
      return new HttpError(
        status,
        errorObj.message ?? statusFallback(status),
        errorObj.code,
        payload,
        errorObj.detail,
        retryAfterSeconds,
      );
    }

    if (typeof payloadRecord.message === "string" && payloadRecord.message.trim()) {
      const code = typeof payloadRecord.code === "string" ? payloadRecord.code : undefined;
      return new HttpError(status, payloadRecord.message, code, payload, undefined, retryAfterSeconds);
    }
  }

  return new HttpError(status, statusFallback(status), undefined, payload, undefined, retryAfterSeconds);
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
        throw new HttpError(
          response.status,
          response.status === 401
            ? "Sessão expirada. Faça login novamente."
            : "Não foi possível renovar a sessão.",
          undefined,
          null,
        );
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
  signal?: AbortSignal;
};

type DevHttpChaosMode = "fail" | "timeout";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getDevHttpChaosRule(
  mode: DevHttpChaosMode,
  method: string,
  path: string,
): null | { storageKey: string; message: string } {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const rawRule = params.get(mode === "fail" ? "__dev_fail_once" : "__dev_timeout_once");
  if (!rawRule) return null;

  const [ruleMethodRaw, ...pathParts] = rawRule.split("|");
  const ruleMethod = ruleMethodRaw?.trim().toUpperCase();
  const rulePath = pathParts.join("|").trim();

  if (!ruleMethod || !rulePath) return null;
  if (ruleMethod !== method.toUpperCase()) return null;
  if (!path.includes(rulePath)) return null;

  const storageKey = `resume-ai-chaos:${mode}:${rawRule}`;
  if (window.sessionStorage.getItem(storageKey) === "used") return null;

  return {
    storageKey,
    message:
      mode === "fail"
        ? "Falha simulada para validar rollback e feedback."
        : "Timeout simulado para validar loading e retry.",
  };
}

async function applyDevHttpChaos(method: string, path: string): Promise<void> {
  if (!import.meta.env.DEV || typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const latencyValue = Number(params.get("__dev_latency_ms") ?? "0");
  if (Number.isFinite(latencyValue) && latencyValue > 0) {
    await sleep(latencyValue);
  }

  const timeoutRule = getDevHttpChaosRule("timeout", method, path);
  if (timeoutRule) {
    window.sessionStorage.setItem(timeoutRule.storageKey, "used");
    throw new HttpError(504, timeoutRule.message, "DEV_TIMEOUT");
  }

  const failRule = getDevHttpChaosRule("fail", method, path);
  if (failRule) {
    window.sessionStorage.setItem(failRule.storageKey, "used");
    throw new HttpError(503, failRule.message, "DEV_FAIL");
  }
}

export async function httpRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, withAuth = true, retryOnUnauthorized = true, signal } = options;
  const isFormData = body instanceof FormData;
  const token = withAuth ? tokenStorage.get() : null;

  const headers = new Headers();
  if (!isFormData) {
    headers.set("Content-Type", "application/json");
  }

  if (withAuth) {
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  const controller = new AbortController();
  const timeoutId =
    typeof window !== "undefined"
      ? window.setTimeout(() => controller.abort("timeout"), DEFAULT_REQUEST_TIMEOUT_MS)
      : null;

  // Forward external abort signal to the internal timeout controller.
  const onExternalAbort = signal ? () => controller.abort() : null;
  if (signal && onExternalAbort) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  try {
    await applyDevHttpChaos(method, path);
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      signal: controller.signal,
      body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    // External caller aborted — surface as standard AbortError so callers can detect it.
    if (signal?.aborted) {
      throw new DOMException("Request aborted", "AbortError");
    }
    if (controller.signal.aborted) {
      throw new HttpError(504, "Tempo de resposta do servidor esgotado. Tente novamente.", undefined, error);
    }
    throw new HttpError(0, "Sem conexão com o servidor. Verifique sua internet.", undefined, error);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    if (signal && onExternalAbort) {
      signal.removeEventListener("abort", onExternalAbort);
    }
  }

  if (
    response.status === 401 &&
    withAuth &&
    retryOnUnauthorized &&
    token &&
    tokenStorage.hasRefreshSession() &&
    !path.includes("/auth/refresh")
  ) {
    await refreshToken();
    return httpRequest<T>(path, { ...options, retryOnUnauthorized: false });
  }

  if (response.status === 401 && withAuth && !token) {
    tokenStorage.clear();
  }

  if (!response.ok) {
    const errorPayload = await parseJson(response);
    throw resolveError(response, errorPayload);
  }

  if (response.status === 204) return null as T;

  const payload = (await parseJson(response)) as T;
  return payload;
}
