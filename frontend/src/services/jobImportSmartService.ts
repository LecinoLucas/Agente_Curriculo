import { Job, JobQualityResult, Skill } from "../types/domain";
import { listJobs, getJobQuality } from "./jobsService";
import { skillsService } from "./skillsService";
import { HttpError, httpRequest } from "./http";

export type JobImportSkillInput = {
  name: string;
  is_mandatory?: boolean;
  minimum_level?: string | null;
  minimum_years?: number | null;
  weight?: number;
};

export type JobImportInput = {
  title: string;
  description: string;
  requirements?: string | null;
  status?: string;
  seniority_level?: string | null;
  minimum_education_level?: string | null;
  minimum_years_experience?: number | string | null;
  deal_breakers?: unknown[];
  work_model?: string | null;
  location?: string | null;
  salary_min?: number | string | null;
  salary_max?: number | string | null;
  salary_currency?: string;
  job_area?: string | null;
  responsibilities?: string | null;
  experience_context?: string | null;
  behavioral_requirements?: string[];
  priority?: "low" | "normal" | "high" | "urgent";
  skills?: JobImportSkillInput[];
};

export type SmartImportOptions = {
  dry_run: boolean;
  skip_duplicates: boolean;
  default_status: "draft" | "published" | "paused" | "closed" | "cancelled";
};

export type SmartImportPayload = {
  jobs: JobImportInput[];
  options: SmartImportOptions;
};

type NormalizedPayload = SmartImportPayload & {
  normalization: Array<{ warnings: string[]; errors: string[] }>;
};

type SkillResolutionPreview = {
  jobs: JobImportInput[];
  warningsByIndex: string[][];
};

type ResolvedCatalogSkill = {
  canonicalName: string;
  key: string;
};

export type SmartImportPreviewItem = {
  index: number;
  title: string;
  job_area: string | null;
  location: string | null;
  action: "create" | "update";
  existing_job_id: string | null;
  missing_skills: string[];
  found_skills: string[];
  errors: string[];
  warnings: string[];
};

export type SmartImportPreview = {
  jobs: JobImportInput[];
  options: SmartImportOptions;
  items: SmartImportPreviewItem[];
  total: number;
  new_jobs: number;
  existing_jobs: number;
  skills_found: string[];
  skills_missing: string[];
};

export type SmartImportExecutionResult = {
  title: string;
  action: "create" | "update";
  status: string;
  job_id: string | null;
  quality_score: number | null;
  quality_status: JobQualityResult["status"] | null;
  errors: string[];
  warnings: string[];
};

export type SmartImportExecutionSummary = {
  total: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  preview_only: number;
  results: SmartImportExecutionResult[];
};

type BulkImportResult = {
  title: string;
  status: "created" | "skipped" | "failed";
  job_id?: string | null;
  quality_score?: number | null;
  quality_status?: JobQualityResult["status"] | null;
  errors?: string[];
  warnings?: string[];
};

type BulkImportResponse = {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  results: BulkImportResult[];
};

type BulkUpdateResult = {
  job_id?: string | null;
  status: "updated" | "failed";
  errors?: string[];
  warnings?: string[];
};

type BulkUpdateResponse = {
  total: number;
  updated: number;
  failed: number;
  results: BulkUpdateResult[];
};

const DEFAULT_OPTIONS: SmartImportOptions = {
  dry_run: false,
  skip_duplicates: true,
  default_status: "draft",
};

const SAFE_MODE = true; // Permite importar items com erros menor (fallback tolerante)

const VALID_JOB_AREAS = new Set([
  "technology",
  "data",
  "financial",
  "fiscal",
  "accounting",
  "administrative",
  "commercial",
  "operational",
  "hr",
  "leadership",
]);

const VALID_SENIORITY_LEVELS = new Set(["intern", "junior", "mid", "senior", "lead", "principal", "director"]);
const VALID_EDUCATION_LEVELS = new Set(["none", "high_school", "technical", "bachelor", "postgraduate", "master", "phd"]);
const VALID_WORK_MODELS = new Set(["remote", "hybrid", "onsite"]);
const VALID_PRIORITY_LEVELS = new Set(["low", "normal", "high", "urgent"]);
const VALID_STATUS_LEVELS = new Set(["draft", "published", "paused", "closed", "cancelled"]);

type EnumType = "job_area" | "seniority_level" | "minimum_education_level" | "work_model" | "priority" | "status";

export const DEFAULT_JOB_IMPORT_TEMPLATE = JSON.stringify(
  [
    {
      title: "Analista de Dados Sênior",
      status: "draft",
      job_area: "data",
      priority: "high",
      seniority_level: "senior",
      minimum_education_level: "bachelor",
      minimum_years_experience: 3,
      work_model: "hybrid",
      location: "São Paulo - SP",
      salary_currency: "BRL",
      description: "Atuar com análise de dados, construção de dashboards e suporte à tomada de decisão.",
      responsibilities: "Construir dashboards, acompanhar indicadores e apoiar áreas de negócio com análises.",
      requirements: "Experiência com SQL, Power BI e análise de indicadores.",
      experience_context: "Vivência em ambientes analíticos, BI e suporte a stakeholders internos.",
      behavioral_requirements: ["Comunicação", "Organização"],
      skills: [
        { name: "SQL", is_mandatory: true, weight: 10, minimum_level: "mid", minimum_years: 2 },
        { name: "Power BI", is_mandatory: true, weight: 8, minimum_level: "mid", minimum_years: 1 }
      ],
      deal_breakers: []
    }
  ],
  null,
  2,
);

export const DEFAULT_JOB_IMPORT_AI_PROMPT = `# Conversor de Vagas para JSON

Você vai analisar uma imagem de vaga enviada no chat e converter FIELMENTE para JSON válido de importação.

## ⚠️ REGRAS CRÍTICAS (Siga exatamente)

1. **RESPONDA APENAS COM JSON VÁLIDO** - nada mais, nada menos
2. **NÃO escreva explicações, comentários ou prefácios**
3. **Retorne SEMPRE no formato final com "jobs" e "options"**
4. **Use APENAS valores pré-definidos em INGLÊS** - vide lista abaixo

## 📋 Enumerações Válidas (copie exatamente)

\`\`\`
job_area: "technology" | "data" | "financial" | "fiscal" | "accounting" | "administrative" | "commercial" | "operational" | "hr" | "leadership"

status: "draft" | "published" | "paused" | "closed" | "cancelled"
Padrão: "draft"

priority: "low" | "normal" | "high" | "urgent"
Padrão: "normal"

seniority_level: "intern" | "junior" | "mid" | "senior" | "lead" | "principal" | "director"

minimum_education_level: "none" | "high_school" | "technical" | "bachelor" | "postgraduate" | "master" | "phd"

work_model: "remote" | "hybrid" | "onsite"

Skill minimum_level: "intern" | "junior" | "mid" | "senior" | "lead" | "principal"

salary_currency: "BRL" (padrão)
\`\`\`

## 🛠️ Campos Obrigatórios

- **title** (string) - Título da vaga
- **description** (string) - Descrição completa da vaga

## 📝 Campos Recomendados

- **job_area** - Qual área (escolha da lista acima)
- **seniority_level** - Nível de senioridade
- **minimum_education_level** - Educação mínima
- **work_model** - Modelo de trabalho
- **location** - Localização
- **skills** - Array de skills com nome, se obrigatória, peso, nível mínimo, anos mínimos

## 🎯 Boas Práticas

- Se **não souber um valor, omita o campo** (não use null ou "")
- **Soft skills em behavioral_requirements** (ex: "Comunicação", "Liderança", "Organização")
- **Skills técnicas em skills array** (ex: "SQL", "Python", "Power BI")
- **Extraia implicitamente**: se pede "banco de dados", adicione "SQL" ou "PostgreSQL"
- **deal_breakers são raros** - só se explicitamente em requisitos eliminatórios

## ⚡ Exemplo Correto

${DEFAULT_JOB_IMPORT_TEMPLATE}

## 🔴 ERROS COMUNS A EVITAR

- ❌ job_area em português ("Dados" em vez de "data")
- ❌ status em português ("Publicada" em vez de "published")
- ❌ priority em português ("Alta" em vez de "high")
- ❌ seniority_level em português ("Sênior" em vez de "senior")
- ❌ work_model em português ("Remoto" em vez de "remote")
- ❌ Valores não da lista (ex: "pleno" em vez de "mid")
- ❌ JSON inválido ou com comentários
- ❌ Explicações antes/depois do JSON
- ❌ Campos vazios "" quando deveria omitir

## 📤 FORMATO FINAL OBRIGATÓRIO

Sempre retorne ESTE EXATO FORMAT COM "jobs" e "options":
\`\`\`json
{
  "jobs": [
    { ... vaga 1 ... },
    { ... vaga 2 ... }
  ],
  "options": {
    "dry_run": false,
    "skip_duplicates": true,
    "default_status": "draft"
  }
}
\`\`\`

Comece a analisar a imagem agora.`;

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function cleanRawJson(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/:contentReference\[[^\]]+\]\{[^}]+\}/g, "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

