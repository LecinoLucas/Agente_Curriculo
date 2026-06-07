import type { JobAiDraftFields } from "../services/jobAiDraftService";
import { normalizeAiDraftStringList } from "../jobFormConfig";

export type SkillSuggestionPriority = "priority" | "complementary";

export type SkillSuggestion = {
  name: string;
  priority: SkillSuggestionPriority;
  category: string | null;
};

type SkillDefinition = {
  name: string;
  category: string | null;
  aliases: string[];
  patterns: RegExp[];
  equivalenceKeys: string[];
};

const SKILL_DEFINITIONS: SkillDefinition[] = [
  {
    name: "Excel",
    category: "tool",
    aliases: ["Microsoft Excel", "Planilhas em Excel", "Controle em Excel"],
    patterns: [/\bexcel\b/i, /\bmicrosoft excel\b/i],
    equivalenceKeys: ["excel", "microsoft excel"],
  },
  {
    name: "Planilhas",
    category: "tool",
    aliases: ["Planilha", "Controle em planilhas", "Planilhas eletrônicas"],
    patterns: [/\bplanilhas?\b/i],
    equivalenceKeys: ["planilha", "planilhas"],
  },
  {
    name: "Comunicação",
    category: "behavioral",
    aliases: ["Boa comunicação", "Comunicação verbal", "Comunicação interpessoal", "Comunicação interna"],
    patterns: [/\bboa comunica[çc][ãa]o\b/i, /\bcomunica[çc][ãa]o\b/i],
    equivalenceKeys: ["comunicacao", "boa comunicacao"],
  },
  {
    name: "Atendimento interno",
    category: "business_process",
    aliases: ["Suporte interno", "Atendimento administrativo interno", "Atendimento entre áreas"],
    patterns: [/\batendimento interno\b/i],
    equivalenceKeys: ["atendimento interno"],
  },
  {
    name: "Conferência de documentos",
    category: "business_process",
    aliases: ["Análise documental", "Validação documental", "Controle de documentos"],
    patterns: [/\bconfer[êe]ncia de documentos\b/i],
    equivalenceKeys: ["conferencia de documentos", "analise documental", "validacao documental"],
  },
  {
    name: "Lançamentos administrativos",
    category: "business_process",
    aliases: ["Lançamentos", "Lançamentos em sistema", "Registros administrativos"],
    patterns: [/\blan[çc]amentos?\b/i],
    equivalenceKeys: ["lancamentos", "lancamentos administrativos"],
  },
  {
    name: "Organização de arquivos",
    category: "business_process",
    aliases: ["Arquivamento", "Gestão de arquivos", "Organização documental"],
    patterns: [/\borganiza[çc][ãa]o de arquivos\b/i, /\barquivamento\b/i],
    equivalenceKeys: ["organizacao de arquivos", "arquivamento", "gestao de arquivos"],
  },
  {
    name: "Organização",
    category: "behavioral",
    aliases: [
      "Organização administrativa",
      "Organização de rotina",
      "Organização de processos",
      "Planejamento e organização",
    ],
    patterns: [/\borganiza[çc][ãa]o\b/i],
    equivalenceKeys: ["organizacao"],
  },
  {
    name: "Rotinas administrativas",
    category: "business_process",
    aliases: ["Processos administrativos", "Apoio administrativo", "Operações administrativas"],
    patterns: [/\brotinas? administrativas?\b/i, /\bapoio administrativo\b/i],
    equivalenceKeys: ["rotinas administrativas", "processos administrativos", "apoio administrativo"],
  },
  {
    name: "SQL",
    category: "technical",
    aliases: ["Structured Query Language", "Consultas SQL", "Banco de dados SQL"],
    patterns: [/\bsql\b/i],
    equivalenceKeys: ["sql"],
  },
  {
    name: "Protheus",
    category: "tool",
    aliases: ["ERP Protheus", "TOTVS Protheus", "Sistema Protheus"],
    patterns: [/\bprotheus\b/i],
    equivalenceKeys: ["protheus", "totvs protheus"],
  },
];

const EXCLUDED_SKILL_PATTERNS = [
  /\bjovem\b/i,
  /\bboa apar[êe]ncia\b/i,
  /\bmorar perto\b/i,
  /\bperto da empresa\b/i,
  /\bmorador de\b/i,
  /\b44 horas?\b/i,
  /\b6x1\b/i,
  /\b12x36\b/i,
  /\b\d+\s+vagas?\b/i,
  /\bsal[áa]rio\b/i,
  /\bbenef[íi]cios?\b/i,
];

const STRONG_OPERATIONAL_SKILLS = new Set([
  "Atendimento interno",
  "Conferência de documentos",
  "Planilhas",
]);

function normalizeSkillText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function singularizeToken(value: string): string {
  if (value.endsWith("oes")) return `${value.slice(0, -3)}ao`;
  if (value.endsWith("aes")) return `${value.slice(0, -3)}ao`;
  if (value.endsWith("is")) return `${value.slice(0, -2)}il`;
  if (value.endsWith("s") && value.length > 4) return value.slice(0, -1);
  return value;
}

function buildEquivalenceKeys(raw: string): string[] {
  const normalized = normalizeSkillText(raw);
  if (!normalized) return [];

  const keys = new Set<string>([normalized]);
  const singularized = normalized
    .split(" ")
    .map((token) => singularizeToken(token))
    .join(" ");
  keys.add(singularized);

  const definition = findDefinition(raw);
  if (definition) {
    keys.add(normalizeSkillText(definition.name));
    for (const explicitKey of definition.equivalenceKeys) {
      keys.add(normalizeSkillText(explicitKey));
    }
  }

  return Array.from(keys);
}

