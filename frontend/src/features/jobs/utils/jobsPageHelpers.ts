import type { ActionMenuItem } from "../../../components/common/ActionMenu";
import type { JobOperationalData } from "../hooks/useJobsList";
import type { Job } from "../../../types/domain";

export function truncate(value: string, max = 140): string {
  return value.length <= max ? value : `${value.slice(0, max).trim()}…`;
}

export function qualityNeedsAttention(job: Job): boolean {
  return job.quality_status === "weak" || job.quality_status === "acceptable";
}

type OperationalTone = "healthy" | "ready" | "risk" | "stuck" | "review";

export type JobOperationalPresentation = {
  tone: OperationalTone;
  healthLabel: string;
  healthNote: string;
  pipelineLabel: string;
  pipelineNote: string;
  actionLabel: string;
  actionTarget: "pipeline" | "edit";
};

export type JobPipelineSnapshot = {
  totalCandidates: number;
  strongCandidates: number;
  topScore: number | null;
  latestActivityLabel: string | null;
  latestActivityDays: number | null;
  entryCount: number;
  screeningCount: number;
  interviewCount: number;
  advancedCount: number;
  movedCount: number;
};

export type InsightConfidence = "high" | "medium" | "initial";
export type InsightMomentum = "stable" | "improving" | "degrading" | "stalled" | "accelerating";

export type JobOperationalInsight = {
  title: string;
  signal: string;
  cause: string;
  impact: string;
  action: string;
  tone: OperationalTone;
  confidence: InsightConfidence;
  momentum: InsightMomentum;
};

export type JobOperationalPriorityLevel = "critical" | "focus" | "active" | "stable";

export type JobOperationalPriority = {
  score: number;
  level: JobOperationalPriorityLevel;
  label: string;
  note: string;
  momentum: InsightMomentum;
  momentumLabel: string;
  compact: boolean;
};

function hasOperationalData(operational?: JobOperationalData | null) {
  return operational != null;
}

function sumStageCounts(counts: Record<string, number>, stages: string[]) {
  return stages.reduce((total, stage) => total + (counts[stage] ?? 0), 0);
}

function formatRelativeActivity(date: string | null | undefined) {
  if (!date) return null;

  const milliseconds = new Date(date).getTime() - Date.now();
  const diffDays = Math.round(milliseconds / (1000 * 60 * 60 * 24));

  if (Math.abs(diffDays) >= 1) {
    return new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" }).format(diffDays, "day");
  }

  return "hoje";
}

