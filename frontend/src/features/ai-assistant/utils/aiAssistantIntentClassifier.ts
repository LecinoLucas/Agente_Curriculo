import type { AiAssistantContextAction, AiAssistantPageContext } from "../types";

const MAX_INPUT_LENGTH = 300;

const BLOCKED_WRITE_PATTERNS = [
  /\bcontrat(?:ar|e)\b/,
  /\brejeit(?:ar|e)\b/,
  /\baprova(?:r|e)\b/,
  /\breprova(?:r|e)\b/,
  /\bmover\b/,
  /\benviar\b/,
  /\bdispar(?:ar|e)\b/,
  /\bdelet(?:ar|e)\b/,
  /\bexclu(?:ir|a)\b/,
  /\balter(?:ar|e)\b/,
  /\bedit(?:ar|e)\b/,
  /\bsalv(?:ar|e)\b/,
  /\bcriar vaga\b/,
  /\bmandar e-?mail\b/,
  /\bmandar mensagem\b/,
  /\bexport(?:ar|e).*(?:agora|ja)\b/,
];

export type ClassifiedAssistantIntent =
  | {
      status: "classified";
      confidence: "high" | "medium" | "low";
      intent: string;
      label: string;
      description: string;
      reason: string;
      action: Extract<AiAssistantContextAction, { kind: "assistant" | "knowledge" }>;
      normalizedInput: string;
    }
  | {
      status: "blocked" | "invalid" | "unclassified";
      message: string;
      normalizedInput: string;
      suggestions?: string[];
    };

