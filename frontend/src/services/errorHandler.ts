import { HttpError } from "./http";

export type UserFriendlyError = {
  title: string;
  message: string;
  details?: string[];
  severity: "error" | "warning" | "info";
  status?: number;
  raw?: unknown;
};

type PydanticDetailItem = {
  loc?: unknown;
  msg?: string;
  input?: unknown;
  type?: string;
};

const JOB_AREA_HINT =
  'Valores válidos: technology = Tecnologia, data = Dados, financial = Financeiro, fiscal = Fiscal, accounting = Contábil, administrative = Administrativo, commercial = Comercial, operational = Operacional, hr = RH, leadership = Liderança.';

const FIELD_LABELS: Record<string, string> = {
  job_area: 'área da vaga',
  seniority_level: 'senioridade',
  work_model: 'modelo de trabalho',
  minimum_education_level: 'escolaridade mínima',
  minimum_years_experience: 'anos mínimos de experiência',
  deal_breakers: 'critérios eliminatórios',
  skills: 'skills',
  title: 'título',
  description: 'descrição',
  requirements: 'requisitos',
  responsibilities: 'responsabilidades',
  experience_context: 'contexto de experiência',
  behavioral_requirements: 'requisitos comportamentais',
  priority: 'prioridade',
  salary_min: 'salário mínimo',
  salary_max: 'salário máximo',
  salary_currency: 'moeda salarial',
  status: 'status',
};

const PYDANTIC_ENUM_HINTS: Record<string, string> = {
  job_area: JOB_AREA_HINT,
  seniority_level:
    'Valores válidos: intern, junior, mid, senior, lead, principal ou director.',
  work_model: 'Valores válidos: remote, hybrid ou onsite.',
  minimum_education_level:
    'Valores válidos: none, high_school, technical, bachelor, postgraduate, master ou phd.',
  priority: 'Valores válidos: low, normal, high ou urgent.',
  status: 'Valores válidos: draft, published, paused, closed ou cancelled.',
};

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function getHttpStatus(error: unknown): number | undefined {
  if (error instanceof HttpError) return error.status;
  const record = toRecord(error);
  const status = record?.status;
  return typeof status === 'number' ? status : undefined;
}

