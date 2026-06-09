import type { AiAssistantResponse, AiAssistantHistoryKind } from "../types";
import { sanitizeText } from "./aiAssistantSanitizer";

type PresentedListItem = {
  title: string;
  description?: string;
  emphasis?: string;
};

type PresentedMetric = {
  label: string;
  value: string;
};

export type PresentedResult = {
  title: string;
  summary?: string[];
  evidence?: PresentedListItem[];
  pending?: string[];
  nextStep?: string;
  limitations?: string[];
  metrics?: PresentedMetric[];
  warningCodes: string[];
  source?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: "Você não tem permissão para usar esta consulta.",
  INVALID_INPUT: "Os dados enviados para esta consulta estão incompletos ou inválidos.",
  NOT_FOUND: "Não encontrei o recurso solicitado.",
  INTERNAL_ERROR: "Não foi possível concluir a consulta agora. Tente novamente em instantes.",
  INTENT_NOT_FOUND: "Esse tipo de consulta não está disponível neste assistente.",
  UNKNOWN_INTENT: "Esse tipo de consulta não está disponível neste assistente.",
  PROVIDER_UNAVAILABLE:
    "O provedor de IA está temporariamente indisponível. Tente novamente em alguns instantes.",
  PROVIDER_RATE_LIMITED:
    "O limite de uso do provedor foi atingido temporariamente. Aguarde um pouco antes de tentar novamente.",
  PROVIDER_TIMEOUT:
    "O provedor de IA demorou além do esperado para responder. Tente novamente em instantes.",
  PROVIDER_BAD_REQUEST:
    "O provedor de IA recusou esta solicitação. Revise a consulta e tente novamente.",
};

const WARNING_MESSAGES: Array<[RegExp, string]> = [
  [
    /^embedding_provider_error/i,
    "Não foi possível consultar os embeddings agora. Verifique a configuração do Gemini ou tente novamente em instantes.",
  ],
  [
    /^vector_store_error/i,
    "A busca vetorial está indisponível no momento. Tente novamente em instantes ou revise a configuração da base de conhecimento.",
  ],
  [
    /^PROVIDER_UNAVAILABLE$/i,
    "O provedor de IA está temporariamente indisponível. Tente novamente em alguns instantes.",
  ],
  [
    /^PROVIDER_RATE_LIMITED$/i,
    "O limite de uso do provedor foi atingido temporariamente. Aguarde um pouco antes de tentar novamente.",
  ],
  [
    /^PROVIDER_TIMEOUT$/i,
    "O provedor de IA demorou além do esperado para responder. Tente novamente em instantes.",
  ],
  [
    /^rag_synthesis_disabled_by_flag$/i,
    "A resposta sintetizada está desligada neste ambiente. Você ainda pode usar Buscar fontes para consultar a base.",
  ],
  [
    /^no_chunks_available$/i,
    "Não encontrei fontes suficientes na base de conhecimento para responder com segurança.",
  ],
  [
    /^no_chunks_found$/i,
    "Nenhuma fonte encontrada para essa pergunta. Tente termos mais específicos ou adicione documentos à base de conhecimento.",
  ],
  [
    /^empty_query$/i,
    "A consulta foi enviada sem conteúdo. Escreva uma pergunta para buscar na base.",
  ],
  [/^low_score$/i, "As fontes encontradas têm baixa relevância. Vale refinar a pergunta."],
  [/^fallback_mode$/i, "A base está operando em modo fallback. Os resultados podem ficar menos precisos."],
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const primitives = value.filter((item) => typeof item !== "object" || item === null);
    if (primitives.length === value.length) return primitives.length > 0 ? primitives.map(String).join(", ") : "Não informado";
  }
  return sanitizeText(JSON.stringify(value));
}

