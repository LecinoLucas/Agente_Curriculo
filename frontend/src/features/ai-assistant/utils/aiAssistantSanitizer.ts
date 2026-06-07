import type { AiAssistantResponse } from "../types";

const SENSITIVE_KEYS = new Set([
  "vector_json",
  "content_hash",
  "embedding",
  "embeddings",
  "payload_json",
  "review_notes",
  "internal_notes",
  "stack",
  "stack_trace",
  "api_key",
  "GEMINI_API_KEY",
]);

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}/g;
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const SENSITIVE_TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/\bstack trace\b/gi, "[redacted-sensitive-term]"],
  [/\btraceback\b/gi, "[redacted-sensitive-term]"],
  [/\braw_ocr_text\b/gi, "[redacted-sensitive-term]"],
  [/\braw_resume_text\b/gi, "[redacted-sensitive-term]"],
  [/\binternal_notes\b/gi, "[redacted-sensitive-term]"],
  [/\breview_notes\b/gi, "[redacted-sensitive-term]"],
  [/\bpayload_json\b/gi, "[redacted-sensitive-term]"],
  [/\bcontent_hash\b/gi, "[redacted-sensitive-term]"],
  [/\bvector_json\b/gi, "[redacted-sensitive-term]"],
  [/\bembeddings?\b/gi, "[redacted-sensitive-term]"],
  [/\bapi_key\b/gi, "[redacted-sensitive-term]"],
  [/\bphone\b/gi, "[redacted-sensitive-term]"],
  [/\bcpf\b/gi, "[redacted-sensitive-term]"],
];

export function sanitizeText(value: string): string {
  if (!value) return value;

  const looksLikeTrace =
    value.includes("Traceback (most recent call last)") ||
    /(?:^|\n)\s*at\s+\S+/m.test(value) ||
    /File ".*", line \d+/m.test(value);

  if (looksLikeTrace) return "Detalhes técnicos internos foram ocultados.";

  let sanitized = value
    .replace(/\bAIza[0-9A-Za-z\-_]{20,}\b/g, "[redacted-api-key]")
    .replace(/\bsk-[0-9A-Za-z]{20,}\b/g, "[redacted-api-key]")
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(PHONE_PATTERN, "[redacted-phone]")
    .replace(CPF_PATTERN, "[redacted-cpf]");

  for (const [pattern, replacement] of SENSITIVE_TEXT_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  return sanitized;
}

export function filterSensitive(value: unknown): unknown {
  if (typeof value === "string") return sanitizeText(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(filterSensitive);

  const filtered: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!SENSITIVE_KEYS.has(key)) filtered[key] = filterSensitive(item);
  }
  return filtered;
}

export function sanitizeResponse(response: AiAssistantResponse): AiAssistantResponse {
  return {
    ...response,
    data: filterSensitive(response.data),
    message: response.message ? sanitizeText(response.message) : response.message,
    warnings: response.warnings.map(sanitizeText),
  };
}

export function normalizeErrorMessage(err: unknown): string {
  const msg =
    err instanceof Error ? err.message : "Não foi possível processar a solicitação.";
  return sanitizeText(msg);
}
