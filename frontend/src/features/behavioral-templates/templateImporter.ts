import administrativoAtendimento from "../../data/behavioral-templates/administrativo-atendimento.json";
import operacionalPostos from "../../data/behavioral-templates/operacional-postos.json";
import liderancaGestao from "../../data/behavioral-templates/lideranca-gestao.json";
import tecnologiaSuporte from "../../data/behavioral-templates/tecnologia-suporte.json";
import aprendizagemAdaptabilidade from "../../data/behavioral-templates/aprendizagem-adaptabilidade.json";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RawTemplateQuestion = {
  key: string;
  type: "text" | "scale" | "multiple_choice";
  required: boolean;
  weight: number;
  prompt: string;
  evaluation_criteria?: string[];
  score_guide?: Record<string, string>;
  options?: Array<{ key: string; label: string; score: number }>;
  scale?: { min: number; max: number; labels: Record<string, string> };
};

export type RawTemplateCompetency = {
  key: string;
  name: string;
  description: string;
  weight: number;
  questions: RawTemplateQuestion[];
};

export type RawTemplate = {
  name: string;
  description: string;
  version: number;
  status: string;
  estimated_minutes?: number;
  instructions_to_candidate?: string;
  competencies: RawTemplateCompetency[];
  final_interpretation?: {
    bands: Array<{ min: number; max: number; label: string; description: string }>;
  };
  compliance_notes?: string[];
};

// ── Bundled templates ─────────────────────────────────────────────────────────

export const BUNDLED_TEMPLATES: RawTemplate[] = [
  administrativoAtendimento as RawTemplate,
  operacionalPostos as RawTemplate,
  liderancaGestao as RawTemplate,
  tecnologiaSuporte as RawTemplate,
  aprendizagemAdaptabilidade as RawTemplate,
];

// ── Validation ────────────────────────────────────────────────────────────────

export class TemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateValidationError";
  }
}

export function validateTemplate(raw: unknown): RawTemplate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TemplateValidationError("Template inválido: deve ser um objeto JSON.");
  }

  const t = raw as Record<string, unknown>;

  if (!t.name || typeof t.name !== "string" || !t.name.trim()) {
    throw new TemplateValidationError("Template inválido: campo 'name' é obrigatório.");
  }

  if (!Array.isArray(t.competencies) || t.competencies.length === 0) {
    throw new TemplateValidationError(
      "Template inválido: deve ter pelo menos 1 competência.",
    );
  }

  for (const comp of t.competencies as unknown[]) {
    if (!comp || typeof comp !== "object" || Array.isArray(comp)) {
      throw new TemplateValidationError("Competência inválida: deve ser um objeto.");
    }
    const c = comp as Record<string, unknown>;
    const compName = typeof c.name === "string" ? c.name : String(c.key ?? "?");

    if (typeof c.weight !== "number" || c.weight <= 0) {
      throw new TemplateValidationError(
        `Competência '${compName}': peso deve ser maior que zero.`,
      );
    }

    if (!Array.isArray(c.questions) || c.questions.length === 0) {
      throw new TemplateValidationError(
        `Competência '${compName}': deve ter pelo menos 1 pergunta.`,
      );
    }

    for (const q of c.questions as unknown[]) {
      if (!q || typeof q !== "object" || Array.isArray(q)) {
        throw new TemplateValidationError("Pergunta inválida: deve ser um objeto.");
      }
      const question = q as Record<string, unknown>;
      const qKey = typeof question.key === "string" ? question.key : "?";

      if (typeof question.weight !== "number" || question.weight <= 0) {
        throw new TemplateValidationError(
          `Pergunta '${qKey}' (${compName}): peso deve ser maior que zero.`,
        );
      }

      if (question.type === "multiple_choice") {
        if (!Array.isArray(question.options) || question.options.length < 2) {
          throw new TemplateValidationError(
            `Pergunta '${qKey}' (${compName}): múltipla escolha deve ter pelo menos 2 opções.`,
          );
        }
      }
    }
  }

  return raw as RawTemplate;
}

// ── Importer ──────────────────────────────────────────────────────────────────

type ImportService = {
  createTemplate: (payload: {
    name: string;
    description?: string;
  }) => Promise<{ id: string }>;
  createCompetency: (
    templateId: string,
    payload: {
      name: string;
      description?: string;
      weight: number;
      display_order: number;
    },
  ) => Promise<{ id: string }>;
  createQuestion: (
    templateId: string,
    competencyId: string,
    payload: {
      question_text: string;
      answer_type: "text" | "scale" | "multiple_choice";
      is_required: boolean;
      weight: number;
      display_order: number;
      options_json?: string[] | null;
    },
  ) => Promise<unknown>;
};

export async function importTemplateToApi(
  raw: RawTemplate,
  service: ImportService,
): Promise<{ id: string }> {
  const validated = validateTemplate(raw);

  const template = await service.createTemplate({
    name: validated.name,
    description: validated.description,
  });

  for (let i = 0; i < validated.competencies.length; i++) {
    const comp = validated.competencies[i];
    const competency = await service.createCompetency(template.id, {
      name: comp.name,
      description: comp.description,
      weight: comp.weight,
      display_order: i,
    });

    for (let j = 0; j < comp.questions.length; j++) {
      const q = comp.questions[j];
      await service.createQuestion(template.id, competency.id, {
        question_text: q.prompt,
        answer_type: q.type,
        is_required: q.required,
        weight: q.weight,
        display_order: j,
        options_json:
          q.type === "multiple_choice"
            ? (q.options?.map((o) => o.label) ?? null)
            : null,
      });
    }
  }

  return template;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function countTemplateQuestions(template: RawTemplate): number {
  return template.competencies.reduce((sum, c) => sum + c.questions.length, 0);
}