function removeTrailingCommas(raw: string): string {
  return raw.replace(/,\s*([}\]])/g, "$1");
}

function extractJsonFragment(raw: string): string {
  const firstBrace = raw.indexOf("{");
  const firstBracket = raw.indexOf("[");
  const starts = [firstBrace, firstBracket].filter((value) => value >= 0);
  if (starts.length === 0) return raw;

  const start = Math.min(...starts);
  const lastBrace = raw.lastIndexOf("}");
  const lastBracket = raw.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);

  if (end <= start) return raw.slice(start).trim();
  return raw.slice(start, end + 1).trim();
}

function replaceSingleQuotes(raw: string): string {
  return raw.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, content: string) => `"${content.replace(/"/g, '\\"')}"`);
}

function quoteUnquotedKeys(raw: string): string {
  return raw.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
}

function fixCommonJsonErrors(input: string): unknown {
  const base = extractJsonFragment(cleanRawJson(input));
  const candidates = [
    base,
    removeTrailingCommas(base),
    removeTrailingCommas(replaceSingleQuotes(base)),
    removeTrailingCommas(quoteUnquotedKeys(replaceSingleQuotes(base))),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  throw new Error("JSON inválido.");
}

function safeJsonParse(input: string): unknown {
  const cleaned = cleanRawJson(input);
  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      return fixCommonJsonErrors(cleaned);
    } catch {
      return { raw_text: cleaned };
    }
  }
}

function parseLooseJson(raw: string): unknown {
  return safeJsonParse(raw);
}

function logAutoFix(field: string, original: unknown, fixed: unknown): void {
  if (original === fixed) return;
  console.warn("AUTO FIX:", {
    field,
    original,
    fixed,
  });
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pickFirst<T = unknown>(source: Record<string, unknown>, keys: string[]): T | undefined {
  for (const key of keys) {
    if (key in source && source[key] != null) {
      return source[key] as T;
    }
  }
  return undefined;
}

function toStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function coerceBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const normalized = normalizeText(String(value ?? ""));
  if (["true", "1", "sim", "yes", "y", "obrigatoria", "obrigatorio", "mandatory", "required"].includes(normalized)) return true;
  if (["false", "0", "nao", "não", "no", "n", "opcional", "optional"].includes(normalized)) return false;
  return fallback;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/[Rr]\$\s?/g, "")
    .replace(/anos?/gi, "")
    .replace(/[^0-9,.-]/g, "")
    .trim();

  if (!cleaned) return null;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let normalized = cleaned;

  if (hasComma && hasDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const ENUM_MAPS: Record<EnumType, Record<string, string>> = {
  job_area: {
    tecnologia: "technology",
    technology: "technology",
    tech: "technology",
    ti: "technology",
    dados: "data",
    data: "data",
    financeiro: "financial",
    financial: "financial",
    financas: "financial",
    fiscal: "fiscal",
    contabil: "accounting",
    contabilidade: "accounting",
    accounting: "accounting",
    administrativo: "administrative",
    administrative: "administrative",
    administracao: "administrative",
    comercial: "commercial",
    commercial: "commercial",
    vendas: "commercial",
    operacional: "operational",
    operational: "operational",
    operacoes: "operational",
    rh: "hr",
    hr: "hr",
    "recursos humanos": "hr",
    lideranca: "leadership",
    leadership: "leadership",
    gestao: "leadership",
  },
  seniority_level: {
    intern: "intern",
    estagio: "intern",
    estagiario: "intern",
    junior: "junior",
    jr: "junior",
    pleno: "mid",
    pl: "mid",
    mid: "mid",
    senior: "senior",
    sr: "senior",
    lead: "lead",
    lider: "lead",
    coordenador: "lead",
    principal: "principal",
    especialista: "principal",
    director: "director",
    diretor: "director",
  },
  minimum_education_level: {
    none: "none",
    nenhuma: "none",
    "high school": "high_school",
    "ensino medio": "high_school",
    medio: "high_school",
    technical: "technical",
    tecnico: "technical",
    bachelor: "bachelor",
    graduacao: "bachelor",
    superior: "bachelor",
    postgraduate: "postgraduate",
    pos: "postgraduate",
    "pos graduacao": "postgraduate",
    master: "master",
    mestrado: "master",
    phd: "phd",
    doutorado: "phd",
  },
  work_model: {
    remote: "remote",
    remoto: "remote",
    "home office": "remote",
    hybrid: "hybrid",
    hibrido: "hybrid",
    onsite: "onsite",
    presencial: "onsite",
  },
  priority: {
    low: "low",
    baixa: "low",
    baixo: "low",
    normal: "normal",
    media: "normal",
    medio: "normal",
    padrao: "normal",
    high: "high",
    alta: "high",
    alto: "high",
    urgent: "urgent",
    urgente: "urgent",
  },
  status: {
    draft: "draft",
    rascunho: "draft",
    publicada: "published",
    publicado: "published",
    published: "published",
    aberta: "published",
    open: "published",
    paused: "paused",
    pausada: "paused",
    pausedo: "paused",
    closed: "closed",
    fechada: "closed",
    encerrada: "closed",
    cancelled: "cancelled",
    canceled: "cancelled",
    cancelada: "cancelled",
  },
};

function normalizeEnum(value: unknown, type: EnumType): string | null {
  const original = toStringOrNull(value);
  if (!original) return null;
  const normalized = normalizeText(original);
  const mapped = ENUM_MAPS[type][normalized];

  console.log(`[normalizeEnum] ${type}:`, {
    input: original,
    normalized: normalized,
    mapped: mapped,
    foundInMap: !!mapped,
  });

  if (mapped) {
    logAutoFix(type, original, mapped);
    console.log(`[normalizeEnum] ${type} returning MAPPED value: "${mapped}"`);
    return mapped;
  }
  // If no mapping found, return original (not normalized)
  console.warn(`[normalizeEnum] No mapping found for ${type}="${original}" (normalized="${normalized}") - RETURNING ORIGINAL`);
  return original;
}

function normalizeJobArea(value: unknown): string | null {
  return normalizeEnum(value, "job_area");
}

function normalizePriority(value: unknown): SmartImportOptions["default_status"] | JobImportInput["priority"] {
  return (normalizeEnum(value, "priority") as JobImportInput["priority"] | null) ?? "normal";
}

function normalizeStatus(value: unknown): SmartImportOptions["default_status"] {
  return (normalizeEnum(value, "status") as SmartImportOptions["default_status"] | null) ?? "draft";
}

function normalizeSeniority(value: unknown): string | null {
  return normalizeEnum(value, "seniority_level");
}

function normalizeEducationLevel(value: unknown): string | null {
  return normalizeEnum(value, "minimum_education_level");
}

function normalizeWorkModel(value: unknown): string | null {
  return normalizeEnum(value, "work_model");
}

function isAllowedEnum(value: unknown, type: EnumType): boolean {
  if (typeof value !== "string") return false;
  switch (type) {
    case "job_area":
      return VALID_JOB_AREAS.has(value);
    case "seniority_level":
      return VALID_SENIORITY_LEVELS.has(value);
    case "minimum_education_level":
      return VALID_EDUCATION_LEVELS.has(value);
    case "work_model":
      return VALID_WORK_MODELS.has(value);
    case "priority":
      return VALID_PRIORITY_LEVELS.has(value);
    case "status":
      return VALID_STATUS_LEVELS.has(value);
    default:
      return false;
  }
}

function normalizeBehavioralRequirements(value: unknown): string[] {
  const seen = new Set<string>();
  return toArray(value)
    .map((item) => toStringOrNull(item))
    .filter((item): item is string => Boolean(item))
    .filter((item) => {
      const key = normalizeText(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function inferDescription(parts: Array<unknown>): string | null {
  const lines = parts
    .map((part) => toStringOrNull(part))
    .filter((part): part is string => Boolean(part));
  if (lines.length === 0) return null;
  return lines.join(" ");
}

function normalizeSkills(value: unknown, isMandatoryDefault: boolean): JobImportSkillInput[] {
  return toArray(value)
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          name: entry.trim(),
          is_mandatory: isMandatoryDefault,
          weight: isMandatoryDefault ? 8 : 5,
          minimum_level: null,
          minimum_years: null,
        };
      }

      const obj = asObject(entry);
      if (!obj) return null;

      const name = toStringOrNull(pickFirst(obj, ["name", "nome", "skill", "habilidade", "competencia", "competência"]));
      if (!name) return null;

      return {
        name,
        is_mandatory: coerceBoolean(
          pickFirst(obj, ["is_mandatory", "mandatory", "obrigatoria", "obrigatório", "required"]),
          isMandatoryDefault,
        ),
        weight:
          coerceNumber(pickFirst(obj, ["weight", "peso", "importancia", "importância"])) ??
          (isMandatoryDefault ? 8 : 5),
        minimum_level: normalizeSeniority(pickFirst(obj, ["minimum_level", "nivel_minimo", "nível_mínimo", "nivel"])),
        minimum_years: coerceNumber(pickFirst(obj, ["minimum_years", "anos_minimos", "anos_mínimos", "experiencia", "experiência"])),
      };
    })
    .filter((item): item is JobImportSkillInput => Boolean(item));
}

function mergeSkills(...groups: JobImportSkillInput[][]): JobImportSkillInput[] {
  const merged = new Map<string, JobImportSkillInput>();

  for (const group of groups) {
    for (const skill of group) {
      const key = normalizeSkillName(skill.name);
      if (!key) continue;

      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...skill });
        continue;
      }

      merged.set(key, {
        ...existing,
        name: existing.name || skill.name,
        is_mandatory: Boolean(existing.is_mandatory || skill.is_mandatory),
        weight: Math.max(existing.weight ?? 0, skill.weight ?? 0),
        minimum_level: existing.minimum_level ?? skill.minimum_level ?? null,
        minimum_years: Math.max(existing.minimum_years ?? 0, skill.minimum_years ?? 0) || null,
      });
    }
  }

  return [...merged.values()];
}