function getActivityAgeDays(date: string | null | undefined) {
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function pluralizeCandidates(total: number) {
  return `${total} ${total === 1 ? "candidato" : "candidatos"}`;
}

function formatStalledNote(relativeActivity: string | null) {
  if (!relativeActivity) return "Mova os primeiros candidatos";
  return relativeActivity === "hoje" ? "Sem avanço hoje" : `Sem avanço desde ${relativeActivity}`;
}

function formatMovementNote(relativeActivity: string | null) {
  if (!relativeActivity) return "Sem sinais de bloqueio agora";
  return relativeActivity === "hoje" ? "Movimento hoje" : `Movimento recente ${relativeActivity}`;
}

function formatActiveFlowNote(relativeActivity: string | null) {
  if (!relativeActivity) return "Pipeline com bom momentum";
  return relativeActivity === "hoje" ? "Fluxo ativo hoje" : `Fluxo ativo até ${relativeActivity}`;
}

function formatElapsedTime(days: number | null) {
  if (days == null) return "sem referência recente";
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

function inferTitleSeniority(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("estágio") || normalized.includes("estagio")) return "intern";
  if (normalized.includes("júnior") || normalized.includes("junior")) return "junior";
  if (normalized.includes("pleno")) return "mid";
  if (normalized.includes("sênior") || normalized.includes("senior")) return "senior";
  if (normalized.includes("lead")) return "lead";
  if (normalized.includes("principal")) return "principal";
  if (normalized.includes("diretor") || normalized.includes("diretoria")) return "director";
  return null;
}

function getInsightConfidenceLabel(confidence: InsightConfidence) {
  if (confidence === "high") return "Alta confiança";
  if (confidence === "medium") return "Confiança média";
  return "Sinal inicial";
}

function getInsightMomentumLabel(momentum: InsightMomentum) {
  if (momentum === "accelerating") return "Acelerando";
  if (momentum === "improving") return "Melhorando";
  if (momentum === "degrading") return "Degradando";
  if (momentum === "stalled") return "Sem movimento";
  return "Estável";
}

export function getInsightMeta(confidence: InsightConfidence, momentum: InsightMomentum) {
  return `${getInsightConfidenceLabel(confidence)} • ${getInsightMomentumLabel(momentum)}`;
}

export function getOperationalMomentum(snapshot: JobPipelineSnapshot): InsightMomentum {
  if (snapshot.totalCandidates === 0) return "degrading";
  if (snapshot.advancedCount > 0) return "accelerating";
  if (snapshot.movedCount > 0) return "improving";
  if (snapshot.entryCount > 0) return "stalled";
  return "stable";
}

export function getOperationalMomentumLabel(snapshot: JobPipelineSnapshot) {
  return getInsightMomentumLabel(getOperationalMomentum(snapshot));
}

export function getOperationalMomentumNote(snapshot: JobPipelineSnapshot) {
  const age = formatElapsedTime(snapshot.latestActivityDays);
  const momentum = getOperationalMomentum(snapshot);

  if (momentum === "accelerating") return `Há avanço em etapas finais ${age}.`;
  if (momentum === "improving") return `O funil segue andando com movimento ${age}.`;
  if (momentum === "stalled") return `O funil está parado desde ${age}.`;
  if (momentum === "degrading") return snapshot.totalCandidates === 0 ? "A vaga ainda não ganhou tração." : `Os sinais pioraram desde ${age}.`;
  return `Sem urgência operacional aparente ${age}.`;
}

export function getOperationalToneClasses(tone: OperationalTone) {
  if (tone === "healthy") {
    return {
      label: "text-[hsl(var(--success))]",
      note: "text-[hsl(var(--text-muted))]",
      marker: "bg-[hsl(var(--success))]",
    };
  }

  if (tone === "ready") {
    return {
      label: "text-[hsl(var(--primary))]",
      note: "text-[hsl(var(--text-muted))]",
      marker: "bg-[hsl(var(--primary))]",
    };
  }

  if (tone === "review") {
    return {
      label: "text-[hsl(var(--warning))]",
      note: "text-[hsl(var(--warning))]",
      marker: "bg-[hsl(var(--warning))]",
    };
  }

  return {
    label: "text-[hsl(var(--danger))]",
    note: tone === "risk" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--warning))]",
    marker: tone === "risk" ? "bg-[hsl(var(--danger))]" : "bg-[hsl(var(--warning))]",
  };
}

export function getOperationalSurfaceClasses(tone: OperationalTone) {
  if (tone === "healthy") {
    return {
      soft: "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/55",
      emphasis: "border-[hsl(var(--success))]/20 bg-[hsl(var(--success-soft))]/75",
      accent: "bg-[hsl(var(--success-soft))]",
    };
  }

  if (tone === "ready") {
    return {
      soft: "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/55",
      emphasis: "border-[hsl(var(--primary))]/20 bg-[hsl(var(--accent-soft))]/90",
      accent: "bg-[hsl(var(--accent-soft))]",
    };
  }

  if (tone === "review") {
    return {
      soft: "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/55",
      emphasis: "border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))]/80",
      accent: "bg-[hsl(var(--warning-soft))]",
    };
  }

  if (tone === "stuck") {
    return {
      soft: "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/55",
      emphasis: "border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))]/80",
      accent: "bg-[hsl(var(--warning-soft))]",
    };
  }

  return {
    soft: "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/55",
    emphasis: "border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))]/80",
    accent: "bg-[hsl(var(--danger-soft))]",
  };
}

