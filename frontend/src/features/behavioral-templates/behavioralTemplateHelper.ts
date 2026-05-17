export type TemplateDescriptionMetadata = {
  description: string;
  category?: string;
  target_audience?: string;
  duration?: number; // estimated minutes
  flow_type?: string;
  required_components?: {
    competencies: boolean;
    questions: boolean;
    scales: boolean;
    feedback: boolean;
  };
};

export type QuestionTextMetadata = {
  text: string;
  instruction?: string;
  evidence?: string;
  criteria?: string;
  alert?: string;
  notes?: string;
  scale_labels?: Record<number, string>;
  recommended_option?: string;
  custom_type?: "text" | "multiple_choice" | "scale_1_5" | "boolean" | "scenario";
};

export function parseTemplateDescription(rawDesc: string | null | undefined): TemplateDescriptionMetadata {
  if (!rawDesc) {
    return { description: "" };
  }
  const trimmed = rawDesc.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        description: parsed.description ?? "",
        category: parsed.category ?? "Geral",
        target_audience: parsed.target_audience ?? "",
        duration: parsed.duration ?? 15,
        flow_type: parsed.flow_type ?? "standard",
        required_components: parsed.required_components ?? {
          competencies: true,
          questions: true,
          scales: true,
          feedback: true,
        },
      };
    } catch {
      // ignore and fallback
    }
  }
  return {
    description: rawDesc,
    category: "Geral",
    target_audience: "Geral",
    duration: 15,
    flow_type: "standard",
    required_components: {
      competencies: true,
      questions: true,
      scales: true,
      feedback: true,
    },
  };
}

export function serializeTemplateDescription(metadata: TemplateDescriptionMetadata): string {
  return JSON.stringify(metadata);
}

export function parseQuestionText(rawText: string | null | undefined): QuestionTextMetadata {
  if (!rawText) {
    return { text: "" };
  }
  const trimmed = rawText.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        text: parsed.text ?? "",
        instruction: parsed.instruction ?? "",
        evidence: parsed.evidence ?? "",
        criteria: parsed.criteria ?? "",
        alert: parsed.alert ?? "",
        notes: parsed.notes ?? "",
        scale_labels: parsed.scale_labels ?? {
          1: "Muito baixo",
          3: "Médio",
          5: "Alto",
        },
        recommended_option: parsed.recommended_option ?? "",
        custom_type: parsed.custom_type ?? "text",
      };
    } catch {
      // ignore and fallback
    }
  }
  return {
    text: rawText,
    instruction: "",
    evidence: "",
    criteria: "",
    alert: "",
    notes: "",
    scale_labels: {
      1: "Muito baixo",
      3: "Médio",
      5: "Alto",
    },
    recommended_option: "",
    custom_type: "text",
  };
}

export function serializeQuestionText(metadata: QuestionTextMetadata): string {
  return JSON.stringify(metadata);
}

export const CATEGORY_COLORS: Record<string, string> = {
  "Avaliação Comportamental — Administrativo e Atendimento": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "Avaliação Comportamental — Operacional e Postos":         "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "Avaliação Comportamental — Liderança e Gestão":           "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "Avaliação Comportamental — Tecnologia e Suporte":         "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  "Avaliação Comportamental — Aprendizagem e Adaptabilidade":"bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

export function categoryTag(name: string): string {
  if (name.includes("Administrativo")) return "Administrativo";
  if (name.includes("Operacional")) return "Operacional";
  if (name.includes("Liderança")) return "Liderança";
  if (name.includes("Tecnologia")) return "Tecnologia";
  if (name.includes("Aprendizagem")) return "Aprendizagem";
  return "Geral";
}