function normalizeOptions(value: unknown): SmartImportOptions {
  const obj = asObject(value) ?? {};
  const defaultStatus = normalizeStatus(pickFirst(obj, ["default_status", "status_padrao", "defaultStatus"]));
  return {
    dry_run: coerceBoolean(pickFirst(obj, ["dry_run", "dryRun"]), false),
    skip_duplicates: coerceBoolean(pickFirst(obj, ["skip_duplicates", "skipDuplicates"]), true),
    default_status: defaultStatus,
  };
}

const DEAL_BREAKER_FIELD_OPERATORS: Record<string, string[]> = {
  location: ["equals", "not_equals", "contains", "in"],
  work_model: ["equals", "not_equals"],
  education_level: ["equals", ">="],
  experience_years: [">=", "<=", "equals"],
  skill: ["contains", "not_contains"],
  language: ["equals", "contains"],
  availability: ["equals"],
  custom_text: ["contains"],
};

const DEAL_BREAKER_FIELD_MAP: Record<string, string> = {
  educacao: "education_level",
  educação: "education_level",
  education_level: "education_level",
  nivel_educacao: "education_level",
  nível_educação: "education_level",
  skill: "skill",
  habilidade: "skill",
  competencia: "skill",
  competência: "skill",
  language: "language",
  idioma: "language",
  location: "location",
  localizacao: "location",
  localização: "location",
  work_model: "work_model",
  modelo_trabalho: "work_model",
  modelo_de_trabalho: "work_model",
  experiencia: "experience_years",
  experiência: "experience_years",
  experience_years: "experience_years",
  disponibilidade: "availability",
  availability: "availability",
  texto_livre: "custom_text",
  custom_text: "custom_text",
};

function normalizeDealBreakerField(value: unknown): string | null {
  const normalized = normalizeText(String(value ?? ""));
  return DEAL_BREAKER_FIELD_MAP[normalized] ?? toStringOrNull(value);
}

function normalizeDealBreakers(value: unknown, index: number): { breakers: unknown[]; warnings: string[] } {
  const warnings: string[] = [];
  const breakers = toArray(value)
    .map((entry) => {
      const obj = asObject(entry);
      if (!obj) return null;

      const fieldRaw = toStringOrNull(obj.field);
      const field = normalizeDealBreakerField(fieldRaw);
      const operator = toStringOrNull(obj.operator);
      const reason = toStringOrNull(obj.reason);
      const valueText = toStringOrNull(obj.value);

      if (!field || !operator || !reason) {
        warnings.push(`Item ${index + 1}: deal_breaker inválido foi ignorado.`);
        return null;
      }

      const allowedOps = DEAL_BREAKER_FIELD_OPERATORS[field];
      if (allowedOps && !allowedOps.includes(operator)) {
        warnings.push(
          `Item ${index + 1}: deal_breaker com operador inválido foi ignorado (${fieldRaw ?? "desconhecido"} / ${operator}).`,
        );
        return null;
      }

      if (operator !== "in" && !valueText) {
        warnings.push(`Item ${index + 1}: deal_breaker sem valor foi ignorado.`);
        return null;
      }

      return {
        ...obj,
        field,
        operator,
      };
    })
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

  return { breakers, warnings };
}

function normalizeSingleJob(rawJob: unknown, index: number): { job: JobImportInput; warnings: string[]; errors: string[] } {
  const source = asObject(rawJob);
  if (!source) {
    if (false) {
      const fallbackDescription = toStringOrNull(rawJob) ?? JSON.stringify(rawJob ?? "");
      return {
        job: {
          title: `Item ${index + 1}`,
          description: fallbackDescription || "Descrição não informada na origem.",
          status: "draft",
          salary_currency: "BRL",
          priority: "normal",
          skills: [],
          deal_breakers: [],
          behavioral_requirements: [],
        },
        warnings: [`Item ${index + 1}: conteúdo inválido foi convertido para texto livre.`],
        errors: [],
      };
    }

    return {
      job: {
        title: `Item ${index + 1}`,
        description: "",
        status: "draft",
        salary_currency: "BRL",
        priority: "normal",
        skills: [],
        deal_breakers: [],
        behavioral_requirements: [],
      },
      warnings: [],
      errors: [`Item ${index + 1}: vaga inválida.`],
    };
  }

  const warnings: string[] = [];
  const errors: string[] = [];

  const title = toStringOrNull(
    pickFirst(source, ["title", "titulo", "título", "cargo", "nome", "job_title", "vaga"]),
  );
  const descriptionRaw = pickFirst(source, ["description", "descricao", "descrição", "resumo"]);
  const responsibilities = toStringOrNull(
    pickFirst(source, ["responsibilities", "responsabilidades", "atividades", "principais_atividades"]),
  );
  const requirements = toStringOrNull(pickFirst(source, ["requirements", "requisitos", "requirement"]));
  const experienceContext = toStringOrNull(
    pickFirst(source, ["experience_context", "experienceContext", "contexto_experiencia", "contexto de experiencia", "contexto"]),
  );
  const descriptionFromSource = toStringOrNull(descriptionRaw);
  const description = descriptionFromSource ?? inferDescription([responsibilities, requirements, experienceContext]) ?? "";

  if (!title) {
    warnings.push(`Item ${index + 1}: título ausente; foi aplicado um título padrão.`);
  }
  if (!descriptionFromSource && description) {
    warnings.push("description ausente no payload original; preenchida a partir de responsabilidades/requisitos/contexto.");
  }
  if (!description && false) {
    warnings.push(`Item ${index + 1}: descrição ausente; preenchida automaticamente com fallback seguro.`);
  }

  const mandatorySkills = normalizeSkills(
    pickFirst(source, ["mandatory_skills", "required_skills", "skills_obrigatorias", "habilidades_obrigatorias"]),
    true,
  );
  const optionalSkills = normalizeSkills(
    pickFirst(source, ["optional_skills", "desired_skills", "skills_desejaveis", "habilidades_desejaveis"]),
    false,
  );
  const mixedSkills = normalizeSkills(
    pickFirst(source, ["skills", "habilidades", "competencias", "competências", "tecnologias"]),
    false,
  );

  const salary = asObject(pickFirst(source, ["salary", "salario", "salário"]));
  const salaryMin = coerceNumber(pickFirst(source, ["salary_min", "salario_min", "salário_min"])) ?? coerceNumber(salary?.min);
  const salaryMax = coerceNumber(pickFirst(source, ["salary_max", "salario_max", "salário_max"])) ?? coerceNumber(salary?.max);
  const salaryCurrency =
    toStringOrNull(pickFirst(source, ["salary_currency", "salaryCurrency", "moeda"])) ??
    toStringOrNull(salary?.currency) ??
    "BRL";

  const statusSource = pickFirst(source, ["status", "situacao", "situação"]);
  const status = normalizeStatus(statusSource);
  if (statusSource != null && status === "draft" && normalizeText(String(statusSource)) !== "draft" && normalizeText(String(statusSource)) !== "rascunho") {
    warnings.push(`status "${String(statusSource)}" normalizado para draft.`);
  }

  const prioritySource = pickFirst(source, ["priority", "prioridade", "urgencia", "urgência"]);
  const priority = normalizePriority(prioritySource) as JobImportInput["priority"];
  if (prioritySource != null && priority === "normal" && !["normal", "media", "medio", "médio", "padrao", "padrão"].includes(normalizeText(String(prioritySource)))) {
    warnings.push(`priority "${String(prioritySource)}" normalizada para normal.`);
  }

  const dealBreakersRaw = pickFirst(source, ["deal_breakers", "criterios_eliminatorios", "critérios_eliminatórios", "eliminatorios"]);
  const dealBreakersNormalized = normalizeDealBreakers(dealBreakersRaw, index);
  warnings.push(...dealBreakersNormalized.warnings);

  const jobAreaInput = pickFirst(source, ["job_area", "area", "área", "department", "departamento"]);
  const jobAreaNormalized = normalizeJobArea(jobAreaInput);

  console.log(`[normalizeSingleJob] Item ${index} job_area:`, {
    inputField: jobAreaInput,
    normalized: jobAreaNormalized,
  });

  const job: JobImportInput = {
    title: title ?? `Item ${index + 1}`,
    description: description || "Descrição não informada na origem.",
    requirements,
    status,
    seniority_level: normalizeSeniority(pickFirst(source, ["seniority_level", "seniority", "senioridade", "nivel_senioridade", "nível_senioridade"])),
    minimum_education_level: normalizeEducationLevel(
      pickFirst(source, ["minimum_education_level", "educacao_minima", "educação_mínima", "education_level", "formacao_minima"]),
    ),
    minimum_years_experience:
      coerceNumber(
        pickFirst(source, [
          "minimum_years_experience",
          "anos_experiencia",
          "anos_experiencia_minima",
          "experiencia_minima",
          "experiência_mínima",
        ]),
      ) ?? null,
    deal_breakers: dealBreakersNormalized.breakers,
    work_model: normalizeWorkModel(pickFirst(source, ["work_model", "modelo_trabalho", "modelo_de_trabalho"])),
    location: toStringOrNull(pickFirst(source, ["location", "localizacao", "localização", "local", "cidade"])),
    salary_min: salaryMin,
    salary_max: salaryMax,
    salary_currency: salaryCurrency.toUpperCase(),
    job_area: jobAreaNormalized,
    responsibilities,
    experience_context: experienceContext,
    behavioral_requirements: normalizeBehavioralRequirements(
      pickFirst(source, [
        "behavioral_requirements",
        "soft_skills",
        "competencias_comportamentais",
        "competências_comportamentais",
        "requisitos_comportamentais",
      ]),
    ),
    priority,
    skills: mergeSkills(mandatorySkills, optionalSkills, mixedSkills),
  };

  console.log(`[normalizeSingleJob] Item ${index} FINAL job_area: "${job.job_area}"`);

  // Additional validation
  if (job.salary_min != null && job.salary_max != null && Number(job.salary_min) > Number(job.salary_max)) {
    if (false) {
      const originalMin = job.salary_min;
      const originalMax = job.salary_max;
      job.salary_min = undefined;
      job.salary_max = undefined;
      warnings.push(`Item ${index + 1}: faixa salarial inválida foi removida automaticamente.`);
      logAutoFix("salary_range", { salary_min: originalMin, salary_max: originalMax }, null);
    } else {
      errors.push(`Item ${index + 1}: salary_min não pode ser maior que salary_max`);
    }
  }

  // Add warning when job_area is normalized
  const jobAreaSource = pickFirst(source, ["job_area", "area", "área", "department", "departamento"]);
  console.log(`[normalizeSingleJob] Item ${index} - source.job_area: "${source.job_area}", normalized to: "${job.job_area}"`);
  if (jobAreaSource != null && job.job_area != null && normalizeText(String(jobAreaSource)) !== normalizeText(job.job_area)) {
    warnings.push(`job_area "${String(jobAreaSource)}" normalizada para "${job.job_area}".`);
  }
  if (job.job_area && !isAllowedEnum(job.job_area, "job_area")) {
    warnings.push(`job_area "${job.job_area}" não é reconhecida; será ignorada no envio para evitar erro 422.`);
  }
  if (job.seniority_level && !isAllowedEnum(job.seniority_level, "seniority_level")) {
    warnings.push(`seniority_level "${job.seniority_level}" não é reconhecida; será ignorada no envio para evitar erro 422.`);
  }

  return { job, warnings, errors };
}