export function getJobOperationalPriority(
  job: Job,
  operational?: JobOperationalData | null,
): JobOperationalPriority {
  if (!hasOperationalData(operational)) {
    if (job.status === "paused") {
      return {
        score: 10,
        level: "stable",
        label: "Em espera",
        note: "A vaga está pausada e segue fora do foco operacional",
        momentum: "stable",
        momentumLabel: "Estável",
        compact: true,
      };
    }

    if (job.status === "closed" || job.status === "cancelled") {
      return {
        score: -24,
        level: "stable",
        label: job.status === "closed" ? "Concluída" : "Cancelada",
        note: "Sem ação operacional prioritária neste momento",
        momentum: "stable",
        momentumLabel: "Estável",
        compact: true,
      };
    }

    if (job.status === "draft") {
      return {
        score: 12,
        level: "stable",
        label: "Rascunho",
        note: "A vaga ainda não entrou na operação ativa",
        momentum: "stable",
        momentumLabel: "Estável",
        compact: true,
      };
    }

    if (qualityNeedsAttention(job)) {
      return {
        score: 42,
        level: "focus",
        label: "Precisa ajuste",
        note: "A estrutura da vaga ainda não sustenta uma leitura operacional confiável",
        momentum: "stable",
        momentumLabel: "Estável",
        compact: false,
      };
    }

    return {
      score: 24,
      level: "stable",
      label: "Monitorando",
      note: "Sinais operacionais em atualização",
      momentum: "stable",
      momentumLabel: "Estável",
      compact: true,
    };
  }

  const snapshot = getJobPipelineSnapshot(operational);
  const presentation = getJobOperationalPresentation(job, operational);
  const momentum = getOperationalMomentum(snapshot);
  const ageDays = snapshot.latestActivityDays ?? 0;
  const strongCandidatesWaiting = snapshot.strongCandidates > 0 && snapshot.movedCount === 0;

  let score =
    presentation.tone === "risk"
      ? 90
      : presentation.tone === "stuck"
        ? 82
        : presentation.tone === "review"
          ? 74
          : presentation.tone === "ready"
            ? 58
            : 26;

  score +=
    momentum === "degrading"
      ? 24
      : momentum === "stalled"
        ? 18
        : momentum === "improving"
          ? 10
          : momentum === "accelerating"
            ? 8
            : 0;

  if (snapshot.totalCandidates === 0 && job.status === "published") score += 18;
  if (strongCandidatesWaiting) score += 24;
  if (snapshot.entryCount >= 4 && snapshot.movedCount === 0) score += 12;
  score += Math.min(ageDays * 2, 18);

  if (job.status === "closed") score -= 52;
  if (job.status === "cancelled") score -= 40;
  if (snapshot.advancedCount > 0) score -= 6;

  const level: JobOperationalPriorityLevel =
    (strongCandidatesWaiting && ageDays >= 1) ||
    (presentation.tone === "risk" && (snapshot.totalCandidates === 0 || ageDays >= 4))
      ? "critical"
      : presentation.tone === "risk" ||
          presentation.tone === "stuck" ||
          presentation.tone === "review" ||
          momentum === "stalled" ||
          momentum === "degrading"
        ? "focus"
        : presentation.tone === "ready" ||
            momentum === "accelerating" ||
            momentum === "improving"
          ? "active"
          : "stable";

  if (job.status === "paused") {
    return {
      score: 10,
      level: "stable",
      label: "Em espera",
      note: "A vaga está pausada e pode ficar fora do foco imediato",
      momentum,
      momentumLabel: getInsightMomentumLabel(momentum),
      compact: true,
    };
  }

  if (job.status === "closed") {
    return {
      score: -20,
      level: "stable",
      label: "Concluída",
      note: "Processo encerrado, sem ação prioritária agora",
      momentum,
      momentumLabel: getInsightMomentumLabel(momentum),
      compact: true,
    };
  }

  if (strongCandidatesWaiting) {
    return {
      score,
      level: level === "critical" ? "critical" : "focus",
      label: level === "critical" ? "Ação imediata" : "Feedback pendente",
      note: `${snapshot.strongCandidates} forte${snapshot.strongCandidates === 1 ? "" : "s"} aguardando avanço`,
      momentum,
      momentumLabel: getInsightMomentumLabel(momentum),
      compact: false,
    };
  }

  if (presentation.tone === "risk" && snapshot.totalCandidates === 0) {
    return {
      score,
      level,
      label: "Perdendo tração",
      note: ageDays > 0 ? `Sem avanço ${formatElapsedTime(snapshot.latestActivityDays)}` : "Pipeline ainda sem reação",
      momentum,
      momentumLabel: getInsightMomentumLabel(momentum),
      compact: false,
    };
  }

  if (presentation.tone === "stuck") {
    return {
      score,
      level,
      label: "Gargalo ativo",
      note: `Triagem sem avanço ${formatElapsedTime(snapshot.latestActivityDays)}`,
      momentum,
      momentumLabel: getInsightMomentumLabel(momentum),
      compact: false,
    };
  }

  if (presentation.tone === "review") {
    return {
      score,
      level,
      label: "Precisa ajuste",
      note: "Critérios ainda puxam ruído operacional",
      momentum,
      momentumLabel: getInsightMomentumLabel(momentum),
      compact: false,
    };
  }

  if (momentum === "accelerating") {
    return {
      score,
      level,
      label: "Acelerando",
      note: "Há avanço real nas etapas finais",
      momentum,
      momentumLabel: getInsightMomentumLabel(momentum),
      compact: false,
    };
  }

  if (momentum === "improving") {
    return {
      score,
      level,
      label: "Recuperando",
      note: "O funil voltou a andar",
      momentum,
      momentumLabel: getInsightMomentumLabel(momentum),
      compact: false,
    };
  }

  return {
    score,
    level,
    label: "Estável",
    note: "Sem urgência operacional imediata",
    momentum,
    momentumLabel: getInsightMomentumLabel(momentum),
    compact: presentation.tone === "healthy" || job.status === "closed",
  };
}