export function getBackendDetail(error: unknown): unknown {
  if (error instanceof HttpError) {
    return error.detail ?? error.data ?? error.message;
  }

  const record = toRecord(error);
  if (!record) return undefined;
  if ('detail' in record) return record.detail;
  if ('data' in record) return record.data;
  if ('message' in record) return record.message;
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractInputValue(message: string): string | undefined {
  const match = message.match(/input_value=(.+?)(?:,\s*input_type=|\])/i);
  if (!match) return undefined;
  return match[1].replace(/^['"]|['"]$/g, '').trim();
}

function extractItemIndexFromText(message: string): number | undefined {
  const match = message.match(/Item\s+(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function normalizeLoc(loc: unknown): Array<string | number> {
  if (!Array.isArray(loc)) return [];
  return loc.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number');
}

function extractItemIndexFromLoc(loc: Array<string | number>): number | undefined {
  const jobsIndex = loc.findIndex((entry) => entry === 'jobs');
  if (jobsIndex >= 0 && typeof loc[jobsIndex + 1] === 'number') {
    return Number(loc[jobsIndex + 1]) + 1;
  }
  return undefined;
}

function extractFieldFromLoc(loc: Array<string | number>): string | undefined {
  for (let index = loc.length - 1; index >= 0; index -= 1) {
    if (typeof loc[index] === 'string') {
      return String(loc[index]);
    }
  }
  return undefined;
}

export function normalizeFieldName(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ');
}

export function friendlyEnumHint(field: string): string | undefined {
  return PYDANTIC_ENUM_HINTS[field];
}

function buildPrefix(itemIndex?: number): string {
  return itemIndex ? `Vaga ${itemIndex}` : 'Payload';
}

function buildFieldMessage(field: string, message: string, input?: unknown, itemIndex?: number): string {
  const friendlyField = normalizeFieldName(field);
  const prefix = buildPrefix(itemIndex);
  const inputText = input != null && String(input).trim() ? ` Valor recebido: "${String(input)}".` : '';
  const normalizedMessage = message.trim();
  const loweredType = normalizedMessage.toLowerCase();

  if (field === 'job_area') {
    const received = input ?? extractInputValue(normalizedMessage);
    return `${prefix}: campo ${friendlyField} inválido.${received ? ` Valor recebido: "${String(received)}".` : ''} Use um dos valores aceitos. ${JOB_AREA_HINT}`;
  }

  if (field === 'deal_breakers') {
    return `${prefix}: ${friendlyField} inválidos.${inputText} Revise a estrutura enviada para os critérios eliminatórios.`;
  }

  if (field === 'skills') {
    return `${prefix}: ${friendlyField} inválidas.${inputText} Revise o formato do array e os campos de cada skill.`;
  }

  if (field === 'salary_max' || field === 'salary_min') {
    if (/salary_min.*salary_max|greater than|menor|maior/i.test(normalizedMessage)) {
      return `${prefix}: faixa salarial inválida. O salário mínimo não pode ser maior que o salário máximo.`;
    }
  }

  if (/field required|missing/i.test(loweredType)) {
    return `${prefix}: campo ${friendlyField} é obrigatório.`;
  }

  if (/literal_error|input should be/i.test(loweredType)) {
    const enumHint = friendlyEnumHint(field);
    return `${prefix}: campo ${friendlyField} inválido.${inputText}${enumHint ? ` ${enumHint}` : ''}`;
  }

  if (/valid string|should be a valid string|string_type/i.test(loweredType)) {
    return `${prefix}: campo ${friendlyField} deve ser um texto válido.${inputText}`;
  }

  if (/valid integer|valid number|float_parsing|int_parsing|decimal_parsing|numeric/i.test(loweredType)) {
    return `${prefix}: campo ${friendlyField} deve ser numérico.${inputText}`;
  }

  if (/list_type|should be a valid list|valid list|array/i.test(loweredType)) {
    return `${prefix}: campo ${friendlyField} deve ser uma lista válida.${inputText}`;
  }

  if (/dict_type|mapping/i.test(loweredType)) {
    return `${prefix}: campo ${friendlyField} deve ser um objeto válido.${inputText}`;
  }

  return `${prefix}: problema no campo ${friendlyField}. ${normalizedMessage}${inputText}`.trim();
}

export function parseBulkImportValidationMessage(message: string): string[] {
  const normalized = message.replace(/\r/g, '').trim();
  if (!normalized) return [];

  const itemIndex = extractItemIndexFromText(normalized);
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const fieldCandidates = Object.keys(FIELD_LABELS).sort((a, b) => b.length - a.length);
  const escaped = fieldCandidates.map(escapeRegExp).join('|');
  const fieldMatch = normalized.match(new RegExp(`(?:^|\\n)(${escaped})(?:\\n|$)`, 'i'));
  const field = fieldMatch?.[1];

  if (field) {
    const fieldLineIndex = lines.findIndex((line) => line.toLowerCase() === field.toLowerCase());
    const detailLine = fieldLineIndex >= 0 ? lines.slice(fieldLineIndex + 1).join(' ') : normalized;
    const input = extractInputValue(normalized);
    return [buildFieldMessage(field, detailLine, input, itemIndex)];
  }

  if (/salary_min.*salary_max|maior que salary_max/i.test(normalized)) {
    return ['Faixa salarial inválida. O salário mínimo não pode ser maior que o salário máximo.'];
  }

  if (/validation error/i.test(normalized)) {
    return ['O backend rejeitou o payload por erro de validação. Revise os campos da vaga e tente novamente.'];
  }

  return [normalized];
}

export function parsePydanticDetail(detail: unknown): string[] {
  if (typeof detail === 'string') {
    return parseBulkImportValidationMessage(detail);
  }

  if (!Array.isArray(detail)) {
    return [];
  }

  const lines: string[] = [];
  for (const item of detail) {
    const record = toRecord(item) as PydanticDetailItem | null;
    if (!record) continue;
    const loc = normalizeLoc(record.loc);
    const itemIndex = extractItemIndexFromLoc(loc);
    const field = extractFieldFromLoc(loc);
    if (field) {
      lines.push(buildFieldMessage(field, record.msg ?? 'Valor inválido.', record.input, itemIndex));
      continue;
    }
    if (record.msg) {
      lines.push(record.msg);
    }
  }

  return lines;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatRetryAfter(seconds: number): string {
  const rounded = Math.max(1, Math.ceil(seconds));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  if (remaining === 0) return `${minutes}min`;
  return `${minutes}min ${remaining}s`;
}

export function handleApiError(error: unknown): UserFriendlyError {
  const status = getHttpStatus(error);
  const detail = getBackendDetail(error);
  const validationDetails = dedupe(parsePydanticDetail(detail));

  // LOG DETALHADO DO ERRO PARA DEBUG
  console.error("🔴 [handleApiError] API Error Details:", {
    status,
    detail,
    validationDetails,
    fullError: error,
    timestamp: new Date().toISOString(),
  });

  if (status === 422) {
    console.error("❌ [handleApiError] VALIDAÇÃO 422 RECEBIDA DO BACKEND:", {
      details: validationDetails,
      rawDetail: detail,
    });
    return {
      title: 'Erro de validação',
      message:
        validationDetails.length > 0
          ? 'Alguns campos precisam ser corrigidos antes de continuar.'
          : 'O backend rejeitou o payload por erro de validação.',
      details: validationDetails,
      severity: 'error',
      status,
      raw: error,
    };
  }

  if (status === 400) {
    return {
      title: 'Requisição inválida',
      message: typeof detail === 'string' && detail.trim() ? detail : 'Há regras de negócio inválidas no payload enviado.',
      details: validationDetails.length > 0 ? validationDetails : undefined,
      severity: 'error',
      status,
      raw: error,
    };
  }

  if (status === 401) {
    return {
      title: 'Sessão expirada',
      message: 'Faça login novamente para continuar.',
      severity: 'warning',
      status,
      raw: error,
    };
  }

  if (status === 403) {
    return {
      title: 'Acesso negado',
      message: 'Você não tem permissão para executar esta ação.',
      severity: 'warning',
      status,
      raw: error,
    };
  }

  if (status === 404) {
    return {
      title: 'Registro não encontrado',
      message: 'O recurso solicitado não foi encontrado.',
      severity: 'warning',
      status,
      raw: error,
    };
  }

  if (status === 409) {
    return {
      title: 'Conflito de dados',
      message: 'Registro duplicado ou conflito de dados.',
      severity: 'warning',
      status,
      raw: error,
    };
  }

  if (status === 429) {
    const retryAfterSeconds =
      error instanceof HttpError && typeof error.retryAfterSeconds === "number"
        ? error.retryAfterSeconds
        : undefined;

    return {
      title: "🚫 Limite de uso da IA atingido",
      message:
        retryAfterSeconds != null
          ? `Aguarde alguns minutos ou troque a chave da API. Tempo estimado para nova tentativa: ${formatRetryAfter(retryAfterSeconds)}.`
          : "Aguarde alguns minutos ou troque a chave da API.",
      severity: "warning",
      status,
      raw: error,
    };
  }

  if (status === 500) {
    return {
      title: 'Erro interno do servidor',
      message: 'Tente novamente ou acione o suporte.',
      severity: 'error',
      status,
      raw: error,
    };
  }

  if (status && status >= 502) {
    return {
      title: 'Servidor indisponível',
      message: 'O servidor não respondeu corretamente. Tente novamente em instantes.',
      severity: 'error',
      status,
      raw: error,
    };
  }

  if (status === 0 || error instanceof TypeError) {
    return {
      title: 'Falha de conexão',
      message: 'Não foi possível conectar ao servidor. Verifique sua conexão ou se o backend está rodando.',
      severity: 'error',
      status,
      raw: error,
    };
  }

  if (error instanceof Error) {
    if (/json inválido|formato inválido|payload|jobs vazio|campo obrigatório/i.test(error.message)) {
      return {
        title: 'Erro de validação',
        message: 'Alguns campos precisam ser corrigidos antes de continuar.',
        details: [error.message],
        severity: 'error',
        status,
        raw: error,
      };
    }

    return {
      title: 'Erro inesperado',
      message: error.message || 'Ocorreu um erro inesperado. Tente novamente.',
      severity: 'error',
      status,
      raw: error,
    };
  }

  return {
    title: 'Erro inesperado',
    message: 'Não foi possível concluir a operação. Tente novamente.',
    severity: 'error',
    status,
    raw: error,
  };
}

export function formatErrorForToast(error: UserFriendlyError): string {
  const firstDetail = error.details?.[0];
  if (firstDetail) {
    return `${error.title}: ${firstDetail}`;
  }
  return `${error.title}: ${error.message}`;
}

export function formatErrorDetails(error: UserFriendlyError): string[] {
  if (error.details && error.details.length > 0) {
    return error.details;
  }
  return error.message ? [error.message] : [];
}

export async function safeRequest<T>(
  fn: () => Promise<T>,
  options?: {
    onError?: (error: UserFriendlyError) => void;
    rethrow?: boolean;
  },
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error('[safeRequest] raw error', error);
    const friendly = handleApiError(error);

    // TRATAMENTO ESPECIAL PARA ERROS 401 (Token expirado)
    if (friendly.status === 401) {
      console.warn("[safeRequest] 401 Unauthorized - Redirecting to login");
      // Redirecionar para login após um pequeno delay
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    }

    // TRATAMENTO ESPECIAL PARA ERROS 422 (Validação)
    if (friendly.status === 422) {
      console.error("[safeRequest] 422 Validation Error:", {
        message: friendly.message,
        details: friendly.details,
      });
    }

    options?.onError?.(friendly);
    if (options?.rethrow) {
      throw friendly;
    }
    return null;
  }
}