function canonicalizeJobAreaKey(value: string | null | undefined): string {
  return normalizeJobArea(value) ?? normalizeText(value);
}

function buildJobIdentityKey(job: { title: string; job_area?: string | null; location?: string | null }): string {
  return [
    normalizeText(job.title),
    canonicalizeJobAreaKey(job.job_area),
    normalizeText(job.location),
  ].join("|");
}

function normalizeSkillName(value: string): string {
  return normalizeText(value);
}

function resolveCatalogSkills(jobs: JobImportInput[], skills: Skill[]): SkillResolutionPreview {
  const directMap = new Map<string, ResolvedCatalogSkill>();
  const fallbackMap = new Map<string, ResolvedCatalogSkill>();

  const controlledEquivalences: Record<string, string> = {
    "api rest": "API REST",
    "apis rest": "API REST",
    "rest api": "API REST",
    "rest apis": "API REST",
    "api restful": "API REST",
    graphql: "GraphQL",
    postgresql: "SQL",
    postgres: "SQL",
    mysql: "SQL",
    "sql server": "SQL",
    mssql: "SQL",
    "t sql": "SQL",
    "t-sql": "SQL",
    mongodb: "MongoDB",
    redis: "Redis",
    rabbitmq: "RabbitMQ",
    docker: "Docker",
    kubernetes: "Kubernetes",
    jest: "Jest",
    cypress: "Cypress",
    selenium: "Selenium",
    "ci cd": "CI/CD",
    cicd: "CI/CD",
  };

  function addLookup(target: Map<string, ResolvedCatalogSkill>, rawKey: string | null | undefined, skill: Skill) {
    const normalizedKey = normalizeSkillName(rawKey ?? "");
    if (!normalizedKey || target.has(normalizedKey)) return;
    target.set(normalizedKey, { canonicalName: skill.name, key: skill.normalized_name });
  }

  for (const skill of skills) {
    addLookup(directMap, skill.normalized_name, skill);
    addLookup(directMap, skill.name, skill);
    for (const alias of skill.aliases ?? []) {
      addLookup(directMap, alias, skill);
    }

    addLookup(fallbackMap, skill.normalized_name.replace(/\./g, " "), skill);
    addLookup(fallbackMap, skill.name.replace(/\./g, " "), skill);
    addLookup(fallbackMap, skill.name.replace(/\/+/g, " "), skill);
    for (const alias of skill.aliases ?? []) {
      addLookup(fallbackMap, alias.replace(/\./g, " "), skill);
      addLookup(fallbackMap, alias.replace(/\/+/g, " "), skill);
    }
  }

  const warningsByIndex: string[][] = [];
  const resolvedJobs = jobs.map((job, index) => {
    const warnings: string[] = [];
    const unmatchedStructured: string[] = [];
    const resolvedSkills = new Map<string, JobImportSkillInput>();

    function resolveSkillName(name: string): ResolvedCatalogSkill | null {
      const normalized = normalizeSkillName(name);
      if (!normalized) return null;

      const direct = directMap.get(normalized);
      if (direct) return direct;

      const compact = normalized
        .replace(/[()]/g, " ")
        .replace(/[./]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const fallback = fallbackMap.get(compact);
      if (fallback) return fallback;

      const equivalent = controlledEquivalences[compact];
      if (equivalent) {
        const equivalentMatch = directMap.get(normalizeSkillName(equivalent)) ?? fallbackMap.get(normalizeSkillName(equivalent));
        if (equivalentMatch) return equivalentMatch;
      }

      return null;
    }

    for (const skill of job.skills ?? []) {
      const resolved = resolveSkillName(skill.name);
      if (!resolved) {
        unmatchedStructured.push(skill.name);
        continue;
      }

      const existing = resolvedSkills.get(resolved.key);
      if (!existing) {
        resolvedSkills.set(resolved.key, {
          ...skill,
          name: resolved.canonicalName,
        });
        continue;
      }

      resolvedSkills.set(resolved.key, {
        ...existing,
        name: resolved.canonicalName,
        is_mandatory: Boolean(existing.is_mandatory || skill.is_mandatory),
        weight: Math.max(existing.weight ?? 0, skill.weight ?? 0),
        minimum_level: existing.minimum_level ?? skill.minimum_level ?? null,
        minimum_years: Math.max(existing.minimum_years ?? 0, skill.minimum_years ?? 0) || null,
      });
    }

    let nextRequirements = job.requirements ?? "";
    if (unmatchedStructured.length > 0) {
      const deduped = [...new Set(unmatchedStructured)];
      const sentence = `Tecnologias mencionadas no payload e preservadas apenas no texto por não existirem no catálogo estruturado: ${deduped.join(", ")}.`;
      nextRequirements = [nextRequirements.trim(), sentence].filter(Boolean).join(" ").trim();
      warnings.push(`Skills fora do catálogo estruturado foram mantidas apenas no texto: ${deduped.join(", ")}.`);
    }

    warningsByIndex[index] = warnings;

    return {
      ...job,
      requirements: nextRequirements || null,
      skills: [...resolvedSkills.values()],
    };
  });

  return { jobs: resolvedJobs, warningsByIndex };
}

async function listAllJobs(): Promise<Job[]> {
  const pageSize = 100;
  const first = await listJobs(1, pageSize);
  const jobs = [...first.data];
  for (let page = 2; page <= first.total_pages; page += 1) {
    const response = await listJobs(page, pageSize);
    jobs.push(...response.data);
  }
  return jobs;
}

function parseRawInput(raw: string): NormalizedPayload {
  if (!raw || !raw.trim()) {
    throw new Error("JSON vazio. Cole um payload JSON válido com pelo menos uma vaga.");
  }

  const parsed = parseLooseJson(raw);

  // Handle array format: [{ job1 }, { job2 }]
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new Error("Array vazio. Envie pelo menos uma vaga no JSON.");
    }

    const normalized = parsed.map((job, index) => normalizeSingleJob(job, index));

    return {
      jobs: normalized.map((item) => item.job),
      options: { ...DEFAULT_OPTIONS },
      normalization: normalized.map((item) => ({ warnings: item.warnings, errors: item.errors })),
    };
  }

  // Handle object format: { jobs: [...], options: {...} }
  const root = asObject(parsed);
  if (!root) {
    throw new Error("Formato inválido. Use um array de vagas ou um objeto com a chave 'jobs' (ex: { jobs: [...] }).");
  }

  const jobsRaw = pickFirst(root, ["jobs", "vagas", "items", "data"]);
  if (!Array.isArray(jobsRaw)) {
    throw new Error("A chave 'jobs' ou 'vagas' não encontrada ou não é um array. Formato esperado: { jobs: [...] } ou simplesmente [...].");
  }

  if (jobsRaw.length === 0) {
    throw new Error("Array 'jobs' vazio. Envie pelo menos uma vaga.");
  }

  const normalized = jobsRaw.map((job, index) => normalizeSingleJob(job, index));

  return {
    jobs: normalized.map((item) => item.job),
    options: normalizeOptions(pickFirst(root, ["options", "opcoes", "opções", "config"])),
    normalization: normalized.map((item) => ({ warnings: item.warnings, errors: item.errors })),
  };
}