const ENUM_MAPS: Record<string, Record<string, string>> = {
  status: {
    draft: "Rascunho",
    published: "Publicada",
    paused: "Pausada",
    closed: "Encerrada",
    cancelled: "Cancelada",
  },
  seniority: {
    junior: "Júnior",
    mid: "Pleno",
    pleno: "Pleno",
    senior: "Sênior",
    lead: "Liderança",
    specialist: "Especialista",
  },
  work_model: {
    onsite: "Presencial",
    presencial: "Presencial",
    hybrid: "Híbrido",
    remote: "Remoto",
    remoto: "Remoto",
  },
  priority: {
    low: "Baixa",
    normal: "Normal",
    high: "Alta",
    urgent: "Urgente",
  },
  area: {
    data: "Dados",
    administrative: "Administrativa",
    administrativa: "Administrativa",
    finance: "Financeiro",
    financial: "Financeiro",
    it: "Tecnologia",
    hr: "RH",
    commercial: "Comercial",
    sales: "Comercial",
  },
};

function translateEnum(category: string, value: unknown): string {
  const str = readString(value)?.toLowerCase();
  if (!str) return "Não informado";
  const map = ENUM_MAPS[category];
  if (map && map[str]) return map[str];
  
  // Fallback: capitalize
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatRelevance(value: unknown): string | undefined {
  const score = readNumber(value);
  if (score === null) return undefined;
  return `${(score * 100).toFixed(0)}%`;
}

export function friendlyError(errorCode: string | null, message: string | null): string {
  const code = errorCode?.trim() ?? null;
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];

  const cleanMessage = sanitizeText(message ?? "");
  if (/PROVIDER_UNAVAILABLE/i.test(cleanMessage)) return ERROR_MESSAGES.PROVIDER_UNAVAILABLE;
  if (/PROVIDER_RATE_LIMITED/i.test(cleanMessage)) return ERROR_MESSAGES.PROVIDER_RATE_LIMITED;
  if (/PROVIDER_TIMEOUT/i.test(cleanMessage)) return ERROR_MESSAGES.PROVIDER_TIMEOUT;
  if (/embedding_provider_error/i.test(cleanMessage)) {
    return "Não foi possível consultar os embeddings agora. Verifique a configuração do Gemini ou tente novamente em instantes.";
  }
  if (/RuntimeError/i.test(cleanMessage) || /Traceback/i.test(cleanMessage)) {
    return "Não foi possível concluir a consulta agora. Tente novamente em instantes.";
  }

  return cleanMessage || "Erro desconhecido.";
}

export function friendlyWarning(code: string): string {
  for (const [pattern, message] of WARNING_MESSAGES) {
    if (pattern.test(code)) return message;
  }
  return sanitizeText(code);
}

function buildKnowledgeSearchPresenter(response: AiAssistantResponse): PresentedResult {
  const record = asRecord(response.data);
  const chunks = record ? asArray(record.chunks) : asArray(response.data);

  if (chunks.length === 0) {
    return {
      title: "Resumo",
      summary: ["Nenhuma fonte encontrada para essa pergunta."],
      limitations: [
        "Tente consultar com termos mais específicos ou adicione documentos à base de conhecimento.",
      ],
      nextStep: "Refine a busca ou use termos mais próximos do documento que você espera encontrar.",
      warningCodes: response.warnings,
    };
  }

  const evidence = chunks
    .map((chunk) => {
      const item = asRecord(chunk);
      if (!item) return null;
      return {
        title: readString(item.source_title) ?? "Documento sem título",
        description:
          readString(item.excerpt) ??
          readString(item.content) ??
          "Sem trecho relevante disponível.",
        emphasis: formatRelevance(item.score),
      } satisfies PresentedListItem;
    })
    .filter((item): item is PresentedListItem => item !== null);

  return {
    title: "Resumo",
    summary: [
      evidence.length === 1
        ? "Encontrei 1 fonte relacionada a essa pergunta."
        : `Encontrei ${evidence.length} fontes relacionadas a essa pergunta.`,
    ],
    evidence,
    nextStep: "Use essas fontes para validar a regra antes de tomar uma ação operacional.",
    limitations: response.warnings.length > 0 ? ["Os avisos abaixo podem reduzir a precisão da busca."] : undefined,
    warningCodes: response.warnings,
  };
}