function isExcludedSkill(value: string): boolean {
  return EXCLUDED_SKILL_PATTERNS.some((pattern) => pattern.test(value));
}

function findDefinition(raw: string): SkillDefinition | null {
  const normalized = normalizeSkillText(raw);
  if (!normalized) return null;
  return (
    SKILL_DEFINITIONS.find(
      (definition) =>
        definition.equivalenceKeys.includes(normalized) ||
        definition.patterns.some((pattern) => pattern.test(raw)),
    ) ?? null
  );
}

function addSuggestion(
  collection: SkillSuggestion[],
  seen: Map<string, SkillSuggestion>,
  item: SkillSuggestion,
) {
  const keys = buildEquivalenceKeys(item.name);
  const existing = keys.map((key) => seen.get(key)).find(Boolean);
  if (existing) {
    if (existing.priority === "complementary" && item.priority === "priority") {
      existing.priority = "priority";
      const optionalIndex = optionalIndexOf(collection, existing);
      if (optionalIndex >= 0) {
        collection.splice(optionalIndex, 1);
      }
    }
    if (!existing.category && item.category) {
      existing.category = item.category;
    }
    return;
  }

  collection.push(item);
  for (const key of keys) {
    seen.set(key, item);
  }
}

function optionalIndexOf(collection: SkillSuggestion[], item: SkillSuggestion): number {
  return collection.findIndex((current) => current.name === item.name);
}

function classifyRequirementSuggestion(raw: string): SkillSuggestion | null {
  if (!raw || isExcludedSkill(raw)) return null;
  const definition = findDefinition(raw);
  const name = definition?.name ?? raw.trim();
  const category = definition?.category ?? null;

  const priority: SkillSuggestionPriority =
    STRONG_OPERATIONAL_SKILLS.has(name) || category === "tool" || category === "behavioral"
      ? "priority"
      : "complementary";

  return { name, category, priority };
}

function classifyOperationalSuggestion(raw: string): SkillSuggestion | null {
  if (!raw || isExcludedSkill(raw)) return null;
  const definition = findDefinition(raw);
  if (!definition) return null;
  if (definition.name === "Organização") return null;
  return {
    name: definition.name,
    category: definition.category,
    priority: definition.name === "Rotinas administrativas" ? "complementary" : "complementary",
  };
}

export function extractSkillSuggestionsFromDraft(draft: JobAiDraftFields): {
  mandatory: string[];
  optional: string[];
} {
  const mandatory: SkillSuggestion[] = [];
  const optional: SkillSuggestion[] = [];
  const seen = new Map<string, SkillSuggestion>();

  const add = (item: SkillSuggestion | null) => {
    if (!item) return;
    if (item.priority === "priority") {
      addSuggestion(mandatory, seen, item);
      return;
    }
    addSuggestion(optional, seen, item);
  };

  for (const skill of normalizeAiDraftStringList(draft.mandatory_skills)) {
    const definition = findDefinition(skill);
    add({
      name: definition?.name ?? skill,
      category: definition?.category ?? null,
      priority: "priority",
    });
  }

  for (const skill of normalizeAiDraftStringList(draft.requirements)) {
    add(classifyRequirementSuggestion(skill));
  }

  for (const skill of normalizeAiDraftStringList(draft.nice_to_have_skills)) {
    add(classifyOperationalSuggestion(skill) ?? { name: skill, category: findDefinition(skill)?.category ?? null, priority: "complementary" });
  }

  for (const item of normalizeAiDraftStringList(draft.responsibilities)) {
    add(classifyOperationalSuggestion(item));
  }

  const experienceContext = draft.experience_context?.trim() ?? "";
  if (experienceContext) {
    for (const definition of SKILL_DEFINITIONS) {
      if (definition.patterns.some((pattern) => pattern.test(experienceContext))) {
        add({
          name: definition.name,
          category: definition.category,
          priority: STRONG_OPERATIONAL_SKILLS.has(definition.name) ? "priority" : "complementary",
        });
      }
    }
  }

  const operationalHits = [
    "Atendimento interno",
    "Conferência de documentos",
    "Lançamentos administrativos",
    "Organização de arquivos",
    "Planilhas",
  ].filter((name) => Array.from(seen.values()).some((item) => item.name === name));
  if (operationalHits.length >= 2) {
    add({
      name: "Rotinas administrativas",
      category: "business_process",
      priority: "complementary",
    });
  }

  return {
    mandatory: mandatory.map((item) => item.name),
    optional: optional.map((item) => item.name),
  };
}

function prettifyAliasCategory(category: string | null): string | null {
  return category;
}

export function getSuggestedSkillCategory(skillName: string): string {
  return prettifyAliasCategory(findDefinition(skillName)?.category ?? null) ?? "";
}

export function getSuggestedSkillAliases(skillName: string): string {
  const definition = findDefinition(skillName);
  if (!definition) return "";

  const normalizedSkill = normalizeSkillText(skillName);
  const aliases = definition.aliases.filter((alias) => {
    return normalizeSkillText(alias) !== normalizedSkill;
  });

  return aliases.join(", ");
}

export function skillNamesAreEquivalent(left: string, right: string): boolean {
  const leftKeys = buildEquivalenceKeys(left);
  const rightKeys = new Set(buildEquivalenceKeys(right));
  return leftKeys.some((key) => rightKeys.has(key));
}