export function compareJobsByOperationalPriority(
  left: Job,
  right: Job,
  operationalData: Record<string, JobOperationalData>,
) {
  const leftPriority = getJobOperationalPriority(left, operationalData[left.id]);
  const rightPriority = getJobOperationalPriority(right, operationalData[right.id]);

  if (leftPriority.score !== rightPriority.score) {
    return rightPriority.score - leftPriority.score;
  }

  return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
}

export function getJobPipelineSnapshot(operational?: JobOperationalData | null): JobPipelineSnapshot {
  const stageCounts = operational?.stageCounts ?? {};

  return {
    totalCandidates: operational?.totalCandidates ?? 0,
    strongCandidates: operational?.strongCandidates ?? 0,
    topScore: operational?.topScore ?? null,
    latestActivityLabel: formatRelativeActivity(operational?.latestActivity),
    latestActivityDays: getActivityAgeDays(operational?.latestActivity),
    entryCount: stageCounts.entry ?? 0,
    screeningCount: stageCounts.screening ?? 0,
    interviewCount: sumStageCounts(stageCounts, ["hr_interview", "technical_interview"]),
    advancedCount: sumStageCounts(stageCounts, ["final", "offer", "hired"]),
    movedCount: sumStageCounts(stageCounts, [
      "screening",
      "hr_interview",
      "technical_interview",
      "final",
      "offer",
      "hired",
    ]),
  };
}