function buildKnowledgeAnswerPresenter(response: AiAssistantResponse): PresentedResult {
  const record = asRecord(response.data);
  const answer = response.ok
    ? readString(record?.answer) ?? response.message ?? "Sem resposta sintetizada."
    : friendlyError(response.error_code, response.message);
  const sources = asArray(record?.sources);
  const sourceEvidence = sources
    .map((source) => {
      const item = asRecord(source);
      if (!item) return null;
      return {
        title: readString(item.source_title) ?? "Documento sem título",
        description: readString(item.excerpt) ?? undefined,
        emphasis: formatRelevance(item.score),
      } satisfies PresentedListItem;
    })
    .filter((item): item is PresentedListItem => item !== null);

  const limitations: string[] = [];
  if (/Síntese de conhecimento desativada globalmente/i.test(answer)) {
    limitations.push(
      "A síntese automática está desligada neste ambiente. As fontes continuam disponíveis em Buscar fontes.",
    );
  }
  if (response.warnings.some((warning) => /no_chunks_available/i.test(warning))) {
    limitations.push("Não encontrei evidências suficientes na base de conhecimento para responder com segurança.");
  }
  if (!response.ok) {
    limitations.push(
      "As fontes recuperadas, se existirem, continuam disponíveis em Buscar fontes.",
    );
  }

  return {
    title: "Resposta",
    summary: [sanitizeText(answer)],
    evidence: sourceEvidence.length > 0 ? sourceEvidence : undefined,
    nextStep:
      sourceEvidence.length > 0
        ? "Use Buscar fontes para revisar os trechos que sustentam esta resposta."
        : "Use Buscar fontes para verificar se a base possui documentos mais específicos sobre o tema.",
    limitations: limitations.length > 0 ? limitations : undefined,
    warningCodes: response.warnings,
  };
}

function buildMetrics(record: Record<string, unknown>, keys: Array<[string, string]>): PresentedMetric[] {
  return keys
    .map(([key, label]) => {
      const value = record[key];
      if (value === undefined || value === null) return null;
      return { label, value: formatValue(value) };
    })
    .filter((item): item is PresentedMetric => item !== null);
}

function buildJobSearchPresenter(response: AiAssistantResponse): PresentedResult {
  const record = asRecord(response.data) ?? {};
  const jobs = asArray(record.jobs);
  
  if (jobs.length === 0) {
    return {
      title: "Busca de Vagas",
      summary: ["Nenhuma vaga encontrada para os critérios informados."],
      nextStep: "Tente buscar com termos mais genéricos ou verifique se o status da vaga é o esperado.",
      warningCodes: response.warnings,
    };
  }

  const evidence = jobs.slice(0, 5).map((job) => {
    const item = asRecord(job);
    if (!item) return null;
    const title = readString(item.title) ?? "Vaga sem título";
    const status = translateEnum("status", item.status);
    const area = translateEnum("area", item.area || item.job_area);
    const seniority = translateEnum("seniority", item.seniority || item.seniority_level);
    
    return {
      title,
      description: `Status: ${status} | Área: ${area} | Nível: ${seniority}`,
    } satisfies PresentedListItem;
  }).filter((item): item is PresentedListItem => item !== null);

  return {
    title: "Vagas encontradas",
    summary: [`Encontrei ${record.total ?? jobs.length} vaga(s) correspondente(s).`],
    evidence,
    metrics: [
      { label: "Total na base", value: formatValue(record.total) },
      { label: "Resultados exibidos", value: formatValue(jobs.length) },
    ],
    nextStep: "Clique em uma das vagas para ver o resumo completo ou use o ID para consultas específicas.",
    warningCodes: response.warnings,
    source: "Fonte: dados atuais da vaga",
  };
}