async function buildReferences(): Promise<{ jobs: Job[]; skills: Skill[] }> {
  const [jobs, skills] = await Promise.all([listAllJobs(), skillsService.list()]);
  return { jobs, skills };
}

export async function detectExistingJobs(raw: string): Promise<SmartImportPreview> {
  const payload = parseRawInput(raw);
  console.log(`[detectExistingJobs] After parseRawInput, first job:`, {
    job_area: payload.jobs[0]?.job_area,
    title: payload.jobs[0]?.title,
  });
  const { jobs, skills } = await buildReferences();
  const resolved = resolveCatalogSkills(payload.jobs, skills);
  console.log(`[detectExistingJobs] After resolveCatalogSkills, first job:`, {
    job_area: resolved.jobs[0]?.job_area,
    title: resolved.jobs[0]?.title,
  });

  const existingByIdentity = new Map(jobs.map((job) => [buildJobIdentityKey(job), job]));
  const skillMap = new Map<string, Skill>();

  for (const skill of skills) {
    skillMap.set(normalizeSkillName(skill.normalized_name), skill);
    skillMap.set(normalizeSkillName(skill.name), skill);
    for (const alias of skill.aliases ?? []) {
      skillMap.set(normalizeSkillName(alias), skill);
    }
  }

  const items: SmartImportPreviewItem[] = resolved.jobs.map((job, index) => {
    const identity = buildJobIdentityKey(job);
    const existing = existingByIdentity.get(identity) ?? null;
    const normalization = payload.normalization[index] ?? { warnings: [], errors: [] };
    const foundSkills: string[] = [];
    const missingSkills: string[] = [];

    for (const skill of job.skills ?? []) {
      const normalized = normalizeSkillName(skill.name);
      if (!normalized) {
        missingSkills.push(skill.name);
        continue;
      }

      if (skillMap.has(normalized)) {
        foundSkills.push(skill.name);
      } else {
        missingSkills.push(skill.name);
      }
    }

    return {
      index,
      title: job.title,
      job_area: job.job_area ?? null,
      location: job.location ?? null,
      action: existing ? "update" : "create",
      existing_job_id: existing?.id ?? null,
      missing_skills: [...new Set(missingSkills)],
      found_skills: [...new Set(foundSkills)],
      errors: normalization.errors,
      warnings: [...normalization.warnings, ...(resolved.warningsByIndex[index] ?? [])],
    };
  });

  return {
    jobs: resolved.jobs,
    options: payload.options,
    items,
    total: items.length,
    new_jobs: items.filter((item) => item.action === "create").length,
    existing_jobs: items.filter((item) => item.action === "update").length,
    skills_found: [...new Set(items.flatMap((item) => item.found_skills))].sort((a, b) => a.localeCompare(b)),
    skills_missing: [...new Set(items.flatMap((item) => item.missing_skills))].sort((a, b) => a.localeCompare(b)),
  };
}

function buildCanonicalJobForApi(job: JobImportInput): JobImportInput {
  console.log(`[buildCanonicalJobForApi] INPUT job_area: "${job.job_area}"`);
  const result = sanitizeJobObject(job);
  console.log(`[buildCanonicalJobForApi] OUTPUT job_area: "${result.job_area}"`);
  return result;
}

function sanitizeEnumForApi(
  value: string | null | undefined,
  type: EnumType,
  field: string,
  warnings: string[],
): string | undefined {
  if (!value) return undefined;
  if (isAllowedEnum(value, type)) return value;
  warnings.push(`${field} "${value}" inválido foi ignorado para evitar erro 422.`);
  logAutoFix(field, value, undefined);
  return undefined;
}

function sanitizeDealBreakersForApi(value: unknown[] | undefined, warnings: string[]): unknown[] {
  const normalized = normalizeDealBreakers(value ?? [], 0);
  if (normalized.warnings.length > 0) {
    warnings.push(...normalized.warnings.map((item) => item.replace(/^Item \d+:\s*/, "")));
  }
  return normalized.breakers;
}

function normalizeOutboundJob(job: JobImportInput): { job: JobImportInput; warnings: string[] } {
  const warnings: string[] = [];
  console.log(`[normalizeOutboundJob] INPUT job_area: "${job.job_area}"`, { job });
  const normalizedStatus = normalizeStatus(job.status);
  const normalizedPriority = normalizePriority(job.priority) as JobImportInput["priority"];
  const normalizedJobArea = normalizeJobArea(job.job_area);
  console.log(`[normalizeOutboundJob] After normalizeJobArea: "${normalizedJobArea}"`);
  const normalizedSeniority = normalizeSeniority(job.seniority_level);
  const normalizedEducation = normalizeEducationLevel(job.minimum_education_level);
  const normalizedWorkModel = normalizeWorkModel(job.work_model);
  const description =
    toStringOrNull(job.description) ??
    inferDescription([job.responsibilities, job.requirements, job.experience_context]) ??
    "Descrição não informada na origem.";

  if (!toStringOrNull(job.description)) {
    warnings.push("description ausente; preenchida automaticamente por fallback.");
  }

  if (normalizedJobArea && !isAllowedEnum(normalizedJobArea, "job_area")) {
    warnings.push(`job_area "${normalizedJobArea}" não reconhecida; campo removido.`);
  }
  if (normalizedSeniority && !isAllowedEnum(normalizedSeniority, "seniority_level")) {
    warnings.push(`seniority_level "${normalizedSeniority}" não reconhecida; campo removido.`);
  }

  const normalizedSkills = normalizeSkills(job.skills ?? [], false).map((skill) => {
    const minimumLevel = normalizeSeniority(skill.minimum_level);
    const safeLevel =
      minimumLevel && isAllowedEnum(minimumLevel, "seniority_level")
        ? minimumLevel
        : undefined;
    if (minimumLevel && !safeLevel) {
      warnings.push(`minimum_level "${minimumLevel}" da skill "${skill.name}" foi ignorado por ser inválido.`);
      logAutoFix("skill.minimum_level", minimumLevel, undefined);
    }
    return {
      ...skill,
      minimum_level: safeLevel ?? null,
    };
  });

  const finalJobArea = sanitizeEnumForApi(normalizedJobArea, "job_area", "job_area", warnings);
  console.log(`[normalizeOutboundJob] After sanitizeEnumForApi, job_area: "${finalJobArea}"`);

  const normalizedJob: JobImportInput = {
    ...job,
    description,
    job_area: finalJobArea,
    status: sanitizeEnumForApi(normalizedStatus, "status", "status", warnings) as SmartImportOptions["default_status"] | undefined,
    seniority_level: sanitizeEnumForApi(normalizedSeniority, "seniority_level", "seniority_level", warnings),
    minimum_education_level: sanitizeEnumForApi(
      normalizedEducation,
      "minimum_education_level",
      "minimum_education_level",
      warnings,
    ),
    work_model: sanitizeEnumForApi(normalizedWorkModel, "work_model", "work_model", warnings),
    priority: (sanitizeEnumForApi(normalizedPriority, "priority", "priority", warnings) as JobImportInput["priority"] | undefined) ?? "normal",
    skills: normalizedSkills,
    deal_breakers: sanitizeDealBreakersForApi(job.deal_breakers, warnings),
  };

  console.log(`[normalizeOutboundJob] Final job_area in return: "${normalizedJob.job_area}"`);
  return { job: normalizedJob, warnings };
}