export function getJobOperationalPresentation(
  job: Job,
  operational?: JobOperationalData | null,
): JobOperationalPresentation {
  if (!hasOperationalData(operational)) {
    if (job.status === "draft" || job.status === "cancelled" || qualityNeedsAttention(job)) {
      return {
        tone: "review",
        healthLabel: job.status === "draft" ? "Rascunho" : "Precisa revisão",
        healthNote:
          job.quality_score != null ? `${job.quality_score}/100 e estrutura incompleta` : "Estrutura incompleta",
        pipelineLabel: "Contexto operacional em atualização",
        pipelineNote: "Ajuste a vaga antes de depender dos sinais do pipeline",
        actionLabel: "Revisar descrição",
        actionTarget: "edit",
      };
    }

    if (job.status === "paused") {
      return {
        tone: "healthy",
        healthLabel: "Em espera",
        healthNote: "Vaga pausada no momento",
        pipelineLabel: "Contexto operacional em atualização",
        pipelineNote: "Retome quando houver contexto para seguir",
        actionLabel: "Revisar prioridade",
        actionTarget: "edit",
      };
    }

    if (job.status === "closed") {
      return {
        tone: "healthy",
        healthLabel: "Encerrada",
        healthNote: "Vaga concluída ou finalizada",
        pipelineLabel: "Histórico em atualização",
        pipelineNote: "Abra o pipeline se precisar revisar o histórico",
        actionLabel: "Abrir pipeline",
        actionTarget: "pipeline",
      };
    }

    return {
      tone: "healthy",
      healthLabel: "Monitorando",
      healthNote: "Sinais de pipeline ainda estão carregando",
      pipelineLabel: "Contexto operacional em atualização",
      pipelineNote: "A lista será priorizada assim que os sinais do pipeline chegarem",
      actionLabel: "Abrir pipeline",
      actionTarget: "pipeline",
    };
  }

  const snapshot = getJobPipelineSnapshot(operational);
  const totalCandidates = snapshot.totalCandidates;
  const strongCandidates = snapshot.strongCandidates;
  const topScore = snapshot.topScore;
  const latestActivity = snapshot.latestActivityLabel;
  const entryCount = snapshot.entryCount;
  const movedCount = snapshot.movedCount;
  const advancedCount = snapshot.advancedCount;

  if (job.status === "draft" || job.status === "cancelled" || qualityNeedsAttention(job)) {
    return {
      tone: "review",
      healthLabel: "Precisa revisão",
      healthNote:
        job.quality_score != null ? `${job.quality_score}/100 e estrutura incompleta` : "Estrutura incompleta",
      pipelineLabel: totalCandidates > 0 ? `${pluralizeCandidates(totalCandidates)} já vinculados` : "Base da vaga incompleta",
      pipelineNote: "Revise critérios e requisitos antes de acelerar",
      actionLabel: totalCandidates > 0 ? "Corrigir critérios" : "Revisar descrição",
      actionTarget: "edit",
    };
  }

  if (job.status === "paused") {
    return {
      tone: "risk",
      healthLabel: "Em espera",
      healthNote: "Vaga pausada no momento",
      pipelineLabel: totalCandidates > 0 ? `${pluralizeCandidates(totalCandidates)} no funil` : "Sem pipeline ativo",
      pipelineNote: "Retome quando houver contexto para seguir",
      actionLabel: "Revisar prioridade",
      actionTarget: "edit",
    };
  }

  if (job.status === "closed") {
    return {
      tone: "healthy",
      healthLabel: "Encerrada",
      healthNote: "Vaga concluída ou finalizada",
      pipelineLabel:
        totalCandidates > 0
          ? totalCandidates === 1
            ? "1 candidato passou por aqui"
            : `${pluralizeCandidates(totalCandidates)} passaram por aqui`
          : "Sem histórico relevante",
      pipelineNote: "Abra o pipeline se precisar revisar o histórico",
      actionLabel: "Abrir pipeline",
      actionTarget: "pipeline",
    };
  }

  if (totalCandidates === 0) {
    return {
      tone: "risk",
      healthLabel: "Em risco",
      healthNote:
        job.quality_score != null ? `${job.quality_score}/100, mas sem tração inicial` : "Sem tração inicial",
      pipelineLabel: "Pipeline vazio",
      pipelineNote: "Revise a vaga antes de buscar novos candidatos",
      actionLabel: "Revisar descrição",
      actionTarget: "edit",
    };
  }

  if (movedCount === 0 && entryCount > 0) {
    return {
      tone: strongCandidates > 0 ? "ready" : "stuck",
      healthLabel: strongCandidates > 0 ? "Pronta para acelerar" : "Travada na triagem",
      healthNote:
        strongCandidates > 0
          ? `${strongCandidates} candidato${strongCandidates === 1 ? "" : "s"} forte${strongCandidates === 1 ? "" : "s"} aguardando avanço`
          : `Todos no topo do funil${topScore != null ? ` · melhor score ${Math.round(topScore)}` : ""}`,
      pipelineLabel: `${pluralizeCandidates(entryCount)} na entrada`,
      pipelineNote: formatStalledNote(latestActivity),
      actionLabel: strongCandidates > 0 ? "Priorizar feedback" : "Corrigir gargalo",
      actionTarget: "pipeline",
    };
  }

  if (strongCandidates >= 2 || advancedCount > 0) {
    return {
      tone: "ready",
      healthLabel: "Pronta para acelerar",
      healthNote:
        strongCandidates >= 2
          ? `${strongCandidates} candidatos fortes no funil`
          : `${advancedCount} em etapa avançada`,
      pipelineLabel: `${pluralizeCandidates(totalCandidates)} em movimento`,
      pipelineNote: formatActiveFlowNote(latestActivity),
      actionLabel: strongCandidates > 0 ? "Ver candidatos fortes" : "Abrir pipeline",
      actionTarget: "pipeline",
    };
  }

  return {
    tone: "healthy",
    healthLabel: "Saudável",
    healthNote:
      job.quality_score != null
        ? `${job.quality_score}/100 com pipeline ativo`
        : "Pipeline ativo e critérios estáveis",
    pipelineLabel: `${pluralizeCandidates(totalCandidates)} no funil`,
    pipelineNote: formatMovementNote(latestActivity),
    actionLabel: "Abrir pipeline",
    actionTarget: "pipeline",
  };
}

