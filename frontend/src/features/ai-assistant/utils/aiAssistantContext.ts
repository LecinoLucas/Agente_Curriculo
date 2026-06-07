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
  section: "actions" | "suggestions" = "actions",
): AiAssistantContextAction {
  return {
    id,
    kind: "knowledge",
    label,
    description,
    intent: "knowledge.search",
    query,
    arguments: { query, limit: 5 },
    section,
  };
}

function buildAssistantAction(
  id: string,
  label: string,
  description: string,
  intent: string,
  args: Record<string, unknown> | null,
  section: "actions" | "suggestions" = "actions",
): AiAssistantContextAction | null {
  if (!args) return null;
  return {
    id,
    kind: "assistant",
    label,
    description,
    intent,
    arguments: args,
    section,
  };
}

function buildNavigationAction(
  id: string,
  label: string,
  description: string,
  href: string,
  section: "actions" | "suggestions" = "actions",
): AiAssistantContextAction {
  return {
    id,
    kind: "navigation",
    label,
    description,
    href,
    section,
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
      suggestedActions: [
        buildKnowledgeAction(
          "suggestion.generic.pre_admission_rules",
          "Consultar regras de pré-admissão",
          "Veja quais documentos precisam estar aprovados antes do avanço admissional.",
          "Quais documentos precisam estar aprovados na pré-admissão?",
          "suggestions",
        ),
        buildKnowledgeAction(
          "suggestion.generic.anti_discrimination",
          "Consultar política antidiscriminatória",
          "Revise critérios que não devem ser usados em vagas e avaliações.",
          "Quais critérios não podem ser usados em uma vaga?",
          "suggestions",
        ),
      ],
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
    suggestedActions: compactActions([
      buildKnowledgeAction(
        "suggestion.job.structured_job",
        "Essa vaga está bem estruturada?",
        "Consulte critérios para uma descrição de vaga clara, objetiva e útil para triagem.",
        "Quais critérios tornam uma vaga bem estruturada e objetiva?",
        "suggestions",
      ),
      buildAssistantAction(
        "suggestion.job.requirements",
        "Ver requisitos da vaga",
        "Abra rapidamente os requisitos atuais cadastrados para esta vaga.",
        "job.requirements",
        { job_id: params.jobId },
        "suggestions",
      ),
      buildAssistantAction(
        "suggestion.job.pipeline",
        "Ver visão da pipeline",
        "Consulte o volume por etapa para esta vaga sem executar nenhuma ação operacional.",
        "pipeline.overview",
        { job_id: params.jobId },
        "suggestions",
      ),
      buildKnowledgeAction(
        "suggestion.job.anti_discrimination",
        "Quais cuidados antidiscriminatórios devo observar?",
        "Revise critérios que não devem aparecer em vagas ou filtros de triagem.",
        "Quais critérios não podem ser usados em uma vaga?",
        "suggestions",
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
      suggestedActions: [
        buildKnowledgeAction(
          "suggestion.generic.fair_evaluation",
          "Como avaliar sem viés?",
          "Consulte orientações de avaliação justa usando apenas a base de conhecimento.",
          "Quais critérios devem ser evitados na avaliação de candidatos?",
          "suggestions",
        ),
      ],
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
    suggestedActions: compactActions([
      buildAssistantAction(
        "suggestion.candidate.summary",
        "Resumo seguro do candidato",
        "Veja um resumo do perfil com foco informativo e sem ações de escrita.",
        "candidate.summary",
        { candidate_id: params.candidateId },
        "suggestions",
      ),
      buildAssistantAction(
        "suggestion.candidate.active_pipeline",
        "Ver pipeline ativa",
        "Consulte a análise resumida do currículo e o contexto ativo já disponível.",
        "candidate.resume_analysis",
        { candidate_id: params.candidateId },
        "suggestions",
      ),
      buildKnowledgeAction(
        "suggestion.candidate.bias",
        "Como avaliar sem viés?",
        "Consulte critérios que devem ser evitados na avaliação de candidatos.",
        "Quais critérios devem ser evitados na avaliação de candidatos?",
        "suggestions",
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
      suggestedActions: [
        buildKnowledgeAction(
          "suggestion.generic.protheus_rules",
          "Consultar regras de Protheus",
          "Veja quando uma admissão pode ser exportada com segurança.",
          "Quando posso exportar uma admissão para o Protheus?",
          "suggestions",
        ),
        buildKnowledgeAction(
          "suggestion.generic.pre_admission_rules",
          "Consultar regras de pré-admissão",
          "Veja quais documentos precisam estar aprovados antes do avanço admissional.",
          "Quais documentos precisam estar aprovados na pré-admissão?",
          "suggestions",
        ),
      ],
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
    suggestedActions: compactActions([
      buildAssistantAction(
        "suggestion.admission.export_readiness",
        "O que falta para exportar?",
        "Veja um resumo do caso para identificar pendências sem disparar exportação real.",
        "admission.case_summary",
        { admission_case_id: params.admissionCaseId },
        "suggestions",
      ),
      buildAssistantAction(
        "suggestion.admission.documents",
        "Ver status dos documentos",
        "Confirme pendências documentais antes de qualquer decisão operacional.",
        "admission.documents_status",
        { admission_case_id: params.admissionCaseId },
        "suggestions",
      ),
      buildKnowledgeAction(
        "suggestion.admission.pre_admission_rules",
        "Quais regras de pré-admissão se aplicam?",
        "Consulte a base de conhecimento para entender as travas e exigências do processo.",
        "Quais documentos precisam estar aprovados na pré-admissão?",
        "suggestions",
      ),
      buildAssistantAction(
        "suggestion.admission.protheus_status",
        "Status Protheus",
        "Consulte apenas o status do pacote quando houver package_id válido na rota.",
        "protheus.export_status",
        params.packageId ? { package_id: params.packageId } : null,
        "suggestions",
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
      buildNavigationAction(
        "nav.admin.knowledge",
        "Abrir Base de Conhecimento",
        "Cadastre documentos revisados e reindexe a base administrativa do Assistente.",
        "/admin/conhecimento",
      ),
      buildNavigationAction(
        "nav.admin.ia",
        "Abrir Laboratório IA",
        "Ver status do provider, limites e governança em Administração.",
        "/admin/ia",
      ),
      buildNavigationAction(
        "nav.admin.health",
        "Abrir Saúde do sistema",
        "Consultar saúde técnica, filas e indicadores disponíveis para IA.",
        "/admin/health",
      ),
      buildNavigationAction(
        "nav.admin.credentials",
        "Abrir Credenciais IA",
        "Gerenciar chaves e credenciais de provider sem expor segredos já salvos.",
        "/admin/ai-provider-credentials",
      ),
      buildNavigationAction(
        "nav.admin.bi",
        "Abrir BI & Métricas",
        "Consultar métricas agregadas e acompanhamento administrativo de uso.",
        "/admin/bi",
      ),
      buildKnowledgeAction(
        "knowledge.assistant_policy",
        "Buscar política de uso do assistente",
        "Consulte documentação interna sobre uso seguro, limites e governança do assistente.",
        "politica de uso do assistente interno ia governanca limites",
      ),
    ],
    suggestedActions: [
      buildKnowledgeAction(
        "suggestion.admin.assistant_policy",
        "Ver política de uso do assistente",
        "Consulte se o assistente pode executar ações automaticamente e quais são seus limites.",
        "O assistente pode executar ações automaticamente?",
        "suggestions",
      ),
      buildKnowledgeAction(
        "suggestion.admin.safe_ai_rules",
        "Quais cuidados de IA devo observar?",
        "Revise regras de uso seguro, governança e limites do assistente.",
        "Quais são as regras de uso seguro do assistente IA?",
        "suggestions",
      ),
      buildNavigationAction(
        "suggestion.admin.lab",
        "Abrir Laboratório IA",
        "Abra a área segura de testes e diagnósticos do assistente.",
        "/admin/ia",
        "suggestions",
      ),
      buildNavigationAction(
        "suggestion.admin.credentials",
        "Abrir Credenciais IA",
        "Abra a tela administrativa para gerenciar chaves sem expor segredos já salvos.",
        "/admin/ai-provider-credentials",
        "suggestions",
      ),
      buildNavigationAction(
        "suggestion.admin.knowledge",
        "Abrir Base de Conhecimento",
        "Abra a área segura para cadastrar documentos revisados e reindexar o RAG.",
        "/admin/conhecimento",
        "suggestions",
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
    suggestedActions: [
      buildKnowledgeAction(
        "suggestion.knowledge.pre_admission_rules",
        "Consultar regras de pré-admissão",
        "Veja quais documentos precisam estar aprovados na pré-admissão.",
        "Quais documentos precisam estar aprovados na pré-admissão?",
        "suggestions",
      ),
      buildKnowledgeAction(
        "suggestion.knowledge.protheus_rules",
        "Consultar regras de Protheus",
        "Consulte quando uma admissão pode seguir para exportação.",
        "Quando posso exportar uma admissão para o Protheus?",
        "suggestions",
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
    emptyTitle: "Não encontrei uma vaga, candidato ou admissão nesta tela.",
    emptyDescription:
      "Você ainda pode consultar a Base de Conhecimento.",
    availableActions: [],
    suggestedActions: [
      buildKnowledgeAction(
        "suggestion.generic.pre_admission_rules",
        "Consultar regras de pré-admissão",
        "Veja quais documentos precisam estar aprovados na pré-admissão.",
        "Quais documentos precisam estar aprovados na pré-admissão?",
        "suggestions",
      ),
      buildKnowledgeAction(
        "suggestion.generic.protheus_rules",
        "Consultar regras de Protheus",
        "Consulte quando uma admissão pode seguir para exportação.",
        "Quando posso exportar uma admissão para o Protheus?",
        "suggestions",
      ),
      buildKnowledgeAction(
        "suggestion.generic.anti_discrimination",
        "Consultar política antidiscriminatória",
        "Revise critérios que não podem ser usados em vagas e triagens.",
        "Quais critérios não podem ser usados em uma vaga?",
        "suggestions",
      ),
    ],
  };
}