function buildJobPresenter(response: AiAssistantResponse): PresentedResult {
  const record = asRecord(response.data) ?? {};
  
  const title = readString(record.title) ?? "Vaga sem título";
  const status = translateEnum("status", record.status);
  const area = translateEnum("area", record.area || record.job_area);
  
  const summary: string[] = [];
  if (response.intent === "job.requirements") {
    summary.push(`Requisitos da Vaga: ${title}`);
  } else {
    summary.push(`Vaga: ${title}`);
    if (record.status) summary.push(`Status atual: ${status}`);
    if (record.area || record.job_area) summary.push(`Área responsável: ${area}`);
    if (record.vacancies_count !== undefined && record.vacancies_count !== null) {
      summary.push(`Quantidade de vagas: ${record.vacancies_count}`);
    }
  }

  const evidence: PresentedListItem[] = [];
  const mandatorySkills = asArray(record.mandatory_skills);
  if (mandatorySkills.length > 0) {
    evidence.push({
      title: "Skills essenciais",
      description: mandatorySkills.map(String).join(", "),
    });
  }
  const niceToHaveSkills = asArray(record.nice_to_have_skills);
  if (niceToHaveSkills.length > 0) {
    evidence.push({
      title: "Skills diferenciais",
      description: niceToHaveSkills.map(String).join(", "),
    });
  }

  const behavioral = asArray(record.behavioral_requirements);
  if (behavioral.length > 0) {
    evidence.push({
      title: "Requisitos comportamentais",
      description: behavioral.map(String).join(", "),
    });
  }

  const requirements = readString(record.requirements);
  if (requirements) {
    evidence.push({
      title: "Descrição dos requisitos",
      description: requirements,
    });
  }

  const pending: string[] = [];
  if (mandatorySkills.length === 0) {
    pending.push("Skills essenciais não informadas. Impacto: o ranking IA e o matching ficam menos confiáveis. Ação sugerida: cadastre as skills essenciais da vaga para melhorar a triagem.");
  }
  if (!readString(record.requirements) && !record.minimum_education_level) {
    pending.push("Requisitos detalhados incompletos. Ação sugerida: complete os requisitos mínimos para melhorar a triagem.");
  }
  if (record.work_model && !readString(record.location) && readString(record.work_model) !== "remote") {
    pending.push("Localidade não informada para vaga presencial/híbrida.");
  }

  const metrics: PresentedMetric[] = [
    { label: "Senioridade", value: translateEnum("seniority", record.seniority || record.seniority_level) },
    { label: "Localidade", value: formatValue(record.location) },
    { label: "Modelo de trabalho", value: translateEnum("work_model", record.work_model) },
    { label: "Prioridade", value: translateEnum("priority", record.priority) },
    { label: "Jornada", value: formatValue(record.working_hours) },
    { label: "Score de qualidade", value: formatValue(record.quality_score) },
  ];

  if (record.minimum_years_experience !== undefined && record.minimum_years_experience !== null) {
    metrics.push({ label: "Exp. mínima", value: `${record.minimum_years_experience} ano(s)` });
  }

  return {
    title: response.intent === "job.requirements" ? "Requisitos Detalhados" : "Resumo da Vaga",
    summary,
    evidence: evidence.length > 0 ? evidence : undefined,
    pending: pending.length > 0 ? pending : undefined,
    metrics: metrics.length > 0 ? metrics : undefined,
    nextStep:
      pending.length > 0
        ? "Revise as pendências acima para garantir que a IA tenha dados suficientes para triagem e ranking."
        : "Dados consistentes. Use esta visão para validar o alinhamento com os critérios de triagem.",
    warningCodes: response.warnings,
    source: "Fonte: dados atuais da vaga",
  };
}

function buildCandidatePresenter(response: AiAssistantResponse): PresentedResult {
  const record = asRecord(response.data) ?? {};
  const summary = [
    readString(record.full_name) ? `Candidato: ${record.full_name}` : null,
    readString(record.active_job_title)
      ? `Vaga ativa: ${record.active_job_title}`
      : null,
    readString(record.active_job_stage)
      ? `Etapa atual: ${record.active_job_stage}`
      : null,
    readString(record.analysis_status)
      ? `Status da análise do currículo: ${record.analysis_status}`
      : null,
  ].filter((item): item is string => item !== null);

  const evidence: PresentedListItem[] = [];
  const tags = asArray(record.tags);
  if (tags.length > 0) {
    evidence.push({
      title: "Tags do perfil",
      description: tags.map(String).join(", "),
    });
  }
  if (readString(record.data_quality_status)) {
    evidence.push({
      title: "Qualidade dos dados",
      description: formatValue(record.data_quality_status),
    });
  }
  if (readString(record.analysis_reason)) {
    evidence.push({
      title: "Observação da análise",
      description: formatValue(record.analysis_reason),
    });
  }

  const pending: string[] = [];
  if (record.has_resume === false) pending.push("O candidato ainda está sem currículo anexado.");
  if (record.resume_parseable === false) pending.push("O currículo não está pronto para análise automática completa.");

  return {
    title: "Resumo",
    summary,
    evidence: evidence.length > 0 ? evidence : undefined,
    pending: pending.length > 0 ? pending : undefined,
    metrics: buildMetrics(record, [
      ["resume_count", "Currículos"],
      ["ai_status", "Status IA"],
      ["active_job_fit_score", "Score de aderência"],
      ["location", "Localidade"],
    ]),
    nextStep:
      pending.length > 0
        ? "Revise o currículo e os dados pendentes antes de avançar para análises mais comparativas."
        : "Abra a vaga ou o pipeline relacionado para revisar o próximo passo com mais contexto.",
    warningCodes: response.warnings,
  };
}