export function getJobOperationalInsights(
  job: Job,
  operational?: JobOperationalData | null,
): JobOperationalInsight[] {
  if (!hasOperationalData(operational)) {
    return [
      {
        title: "Sinais operacionais em atualização",
        signal: "A vaga ainda está carregando contexto de pipeline e candidatos.",
        cause: "Os sinais usados para detectar risco, momentum e gargalos ainda não chegaram por completo.",
        impact: "A priorização adaptativa pode ficar mais neutra até a leitura terminar.",
        action: qualityNeedsAttention(job) ? "Revisar a estrutura da vaga enquanto o contexto atualiza." : "Acompanhar o pipeline quando os sinais carregarem.",
        tone: qualityNeedsAttention(job) ? "review" : "healthy",
        confidence: "initial",
        momentum: "stable",
      },
    ];
  }

  const snapshot = getJobPipelineSnapshot(operational);
  const insights: JobOperationalInsight[] = [];
  const titleSeniority = inferTitleSeniority(job.title);
  const hasSeniorityMismatch = titleSeniority != null && job.seniority_level != null && titleSeniority !== job.seniority_level;
  const hasMissingSenioritySignal = titleSeniority != null && !job.seniority_level;

  if (qualityNeedsAttention(job)) {
    insights.push({
      title: "Estrutura ainda não sustenta ritmo alto",
      signal: job.quality_score != null ? `A vaga está em ${job.quality_score}/100.` : "A configuração ainda está incompleta.",
      cause: "Os critérios principais ainda não estão maduros para sustentar um funil mais rápido.",
      impact: "Isso aumenta ruído de triagem e reduz a qualidade das decisões seguintes.",
      action: "Revisar descrição, senioridade e requisitos antes de acelerar.",
      tone: "review",
      confidence: job.quality_score != null ? "high" : "medium",
      momentum: "degrading",
    });
  }

  if (snapshot.totalCandidates === 0) {
    insights.push({
      title: "Pipeline sem entrada recente",
      signal: "A vaga segue publicada sem gerar entrada no pipeline.",
      cause: "A atratividade percebida ou os filtros iniciais podem estar restringindo demais a entrada.",
      impact: "Se nada mudar, o prazo de contratação tende a escorregar antes da triagem começar.",
      action: "Revisar descrição e critérios de corte antes de insistir em volume.",
      tone: "risk",
      confidence: "medium",
      momentum: "degrading",
    });
  }

  if (snapshot.entryCount >= 2 && snapshot.movedCount === 0 && snapshot.strongCandidates > 0) {
    insights.push({
      title: "Candidatos fortes aguardando feedback",
      signal: `${snapshot.strongCandidates} candidatos fortes seguem na entrada sem avanço desde ${formatElapsedTime(snapshot.latestActivityDays)}.`,
      cause: "A triagem não converteu os melhores perfis em próximas etapas.",
      impact: "Isso aumenta risco de perda de talento enquanto o interesse ainda está quente.",
      action: "Priorizar feedback hoje e mover os perfis fortes para a próxima etapa.",
      tone: "ready",
      confidence: "high",
      momentum: "stalled",
    });
  }

  if (snapshot.entryCount >= 2 && snapshot.movedCount === 0 && snapshot.strongCandidates === 0) {
    insights.push({
      title: "Triagem acumulando sem avanço",
      signal: `${snapshot.entryCount} candidatos seguem no topo do funil sem avanço desde ${formatElapsedTime(snapshot.latestActivityDays)}.`,
      cause: "O pipeline recebe entrada, mas a triagem não está convertendo esses perfis em progresso real.",
      impact: "O processo envelhece cedo e consome tempo do time sem gerar decisão.",
      action: "Corrigir o gargalo da triagem e revisar os critérios de priorização.",
      tone: snapshot.strongCandidates > 0 ? "ready" : "stuck",
      confidence: snapshot.entryCount >= 4 ? "high" : "medium",
      momentum: "stalled",
    });
  }

  if (snapshot.strongCandidates >= 2) {
    insights.push({
      title: "Existe oportunidade de acelerar contratação",
      signal: `${snapshot.strongCandidates} candidatos fortes já apareceram no funil.`,
      cause: "A vaga conseguiu atrair perfis promissores cedo no processo.",
      impact: "Há espaço para reduzir tempo de contratação sem comprometer qualidade.",
      action: "Abrir o pipeline e concentrar a próxima decisão nos melhores perfis.",
      tone: "ready",
      confidence: "high",
      momentum: snapshot.advancedCount > 0 ? "accelerating" : "improving",
    });
  }

  if (job.status === "paused" && snapshot.totalCandidates > 0) {
    insights.push({
      title: "Pipeline parado por decisão de status",
      signal: `A vaga está pausada com ${pluralizeCandidates(snapshot.totalCandidates)} ainda vinculados.`,
      cause: "O status interrompeu o fluxo mesmo com pipeline já formado.",
      impact: "Os candidatos ficam em limbo e o processo perde previsibilidade.",
      action: "Decidir entre retomar a vaga ou encerrar o processo explicitamente.",
      tone: "risk",
      confidence: "high",
      momentum: "stalled",
    });
  }

  if ((hasSeniorityMismatch || hasMissingSenioritySignal) && !qualityNeedsAttention(job)) {
    insights.push({
      title: "Possível desalinhamento entre título e senioridade",
      signal: hasSeniorityMismatch
        ? "O título sugere uma senioridade diferente da configuração atual da vaga."
        : "O título sugere senioridade, mas esse sinal não está explicitado na vaga.",
      cause: "O enquadramento do papel pode estar ambíguo para quem lê e para quem faz triagem.",
      impact: "Isso tende a gerar entrada menos qualificada e decisões inconsistentes de screening.",
      action: "Revisar senioridade e descrição para alinhar expectativa e triagem.",
      tone: "review",
      confidence: hasSeniorityMismatch ? "medium" : "initial",
      momentum: "stable",
    });
  }

  if (snapshot.totalCandidates > 0 && snapshot.strongCandidates === 0 && snapshot.topScore != null && snapshot.topScore < 55) {
    insights.push({
      title: "Pouca força no topo do funil",
      signal: `Os perfis atuais não passam de um melhor score ${Math.round(snapshot.topScore)}.`,
      cause: "A vaga atraiu volume, mas ainda não converteu candidatos com fit forte.",
      impact: "O time corre risco de gastar esforço em triagem sem aproximar a contratação.",
      action: "Revisar atratividade e critérios para elevar a qualidade das próximas entradas.",
      tone: "risk",
      confidence: "medium",
      momentum: snapshot.movedCount > 0 ? "stable" : "degrading",
    });
  }

  if (insights.length === 0) {
    insights.push({
      title: "Leitura operacional está estável",
      signal:
        snapshot.totalCandidates > 0
          ? `O pipeline tem ${pluralizeCandidates(snapshot.totalCandidates)} com sinais operacionais equilibrados.`
          : "Ainda há poucos sinais para um diagnóstico mais agressivo.",
      cause: "Não aparecem gargalos, pausas ou inconsistências fortes neste momento.",
      impact: "A vaga pode seguir monitorada sem ação urgente imediata.",
      action: "Abrir o pipeline apenas para acompanhar ritmo e próximos passos.",
      tone: "healthy",
      confidence: snapshot.totalCandidates > 0 ? "medium" : "initial",
      momentum: "stable",
    });
  }

  return insights.slice(0, 3);
}