function normalizeInput(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasBlockedWriteIntent(input: string): boolean {
  return BLOCKED_WRITE_PATTERNS.some((pattern) => pattern.test(input));
}

function buildKnowledgeAction(query: string, label = "Consulta na Base de Conhecimento") {
  return {
    id: "text-intent-knowledge-search",
    kind: "knowledge" as const,
    label,
    description: query,
    intent: "knowledge.search" as const,
    query,
    arguments: {
      query,
      limit: 5,
    },
  };
}

function buildAssistantAction(
  id: string,
  label: string,
  description: string,
  intent: string,
  args: Record<string, unknown> | null,
): Extract<AiAssistantContextAction, { kind: "assistant" }> | null {
  if (!args) return null;

  return {
    id,
    kind: "assistant",
    label,
    description,
    intent,
    arguments: args,
  };
}

function includesAny(input: string, terms: string[]): boolean {
  return terms.some((term) => input.includes(term));
}

function classifyJobIntent(
  input: string,
  context: AiAssistantPageContext,
): ClassifiedAssistantIntent | null {
  if (!context.entityId) {
    return {
      status: "invalid",
      normalizedInput: input,
      message:
        "Abra uma vaga específica para consultar resumo, requisitos ou pipeline com segurança.",
      suggestions: [
        "Resumo da vaga",
        "Requisitos da vaga",
        "Visão da pipeline",
      ],
    };
  }

  if (includesAny(input, ["requisito", "requisitos", "skill", "skills"])) {
    return {
      status: "classified",
      confidence: "high",
      intent: "job.requirements",
      label: "Requisitos da vaga",
      description: "Consulta segura dos requisitos cadastrados para a vaga atual.",
      reason: "A pergunta menciona requisitos da vaga.",
      action: buildAssistantAction(
        "text-intent-job-requirements",
        "Requisitos da vaga",
        "Consulta segura dos requisitos cadastrados para a vaga atual.",
        "job.requirements",
        { job_id: context.entityId },
      )!,
      normalizedInput: input,
    };
  }

  if (includesAny(input, ["pipeline", "processo da vaga", "etapas da vaga", "como esta a pipeline"])) {
    return {
      status: "classified",
      confidence: "high",
      intent: "pipeline.overview",
      label: "Visão da pipeline",
      description: "Consulta segura da pipeline vinculada à vaga atual.",
      reason: "A pergunta menciona pipeline da vaga.",
      action: buildAssistantAction(
        "text-intent-job-pipeline",
        "Visão da pipeline",
        "Consulta segura da pipeline vinculada à vaga atual.",
        "pipeline.overview",
        { job_id: context.entityId },
      )!,
      normalizedInput: input,
    };
  }

  if (
    includesAny(input, [
      "resumo da vaga",
      "status da vaga",
      "essa vaga esta pronta",
      "vaga pronta",
      "resumo vaga",
    ])
  ) {
    return {
      status: "classified",
      confidence: "high",
      intent: "job.summary",
      label: "Resumo da vaga",
      description: "Consulta segura do resumo operacional da vaga atual.",
      reason: "A pergunta pede um resumo da vaga.",
      action: buildAssistantAction(
        "text-intent-job-summary",
        "Resumo da vaga",
        "Consulta segura do resumo operacional da vaga atual.",
        "job.summary",
        { job_id: context.entityId },
      )!,
      normalizedInput: input,
    };
  }

  if (includesAny(input, ["vaga bem estruturada", "antidiscrimin", "criterios nao podem"])) {
    return {
      status: "classified",
      confidence: "medium",
      intent: "knowledge.search",
      label: "Consulta na Base de Conhecimento",
      description: "Consulta segura das regras relacionadas a vagas e critérios permitidos.",
      reason: "A pergunta pede orientação normativa sobre vagas.",
      action: buildKnowledgeAction(input),
      normalizedInput: input,
    };
  }

  return null;
}

function classifyCandidateIntent(
  input: string,
  context: AiAssistantPageContext,
): ClassifiedAssistantIntent | null {
  if (!context.entityId) {
    return {
      status: "invalid",
      normalizedInput: input,
      message:
        "Abra um candidato específico para consultar resumo e posição no processo com segurança.",
      suggestions: ["Resumo do candidato", "Ver pipeline ativa"],
    };
  }

  if (includesAny(input, ["resumo do candidato", "resumo candidato", "perfil do candidato"])) {
    return {
      status: "classified",
      confidence: "high",
      intent: "candidate.summary",
      label: "Resumo do candidato",
      description: "Consulta segura do resumo do candidato atual.",
      reason: "A pergunta pede o resumo do candidato.",
      action: buildAssistantAction(
        "text-intent-candidate-summary",
        "Resumo do candidato",
        "Consulta segura do resumo do candidato atual.",
        "candidate.summary",
        { candidate_id: context.entityId },
      )!,
      normalizedInput: input,
    };
  }

  if (
    includesAny(input, [
      "pipeline ativa",
      "onde esse candidato esta",
      "onde esse candidato esta no processo",
      "qual pipeline ativa",
      "onde esta no processo",
    ])
  ) {
    return {
      status: "classified",
      confidence: "high",
      intent: "candidate.resume_analysis",
      label: "Ver pipeline ativa",
      description: "Consulta segura do status resumido do candidato no processo atual.",
      reason: "A pergunta pede a posição do candidato no processo.",
      action: buildAssistantAction(
        "text-intent-candidate-pipeline",
        "Ver pipeline ativa",
        "Consulta segura do status resumido do candidato no processo atual.",
        "candidate.resume_analysis",
        { candidate_id: context.entityId },
      )!,
      normalizedInput: input,
    };
  }

  if (includesAny(input, ["sem vies", "sem viés", "criterios devem ser evitados"])) {
    return {
      status: "classified",
      confidence: "medium",
      intent: "knowledge.search",
      label: "Consulta na Base de Conhecimento",
      description: "Consulta segura de regras sobre avaliação justa de candidatos.",
      reason: "A pergunta pede orientação normativa sobre avaliação.",
      action: buildKnowledgeAction(input),
      normalizedInput: input,
    };
  }

  return null;
}

function classifyAdmissionIntent(
  input: string,
  context: AiAssistantPageContext,
): ClassifiedAssistantIntent | null {
  if (!context.entityId) {
    return {
      status: "invalid",
      normalizedInput: input,
      message:
        "Abra um caso admissional específico para consultar pendências, documentos ou eventos com segurança.",
      suggestions: ["O que falta para exportar?", "Ver status dos documentos"],
    };
  }

  if (
    includesAny(input, [
      "documentos pendentes",
      "documentos estao pendentes",
      "status dos documentos",
      "quais documentos",
      "documentos da admissao",
    ])
  ) {
    return {
      status: "classified",
      confidence: "high",
      intent: "admission.documents_status",
      label: "Status dos documentos",
      description: "Consulta segura do status documental do caso admissional.",
      reason: "A pergunta pede status dos documentos.",
      action: buildAssistantAction(
        "text-intent-admission-documents",
        "Status dos documentos",
        "Consulta segura do status documental do caso admissional.",
        "admission.documents_status",
        { admission_case_id: context.entityId },
      )!,
      normalizedInput: input,
    };
  }

  if (includesAny(input, ["eventos da admissao", "eventos da admissão", "historico da admissao", "eventos recentes"])) {
    return {
      status: "classified",
      confidence: "high",
      intent: "admission.events_summary",
      label: "Eventos recentes",
      description: "Consulta segura do histórico recente do caso admissional.",
      reason: "A pergunta pede o histórico do caso admissional.",
      action: buildAssistantAction(
        "text-intent-admission-events",
        "Eventos recentes",
        "Consulta segura do histórico recente do caso admissional.",
        "admission.events_summary",
        { admission_case_id: context.entityId },
      )!,
      normalizedInput: input,
    };
  }

  if (
    includesAny(input, [
      "o que falta para exportar",
      "status admissional",
      "qual o status admissional",
      "pendencias da admissao",
      "pendencias da admissão",
    ])
  ) {
    return {
      status: "classified",
      confidence: "high",
      intent: "admission.case_summary",
      label: "Resumo do caso admissional",
      description: "Consulta segura do panorama do caso admissional atual.",
      reason: "A pergunta pede pendências gerais do caso admissional.",
      action: buildAssistantAction(
        "text-intent-admission-summary",
        "Resumo do caso admissional",
        "Consulta segura do panorama do caso admissional atual.",
        "admission.case_summary",
        { admission_case_id: context.entityId },
      )!,
      normalizedInput: input,
    };
  }

  if (includesAny(input, ["pre-admissao", "pre admissao", "documentos precisam estar aprovados"])) {
    return {
      status: "classified",
      confidence: "medium",
      intent: "knowledge.search",
      label: "Consulta na Base de Conhecimento",
      description: "Consulta segura das regras de pré-admissão.",
      reason: "A pergunta pede orientação normativa sobre pré-admissão.",
      action: buildKnowledgeAction(input),
      normalizedInput: input,
    };
  }

  return null;
}

function classifyProtheusIntent(
  input: string,
  context: AiAssistantPageContext,
): ClassifiedAssistantIntent | null {
  const mentionsProtheus = includesAny(input, [
    "protheus",
    "pronto para exportar",
    "status da exportacao",
    "status da exportação",
    "status protheus",
    "pacote de exportacao",
    "pacote de exportação",
  ]);

  if (!mentionsProtheus) return null;

  const packageId = context.suggestedActions
    .find((action) => action.kind !== "navigation" && action.intent === "protheus.export_status")
    ?.arguments?.package_id;

  if (!packageId) {
    return {
      status: "invalid",
      normalizedInput: input,
      message:
        "Não encontrei um package_id válido nesta tela. Abra o caso ou pacote correto para consultar o status Protheus.",
      suggestions: [
        "Status Protheus",
        "Consultar regras de Protheus",
      ],
    };
  }

  return {
    status: "classified",
    confidence: "high",
    intent: "protheus.export_status",
    label: "Status Protheus",
    description: "Consulta segura do status do pacote Protheus atual.",
    reason: "A pergunta pede o status de exportação no Protheus.",
    action: buildAssistantAction(
      "text-intent-protheus-status",
      "Status Protheus",
      "Consulta segura do status do pacote Protheus atual.",
      "protheus.export_status",
      { package_id: packageId },
    )!,
    normalizedInput: input,
  };
}

function classifyKnowledgeIntent(input: string): ClassifiedAssistantIntent | null {
  if (
    includesAny(input, [
      "quais criterios",
      "criterios nao podem",
      "quando posso exportar",
      "assistente pode executar",
      "regras de uso seguro",
      "gemini",
      "provider",
      "politica",
      "base de conhecimento",
      "quais documentos precisam estar aprovados",
      "como avaliar sem vies",
      "como avaliar sem vies",
    ])
  ) {
    return {
      status: "classified",
      confidence: "medium",
      intent: "knowledge.search",
      label: "Consulta na Base de Conhecimento",
      description: "Consulta segura na base de conhecimento com fontes indexadas.",
      reason: "A pergunta pede regra, política ou explicação baseada em conhecimento.",
      action: buildKnowledgeAction(input),
      normalizedInput: input,
    };
  }

  return null;
}

export function classifyAssistantTextInput(
  input: string,
  context: AiAssistantPageContext,
): ClassifiedAssistantIntent {
  const normalizedInput = normalizeInput(input);

  if (!normalizedInput) {
    return {
      status: "invalid",
      normalizedInput,
      message: "Digite uma pergunta curta para consultar o assistente.",
    };
  }

  if (normalizedInput.length > MAX_INPUT_LENGTH) {
    return {
      status: "invalid",
      normalizedInput,
      message: `Use no máximo ${MAX_INPUT_LENGTH} caracteres para esta consulta.`,
    };
  }

  if (hasBlockedWriteIntent(normalizedInput)) {
    return {
      status: "blocked",
      normalizedInput,
      message:
        "Por segurança, o assistente não executa ações de escrita. Posso consultar informações e indicar próximos passos para revisão humana.",
    };
  }

  const contextual =
    (context.domain === "job" ? classifyJobIntent(normalizedInput, context) : null) ??
    (context.domain === "candidate" ? classifyCandidateIntent(normalizedInput, context) : null) ??
    (context.domain === "admission" ? classifyProtheusIntent(normalizedInput, context) : null) ??
    (context.domain === "admission" ? classifyAdmissionIntent(normalizedInput, context) : null);

  if (contextual) return contextual;

  const knowledge = classifyKnowledgeIntent(normalizedInput);
  if (knowledge) return knowledge;

  return {
    status: "unclassified",
    normalizedInput,
    message:
      "Não consegui associar sua pergunta a uma consulta segura. Tente uma das sugestões desta tela ou consulte a Base de Conhecimento.",
    suggestions: context.suggestedActions.slice(0, 3).map((action) => action.label),
  };
}