function normalizeOutboundJobs(jobs: JobImportInput[]): { jobs: JobImportInput[]; warningsByIndex: string[][] } {
  const warningsByIndex: string[][] = [];
  const normalized = jobs.map((job, index) => {
    const result = normalizeOutboundJob(job);
    warningsByIndex[index] = result.warnings;
    return result.job;
  });
  return { jobs: normalized, warningsByIndex };
}

function isValidation422(error: unknown): error is HttpError {
  return error instanceof HttpError && error.status === 422;
}

function validationDetail(error: HttpError): string {
  if (typeof error.detail === "string") return error.detail;
  if (typeof error.data === "string") return error.data;
  return JSON.stringify(error.detail ?? error.data ?? "Erro de validação");
}


// Validação PROFUNDA: garante que NENHUM enum inválido está no payload COMPLETO
function assertValidEnumsBeforeSending(job: JobImportInput): void {
  const VALID_JOB_AREAS = ["technology", "data", "financial", "fiscal", "accounting", "administrative", "commercial", "operational", "hr", "leadership"];
  const VALID_STATUSES = ["draft", "published", "paused", "closed", "cancelled"];
  const VALID_PRIORITIES = ["low", "normal", "high", "urgent"];
  const VALID_SENIORITIES = ["intern", "junior", "mid", "senior", "lead", "principal", "director"];
  const VALID_EDUCATION = ["none", "high_school", "technical", "bachelor", "postgraduate", "master", "phd"];
  const VALID_WORK_MODELS = ["remote", "hybrid", "onsite"];

  // Validação profunda de job_area - SEMPRE em inglês
  if (job.job_area) {
    if (!VALID_JOB_AREAS.includes(job.job_area)) {
      const suggestion = `Valores válidos: ${VALID_JOB_AREAS.join(", ")}`;
      throw new Error(
        `❌ ENUM INVÁLIDO ANTES DO ENVIO:\n` +
        `job_area="${job.job_area}" não é permitido.\n` +
        `${suggestion}\n` +
        `Nota: Valores em português como "Dados" devem ser normalizados para "data"`
      );
    }
  }

  if (job.status && !VALID_STATUSES.includes(job.status)) {
    throw new Error(
      `❌ ENUM INVÁLIDO ANTES DO ENVIO:\n` +
      `status="${job.status}" não é permitido.\n` +
      `Valores válidos: ${VALID_STATUSES.join(", ")}`
    );
  }

  if (job.priority && !VALID_PRIORITIES.includes(job.priority)) {
    throw new Error(
      `❌ ENUM INVÁLIDO ANTES DO ENVIO:\n` +
      `priority="${job.priority}" não é permitido.\n` +
      `Valores válidos: ${VALID_PRIORITIES.join(", ")}`
    );
  }

  if (job.seniority_level && !VALID_SENIORITIES.includes(job.seniority_level)) {
    throw new Error(
      `❌ ENUM INVÁLIDO ANTES DO ENVIO:\n` +
      `seniority_level="${job.seniority_level}" não é permitido.\n` +
      `Valores válidos: ${VALID_SENIORITIES.join(", ")}`
    );
  }

  if (job.minimum_education_level && !VALID_EDUCATION.includes(job.minimum_education_level)) {
    throw new Error(
      `❌ ENUM INVÁLIDO ANTES DO ENVIO:\n` +
      `minimum_education_level="${job.minimum_education_level}" não é permitido.\n` +
      `Valores válidos: ${VALID_EDUCATION.join(", ")}`
    );
  }

  if (job.work_model && !VALID_WORK_MODELS.includes(job.work_model)) {
    throw new Error(
      `❌ ENUM INVÁLIDO ANTES DO ENVIO:\n` +
      `work_model="${job.work_model}" não é permitido.\n` +
      `Valores válidos: ${VALID_WORK_MODELS.join(", ")}`
    );
  }
}

