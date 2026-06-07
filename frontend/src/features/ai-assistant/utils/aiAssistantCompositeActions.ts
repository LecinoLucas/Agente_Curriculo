import type { AiAssistantPageContext, AiCompositeAction } from "../types";

function includesAny(input: string, terms: string[]): boolean {
  return terms.some((term) => input.includes(term));
}

function buildAdmissionComposite(context: AiAssistantPageContext): AiCompositeAction | null {
  if (!context.entityId) return null;

  const protheusStep = context.suggestedActions
    .find((action) => action.kind !== "navigation" && action.intent === "protheus.export_status")
    ?.arguments?.package_id;

  return {
    id: "composite.admission.export-readiness",
    label: "Diagnóstico de exportação admissional",
    description: "Cruza caso, documentos, eventos e regras de pré-admissão em modo read-only.",
    domain: "admission",
    steps: [
      {
        id: "admission.case_summary",
        label: "Resumo do caso",
        intent: "admission.case_summary",
        payload: { admission_case_id: context.entityId },
      },
      {
        id: "admission.documents_status",
        label: "Status dos documentos",
        intent: "admission.documents_status",
        payload: { admission_case_id: context.entityId },
      },
      {
        id: "admission.events_summary",
        label: "Eventos recentes",
        intent: "admission.events_summary",
        payload: { admission_case_id: context.entityId },
      },
      {
        id: "knowledge.export_rules",
        label: "Regras da base de conhecimento",
        intent: "knowledge.search",
        payload: {
          query:
            "Quais documentos e condições precisam estar aprovados antes da exportação admissional para o Protheus?",
          limit: 5,
        },
      },
      ...(protheusStep
        ? [
            {
              id: "protheus.export_status",
              label: "Status Protheus",
              intent: "protheus.export_status",
              payload: { package_id: String(protheusStep) },
            },
          ]
        : []),
    ],
    summaryHint: "O que falta para exportar essa admissão?",
    safeNextStep: "Revise os documentos pendentes antes de tentar exportar.",
  };
}

function buildJobComposite(context: AiAssistantPageContext): AiCompositeAction | null {
  if (!context.entityId) return null;

  return {
    id: "composite.job.readiness",
    label: "Diagnóstico de prontidão da vaga",
    description: "Cruza resumo, requisitos, pipeline e regras de qualidade da vaga.",
    domain: "job",
    steps: [
      {
        id: "job.summary",
        label: "Resumo da vaga",
        intent: "job.summary",
        payload: { job_id: context.entityId },
      },
      {
        id: "job.requirements",
        label: "Requisitos da vaga",
        intent: "job.requirements",
        payload: { job_id: context.entityId },
      },
      {
        id: "pipeline.overview",
        label: "Pipeline atual",
        intent: "pipeline.overview",
        payload: { job_id: context.entityId },
      },
      {
        id: "knowledge.job_quality",
        label: "Regras de qualidade",
        intent: "knowledge.search",
        payload: {
          query: "Quais critérios tornam uma vaga objetiva, segura e bem estruturada?",
          limit: 5,
        },
      },
    ],
    summaryHint: "Essa vaga está pronta?",
    safeNextStep:
      "Revise os requisitos obrigatórios e confirme se a descrição está objetiva antes de publicar.",
  };
}

function buildCandidateComposite(context: AiAssistantPageContext): AiCompositeAction | null {
  if (!context.entityId) return null;

  return {
    id: "composite.candidate.next-step",
    label: "Diagnóstico do próximo passo do candidato",
    description: "Cruza resumo do candidato, posição atual e cuidados de avaliação justa.",
    domain: "candidate",
    steps: [
      {
        id: "candidate.summary",
        label: "Resumo do candidato",
        intent: "candidate.summary",
        payload: { candidate_id: context.entityId },
      },
      {
        id: "candidate.active_pipeline",
        label: "Pipeline ativa",
        intent: "candidate.resume_analysis",
        payload: { candidate_id: context.entityId },
      },
      {
        id: "knowledge.fair_evaluation",
        label: "Cuidados de avaliação justa",
        intent: "knowledge.search",
        payload: {
          query: "Quais cuidados devem ser observados para avaliar candidatos sem viés?",
          limit: 5,
        },
      },
    ],
    summaryHint: "Qual próximo passo com esse candidato?",
    safeNextStep: "Revise as evidências objetivas antes de tomar decisão.",
  };
}

function buildAdminComposite(): AiCompositeAction {
  return {
    id: "composite.admin.ai-status",
    label: "Panorama seguro de IA",
    description: "Resume regras de uso seguro e destaca atalhos administrativos disponíveis.",
    domain: "admin",
    steps: [
      {
        id: "knowledge.ai_safety",
        label: "Regras de uso seguro",
        intent: "knowledge.search",
        payload: {
          query: "Quais são as regras de uso seguro do assistente IA?",
          limit: 5,
        },
      },
    ],
    summaryHint: "A IA está funcionando?",
    safeNextStep: "Use o Laboratório IA e o Health do Sistema para validar disponibilidade operacional.",
  };
}

export function detectCompositeAction(
  input: string,
  context: AiAssistantPageContext,
): AiCompositeAction | null {
  if (
    context.domain === "admission" &&
    includesAny(input, [
      "o que falta para exportar",
      "pendencias impedem o protheus",
      "pendencias impedem protheus",
      "por que nao posso exportar",
    ])
  ) {
    return buildAdmissionComposite(context);
  }

  if (
    context.domain === "job" &&
    includesAny(input, [
      "essa vaga esta pronta",
      "essa vaga esta bem estruturada",
      "vaga esta pronta",
    ])
  ) {
    return buildJobComposite(context);
  }

  if (
    context.domain === "candidate" &&
    includesAny(input, [
      "qual proximo passo com esse candidato",
      "qual o proximo passo com esse candidato",
      "proximo passo com candidato",
    ])
  ) {
    return buildCandidateComposite(context);
  }

  if (
    context.domain === "admin" &&
    includesAny(input, ["a ia esta funcionando", "ia esta funcionando", "gemini esta funcionando"])
  ) {
    return buildAdminComposite();
  }

  return null;
}
