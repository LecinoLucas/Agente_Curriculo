import type {
  AiAssistantContextAction,
  AiAssistantPageContext,
} from "../types";

type RouteParams = {
  jobId?: string;
  candidateId?: string;
  admissionCaseId?: string;
  packageId?: string;
};

function buildKnowledgeAction(
  id: string,
  label: string,
  description: string,
  query: string,
): AiAssistantContextAction {
  return {
    id,
    kind: "knowledge",
    label,
    description,
    intent: "knowledge.search",
    query,
    arguments: { query, limit: 5 },
  };
}

function buildAssistantAction(
  id: string,
  label: string,
  description: string,
  intent: string,
  args: Record<string, unknown> | null,
): AiAssistantContextAction | null {
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

function compactActions(
  actions: Array<AiAssistantContextAction | null>,
): AiAssistantContextAction[] {
  return actions.filter((action): action is AiAssistantContextAction => action !== null);
}

function extractParams(pathname: string, search: string): RouteParams {
  const params: RouteParams = {};

  const jobMatch = pathname.match(/^\/vagas\/([^/?]+)/);
  if (jobMatch && jobMatch[1] !== "nova") params.jobId = jobMatch[1];

  const pipelineMatch = pathname.match(/^\/pipeline\/([^/?]+)/);
  if (pipelineMatch?.[1]) params.jobId = pipelineMatch[1];

  const candidateMatch = pathname.match(/^\/candidatos\/([^/?]+)/);
  if (candidateMatch?.[1]) params.candidateId = candidateMatch[1];

  const admissionMatch =
    pathname.match(/^\/admission\/cases\/([^/?]+)/) ??
    pathname.match(/^\/admissao\/([^/?]+)/) ??
    pathname.match(/^\/admitidos\/([^/?]+)/);
  if (admissionMatch?.[1]) params.admissionCaseId = admissionMatch[1];

  const searchParams = new URLSearchParams(search);
  const packageId = searchParams.get("packageId") ?? searchParams.get("package_id");
  const jobId = searchParams.get("jobId") ?? searchParams.get("job_id");

  if (packageId) params.packageId = packageId;
  if (jobId && !params.jobId) params.jobId = jobId;

  return params;
}

function buildJobContext(pathname: string, params: RouteParams): AiAssistantPageContext {
  if (!params.jobId) {
    return {
      route: pathname,
      domain: "job",
      title: "Vaga",
      subtitle: "Ações recomendadas para esta tela",
      guidance: "Abra uma vaga específica para consultar resumo, requisitos e pipeline.",
      emptyTitle: "Não identifiquei a vaga atual",
      emptyDescription: "Abra uma vaga específica para usar ações contextuais.",
      availableActions: [],
    };
  }

  return {
    route: pathname,
    domain: "job",
    entityId: params.jobId,
    entityLabel: `Vaga ${params.jobId}`,
    title: "Vaga",
    subtitle: "Ações recomendadas para esta tela",
    guidance: "Consulte resumo, requisitos, pipeline e regras de qualidade relacionadas a esta vaga.",
    emptyTitle: "",
    emptyDescription: "",
    availableActions: compactActions([
      buildAssistantAction(
        "job.summary",
        "Resumo da vaga",
        "Veja status, requisitos e pendências principais.",
        "job.summary",
        { job_id: params.jobId },
      ),
      buildAssistantAction(
        "job.requirements",
        "Requisitos da vaga",
        "Entenda skills, experiência e critérios técnicos já cadastrados.",
        "job.requirements",
        { job_id: params.jobId },
      ),
      buildAssistantAction(
        "pipeline.overview",
        "Visão da pipeline",
        "Veja volumes por etapa e onde a vaga concentra mais candidatos.",
        "pipeline.overview",
        { job_id: params.jobId },
      ),
      buildKnowledgeAction(
        "knowledge.job_quality_rules",
        "Buscar regras sobre qualidade de vaga",
        "Consulte políticas e critérios internos de publicação e qualidade de vaga.",
        "regras internas de qualidade de vaga requisitos publicacao pendencias",
      ),
    ]),
  };
}

function buildCandidateContext(pathname: string, params: RouteParams): AiAssistantPageContext {
  if (!params.candidateId) {
    return {
      route: pathname,
      domain: "candidate",
      title: "Candidato",
      subtitle: "Ações recomendadas para esta tela",
      guidance: "Abra um perfil de candidato para consultar resumo e status de análise.",
      emptyTitle: "Não identifiquei o candidato atual",
      emptyDescription: "Abra um perfil de candidato para usar ações contextuais.",
      availableActions: [],
    };
  }

  return {
    route: pathname,
    domain: "candidate",
    entityId: params.candidateId,
    entityLabel: `Candidato ${params.candidateId}`,
    title: "Candidato",
    subtitle: "Ações recomendadas para esta tela",
    guidance: "Consulte resumo seguro do candidato, status de análise do currículo e regras de avaliação justa.",
    emptyTitle: "",
    emptyDescription: "",
    availableActions: compactActions([
      buildAssistantAction(
        "candidate.summary",
        "Resumo do candidato",
        "Entenda dados principais, pipeline ativo e próximos passos.",
        "candidate.summary",
        { candidate_id: params.candidateId },
      ),
      buildAssistantAction(
        "candidate.active_pipeline",
        "Status do currículo",
        "Veja se o currículo está pronto para análise e o que ainda limita a triagem.",
        "candidate.resume_analysis",
        { candidate_id: params.candidateId },
      ),
      buildKnowledgeAction(
        "knowledge.fair_evaluation_rules",
        "Buscar regras sobre avaliação justa",
        "Consulte orientações internas para avaliação segura e não discriminatória.",
        "regras de avaliacao justa triagem antidiscriminatoria candidatos",
      ),
    ]),
  };
}

function buildAdmissionContext(pathname: string, params: RouteParams): AiAssistantPageContext {
  if (!params.admissionCaseId) {
    return {
      route: pathname,
      domain: "admission",
      title: "Admissão",
      subtitle: "Ações recomendadas para esta tela",
      guidance: "Abra um caso admissional específico para consultar pendências, documentos e eventos.",
      emptyTitle: "Não identifiquei o caso admissional atual",
      emptyDescription: "Abra um caso admissional específico para usar ações contextuais.",
      availableActions: [],
    };
  }

  return {
    route: pathname,
    domain: "admission",
    entityId: params.admissionCaseId,
    entityLabel: `Caso admissional ${params.admissionCaseId}`,
    title: "Admissão",
    subtitle: "Ações recomendadas para esta tela",
    guidance: "Consulte pendências do caso, status documental, eventos recentes e regras de pré-admissão.",
    emptyTitle: "",
    emptyDescription: "",
    availableActions: compactActions([
      buildAssistantAction(
        "admission.case_summary",
        "Resumo do caso admissional",
        "Veja pendências, documentos e bloqueios principais.",
        "admission.case_summary",
        { admission_case_id: params.admissionCaseId },
      ),
      buildAssistantAction(
        "admission.documents_status",
        "Status dos documentos",
        "Confira documentos pendentes, rejeitados e pontos que travam o caso.",
        "admission.documents_status",
        { admission_case_id: params.admissionCaseId },
      ),
      buildAssistantAction(
        "admission.events_summary",
        "Eventos recentes",
        "Veja o histórico recente do caso para localizar atrasos e reprocessos.",
        "admission.events_summary",
        { admission_case_id: params.admissionCaseId },
      ),
      buildAssistantAction(
        "protheus.export_status",
        "Status Protheus",
        "Consulte o status do pacote de exportação quando houver um package_id disponível.",
        "protheus.export_status",
        params.packageId ? { package_id: params.packageId } : null,
      ),
      buildKnowledgeAction(
        "knowledge.pre_admission_rules",
        "Buscar regras de pré-admissão",
        "Consulte políticas sobre documentos, checklist e preparação para exportação.",
        "regras de pre-admissao documentos obrigatorios checklist exportacao protheus",
      ),
    ]),
  };
}

function buildAdminContext(pathname: string): AiAssistantPageContext {
  return {
    route: pathname,
    domain: "admin",
    title: "Administração",
    subtitle: "Consulte governança, saúde e documentação interna de IA",
    guidance: "Este contexto não executa ações operacionais. Use atalhos seguros e a base de conhecimento para políticas e suporte.",
    emptyTitle: "",
    emptyDescription: "",
    availableActions: [
      {
        id: "nav.admin.ia",
        kind: "navigation",
        label: "Abrir Laboratório IA",
        description: "Ver status do provider, limites e governança em Administração.",
        href: "/admin/ia",
      },
      {
        id: "nav.admin.health",
        kind: "navigation",
        label: "Abrir Saúde do sistema",
        description: "Consultar saúde técnica, filas e indicadores disponíveis para IA.",
        href: "/admin/health",
      },
      buildKnowledgeAction(
        "knowledge.assistant_policy",
        "Buscar política de uso do assistente",
        "Consulte documentação interna sobre uso seguro, limites e governança do assistente.",
        "politica de uso do assistente interno ia governanca limites",
      ),
    ],
  };
}

function buildKnowledgeContext(pathname: string): AiAssistantPageContext {
  return {
    route: pathname,
    domain: "knowledge",
    title: "Base de conhecimento",
    subtitle: "Consulte documentação interna com suporte de fontes",
    guidance: "Use Buscar fontes ou Responder para localizar políticas, processos e documentação indexada.",
    emptyTitle: "",
    emptyDescription: "",
    availableActions: [
      buildKnowledgeAction(
        "knowledge.indexing_rules",
        "Buscar regras sobre indexação e uso",
        "Consulte orientações sobre alimentação da base de conhecimento e limitações do RAG.",
        "base de conhecimento indexacao ingestao documentos limitacoes rag",
      ),
    ],
  };
}

export function deriveAiAssistantPageContext(
  pathname: string,
  search = "",
): AiAssistantPageContext {
  const params = extractParams(pathname, search);

  if (/^\/admin\/conhecimento(?:\/|$)/.test(pathname)) {
    return buildKnowledgeContext(pathname);
  }

  if (
    /^\/admin(?:\/|$)/.test(pathname)
  ) {
    return buildAdminContext(pathname);
  }

  if (
    /^\/admission\/cases(?:\/|$)/.test(pathname) ||
    /^\/admissao(?:\/|$)/.test(pathname) ||
    /^\/admitidos(?:\/|$)/.test(pathname)
  ) {
    return buildAdmissionContext(pathname, params);
  }

  if (/^\/candidatos(?:\/|$)/.test(pathname)) {
    return buildCandidateContext(pathname, params);
  }

  if (/^\/vagas(?:\/|$)/.test(pathname) || /^\/pipeline(?:\/|$)/.test(pathname)) {
    return buildJobContext(pathname, params);
  }

  return {
    route: pathname,
    domain: "generic",
    title: "Assistente IA",
    subtitle: "Ações recomendadas para esta tela",
    guidance: "Abra uma vaga, candidato ou caso admissional para ver ações contextuais. Você também pode consultar a Base de Conhecimento.",
    emptyTitle: "Nenhuma ação contextual disponível",
    emptyDescription:
      "Abra uma vaga, candidato ou caso admissional para ver ações contextuais. Você também pode consultar a Base de Conhecimento.",
    availableActions: [],
  };
}