export function buildJobActionItems(
  job: Job,
  runningAction: string | null,
  onEdit: (jobId: string) => void,
  onPipeline: (jobId: string) => void,
  onPause: (jobId: string) => void,
  onClose: (jobId: string) => void,
  onDelete: (job: Job) => void,
): ActionMenuItem[] {
  const items: ActionMenuItem[] = [
    {
      label: "Editar",
      onClick: () => onEdit(job.id),
    },
    {
      label: "Abrir pipeline",
      onClick: () => onPipeline(job.id),
    },
  ];

  if (job.status === "published") {
    items.push(
      {
        label: "Pausar",
        onClick: () => onPause(job.id),
        disabled: runningAction === `pause:${job.id}`,
      },
      {
        label: "Encerrar",
        onClick: () => onClose(job.id),
        disabled: runningAction === `close:${job.id}`,
      },
    );
  }

  if (job.status === "paused") {
    items.push({
      label: "Encerrar",
      onClick: () => onClose(job.id),
      disabled: runningAction === `close:${job.id}`,
    });
  }

  if (job.status === "draft" || job.status === "cancelled") {
    items.push({
      label: "Excluir",
      tone: "danger" as const,
      onClick: () => onDelete(job),
      disabled: runningAction === `delete:${job.id}`,
    });
  }

  return items;
}
