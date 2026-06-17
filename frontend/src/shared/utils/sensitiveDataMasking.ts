const EMPTY_MASK = "-";
const PRESENT_MASK = "Informado";

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

const EMAIL_KEYS = new Set(["email", "e_mail"]);
const CPF_KEYS = new Set(["cpf"]);
const PHONE_KEYS = new Set(["phone", "telefone", "celular", "mobile", "cellphone", "whatsapp"]);
const SENSITIVE_SUMMARY_KEYS = new Set([
  "rg",
  "salario",
  "remuneracao",
  "salary",
  "wage",
  "compensation",
  "endereco",
  "address",
  "logradouro",
  "bairro",
  "cep",
  "zipcode",
  "postalcode",
  "banco",
  "bancaria",
  "bancario",
  "bank",
  "agencia",
  "agency",
  "conta",
  "account",
  "iban",
  "pix",
  "mae",
  "mother",
  "pai",
  "father",
  "pis",
  "pasep",
  "ctps",
]);

type SensitiveKind = "email" | "cpf" | "phone" | "summary" | null;

function normalizeKey(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function keyTokens(key: string): string[] {
  return normalizeKey(key).split(/[^a-z0-9]+/).filter(Boolean);
}

function resolveSensitiveKind(key: string): SensitiveKind {
  const tokens = keyTokens(key);
  if (tokens.some((token) => EMAIL_KEYS.has(token))) return "email";
  if (tokens.some((token) => CPF_KEYS.has(token))) return "cpf";
  if (tokens.some((token) => PHONE_KEYS.has(token))) return "phone";
  if (tokens.some((token) => SENSITIVE_SUMMARY_KEYS.has(token))) return "summary";
  return null;
}

export function maskEmail(value?: string | null): string {
  if (!value) return EMPTY_MASK;
  const [localPart, domain] = value.split("@");
  if (!domain) return PRESENT_MASK;
  const visible = localPart.slice(0, 1) || "*";
  return `${visible}***@${domain}`;
}

export function maskCpf(value?: string | null): string {
  if (!value) return EMPTY_MASK;
  const digits = value.replace(/\D/g, "");
  const suffix = digits.slice(-2);
  return suffix ? `***.***.***-${suffix.padStart(2, "*")}` : PRESENT_MASK;
}

export function maskPhone(value?: string | null): string {
  if (!value) return EMPTY_MASK;
  const digits = value.replace(/\D/g, "");
  if (!digits) return PRESENT_MASK;
  const suffix = digits.slice(-2);
  return suffix ? `Telefone ***${suffix}` : PRESENT_MASK;
}

export function summarizeSensitiveValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return EMPTY_MASK;
  return PRESENT_MASK;
}

function redactSensitiveString(value: string): string {
  return value
    .replace(EMAIL_PATTERN, (match) => maskEmail(match))
    .replace(CPF_PATTERN, (match) => maskCpf(match));
}

function maskByKind(value: unknown, kind: Exclude<SensitiveKind, null>): unknown {
  if (kind === "email") return maskEmail(typeof value === "string" ? value : null);
  if (kind === "cpf") return maskCpf(typeof value === "string" ? value : null);
  if (kind === "phone") return maskPhone(typeof value === "string" ? value : null);
  return summarizeSensitiveValue(value);
}

export function redactSensitivePayload<T>(payload: T): T {
  function visitSensitiveContainer(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => visitSensitiveContainer(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
          entryKey,
          visitSensitiveContainer(entryValue),
        ]),
      );
    }

    return summarizeSensitiveValue(value);
  }

  function visit(value: unknown, key?: string): unknown {
    const kind = key ? resolveSensitiveKind(key) : null;
    if (kind) {
      if (value && typeof value === "object") return visitSensitiveContainer(value);
      return maskByKind(value, kind);
    }

    if (Array.isArray(value)) {
      return value.map((item) => visit(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
          entryKey,
          visit(entryValue, entryKey),
        ]),
      );
    }

    if (typeof value === "string") {
      return redactSensitiveString(value);
    }

    return value;
  }

  return visit(payload) as T;
}