async function postBulkImportWithFallback(
  requestBody: ReturnType<typeof buildBulkImportBody>,
  createItems: SmartImportPreviewItem[],
): Promise<BulkImportResponse> {
  // VALIDAÇÃO PROFUNDA: garante que NENHUM enum inválido está no payload COMPLETO
  const validationErrors: string[] = [];
  for (let i = 0; i < requestBody.jobs.length; i++) {
    const job = requestBody.jobs[i];
    try {
      assertValidEnumsBeforeSending(job);
    } catch (error) {
      validationErrors.push(`Job ${i} (${job.title}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (validationErrors.length > 0) {
    const errorMessage = `❌ VALIDAÇÃO FALHOU ANTES DO ENVIO:\n${validationErrors.join("\n")}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  // Log FINAL do payload sendo enviado - COMPLETO, não resumido
  const payloadSnapshot = JSON.parse(JSON.stringify(requestBody)); // Deep clone para debug
  console.log("🚀 FINAL PAYLOAD BEING SENT TO API (BULK IMPORT):", {
    timestamp: new Date().toISOString(),
    totalJobs: requestBody.jobs.length,
    fullPayload: JSON.stringify(requestBody, null, 2),
    jobsSummary: requestBody.jobs.map((j) => ({
      title: j.title,
      job_area: j.job_area,
      status: j.status,
      priority: j.priority,
    })),
  });

  try {
    const response = await httpRequest<BulkImportResponse>("/api/v1/jobs/bulk-import", {
      method: "POST",
      body: requestBody,
    });
    console.log("✅ BULK IMPORT SUCCESS");
    return response;
  } catch (error) {
    console.error("❌ BULK IMPORT FAILED:", {
      errorMessage: error instanceof Error ? error.message : String(error),
      status: (error as any)?.status,
      sentPayload: payloadSnapshot,
    });
    throw error;
  }
}

async function patchBulkUpdateWithFallback(
  requestBody: ReturnType<typeof buildBulkUpdateBody>,
): Promise<BulkUpdateResponse> {
  // VALIDAÇÃO PROFUNDA antes de PATCH
  const validationErrors: string[] = [];
  for (let i = 0; i < requestBody.jobs.length; i++) {
    const item = requestBody.jobs[i];
    try {
      assertValidEnumsBeforeSending(item.data);
    } catch (error) {
      validationErrors.push(
        `Update ${i} (Job ID: ${item.job_id}): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (validationErrors.length > 0) {
    const errorMessage = `❌ VALIDAÇÃO FALHOU ANTES DO UPDATE:\n${validationErrors.join("\n")}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  const payloadSnapshot = JSON.parse(JSON.stringify(requestBody));
  console.log("🚀 FINAL PATCH PAYLOAD BEING SENT:", {
    timestamp: new Date().toISOString(),
    totalJobs: requestBody.jobs.length,
    fullPayload: JSON.stringify(requestBody, null, 2),
    jobsSummary: requestBody.jobs.map((j) => ({
      job_id: j.job_id,
      job_area: j.data.job_area,
      status: j.data.status,
    })),
  });

  try {
    const response = await httpRequest<BulkUpdateResponse>("/api/v1/jobs/bulk-update", {
      method: "PATCH",
      body: requestBody,
    });
    console.log("✅ BULK UPDATE SUCCESS");
    return response;
  } catch (error) {
    console.error("❌ BULK UPDATE FAILED:", {
      errorMessage: error instanceof Error ? error.message : String(error),
      status: (error as any)?.status,
      sentPayload: payloadSnapshot,
    });
    throw error;
  }
}

function normalizeOutboundImportBody(body: ReturnType<typeof buildBulkImportBody>): {
  requestBody: ReturnType<typeof buildBulkImportBody>;
  warningsByIndex: string[][];
} {
  console.log(`[normalizeOutboundImportBody] Before normalization, first job:`, {
    job_area: body.jobs[0]?.job_area,
    title: body.jobs[0]?.title,
  });
  const normalized = normalizeOutboundJobs(body.jobs);
  console.log(`[normalizeOutboundImportBody] After normalization, first job:`, {
    job_area: normalized.jobs[0]?.job_area,
    title: normalized.jobs[0]?.title,
  });
  return {
    requestBody: {
      ...body,
      jobs: normalized.jobs,
    },
    warningsByIndex: normalized.warningsByIndex,
  };
}

function normalizeOutboundUpdateBody(body: ReturnType<typeof buildBulkUpdateBody>): {
  requestBody: ReturnType<typeof buildBulkUpdateBody>;
  warningsByIndex: string[][];
} {
  const normalized = normalizeOutboundJobs(body.jobs.map((item) => item.data));
  return {
    requestBody: {
      ...body,
      jobs: body.jobs.map((item, index) => ({
        ...item,
        data: normalized.jobs[index],
      })),
    },
    warningsByIndex: normalized.warningsByIndex,
  };
}

function buildBulkImportBody(preview: SmartImportPreview, items: SmartImportPreviewItem[], dryRun: boolean) {
  const jobs = items.map((item) => {
    const canonicalJob = buildCanonicalJobForApi(preview.jobs[item.index]);
    console.log(`[buildBulkImportBody] Item ${item.index} after buildCanonicalJobForApi:`, {
      job_area: canonicalJob.job_area,
      title: canonicalJob.title,
    });
    return canonicalJob;
  });

  return {
    jobs,
    options: {
      dry_run: dryRun,
      skip_duplicates: preview.options.skip_duplicates,
      default_status: preview.options.default_status,
      fallback_unknown_skills_to_requirements: false,
    },
  };
}

function buildBulkUpdateBody(preview: SmartImportPreview, items: SmartImportPreviewItem[]) {
  return {
    jobs: items.map((item) => ({
      job_id: item.existing_job_id,
      data: buildCanonicalJobForApi(preview.jobs[item.index]),
    })),
    options: {
      fallback_unknown_skills_to_requirements: false,
    },
  };
}

function normalizeWarnings(item: SmartImportPreviewItem): string[] {
  return [...item.warnings];
}

function emptyExecutionSummary(total: number): SmartImportExecutionSummary {
  return {
    total,
    created: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    preview_only: 0,
    results: [],
  };
}

function computeExecutionCounters(results: SmartImportExecutionResult[]): Omit<SmartImportExecutionSummary, "results" | "total"> {
  return {
    created: results.filter((item) => item.action === "create" && item.status === "created").length,
    updated: results.filter((item) => item.action === "update" && item.status === "updated").length,
    failed: results.filter((item) => item.status === "failed").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    preview_only: results.filter((item) => item.status === "preview_only").length,
  };
}

async function fetchQualityMap(jobIds: string[]): Promise<Map<string, JobQualityResult>> {
  const uniqueIds = [...new Set(jobIds.filter(Boolean))];
  const entries = await Promise.all(
    uniqueIds.map(async (jobId) => {
      try {
        const quality = await getJobQuality(jobId);
        return [jobId, quality] as const;
      } catch {
        return [jobId, null] as const;
      }
    }),
  );
  return new Map(entries.filter((entry): entry is readonly [string, JobQualityResult] => Boolean(entry[1])));
}

async function executeInternal(preview: SmartImportPreview, dryRun: boolean): Promise<SmartImportExecutionSummary> {
  const invalidItems = false
    ? []
    : preview.items.filter((item) => item.missing_skills.length > 0 || item.errors.length > 0);
  const validItems = false
    ? preview.items
    : preview.items.filter((item) => item.missing_skills.length === 0 && item.errors.length === 0);
  const createItems = validItems.filter((item) => item.action === "create");
  const updateItems = validItems.filter((item) => item.action === "update");

  const resultsByIndex = new Map<number, SmartImportExecutionResult>();

  for (const item of invalidItems) {
    const errors = [
      ...item.errors,
      ...(item.missing_skills.length > 0 ? [`Skills não encontradas: ${item.missing_skills.join(", ")}`] : []),
    ];
    resultsByIndex.set(item.index, {
      title: item.title,
      action: item.action,
      status: "failed",
      job_id: item.existing_job_id,
      quality_score: null,
      quality_status: null,
      errors,
      warnings: [],
    });
  }

  if (createItems.length > 0) {
    const builtBody = buildBulkImportBody(preview, createItems, dryRun);
    console.log("[executeInternal] Built body before outbound normalization:", {
      jobCount: builtBody.jobs.length,
      firstJobArea: builtBody.jobs[0]?.job_area,
    });

    const normalized = normalizeOutboundImportBody(builtBody);
    console.log("[executeInternal] After outbound normalization:", {
      jobCount: normalized.requestBody.jobs.length,
      firstJobArea: normalized.requestBody.jobs[0]?.job_area,
    });

    // GARANTIR IMUTABILIDADE: congelar o payload antes de enviar
    const finalPayload = Object.freeze(JSON.parse(JSON.stringify(normalized.requestBody)));
    console.log("[executeInternal] FINAL IMMUTABLE PAYLOAD:", {
      jobs: finalPayload.jobs.map((j) => ({ title: j.title, job_area: j.job_area })),
    });

    const response = await postBulkImportWithFallback(finalPayload, createItems);

    response.results.forEach((result, index) => {
      const item = createItems[index];
      resultsByIndex.set(item.index, {
        title: item.title,
        action: "create",
        status: result.status,
        job_id: result.job_id ?? null,
        quality_score: result.quality_score ?? null,
        quality_status: result.quality_status ?? null,
        errors: result.errors ?? [],
        warnings: [
          ...normalizeWarnings(item),
          ...(normalized.warningsByIndex[index] ?? []),
          ...(result.warnings ?? []),
        ],
      });
    });
  }

  if (updateItems.length > 0) {
    if (dryRun) {
      for (const item of updateItems) {
        resultsByIndex.set(item.index, {
          title: item.title,
          action: "update",
          status: "preview_only",
          job_id: item.existing_job_id,
          quality_score: null,
          quality_status: null,
          errors: [],
          warnings: [
            ...normalizeWarnings(item),
            "Dry run não executa bulk-update; esta vaga seria atualizada na execução final.",
          ],
        });
      }
    } else {
      const builtUpdateBody = buildBulkUpdateBody(preview, updateItems);
      console.log("[executeInternal] Built update body:", {
        jobCount: builtUpdateBody.jobs.length,
        firstJobArea: builtUpdateBody.jobs[0]?.data?.job_area,
      });

      const normalized = normalizeOutboundUpdateBody(builtUpdateBody);
      console.log("[executeInternal] After outbound normalization (update):", {
        jobCount: normalized.requestBody.jobs.length,
        firstJobArea: normalized.requestBody.jobs[0]?.data?.job_area,
      });

      // GARANTIR IMUTABILIDADE
      const finalPayload = Object.freeze(JSON.parse(JSON.stringify(normalized.requestBody)));
      console.log("[executeInternal] FINAL IMMUTABLE UPDATE PAYLOAD:", {
        jobs: finalPayload.jobs.map((j) => ({ job_id: j.job_id, job_area: j.data.job_area })),
      });

      const response = await patchBulkUpdateWithFallback(finalPayload);

      const successfulUpdatedIds = response.results
        .filter((result) => result.status === "updated" && result.job_id)
        .map((result) => result.job_id as string);
      const qualityMap = await fetchQualityMap(successfulUpdatedIds);

      response.results.forEach((result, index) => {
        const item = updateItems[index];
        const quality = result.job_id ? qualityMap.get(result.job_id) ?? null : null;
        resultsByIndex.set(item.index, {
          title: item.title,
          action: "update",
          status: result.status,
          job_id: result.job_id ?? item.existing_job_id,
          quality_score: quality?.quality_score ?? null,
          quality_status: quality?.status ?? null,
          errors: result.errors ?? [],
          warnings: [
            ...normalizeWarnings(item),
            ...(normalized.warningsByIndex[index] ?? []),
            ...(result.warnings ?? []),
          ],
        });
      });
    }
  }

  const orderedResults = preview.items
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => resultsByIndex.get(item.index))
    .filter((item): item is SmartImportExecutionResult => Boolean(item));

  return {
    total: preview.total,
    ...computeExecutionCounters(orderedResults),
    results: orderedResults,
  };
}

async function createMissingSkills(preview: SmartImportPreview): Promise<void> {
  const missingSkillNames = preview.skills_missing;
  if (missingSkillNames.length === 0) return;

  // Create all missing skills
  await Promise.all(
    missingSkillNames.map((skillName) =>
      httpRequest("/api/v1/skills", {
        method: "POST",
        body: {
          name: skillName,
          category: null,
          aliases: [],
        },
      }).catch((err) => {
        // If skill already exists (409), that's fine
        if (err?.status === 409) return;
        throw err;
      }),
    ),
  );
}

function fixDealBreakers(obj: unknown): { fixed: boolean; corrections: string[] } {
  const corrections: string[] = [];
  const root = asObject(obj);
  if (!root) return { fixed: false, corrections };

  const jobsRaw = pickFirst(root, ["jobs", "vagas", "items", "data"]);
  if (!Array.isArray(jobsRaw)) return { fixed: false, corrections };

  let fixed = false;

  for (let i = 0; i < jobsRaw.length; i++) {
    const job = asObject(jobsRaw[i]);
    if (!job) continue;

    const dealBreakers = toArray(job.deal_breakers ?? []);
    let jobFixed = false;

    for (const breaker of dealBreakers) {
      const breakerObj = asObject(breaker);
      if (!breakerObj) continue;

      const field = normalizeText(String(breakerObj.field ?? ""));
      const operator = toStringOrNull(breakerObj.operator);
      if (!field || !operator) continue;

      const normalizedField = DEAL_BREAKER_FIELD_MAP[field] ?? field;
      const allowedOps = DEAL_BREAKER_FIELD_OPERATORS[normalizedField];

      if (allowedOps && !allowedOps.includes(operator)) {
        // Auto-fix: use the first allowed operator
        const fixedOp = allowedOps[0];
        breakerObj.operator = fixedOp;
        fixed = true;
        jobFixed = true;
      }
    }

    if (jobFixed) {
      const jobTitle = toStringOrNull(
        pickFirst(job, ["title", "titulo", "título", "cargo", "nome", "job_title", "vaga"]),
      ) ?? `Job ${i + 1}`;
      corrections.push(
        `Vaga "${jobTitle}": operadores de deal_breakers corrigidos para valores válidos`,
      );
    }
  }

  return { fixed, corrections };
}

function sanitizeJobObject(obj: unknown): JobImportInput {
  const source = asObject(obj) ?? {};

  console.log(`[sanitizeJobObject] INPUT source.job_area: "${source.job_area}"`);

  // Extract and validate all fields
  const title = toStringOrNull(
    pickFirst(source, ["title", "titulo", "título", "cargo", "nome", "job_title", "vaga"]),
  ) ?? "Vaga sem título";

  const description =
    toStringOrNull(
      pickFirst(source, ["description", "descricao", "descrição", "resumo"]),
    ) ?? "";

  const jobAreaForSanitize = pickFirst(source, ["job_area", "area", "área", "department", "departamento"]);
  const sanitizedJobArea = normalizeJobArea(jobAreaForSanitize) ?? undefined;

  console.log(`[sanitizeJobObject] Sanitized job_area: input="${jobAreaForSanitize}" -> output="${sanitizedJobArea}"`);

  // Sanitize every field with validation
  const result = {
    title,
    description,
    requirements: toStringOrNull(
      pickFirst(source, ["requirements", "requisitos", "requirement"]),
    ) ?? undefined,
    status: normalizeStatus(pickFirst(source, ["status", "situacao", "situação"])),
    seniority_level: normalizeSeniority(
      pickFirst(source, ["seniority_level", "seniority", "senioridade", "nivel_senioridade"]),
    ) ?? undefined,
    minimum_education_level: normalizeEducationLevel(
      pickFirst(source, ["minimum_education_level", "educacao_minima", "educação_mínima"]),
    ) ?? undefined,
    minimum_years_experience:
      coerceNumber(
        pickFirst(source, [
          "minimum_years_experience",
          "anos_experiencia",
          "experiencia_minima",
          "experiência_mínima",
        ]),
      ) ?? undefined,
    deal_breakers: Array.isArray(
      pickFirst(source, ["deal_breakers", "criterios_eliminatorios", "eliminatorios"]),
    )
      ? (pickFirst(source, ["deal_breakers", "criterios_eliminatorios"]) as unknown[])
      : [],
    work_model: normalizeWorkModel(
      pickFirst(source, ["work_model", "modelo_trabalho", "modelo_de_trabalho"]),
    ) ?? undefined,
    location: toStringOrNull(
      pickFirst(source, ["location", "localizacao", "localização", "local", "cidade"]),
    ) ?? undefined,
    salary_min: coerceNumber(pickFirst(source, ["salary_min", "salario_min", "salário_min"])) ?? undefined,
    salary_max: coerceNumber(pickFirst(source, ["salary_max", "salario_max", "salário_max"])) ?? undefined,
    salary_currency:
      toStringOrNull(pickFirst(source, ["salary_currency", "salaryCurrency", "moeda"]))?.toUpperCase() ?? "BRL",
    job_area: sanitizedJobArea,
    responsibilities: toStringOrNull(
      pickFirst(source, ["responsibilities", "responsabilidades", "atividades"]),
    ) ?? undefined,
    experience_context: toStringOrNull(
      pickFirst(source, ["experience_context", "contexto_experiencia", "contexto"]),
    ) ?? undefined,
    behavioral_requirements: normalizeBehavioralRequirements(
      pickFirst(source, [
        "behavioral_requirements",
        "soft_skills",
        "competencias_comportamentais",
        "requisitos_comportamentais",
      ]),
    ),
    priority: (normalizePriority(pickFirst(source, ["priority", "prioridade", "urgencia"])) as JobImportInput["priority"]) ?? "normal",
    skills: normalizeSkills(pickFirst(source, ["skills", "habilidades", "competencias"]), false),
  };

  console.log(`[sanitizeJobObject] FINAL result.job_area: "${result.job_area}"`);
  return result;
}

function createPayloadChecksum(payload: SmartImportPayload): string {
  // Gera checksum do payload para detectar mutações
  const data = JSON.stringify(payload.jobs.map(j => ({
    title: j.title,
    job_area: j.job_area,
    status: j.status,
    priority: j.priority,
  })));
  return btoa(data); // Base64 como checksum simples
}

function normalizePayload(raw: string): { normalized: boolean; corrections: string[]; json: string; checksum: string } {
  const payload = parseRawInput(raw);
  const corrections: string[] = [];

  // Collect warnings from normalization
  for (let i = 0; i < payload.normalization.length; i++) {
    const norm = payload.normalization[i];
    const jobTitle = payload.jobs[i]?.title ?? `Job ${i + 1}`;
    norm.warnings.forEach((warning) => {
      corrections.push(`Vaga "${jobTitle}": ${warning}`);
    });
  }

  const normalized = { jobs: payload.jobs, options: payload.options };
  const checksum = createPayloadChecksum(normalized);

  return {
    normalized: corrections.length > 0,
    corrections,
    json: JSON.stringify(normalized, null, 2),
    checksum,
  };
}

export const jobImportSmartService = {
  DEFAULT_JOB_IMPORT_TEMPLATE,

  parse(raw: string): SmartImportPayload {
    const payload = parseRawInput(raw);
    return { jobs: payload.jobs, options: payload.options };
  },

  fixDealBreakers(raw: string): { fixed: boolean; corrections: string[]; json: string } {
    try {
      const parsed = parseLooseJson(raw);
      const { fixed, corrections } = fixDealBreakers(parsed);
      return {
        fixed,
        corrections,
        json: JSON.stringify(parsed, null, 2),
      };
    } catch {
      return { fixed: false, corrections: ["Erro ao processar JSON"], json: raw };
    }
  },

  normalizePayload(raw: string): { normalized: boolean; corrections: string[]; json: string } {
    return normalizePayload(raw);
  },

  async detectExistingJobs(raw: string): Promise<SmartImportPreview> {
    return detectExistingJobs(raw);
  },

  async dryRun(raw: string): Promise<SmartImportExecutionSummary> {
    console.log("[dryRun] Starting with raw input");

    // Ensure JSON is corrected and normalized before dry run
    let normalizedJson = raw;

    try {
      const parsed = parseLooseJson(raw);
      const { fixed } = fixDealBreakers(parsed);
      if (fixed) {
        normalizedJson = JSON.stringify(parsed, null, 2);
        console.log("[dryRun] Deal-breakers foram corrigidos");
      }
    } catch (error) {
      console.warn("[dryRun] Falha ao corrigir deal-breakers:", error);
    }

    try {
      const normalizeResult = normalizePayload(normalizedJson);
      normalizedJson = normalizeResult.json; // Always use normalized JSON
      const originalChecksum = normalizeResult.checksum;

      console.log("[dryRun] Payload normalizado com checksum:", originalChecksum);
    } catch (error) {
      console.warn("[dryRun] Falha ao normalizar payload:", error);
    }

    const preview = await detectExistingJobs(normalizedJson);
    console.log("[dryRun] Preview detectado com jobs:", preview.jobs.length);

    if (preview.total === 0) return emptyExecutionSummary(0);

    // Create missing skills before dry run
    if (preview.skills_missing.length > 0) {
      console.log("[dryRun] Criando", preview.skills_missing.length, "skills ausentes");
      await createMissingSkills(preview);
      // Re-detect to get updated preview with skills now available
      const updatedPreview = await detectExistingJobs(normalizedJson);
      return executeInternal(updatedPreview, true);
    }

    return executeInternal(preview, true);
  },

  async execute(raw: string): Promise<SmartImportExecutionSummary> {
    console.log("[execute] Starting with raw input");

    // Ensure JSON is corrected and normalized before execution
    let normalizedJson = raw;

    try {
      const parsed = parseLooseJson(raw);
      const { fixed } = fixDealBreakers(parsed);
      if (fixed) {
        normalizedJson = JSON.stringify(parsed, null, 2);
        console.log("[execute] Deal-breakers foram corrigidos");
      }
    } catch (error) {
      console.warn("[execute] Falha ao corrigir deal-breakers:", error);
    }

    try {
      const normalizeResult = normalizePayload(normalizedJson);
      normalizedJson = normalizeResult.json; // Always use normalized JSON
      const originalChecksum = normalizeResult.checksum;

      console.log("[execute] Payload normalizado com checksum:", originalChecksum);
    } catch (error) {
      console.warn("[execute] Falha ao normalizar payload:", error);
    }

    const preview = await detectExistingJobs(normalizedJson);
    console.log("[execute] Preview detectado com jobs:", preview.jobs.length);

    if (preview.total === 0) return emptyExecutionSummary(0);

    // Create missing skills before execution
    if (preview.skills_missing.length > 0) {
      console.log("[execute] Criando", preview.skills_missing.length, "skills ausentes");
      await createMissingSkills(preview);
      // Re-detect to get updated preview with skills now available
      const updatedPreview = await detectExistingJobs(normalizedJson);
      return executeInternal(updatedPreview, false);
    }

    return executeInternal(preview, false);
  },
};