function buildPipelinePresenter(response: AiAssistantResponse): PresentedResult {
  const record = asRecord(response.data) ?? {};
  const stageSummary = asArray(record.stage_summary);
  const evidence = stageSummary
    .map((stage) => {
      const item = asRecord(stage);
      if (!item) return null;
      return {
        title: readString(item.label) ?? readString(item.stage) ?? "Etapa",
        description: `${formatValue(item.count)} candidato(s)`,
      } satisfies PresentedListItem;
    })
    .filter((item): item is PresentedListItem => item !== null);

  const bottleneck = readString(record.bottleneck_stage);
  return {
    title: "Resumo",
    summary: [
      readString(record.job_title) ? `Vaga: ${record.job_title}` : null,
      bottleneck ? `Gargalo principal: ${bottleneck}` : null,
      readNumber(record.total_candidates) !== null
        ? `Total de candidatos na pipeline: ${record.total_candidates}`
        : null,
    ].filter((item): item is string => item !== null),
    evidence: evidence.length > 0 ? evidence : undefined,
    metrics: buildMetrics(record, [
      ["total_candidates", "Total de candidatos"],
      ["returned", "Resultados exibidos"],
    ]),
    nextStep: bottleneck
      ? "Revise a etapa com maior concentração de candidatos e priorize quem precisa de ação primeiro."
      : "Use esta visão para localizar a etapa que merece acompanhamento mais próximo.",
    limitations: record.truncated ? ["A lista foi truncada para manter a resposta legível."] : undefined,
    warningCodes: response.warnings,
  };
}

function buildAdmissionPresenter(response: AiAssistantResponse): PresentedResult {
  const record = asRecord(response.data) ?? {};
  const mainBlocker = asRecord(record.main_blocker);
  const nextAction = asRecord(record.next_action);
  const documents = asArray(record.documents);

  const evidence: PresentedListItem[] = [];
  if (mainBlocker) {
    evidence.push({
      title: readString(mainBlocker.title) ?? "Bloqueio principal",
      description: readString(mainBlocker.description) ?? undefined,
      emphasis: readString(mainBlocker.severity) ?? undefined,
    });
  }
  if (documents.length > 0) {
    documents.slice(0, 4).forEach((document) => {
      const item = asRecord(document);
      if (!item) return;
      evidence.push({
        title: readString(item.checklist_title) ?? readString(item.filename) ?? "Documento",
        description: `Status: ${formatValue(item.status)}`,
      });
    });
  }

  const pending: string[] = [];
  const progress = asRecord(record.progress);
  if (progress) {
    const pendingCount = readNumber(progress.pending);
    if (pendingCount && pendingCount > 0) {
      pending.push(`${pendingCount} item(ns) ainda estão pendentes no checklist.`);
    }
    const rejectedCount = readNumber(progress.rejected);
    if (rejectedCount && rejectedCount > 0) {
      pending.push(`${rejectedCount} item(ns) precisam de correção antes de seguir.`);
    }
  }
  if (record.ready_for_export === false) {
    pending.push("O caso ainda não está pronto para exportação.");
  }

  return {
    title: "Resumo",
    summary: [
      readString(record.candidate_name) ? `Candidato: ${record.candidate_name}` : null,
      readString(record.job_title) ? `Vaga: ${record.job_title}` : null,
      readString(record.status_label) ? `Status: ${record.status_label}` : null,
      record.ready_for_export === true
        ? "O caso está marcado como pronto para exportação."
        : null,
    ].filter((item): item is string => item !== null),
    evidence: evidence.length > 0 ? evidence : undefined,
    pending: pending.length > 0 ? pending : undefined,
    metrics: buildMetrics(record, [
      ["readiness_status", "Readiness"],
      ["responsible_name", "Responsável"],
      ["total_documents", "Documentos exibidos"],
    ]),
    nextStep: readString(nextAction?.label)
      ? `${nextAction?.label}. Revise os itens bloqueantes antes de tentar seguir para o Protheus.`
      : "Revise os documentos pendentes antes de tentar exportar.",
    warningCodes: response.warnings,
  };
}

