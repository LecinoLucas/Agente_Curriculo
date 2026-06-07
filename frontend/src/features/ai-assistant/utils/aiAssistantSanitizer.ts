import type { AiAssistantResponse } from "../types";

const REDACTED_CPF = "[cpf_removido]";
const REDACTED_PHONE = "[telefone_removido]";
const REDACTED_EMAIL = "[email_removido]";
const REDACTED_SECRET = "[segredo_removido]";
const REDACTED_ERROR = "[erro_tecnico_removido]";

const SENSITIVE_KEYS = new Set([
  "api_key",
  "authorization",
  "content_hash",
  "embedding",
  "embeddings",
  "gemini_api_key",
  "internal_notes",
  "payload_json",
  "raw_ocr_text",
  "raw_resume_text",
  "review_notes",
  "secret",
  "stack",
  "stack_trace",
  "token",
  "traceback",
  "vector_json",
]);

const SENSITIVE_KEY_FRAGMENTS = [
  "api_key",
  "authorization",
  "content_hash",
  "embedding",
  "embeddings",
  "internal_notes",
  "payload_json",
  "raw_ocr_text",
  "raw_resume_text",
  "review_notes",
  "secret",
  "stack",
  "token",
  "traceback",
  "vector_json",
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CPF_FORMATTED_PATTERN = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const CPF_PLAIN_PATTERN = /\b\d{11}\b/g;
const PHONE_PATTERN =
  /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4})-?\d{4}\b/g;
const GOOGLE_API_KEY_PATTERN = /\bAIza[0-9A-Za-z\-_]{20,}\b/g;
const OPENAI_KEY_PATTERN = /\bsk-[0-9A-Za-z]{20,}\b/g;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi;
const GENERIC_SECRET_PATTERN =
  /\b(?:token|secret|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9\-._~+/]{6,}["']?/gi;
const INTERNAL_FIELD_LINE_PATTERN =
  /\b(?:payload_json|vector_json|content_hash|embedding|embeddings|review_notes|internal_notes|raw_ocr_text|raw_resume_text)\b\s*[:=]\s*[^\n]*/gi;
const TRACE_LINE_PATTERN = /(?:^|\n)\s*at\s+\S+/m;
const TRACE_FILE_PATTERN = /File ".*", line \d+/m;

const SENSITIVE_TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/\bpayload_json\b/gi, REDACTED_SECRET],
  [/\bvector_json\b/gi, REDACTED_SECRET],
  [/\bcontent_hash\b/gi, REDACTED_SECRET],
  [/\breview_notes\b/gi, REDACTED_SECRET],
  [/\binternal_notes\b/gi, REDACTED_SECRET],
  [/\braw_ocr_text\b/gi, REDACTED_SECRET],
  [/\braw_resume_text\b/gi, REDACTED_SECRET],
  [/\bembeddings?\b/gi, REDACTED_SECRET],
  [/\bapi[_-]?key\b/gi, REDACTED_SECRET],
  [/\btoken\b/gi, REDACTED_SECRET],
  [/\bsecret\b/gi, REDACTED_SECRET],
  [/\bstack trace\b/gi, REDACTED_ERROR],
  [/\btraceback\b/gi, REDACTED_ERROR],
];

const SENSITIVE_HISTORY_PATTERNS = [
  EMAIL_PATTERN,
  CPF_FORMATTED_PATTERN,
  CPF_PLAIN_PATTERN,
  PHONE_PATTERN,
  GOOGLE_API_KEY_PATTERN,
  OPENAI_KEY_PATTERN,
  BEARER_TOKEN_PATTERN,
  /\b(?:cpf|telefone|phone|e-?mail)\b/gi,
  /\b(?:payload_json|vector_json|content_hash|embedding|embeddings|review_notes|internal_notes|raw_ocr_text|raw_resume_text)\b/gi,
  /\b(?:api[_-]?key|token|secret|stack trace|traceback)\b/gi,
];

function looksLikeTrace(value: string): boolean {
  return (
    value.includes("Traceback (most recent call last)") ||
    TRACE_LINE_PATTERN.test(value) ||
    TRACE_FILE_PATTERN.test(value)
  );
}

function sanitizePrimitiveText(value: string): string {
  let sanitized = value
    .replace(INTERNAL_FIELD_LINE_PATTERN, REDACTED_SECRET)
    .replace(GOOGLE_API_KEY_PATTERN, REDACTED_SECRET)
    .replace(OPENAI_KEY_PATTERN, REDACTED_SECRET)
    .replace(BEARER_TOKEN_PATTERN, REDACTED_SECRET)
    .replace(GENERIC_SECRET_PATTERN, REDACTED_SECRET)
    .replace(EMAIL_PATTERN, REDACTED_EMAIL)
    .replace(CPF_FORMATTED_PATTERN, REDACTED_CPF)
    .replace(CPF_PLAIN_PATTERN, REDACTED_CPF)
    .replace(PHONE_PATTERN, REDACTED_PHONE);

  for (const [pattern, replacement] of SENSITIVE_TEXT_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  return sanitized;
}

function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.trim().toLowerCase();
  if (SENSITIVE_KEYS.has(normalizedKey)) return true;
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment));
}

export function sanitizeAssistantText(value: string): string {
  if (!value) return value;
  if (looksLikeTrace(value)) return "Detalhes técnicos internos foram ocultados.";
  return sanitizePrimitiveText(value);
}

export function containsSensitiveAssistantText(value: string): boolean {
  if (!value.trim()) return false;
  if (looksLikeTrace(value)) return true;
  return SENSITIVE_HISTORY_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function filterSensitiveKeys(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key)) continue;
    filtered[key] = sanitizeAssistantPayload(item);
  }

  return filtered;
}

export function sanitizeAssistantPayload(value: unknown): unknown {
  if (typeof value === "string") return sanitizeAssistantText(value);
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeAssistantPayload(item));
  if (typeof value !== "object") return value;
  return filterSensitiveKeys(value as Record<string, unknown>);
}

export function sanitizeText(value: string): string {
  return sanitizeAssistantText(value);
}

export function filterSensitive(value: unknown): unknown {
  return sanitizeAssistantPayload(value);
}

export function sanitizeResponse(response: AiAssistantResponse): AiAssistantResponse {
  return {
    ...response,
    data: sanitizeAssistantPayload(response.data),
    message: response.message ? sanitizeAssistantText(response.message) : response.message,
    warnings: response.warnings.map(sanitizeAssistantText),
  };
}

export function normalizeErrorMessage(err: unknown): string {
  const msg =
    err instanceof Error ? err.message : "Não foi possível processar a solicitação.";
  return sanitizeAssistantText(msg);
}