function buildProtheusPresenter(response: AiAssistantResponse): PresentedResult {
  const record = asRecord(response.data) ?? {};
  const validationErrors = asArray(record.validation_errors);
  const evidence = validationErrors
    .slice(0, 5)
    .map((error, index) => ({
      title: `Erro ${index + 1}`,
      description: formatValue(error),
    }));

  const pending: string[] = [];
  if (record.has_validation_errors === true) {
    pending.push("O pacote ainda possui erros de validação.");
  }

  return {
    title: "Resumo",
    summary: [
      readString(record.status) ? `Status do pacote: ${record.status}` : null,
      validationErrors.length > 0
        ? `${validationErrors.length} erro(s) de validação identificado(s).`
        : "Nenhum erro de validação informado.",
    ].filter((item): item is string => item !== null),
    evidence: evidence.length > 0 ? evidence : undefined,
    pending: pending.length > 0 ? pending : undefined,
    nextStep:
      validationErrors.length > 0
        ? "Corrija os erros de validação antes de tentar qualquer envio ao ERP."
        : "Use este status para confirmar se o pacote está pronto para revisão operacional.",
    warningCodes: response.warnings,
  };
}

function buildGenericPresenter(response: AiAssistantResponse): PresentedResult {
  const record = asRecord(response.data);
  const metrics = record
    ? Object.entries(record)
        .slice(0, 8)
        .map(([label, value]) => ({ label: label.replace(/_/g, " "), value: formatValue(value) }))
    : undefined;

  return {
    title: "Resumo",
    summary: [response.message ?? "Resultado disponível."],
    metrics,
    warningCodes: response.warnings,
  };
}

export function presentResult(response: AiAssistantResponse): PresentedResult {
  if (response.intent === "knowledge.search") return buildKnowledgeSearchPresenter(response);
  if (response.intent === "knowledge.answer") return buildKnowledgeAnswerPresenter(response);
  if (response.intent === "job.search") return buildJobSearchPresenter(response);
  if (response.intent.startsWith("job.")) return buildJobPresenter(response);
  if (response.intent.startsWith("candidate.")) return buildCandidatePresenter(response);
  if (response.intent.startsWith("pipeline.")) return buildPipelinePresenter(response);
  if (response.intent.startsWith("admission.")) return buildAdmissionPresenter(response);
  if (response.intent.startsWith("protheus.")) return buildProtheusPresenter(response);
  return buildGenericPresenter(response);
}

export function classifyIntent(intent: string): AiAssistantHistoryKind {
  if (intent.startsWith("job.") || intent.startsWith("pipeline.")) return "vaga";
  if (intent.startsWith("candidate.")) return "candidato";
  if (intent.startsWith("admission.")) return "admissao";
  if (intent.startsWith("knowledge.")) return "conhecimento";
  return "geral";
}

function truncateText(value: string, maxLength = 96): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function summarizeResponse(response: AiAssistantResponse | null, errorMessage: string | null): {
  status: "success" | "error";
  summary: string;
} {
  if (errorMessage) return { status: "error", summary: truncateText(sanitizeText(errorMessage)) };
  if (!response) return { status: "error", summary: "Resultado indisponível." };
  if (!response.ok) {
    return {
      status: "error",
      summary: truncateText(friendlyError(response.error_code, response.message)),
    };
  }

  const presented = presentResult(response);
  const firstLine =
    presented.summary?.find((line) => line.trim()) ??
    presented.pending?.[0] ??
    presented.evidence?.[0]?.title ??
    "Resultado disponível.";
  return { status: "success", summary: truncateText(firstLine) };
}
