import { type MutableRefObject, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Tabs } from "../../components/common/Tabs";
import { StatusPill } from "../../components/common/StatusPill";
import { useAuth } from "../../features/auth/useAuth";
import { analysisService } from "../../services/analysisService";
import { candidatesService } from "../../services/candidatesService";
import { formatContextError } from "../../services/errorMessages";
import { feedback } from "../../services/feedback";
import { getJobRanking } from "../../services/jobsService";
import { pipelineService } from "../../services/pipelineService";
import { resumeService } from "../../services/resumeService";
import { toast } from "../../services/toast";
import type {
  AnalysisPipelineStatus,
  AnalysisResult,
  CandidateOverview,
  CandidatePipelineHistory,
  Job,
  JobRankingEntry,
  PipelineStage,
  PipelineTrigger,
} from "../../types/domain";
import { formatJobStatus, formatSeniority, jobStatusTone } from "../../utils/jobFormatters";
import { getCandidateState, getNextAction, type CandidateState } from "./candidateState";
import { type PanelTab, usePipeline } from "./PipelineContext";
import { EditCandidateModal } from "./EditCandidateModal";

const DRAWER_TABS = [
  { key: "summary" satisfies PanelTab, label: "Resumo" },
  { key: "score" satisfies PanelTab, label: "Score" },
  { key: "analysis" satisfies PanelTab, label: "Análise IA" },
  { key: "documents" satisfies PanelTab, label: "Documentos" },
  { key: "history" satisfies PanelTab, label: "Histórico" },
  { key: "actions" satisfies PanelTab, label: "Ações" },
];

const STAGE_OPTIONS: { value: PipelineStage; label: string }[] = [
  { value: "entry", label: "Recebido" },
  { value: "screening", label: "Triagem" },
  { value: "hr_interview", label: "Entrevista RH" },
  { value: "technical_interview", label: "Entrevista Técnica" },
  { value: "final", label: "Final" },
  { value: "offer", label: "Proposta" },
  { value: "hired", label: "Contratado" },
  { value: "rejected", label: "Reprovado" },
];

const STAGE_LABEL: Record<string, string> = {
  entry: "Recebido",
  screening: "Triagem",
  hr_interview: "Entrevista RH",
  technical_interview: "Entrevista Técnica",
  final: "Final",
  offer: "Proposta",
  hired: "Contratado",
  rejected: "Reprovado",
};

const TRIGGER_LABEL: Record<PipelineTrigger, string> = {
  manual: "Movido manualmente",
  auto_match: "Entrada automática por compatibilidade",
  system: "Movido pelo sistema",
};

const ANALYSIS_STATUS_LABEL: Record<string, string> = {
  pending: "Na fila",
  processing: "Processando",
  completed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
};

const EXTRACTION_STATUS_LABEL: Record<string, string> = {
  completed: "Pronto",
  pending: "Pendente",
  processing: "Extraindo…",
  failed: "Falha",
};

const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;
const TRANSFER_ALLOWED_STAGES: PipelineStage[] = ["entry", "screening"];
const DANGEROUS_STAGES: PipelineStage[] = ["hired", "rejected"];

function fmtScore(score: number | null | undefined): string {
  if (score == null) return "—";
  return `${Math.round(score > 1 ? score : score * 100)}%`;
}

function scoreColorClass(score: number | null | undefined): string {
  if (score == null) return "text-[hsl(var(--text-muted))]";
  const n = score > 1 ? score / 100 : score;
  if (n >= 0.7) return "text-[hsl(var(--success))]";
  if (n >= 0.4) return "text-[hsl(var(--warning))]";
  return "text-[hsl(var(--danger))]";
}

function scoreBgClass(score: number | null | undefined): string {
  if (score == null) return "bg-[hsl(var(--surface-muted))] ring-[hsl(var(--border))]";
  const n = score > 1 ? score / 100 : score;
  if (n >= 0.7) return "bg-[hsl(var(--success-soft))] ring-[hsl(var(--success))]/25";
  if (n >= 0.4) return "bg-[hsl(var(--warning-soft))] ring-[hsl(var(--warning))]/25";
  return "bg-[hsl(var(--danger-soft))] ring-[hsl(var(--danger))]/25";
}

function getCompatibilityGuidance(params: {
  hasPipelineEntry: boolean;
  hasResume: boolean;
  analysisStatus: CandidateOverview["latest_analysis"] extends infer T
    ? T extends { status: infer S }
      ? S | null
      : null
    : null;
}): {
  title: string;
  description: string;
  tone: "neutral" | "info";
} | null {
  if (!params.hasPipelineEntry) {
    return {
      title: "Compatibilidade indisponível",
      description: "Associe o candidato a esta vaga para calcular a compatibilidade.",
      tone: "neutral",
    };
  }
  if (!params.hasResume) {
    return {
      title: "Compatibilidade indisponível",
      description: "Envie um currículo para calcular a compatibilidade.",
      tone: "neutral",
    };
  }
  if (params.analysisStatus === "pending" || params.analysisStatus === "processing") {
    return {
      title: "Análise da IA em processamento",
      description: "O cálculo da compatibilidade será atualizado quando a execução terminar.",
      tone: "info",
    };
  }
  if (params.analysisStatus !== "completed") {
    return {
      title: "Compatibilidade indisponível",
      description: "Execute a análise da IA para liberar esta decisão.",
      tone: "neutral",
    };
  }
  return null;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatOptionalDateTime(value: string | null | undefined): string {
  return value ? formatDateTime(value) : "—";
}

function inferAdmissionFields(overview: CandidateOverview): { label: string; value: string }[] {
  const source = overview.candidate as Record<string, unknown>;
  const fieldMap: Array<{ key: string; label: string }> = [
    { key: "admission_status", label: "Status de admissão" },
    { key: "admission_date", label: "Data de admissão" },
    { key: "start_date", label: "Data de início" },
    { key: "hire_date", label: "Data de contratação" },
    { key: "admission_notes", label: "Observações de admissão" },
  ];

  return fieldMap
    .map(({ key, label }) => {
      const raw = source[key];
      if (typeof raw !== "string" || !raw.trim()) return null;
      return { label, value: raw };
    })
    .filter((item): item is { label: string; value: string } => item !== null);
}

function CandidateDrawerHeader({
  candidate,
  candidateState,
  candidateSuggestion,
  primaryActionLabel,
  primaryActionLoading,
  onPrimaryAction,
  activeJobLabel,
  currentStage,
  activeJobCompatibilityScore,
  linkStatus,
  candidateLoading,
  closeCandidate,
}: {
  candidate: CandidateOverview["candidate"] | null | undefined;
  candidateState: CandidateState | null;
  candidateSuggestion: string | null;
  primaryActionLabel: string | null;
  primaryActionLoading: boolean;
  onPrimaryAction: (() => void) | null;
  activeJobLabel: string;
  currentStage: PipelineStage | null;
  activeJobCompatibilityScore: number | null;
  linkStatus: string;
  candidateLoading: boolean;
  closeCandidate: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {candidateLoading ? (
            <div className="h-5 w-40 animate-pulse rounded bg-[hsl(var(--surface-muted))]" />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-semibold text-[hsl(var(--text))]">
                {candidate?.full_name ?? "—"}
              </p>
              {candidateState ? <StatusPill label={candidateState.label} tone={candidateState.tone} /> : null}
            </div>
          )}
          {candidateLoading ? (
            <div className="mt-2 h-3 w-32 animate-pulse rounded bg-[hsl(var(--surface-muted))]" />
          ) : (
            <div className="mt-1">
              <p className="truncate text-sm text-[hsl(var(--text-muted))]">
                {[candidate?.email, candidate?.phone].filter(Boolean).join(" · ") || "Sem contato informado"}
              </p>
              {candidateSuggestion ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium text-[hsl(var(--text-muted))]">{candidateSuggestion}</p>
                  {primaryActionLabel && onPrimaryAction ? (
                    <button
                      type="button"
                      onClick={onPrimaryAction}
                      disabled={primaryActionLoading}
                      className="rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50"
                    >
                      {primaryActionLoading ? "Processando…" : primaryActionLabel}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={closeCandidate}
          className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))]"
          aria-label="Fechar painel"
        >
          ✕
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <HeaderFact label="Vaga atual" value={activeJobLabel} />
        <HeaderFact
          label="Etapa atual"
          value={currentStage ? STAGE_LABEL[currentStage] ?? currentStage : "Não vinculado"}
        />
        <HeaderFact
          label="Compatibilidade"
          value={fmtScore(activeJobCompatibilityScore)}
          valueClassName={scoreColorClass(activeJobCompatibilityScore)}
        />
        <HeaderFact label="Status do vínculo" value={linkStatus} />
      </div>
    </div>
  );
}

function HeaderFact({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
        {label}
      </p>
      <div className={["mt-1 text-sm font-medium text-[hsl(var(--text))]", valueClassName ?? ""].join(" ")}>
        {value}
      </div>
    </div>
  );
}

export function CandidateDrawer() {
  const {
    selectedCandidateId,
    candidateOverview,
    candidateLoading,
    candidateError,
    activePanelTab,
    activeJobId,
    jobs,
    rankingSyncTick,
    closeCandidate,
    openCandidate,
    switchPanelTab,
    refreshBoard,
    syncCandidateOverview,
    syncAnalysisStart,
    startPolling,
    notifyCandidatesChanged,
    moveCandidateStage,
    invalidateJobState,
  } = usePipeline();
  const { user } = useAuth();
  const canSpendRealTokens = Boolean(user?.real_ai_token_spend_enabled);

  const isOpen = selectedCandidateId !== null;
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisResultLoading, setAnalysisResultLoading] = useState(false);
  const [analysisResultError, setAnalysisResultError] = useState<string | null>(null);
  const analysisResultCacheRef = useRef<Map<string, AnalysisResult>>(new Map());
  const historyCacheRef = useRef<Map<string, CandidatePipelineHistory>>(new Map());
  const rankingEntryCacheRef = useRef<Map<string, JobRankingEntry | null>>(new Map());

  const [rankingEntry, setRankingEntry] = useState<JobRankingEntry | null>(null);
  const [rankingEntryLoading, setRankingEntryLoading] = useState(false);
  const [rankingEntryError, setRankingEntryError] = useState<string | null>(null);

  const [stageSaving, setStageSaving] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [headerActionLoading, setHeaderActionLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addJobModalOpen, setAddJobModalOpen] = useState(false);
  const [transferJobModalOpen, setTransferJobModalOpen] = useState(false);

  useEffect(() => {
    setAnalysisResult(null);
    setAnalysisResultError(null);
    setRankingEntry(null);
    setRankingEntryError(null);
  }, [selectedCandidateId]);

  useEffect(() => {
    rankingEntryCacheRef.current.clear();
    setRankingEntry(null);
    setRankingEntryError(null);
  }, [rankingSyncTick]);

  useEffect(() => {
    if (activePanelTab !== "analysis") return;

    const analysisId = candidateOverview?.latest_analysis?.analysis_id;
    const status = candidateOverview?.latest_analysis?.status;
    if (!analysisId || status !== "completed") return;

    const cached = analysisResultCacheRef.current.get(analysisId);
    if (cached) {
      setAnalysisResult(cached);
      return;
    }

    setAnalysisResultLoading(true);
    setAnalysisResultError(null);

    analysisService
      .result(analysisId)
      .then((result) => {
        analysisResultCacheRef.current.set(analysisId, result);
        setAnalysisResult(result);
      })
      .catch((err: unknown) => {
        setAnalysisResultError(
          formatContextError(
            err,
            "Não foi possível carregar o resultado completo da análise.",
            "Tente novamente em alguns instantes.",
          ),
        );
      })
      .finally(() => setAnalysisResultLoading(false));
  }, [
    activePanelTab,
    candidateOverview?.latest_analysis?.analysis_id,
    candidateOverview?.latest_analysis?.status,
  ]);

  useEffect(() => {
    if (activePanelTab !== "score") return;
    if (!activeJobId || !candidateOverview) {
      setRankingEntry(null);
      setRankingEntryError(null);
      setRankingEntryLoading(false);
      return;
    }

    let cancelled = false;
    const cacheKey = `${activeJobId}:${candidateOverview.candidate.id}`;
    const cached = rankingEntryCacheRef.current.get(cacheKey);
    if (cached !== undefined) {
      setRankingEntry(cached);
      setRankingEntryError(null);
      setRankingEntryLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setRankingEntryLoading(true);
    setRankingEntryError(null);

    void getJobRanking(activeJobId)
      .then((ranking) => {
        if (cancelled) return;
        const entry = ranking.candidates.find(
          (candidate) => candidate.candidate_id === candidateOverview.candidate.id,
        ) ?? null;
        rankingEntryCacheRef.current.set(cacheKey, entry);
        setRankingEntry(entry);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRankingEntry(null);
        setRankingEntryError(
          formatContextError(
            err,
            "Não foi possível carregar o score detalhado desta vaga.",
            "Tente novamente.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setRankingEntryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activePanelTab, activeJobId, candidateOverview]);

  const candidate = candidateOverview?.candidate;
  const activePipelineEntry = useMemo(() => {
    if (!activeJobId || !candidateOverview) return null;
    return candidateOverview.pipeline_entries.find((entry) => entry.job_id === activeJobId) ?? null;
  }, [activeJobId, candidateOverview]);

  const currentStage = activePipelineEntry?.stage ?? null;
  const activeJob = useMemo<Job | null>(
    () => jobs.find((job) => job.id === activeJobId) ?? null,
    [jobs, activeJobId],
  );
  const activeJobMatch = useMemo(
    () =>
      activeJobId && candidateOverview
        ? candidateOverview.top_matches.find((match) => match.job_id === activeJobId) ?? null
        : null,
    [activeJobId, candidateOverview],
  );
  const activeJobCompatibilityScore =
    activePipelineEntry?.match_score ?? activeJobMatch?.match_score ?? null;
  const candidateState = useMemo(() => {
    if (!candidateOverview) return null;
    return getCandidateState({
      resume_count: candidateOverview.resumes.length,
      ai_status: candidateOverview.latest_analysis?.status ?? null,
      pipeline: { stage: activePipelineEntry?.stage ?? null },
      ranking_available:
        rankingEntry !== null ||
        activeJobCompatibilityScore !== null ||
        activeJobMatch?.match_score != null,
    });
  }, [
    activeJobCompatibilityScore,
    activeJobMatch?.match_score,
    activePipelineEntry?.stage,
    candidateOverview,
    rankingEntry,
  ]);
  const candidateNextAction = useMemo(
    () => (candidateState ? getNextAction(candidateState) : null),
    [candidateState],
  );
  const linkedJobIds = useMemo(
    () => new Set((candidateOverview?.pipeline_entries ?? []).map((entry) => entry.job_id)),
    [candidateOverview],
  );
  const availableJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.id !== activeJobId &&
          !linkedJobIds.has(job.id) &&
          (job.status === "published" || job.status === "paused"),
      ),
    [jobs, activeJobId, linkedJobIds],
  );
  const canTransferCurrentJob = currentStage ? TRANSFER_ALLOWED_STAGES.includes(currentStage) : false;
  const hasResume = (candidateOverview?.resumes.length ?? 0) > 0;
  const compatibilityGuidance = getCompatibilityGuidance({
    hasPipelineEntry: activePipelineEntry !== null,
    hasResume,
    analysisStatus: candidateOverview?.latest_analysis?.status ?? null,
  });

  const handleHeaderRequestAnalysis = useCallback(async () => {
    if (!candidateOverview || headerActionLoading) return;

    const readyResume = candidateOverview.resumes.find(
      (resume) =>
        resume.status === "active" &&
        resume.extraction_status === "completed" &&
        resume.current_version_id,
    );

    switchPanelTab("analysis");

    if (!canSpendRealTokens) {
      toast.warning("Consumo real bloqueado — ative real_ai_token_spend_enabled para analisar.");
      return;
    }

    if (!readyResume?.current_version_id) {
      toast.warning("Nenhum currículo pronto para análise.");
      return;
    }

    setHeaderActionLoading(true);
    feedback.requestAnalysis.processing();
    try {
      const response = await analysisService.request(readyResume.current_version_id);
      await syncAnalysisStart({
        candidateId: candidateOverview.candidate.id,
        analysisId: response.analysis_id,
        status: "pending",
        resumeId: readyResume.resume_id,
        resumeTitle: readyResume.title,
      });
      startPolling(response.analysis_id, candidateOverview.candidate.id, "pending");
      feedback.requestAnalysis.success();
    } catch (err) {
      feedback.requestAnalysis.error(err);
    } finally {
      setHeaderActionLoading(false);
    }
  }, [
    candidateOverview,
    headerActionLoading,
    canSpendRealTokens,
    startPolling,
    switchPanelTab,
    syncAnalysisStart,
  ]);

  const headerPrimaryAction = useMemo(() => {
    if (!candidateState) return null;

    switch (candidateState.key) {
      case "no_resume":
        return {
          label: "Enviar currículo",
          onClick: () => switchPanelTab("documents"),
          loading: false,
        };
      case "waiting_analysis":
        return {
          label: "Iniciar análise",
          onClick: () => {
            void handleHeaderRequestAnalysis();
          },
          loading: headerActionLoading,
        };
      case "analysis_completed":
        return {
          label: "Ver análise",
          onClick: () => switchPanelTab("analysis"),
          loading: false,
        };
      case "ready_for_decision":
        return {
          label: "Mover etapa",
          onClick: () => switchPanelTab("actions"),
          loading: false,
        };
      case "moved_in_pipeline":
        return {
          label: "Ver histórico",
          onClick: () => switchPanelTab("history"),
          loading: false,
        };
      case "in_analysis":
      case "finalized":
        return null;
    }
  }, [candidateState, headerActionLoading, handleHeaderRequestAnalysis, switchPanelTab]);

  async function handleStageChange(newStage: PipelineStage) {
    if (!selectedCandidateId || !currentStage || newStage === currentStage) return;
    setStageSaving(true);
    feedback.moveCandidate.processing();
    try {
      await moveCandidateStage(selectedCandidateId, newStage);
      feedback.moveCandidate.success();
    } catch (err: unknown) {
      feedback.moveCandidate.error(err);
    } finally {
      setStageSaving(false);
    }
  }

  async function handleLinkToActiveJob() {
    if (!selectedCandidateId || !activeJobId) return;
    setLinkSaving(true);
    try {
      await pipelineService.addCandidateToJob(selectedCandidateId, {
        job_id: activeJobId,
        initial_stage: "entry",
      });
      await invalidateJobState();
      feedback.moveCandidate.success();
    } catch (err: unknown) {
      feedback.moveCandidate.error(err);
    } finally {
      setLinkSaving(false);
    }
  }

  const activeJobLabel = activeJob?.title ?? activePipelineEntry?.job_title ?? "Nenhuma vaga em contexto";
  const linkStatus = activePipelineEntry
    ? "Vinculado à vaga ativa"
    : linkSaving
      ? "Vinculando à vaga ativa"
      : "Não vinculado à vaga ativa";

  return (
    <>
      {isOpen ? (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={closeCandidate} aria-hidden="true" />
      ) : null}

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Painel do candidato"
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-full flex-col bg-[hsl(var(--surface))] shadow-2xl",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <CandidateDrawerHeader
          candidate={candidate}
          candidateState={candidateState}
          candidateSuggestion={candidateNextAction?.suggestion ?? null}
          primaryActionLabel={headerPrimaryAction?.label ?? null}
          primaryActionLoading={headerPrimaryAction?.loading ?? false}
          onPrimaryAction={headerPrimaryAction?.onClick ?? null}
          activeJobLabel={activeJobLabel}
          currentStage={currentStage}
          activeJobCompatibilityScore={activeJobCompatibilityScore}
          linkStatus={linkStatus}
          candidateLoading={candidateLoading}
          closeCandidate={closeCandidate}
        />

        <div className="shrink-0 bg-[hsl(var(--surface))]">
          <Tabs
            tabs={DRAWER_TABS}
            active={activePanelTab}
            onChange={(key) => switchPanelTab(key as PanelTab)}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {candidateLoading ? (
            <div className="p-5">
              <div className="mb-4 rounded-xl border border-[hsl(var(--primary))]/15 bg-[hsl(var(--accent-soft))] px-4 py-3">
                <p className="text-sm font-semibold text-[hsl(var(--text))]">Carregando candidato…</p>
                <p className="mt-1 text-xs text-[hsl(var(--primary))]">
                  Buscando dados, análise, documentos e histórico.
                </p>
              </div>
              <LoadingSkeleton />
            </div>
          ) : null}

          {!candidateLoading && candidateError ? (
            <div className="m-5 rounded-xl border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-4 text-sm text-[hsl(var(--danger))]">
              <p className="font-semibold">Não foi possível abrir este candidato.</p>
              <p className="mt-1">{candidateError}</p>
              {selectedCandidateId ? (
                <button
                  type="button"
                  onClick={() => void openCandidate(selectedCandidateId)}
                  className="mt-3 rounded-lg border border-[hsl(var(--danger))]/20 bg-[hsl(var(--surface))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger-soft))]"
                >
                  Tentar novamente
                </button>
              ) : null}
            </div>
          ) : null}

          {!candidateLoading && !candidateError && candidateOverview ? (
            <>
              {activePanelTab === "summary" ? (
                <SummaryTab
                  overview={candidateOverview}
                  activeJob={activeJob}
                  activePipelineEntry={activePipelineEntry}
                  onEdit={() => setEditModalOpen(true)}
                />
              ) : null}

              {activePanelTab === "score" ? (
                <ScoreTab
                  overview={candidateOverview}
                  activeJobId={activeJobId}
                  activeJobMatch={activeJobMatch}
                  activePipelineEntry={activePipelineEntry}
                  rankingEntry={rankingEntry}
                  loading={rankingEntryLoading}
                  error={rankingEntryError}
                  compatibilityGuidance={compatibilityGuidance}
                />
              ) : null}

              {activePanelTab === "analysis" ? (
                <AnalysisTab
                  overview={candidateOverview}
                  result={analysisResult}
                  loading={analysisResultLoading}
                  error={analysisResultError}
                />
              ) : null}

              {activePanelTab === "documents" ? <DocumentsTab overview={candidateOverview} /> : null}

              {activePanelTab === "history" ? (
                <HistoryTab
                  overview={candidateOverview}
                  activeJobId={activeJobId}
                  cacheRef={historyCacheRef}
                />
              ) : null}

              {activePanelTab === "actions" ? (
                <ActionsTab
                  overview={candidateOverview}
                  activeJob={activeJob}
                  activeJobId={activeJobId}
                  currentStage={currentStage}
                  availableJobs={availableJobs}
                  canTransferCurrentJob={canTransferCurrentJob}
                  stageSaving={stageSaving}
                  linkSaving={linkSaving}
                  onStageChange={handleStageChange}
                  onLinkToActiveJob={handleLinkToActiveJob}
                  onOpenAddJob={() => setAddJobModalOpen(true)}
                  onOpenTransferJob={() => setTransferJobModalOpen(true)}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <EditCandidateModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        candidate={candidate}
        onSuccess={async (candidateId) => {
          await Promise.all([syncCandidateOverview(candidateId), refreshBoard()]);
          notifyCandidatesChanged();
        }}
      />

      <AddToJobModal
        isOpen={addJobModalOpen}
        candidateId={candidate?.id ?? null}
        availableJobs={availableJobs}
        onClose={() => setAddJobModalOpen(false)}
        onSuccess={async () => {
          if (!candidate?.id) return;
          await invalidateJobState();
          setAddJobModalOpen(false);
        }}
      />

      <TransferJobModal
        isOpen={transferJobModalOpen}
        candidateId={candidate?.id ?? null}
        fromJobId={activeJobId}
        availableJobs={availableJobs}
        canTransfer={canTransferCurrentJob}
        onClose={() => setTransferJobModalOpen(false)}
        onSuccess={async () => {
          if (!candidate?.id) return;
          await invalidateJobState();
          setTransferJobModalOpen(false);
          closeCandidate();
        }}
      />
    </>
  );
}

function SummaryTab({
  overview,
  activeJob,
  activePipelineEntry,
  onEdit,
}: {
  overview: CandidateOverview;
  activeJob: Job | null;
  activePipelineEntry: CandidateOverview["pipeline_entries"][number] | null;
  onEdit: () => void;
}) {
  const admissionFields = inferAdmissionFields(overview);
  const { candidate, resumes, latest_analysis } = overview;

  return (
    <div className="flex flex-col gap-5 p-5">
      <Section
        title="Dados cadastrais"
        action={
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))]"
          >
            Editar dados
          </button>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <MetaItem label="Nome" value={candidate.full_name} />
          <MetaItem label="E-mail" value={candidate.email ?? "—"} />
          <MetaItem label="Telefone" value={candidate.phone ?? "—"} />
          <MetaItem label="CPF" value={candidate.cpf ?? "—"} />
          <MetaItem
            label="Localização"
            value={[candidate.location_city, candidate.location_state, candidate.location_country].filter(Boolean).join(" · ") || "—"}
          />
          <MetaItem label="Criado em" value={formatOptionalDateTime(candidate.created_at)} />
        </div>

        {(candidate.linkedin_url || candidate.github_url || candidate.portfolio_url) ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <MetaItem label="LinkedIn" value={candidate.linkedin_url ?? "—"} />
            <MetaItem label="GitHub" value={candidate.github_url ?? "—"} />
            <MetaItem label="Portfólio" value={candidate.portfolio_url ?? "—"} />
          </div>
        ) : null}

        {candidate.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {candidate.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-2.5 py-1 text-[11px] text-[hsl(var(--text-muted))]"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Status geral">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusCard
            label="Vaga ativa"
            title={activeJob?.title ?? activePipelineEntry?.job_title ?? "Sem vaga ativa"}
            description={
              activePipelineEntry
                ? `${STAGE_LABEL[activePipelineEntry.stage] ?? activePipelineEntry.stage} · ${activePipelineEntry.candidate_status}`
                : "O candidato não está vinculado à vaga ativa neste contexto."
            }
          />
          <StatusCard
            label="Análise IA"
            title={
              latest_analysis
                ? ANALYSIS_STATUS_LABEL[latest_analysis.status] ?? latest_analysis.status
                : "Ainda não solicitada"
            }
            description={
              latest_analysis
                ? `Última execução: ${latest_analysis.resume_title}`
                : "Envie um currículo para iniciar o fluxo de análise."
            }
          />
          <StatusCard
            label="Currículos"
            title={`${resumes.length} arquivo${resumes.length !== 1 ? "s" : ""}`}
            description={
              resumes.length > 0
                ? `${resumes.filter((resume) => resume.status === "active").length} ativo(s)`
                : "Nenhum currículo enviado."
            }
          />
          <StatusCard
            label="Atualização"
            title={formatOptionalDateTime(candidate.updated_at)}
            description="Última atualização dos dados cadastrais."
          />
        </div>
      </Section>

      <Section title="Informações de admissão">
        {admissionFields.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {admissionFields.map((field) => (
              <MetaItem key={field.label} label={field.label} value={field.value} />
            ))}
          </div>
        ) : (
          <EmptyTab
            title="Informações de admissão ainda não disponíveis"
            description="Este espaço já está preparado para exibir dados de admissão quando eles vierem no payload atual."
            compact
          />
        )}
      </Section>
    </div>
  );
}

function ScoreTab({
  overview,
  activeJobId,
  activeJobMatch,
  activePipelineEntry,
  rankingEntry,
  loading,
  error,
  compatibilityGuidance,
}: {
  overview: CandidateOverview;
  activeJobId: string | null;
  activeJobMatch: CandidateOverview["top_matches"][number] | null;
  activePipelineEntry: CandidateOverview["pipeline_entries"][number] | null;
  rankingEntry: JobRankingEntry | null;
  loading: boolean;
  error: string | null;
  compatibilityGuidance: ReturnType<typeof getCompatibilityGuidance>;
}) {
  const compatibilityScore = activePipelineEntry?.match_score ?? activeJobMatch?.match_score ?? null;
  const aiScore = overview.latest_analysis?.overall_score ?? null;
  const hasRankingDetails =
    Boolean(rankingEntry?.explanation_text) ||
    Boolean(rankingEntry && rankingEntry.reason_codes.length > 0) ||
    Boolean(rankingEntry?.score_breakdown);

  if (!activeJobId) {
    return (
      <EmptyTab
        title="Selecione uma vaga para ver o score"
        description="Esta aba sempre mostra apenas os sinais de decisão da vaga ativa."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <Section title="Indicadores da vaga ativa">
        <div className="grid gap-3 sm:grid-cols-3">
          <DecisionCard
            label="Compatibilidade"
            value={compatibilityGuidance ? compatibilityGuidance.title : fmtScore(compatibilityScore)}
            description={compatibilityGuidance?.description ?? "Aderência do candidato à vaga ativa."}
            valueClassName={compatibilityGuidance ? "text-[hsl(var(--text))]" : scoreColorClass(compatibilityScore)}
          />
          <DecisionCard
            label="Score da IA"
            value={fmtScore(aiScore)}
            description={
              overview.latest_analysis?.status === "completed"
                ? "Leitura do currículo pela IA."
                : "Aguardando análise concluída para mostrar este indicador."
            }
            valueClassName={scoreColorClass(aiScore)}
          />
          <DecisionCard
            label="Ranking da vaga"
            value={rankingEntry ? `#${rankingEntry.rank} · ${fmtScore(rankingEntry.final_score)}` : "—"}
            description={
              rankingEntry
                ? "Posição atual do candidato no ranking desta vaga."
                : "Ainda não há posição persistida para este candidato nesta vaga."
            }
            valueClassName={rankingEntry ? scoreColorClass(rankingEntry.final_score) : undefined}
          />
        </div>
      </Section>

      <Section title="Detalhamento do ranking">
        {loading ? <LoadingSkeleton /> : null}
        {error ? (
          <div className="rounded-xl border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-3 text-sm text-[hsl(var(--danger))]">
            {error}
          </div>
        ) : null}

        {!loading && !error && rankingEntry ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <MetaItem label="Posição" value={`#${rankingEntry.rank}`} />
              <MetaItem label="Ranking da vaga" value={fmtScore(rankingEntry.final_score)} />
              <MetaItem label="Etapa no ranking" value={rankingEntry.stage || "—"} />
              <MetaItem label="Status do pipeline" value={rankingEntry.pipeline_status || "—"} />
            </div>

            {rankingEntry.score_breakdown ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <BreakdownItem label="Skills" value={rankingEntry.score_breakdown.skill_match_score} />
                <BreakdownItem label="Experiência" value={rankingEntry.score_breakdown.experience_match_score} />
                <BreakdownItem label="Senioridade" value={rankingEntry.score_breakdown.seniority_match_score} />
                <BreakdownItem label="Educação" value={rankingEntry.score_breakdown.education_score} />
                <BreakdownItem label="Confiança da IA" value={rankingEntry.score_breakdown.ai_confidence_score} />
                <BreakdownItem label="Penalidade" value={rankingEntry.score_breakdown.penalty_score} />
              </div>
            ) : null}

            {rankingEntry.reason_codes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {rankingEntry.reason_codes.map((reason, index) => (
                  <span
                    key={`${reason.type}-${reason.field}-${index}`}
                    className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-2.5 py-1 text-[11px] text-[hsl(var(--text-muted))]"
                  >
                    {reason.description}
                  </span>
                ))}
              </div>
            ) : null}

            {rankingEntry.explanation_text ? (
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                  Explicação
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--text))]">
                  {rankingEntry.explanation_text}
                </p>
              </div>
            ) : null}

            {!hasRankingDetails ? (
              <p className="text-sm text-[hsl(var(--text-muted))]">
                O detalhamento do ranking ainda não está disponível neste contexto.
              </p>
            ) : null}
          </div>
        ) : null}

        {!loading && !error && !rankingEntry ? (
          <EmptyTab
            title="O detalhamento do ranking ainda não está disponível neste contexto."
            description="A vaga ativa ainda não tem uma entrada persistida de ranking para este candidato."
            compact
          />
        ) : null}
      </Section>
    </div>
  );
}

function AnalysisTab({
  overview,
  result,
  loading,
  error,
}: {
  overview: CandidateOverview;
  result: AnalysisResult | null;
  loading: boolean;
  error: string | null;
}) {
  const { startPolling, pollingStatus, pollingAnalysisId, syncAnalysisStart } = usePipeline();
  const { user } = useAuth();
  const canSpendRealTokens = Boolean(user?.real_ai_token_spend_enabled);

  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<AnalysisPipelineStatus | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);

  const { latest_analysis } = overview;
  const analysisId = latest_analysis?.analysis_id ?? null;
  const readyResumes = overview.resumes.filter(
    (resume) => resume.status === "active" && resume.extraction_status === "completed" && resume.current_version_id,
  );

  useEffect(() => {
    if (!analysisId) {
      setPipelineStatus(null);
      return;
    }
    setPipelineLoading(true);
    void analysisService
      .pipeline(analysisId)
      .then((status) => setPipelineStatus(status))
      .catch(() => setPipelineStatus(null))
      .finally(() => setPipelineLoading(false));
  }, [analysisId]);

  useEffect(() => {
    if (!pollingStatus || pollingAnalysisId !== analysisId || !analysisId) return;
    const isTerminal =
      pollingStatus.status === "completed" ||
      pollingStatus.status === "failed" ||
      pollingStatus.status === "cancelled";
    if (!isTerminal) return;
    void analysisService
      .pipeline(analysisId)
      .then((status) => setPipelineStatus(status))
      .catch(() => {});
  }, [pollingStatus, pollingAnalysisId, analysisId]);

  async function handleRequestAnalysis() {
    if (!selectedVersionId || !canSpendRealTokens || isRequesting) return;
    setIsRequesting(true);
    feedback.requestAnalysis.processing();
    try {
      const response = await analysisService.request(selectedVersionId);
      const selectedResume = readyResumes.find((resume) => resume.current_version_id === selectedVersionId);
      await syncAnalysisStart({
        candidateId: overview.candidate.id,
        analysisId: response.analysis_id,
        status: "pending",
        resumeId: selectedResume?.resume_id ?? null,
        resumeTitle: selectedResume?.title ?? null,
      });
      startPolling(response.analysis_id, overview.candidate.id, "pending");
      feedback.requestAnalysis.success();
    } catch (err) {
      feedback.requestAnalysis.error(err);
    } finally {
      setIsRequesting(false);
    }
  }

  const isCurrentlyPolling = pollingAnalysisId === analysisId;
  const effectiveStatus =
    isCurrentlyPolling && pollingStatus ? pollingStatus.status : latest_analysis?.status;
  const effectiveStartedAt =
    isCurrentlyPolling && pollingStatus ? pollingStatus.started_at : latest_analysis?.started_at;
  const effectiveCompletedAt =
    isCurrentlyPolling && pollingStatus ? pollingStatus.completed_at : latest_analysis?.completed_at;
  const effectiveFailedAt =
    isCurrentlyPolling && pollingStatus ? pollingStatus.failed_at : latest_analysis?.failed_at;
  const effectiveFailureReason =
    isCurrentlyPolling && pollingStatus?.failure_reason
      ? pollingStatus.failure_reason
      : latest_analysis?.failure_reason;
  const progressValue =
    effectiveStatus === "completed" ||
    effectiveStatus === "failed" ||
    effectiveStatus === "cancelled"
      ? 100
      : effectiveStatus === "processing"
        ? 68
        : effectiveStatus === "pending"
          ? 22
          : 0;
  const shouldShowManualStart =
    readyResumes.length > 0 &&
    (!latest_analysis || latest_analysis.status === "failed" || latest_analysis.status === "cancelled");

  return (
    <div className="flex flex-col gap-5 p-5">
      <Section title="Solicitar análise">
        {!canSpendRealTokens ? (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Consumo real bloqueado — ative <code>real_ai_token_spend_enabled</code> para analisar.
          </div>
        ) : null}

        {readyResumes.length > 0 ? (
          <div className="flex items-center gap-2">
            <select
              value={selectedVersionId}
              onChange={(event) => setSelectedVersionId(event.target.value)}
              disabled={isRequesting}
              className="ui-input h-10 flex-1 rounded-lg px-3 text-sm disabled:opacity-50"
            >
              <option value="">Selecione um currículo</option>
              {readyResumes.map((resume) => (
                <option key={resume.current_version_id} value={resume.current_version_id!}>
                  {resume.title} · v{resume.current_version}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleRequestAnalysis()}
              disabled={!selectedVersionId || !canSpendRealTokens || isRequesting}
              className="rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:opacity-40"
            >
              {isRequesting ? "Iniciando…" : "Iniciar análise da IA"}
            </button>
          </div>
        ) : (
          <EmptyTab
            title="Nenhum currículo pronto para análise"
            description='Envie um PDF na aba "Documentos" para liberar uma nova análise.'
            compact
          />
        )}

        {shouldShowManualStart ? (
          <p className="mt-2 text-[11px] text-[hsl(var(--text-muted))]">
            Se a análise não começou automaticamente após o upload, selecione o currículo e inicie manualmente.
          </p>
        ) : null}
      </Section>

      <Section title="Rastreabilidade da execução">
        {!latest_analysis ? (
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
            <p className="text-sm font-semibold text-[hsl(var(--text))]">Análise ainda não solicitada</p>
            <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
              Selecione um currículo e clique em iniciar análise.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[hsl(var(--text))]">
                  {effectiveStatus === "processing"
                    ? "Análise em processamento"
                    : effectiveStatus === "completed"
                      ? "Análise concluída"
                      : effectiveStatus === "failed"
                        ? "Análise falhou"
                        : effectiveStatus === "cancelled"
                          ? "Análise cancelada"
                          : "Análise na fila"}
                </p>
                <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                  Última execução vinculada ao currículo {latest_analysis.resume_title}.
                </p>
              </div>
              <span
                className={[
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                  effectiveStatus === "completed"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : effectiveStatus === "failed" || effectiveStatus === "cancelled"
                      ? "bg-red-50 text-red-700 ring-red-200"
                      : "bg-amber-50 text-amber-700 ring-amber-200",
                ].join(" ")}
              >
                {ANALYSIS_STATUS_LABEL[effectiveStatus ?? ""] ?? effectiveStatus}
              </span>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--border))]">
              <div
                className={[
                  "h-full rounded-full transition-all duration-500",
                  effectiveStatus === "failed" || effectiveStatus === "cancelled"
                    ? "bg-[hsl(var(--danger))]"
                    : "bg-[hsl(var(--primary))]",
                ].join(" ")}
                style={{ width: `${progressValue}%` }}
              />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <MetaItem label="Solicitada em" value={formatOptionalDateTime(latest_analysis.created_at)} />
              <MetaItem label="Iniciada em" value={formatOptionalDateTime(effectiveStartedAt)} />
              <MetaItem label="Concluída em" value={formatOptionalDateTime(effectiveCompletedAt)} />
              <MetaItem label="Falhou em" value={formatOptionalDateTime(effectiveFailedAt)} />
              <MetaItem
                label="Usou IA real"
                value={
                  latest_analysis.used_real_ai == null
                    ? "Ainda não disponível"
                    : latest_analysis.used_real_ai
                      ? "Sim"
                      : "Fallback / sem tokens reais"
                }
              />
              <MetaItem label="Worker" value={latest_analysis.worker_id ?? "Não informado"} />
            </div>

            {effectiveFailureReason ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                  Erro da análise
                </p>
                <p className="mt-1 text-xs text-red-800">{effectiveFailureReason}</p>
              </div>
            ) : null}
          </div>
        )}
      </Section>

      {pipelineLoading ? (
        <Section title="Processamento">
          <LoadingSkeleton />
        </Section>
      ) : null}

      {pipelineStatus ? (
        <Section title="Processamento">
          <div className="grid gap-2 sm:grid-cols-3">
            <MetaItem label="Matching" value={pipelineStatus.matching_status} />
            <MetaItem label="Vagas analisadas" value={String(pipelineStatus.published_jobs_total)} />
            <MetaItem label="Matches recentes" value={String(pipelineStatus.matched_jobs_count)} />
          </div>
        </Section>
      ) : null}

      {latest_analysis?.status === "completed" ? (
        <>
          {loading ? (
            <Section title="Leitura do currículo">
              <LoadingSkeleton />
            </Section>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {result ? (
            <>
              <Section title="Resumo">
                <p className="text-sm leading-relaxed text-[hsl(var(--text))]">
                  {result.candidate_summary ?? "A IA ainda não gerou um resumo para este currículo."}
                </p>
              </Section>

              <Section title="Leitura do currículo">
                <div className="grid gap-2 sm:grid-cols-3">
                  <MetaItem
                    label="Senioridade"
                    value={result.seniority_level ?? latest_analysis.seniority_level ?? "Não identificada"}
                  />
                  <MetaItem
                    label="Experiência total"
                    value={
                      result.total_experience_years != null
                        ? `${result.total_experience_years} ano(s)`
                        : latest_analysis.total_experience_years != null
                          ? `${latest_analysis.total_experience_years} ano(s)`
                          : "Não identificada"
                    }
                  />
                  <MetaItem label="Currículo" value={result.resume_title ?? latest_analysis.resume_title ?? "—"} />
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                    Skills
                  </p>
                  {result.keywords.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {result.keywords.map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-2.5 py-1 text-[11px] text-[hsl(var(--text-muted))]"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
                      A IA ainda não listou skills identificadas neste currículo.
                    </p>
                  )}
                </div>
              </Section>

              <Section title="Pontos fortes">
                {result.strengths.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {result.strengths.map((item) => (
                      <li key={item} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2 text-sm text-[hsl(var(--text))]">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyTab
                    title="Nenhum ponto forte retornado"
                    description="A IA concluiu a análise, mas não listou pontos fortes nesta execução."
                    compact
                  />
                )}
              </Section>

              <Section title="Pontos fracos">
                {result.weaknesses.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {result.weaknesses.map((item) => (
                      <li key={item} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2 text-sm text-[hsl(var(--text))]">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyTab
                    title="Nenhum ponto fraco retornado"
                    description="A IA concluiu a análise, mas não listou pontos fracos nesta execução."
                    compact
                  />
                )}
              </Section>

              {result.recommendations.length > 0 ? (
                <Section title="Observações da IA">
                  <ul className="flex flex-col gap-2">
                    {result.recommendations.map((item) => (
                      <li key={item} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2 text-sm text-[hsl(var(--text))]">
                        {item}
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function DocumentsTab({ overview }: { overview: CandidateOverview }) {
  const {
    refreshCandidateOverview,
    startPolling,
    pollingAnalysisId,
    switchPanelTab,
    syncAnalysisStart,
    notifyCandidatesChanged,
  } = usePipeline();
  const { user } = useAuth();
  const canSpendRealTokens = Boolean(user?.real_ai_token_spend_enabled);
  const { resumes, latest_analysis } = overview;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [editingResumeId, setEditingResumeId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [analyzingResumeId, setAnalyzingResumeId] = useState<string | null>(null);

  useEffect(() => {
    if (pollingAnalysisId === null) setAnalyzingResumeId(null);
  }, [pollingAnalysisId]);

  function clearFile() {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileSelect(file: File | null) {
    if (!file) {
      clearFile();
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.warning("Selecione um arquivo com extensão .pdf");
      clearFile();
      return;
    }
    if (file.size > MAX_PDF_UPLOAD_BYTES) {
      toast.warning("Arquivo PDF excede o limite de 10 MB");
      clearFile();
      return;
    }
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) return;
    if (!overview.candidate.id) {
      toast.error("Não foi possível enviar o currículo. Abra o candidato novamente e tente outra vez.");
      return;
    }
    setUploadLoading(true);
    feedback.uploadResume.processing();
    try {
      const payload = await resumeService.initiateUpload(overview.candidate.id);
      const uploaded = await resumeService.uploadPdf(payload.resume_id, selectedFile);
      clearFile();
      await refreshCandidateOverview();
      switchPanelTab("analysis");
      feedback.uploadResume.success();
      if (uploaded.analysis_auto_requested && uploaded.analysis_id) {
        await syncAnalysisStart({
          candidateId: overview.candidate.id,
          analysisId: uploaded.analysis_id,
          status: uploaded.analysis_status ?? "pending",
          resumeId: uploaded.resume_id,
          resumeTitle: selectedFile.name,
        });
        startPolling(uploaded.analysis_id, overview.candidate.id, uploaded.analysis_status ?? "pending");
      } else {
        notifyCandidatesChanged();
      }
    } catch (err) {
      feedback.uploadResume.error(err);
    } finally {
      setUploadLoading(false);
    }
  }

  async function handleEditSave() {
    if (!editingResumeId || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      await resumeService.update(editingResumeId, { title: editTitle.trim() });
      toast.success("Título atualizado");
      setEditingResumeId(null);
      await refreshCandidateOverview();
      notifyCandidatesChanged();
    } catch (err) {
      toast.error(
        formatContextError(
          err,
          "Não foi possível atualizar o título do currículo.",
          "Tente novamente.",
        ),
      );
    } finally {
      setEditSaving(false);
    }
  }

  async function handleToggleStatus(resumeId: string, currentStatus: string) {
    try {
      if (currentStatus === "active") {
        await resumeService.archive(resumeId);
        toast.success("Currículo arquivado");
      } else {
        await resumeService.activate(resumeId);
        toast.success("Currículo reativado");
      }
      await refreshCandidateOverview();
      notifyCandidatesChanged();
    } catch (err) {
      toast.error(
        formatContextError(
          err,
          "Não foi possível alterar o status do currículo.",
          "Tente novamente.",
        ),
      );
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    setDeletingId(confirmDeleteId);
    setConfirmDeleteId(null);
    try {
      await resumeService.delete(confirmDeleteId);
      toast.success("Currículo excluído");
      await refreshCandidateOverview();
      notifyCandidatesChanged();
    } catch (err) {
      toast.error(
        formatContextError(
          err,
          "Não foi possível excluir o currículo.",
          "Tente novamente.",
        ),
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAnalyze(resumeId: string, versionId: string) {
    if (!canSpendRealTokens) {
      toast.warning("Consumo real bloqueado — ative real_ai_token_spend_enabled para analisar.");
      return;
    }
    setAnalyzingResumeId(resumeId);
    feedback.requestAnalysis.processing();
    try {
      const response = await analysisService.request(versionId);
      const resume = resumes.find((item) => item.resume_id === resumeId);
      await syncAnalysisStart({
        candidateId: overview.candidate.id,
        analysisId: response.analysis_id,
        status: "pending",
        resumeId,
        resumeTitle: resume?.title ?? null,
      });
      startPolling(response.analysis_id, overview.candidate.id, "pending");
      feedback.requestAnalysis.success();
    } catch (err) {
      feedback.requestAnalysis.error(err);
      setAnalyzingResumeId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <Section title="Fluxo currículo → análise IA">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusCard
            label="Última análise"
            title={
              latest_analysis
                ? ANALYSIS_STATUS_LABEL[latest_analysis.status] ?? latest_analysis.status
                : "Ainda não solicitada"
            }
            description={
              latest_analysis
                ? `Currículo: ${latest_analysis.resume_title}`
                : "Envie um currículo para iniciar o fluxo de análise."
            }
          />
          <StatusCard
            label="Processamento do currículo"
            title={resumes[0]?.extraction_status ? EXTRACTION_STATUS_LABEL[resumes[0].extraction_status] ?? resumes[0].extraction_status : "Sem currículo"}
            description="Upload, extração do PDF e disponibilidade para análise."
          />
        </div>
      </Section>

      {!canSpendRealTokens ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Consumo real bloqueado — ative <code>real_ai_token_spend_enabled</code> para analisar currículos.
        </div>
      ) : null}

      <Section title="Enviar currículo">
        <input
          type="file"
          accept="application/pdf,.pdf"
          ref={fileInputRef}
          disabled={uploadLoading}
          onChange={(event) => handleFileSelect(event.target.files?.[0] ?? null)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!uploadLoading) setIsDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploadLoading) setIsDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragActive(false);
            if (uploadLoading) return;
            handleFileSelect(event.dataTransfer.files?.[0] ?? null);
          }}
          disabled={uploadLoading}
          className={[
            "flex w-full flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-6 text-center transition",
            isDragActive
              ? "border-[hsl(var(--primary))] bg-[hsl(var(--accent-soft))]"
              : "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] hover:border-[hsl(var(--primary))]/45 hover:bg-[hsl(var(--accent-soft))]/60",
            uploadLoading ? "cursor-wait opacity-70" : "cursor-pointer",
          ].join(" ")}
        >
          <span className="rounded-full bg-[hsl(var(--surface))] px-3 py-1 text-xs font-semibold text-[hsl(var(--primary))] shadow-sm">
            PDF do currículo
          </span>
          <span className="mt-3 text-sm font-semibold text-[hsl(var(--text))]">
            Envie o currículo para iniciar a análise da IA
          </span>
          <span className="mt-1 text-xs text-[hsl(var(--text-muted))]">
            Clique para selecionar ou arraste o PDF para esta área
          </span>
        </button>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={uploadLoading || !selectedFile}
            className="rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:opacity-40"
          >
            {uploadLoading ? "Enviando currículo…" : "Enviar currículo"}
          </button>
          {selectedFile ? (
            <button
              type="button"
              onClick={clearFile}
              disabled={uploadLoading}
              className="ui-btn-secondary rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-40"
            >
              Remover arquivo
            </button>
          ) : null}
        </div>

        {selectedFile ? (
          <p className="mt-2 text-[11px] text-[hsl(var(--text-muted))]">
            {selectedFile.name} ({Math.ceil(selectedFile.size / 1024)} KB)
          </p>
        ) : null}
      </Section>

      <Section title="Documentos de admissão">
        <EmptyTab
          title="Documentos de admissão ainda não disponíveis"
          description="Este espaço será preenchido quando houver documentos de admissão no payload atual."
          compact
        />
      </Section>

      {resumes.length === 0 ? (
        <EmptyTab
          title="Ainda não há currículos enviados"
          description="Envie o currículo para iniciar a análise da IA."
        />
      ) : (
        <Section title="Currículos">
          <div className="flex flex-col gap-3">
            {resumes.map((resume) => {
              const isEditing = editingResumeId === resume.resume_id;
              const isDeleting = deletingId === resume.resume_id;
              const isAnalyzing = analyzingResumeId === resume.resume_id;
              const canAnalyze =
                Boolean(resume.current_version_id) && resume.extraction_status === "completed";

              return (
                <div
                  key={resume.resume_id}
                  className={[
                    "rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3 transition-opacity",
                    isDeleting ? "opacity-40" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={editTitle}
                            onChange={(event) => setEditTitle(event.target.value)}
                            className="ui-input h-8 flex-1 rounded-lg px-3 text-sm"
                            autoFocus
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void handleEditSave();
                              if (event.key === "Escape") setEditingResumeId(null);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => void handleEditSave()}
                            disabled={editSaving || !editTitle.trim()}
                            className="rounded-lg bg-[hsl(var(--primary))] px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
                          >
                            {editSaving ? "…" : "OK"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingResumeId(null)}
                            className="text-[11px] text-[hsl(var(--text-muted))]"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <p className="truncate text-sm font-semibold text-[hsl(var(--text))]">{resume.title}</p>
                      )}

                      {resume.current_file_name ? (
                        <p className="mt-0.5 truncate text-[11px] text-[hsl(var(--text-muted))]">
                          {resume.current_file_name}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                          resume.status === "active"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-gray-100 text-gray-500 ring-gray-200",
                        ].join(" ")}
                      >
                        {resume.status === "active" ? "Ativo" : "Arquivado"}
                      </span>
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                          resume.extraction_status === "completed"
                            ? "bg-blue-50 text-blue-700 ring-blue-200"
                            : resume.extraction_status === "failed"
                              ? "bg-red-50 text-red-700 ring-red-200"
                              : "bg-gray-50 text-gray-500 ring-gray-200",
                        ].join(" ")}
                      >
                        {EXTRACTION_STATUS_LABEL[resume.extraction_status ?? ""] ??
                          (resume.extraction_status ?? "—")}
                      </span>
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-[hsl(var(--text-muted))]">
                    <span>v{resume.current_version}</span>
                    <span>{new Date(resume.updated_at).toLocaleDateString("pt-BR")}</span>
                  </div>

                  {!isEditing ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingResumeId(resume.resume_id);
                          setEditTitle(resume.title);
                        }}
                        className="rounded-lg border border-[hsl(var(--border))] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface))]"
                      >
                        Editar título
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(resume.resume_id, resume.status)}
                        className="rounded-lg border border-[hsl(var(--border))] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface))]"
                      >
                        {resume.status === "active" ? "Arquivar" : "Reativar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(resume.resume_id)}
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-50"
                      >
                        Excluir
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAnalyze(resume.resume_id, resume.current_version_id!)}
                        disabled={!canAnalyze || isAnalyzing || pollingAnalysisId !== null || !canSpendRealTokens}
                        className="rounded-lg bg-[hsl(var(--primary))] px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:opacity-40"
                      >
                        {isAnalyzing ? "Solicitando…" : "Análise manual"}
                      </button>
                    </div>
                  ) : null}

                  {!isEditing && canAnalyze ? (
                    <p className="mt-2 text-[11px] text-[hsl(var(--text-muted))]">
                      Atalho manual. O acompanhamento da execução fica na aba Análise IA.
                    </p>
                  ) : null}

                  {confirmDeleteId === resume.resume_id ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <p className="text-xs text-red-700">Confirmar exclusão deste currículo?</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleDelete()}
                          className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-red-700"
                        >
                          Excluir
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg border border-[hsl(var(--border))] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface))]"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

function HistoryTab({
  overview,
  activeJobId,
  cacheRef,
}: {
  overview: CandidateOverview;
  activeJobId: string | null;
  cacheRef: MutableRefObject<Map<string, CandidatePipelineHistory>>;
}) {
  const [history, setHistory] = useState<CandidatePipelineHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const currentEntry = useMemo(
    () =>
      activeJobId
        ? overview.pipeline_entries.find((entry) => entry.job_id === activeJobId) ?? null
        : null,
    [activeJobId, overview.pipeline_entries],
  );

  useEffect(() => {
    if (!activeJobId) {
      setHistory(null);
      setHistoryError(null);
      setHistoryLoading(false);
      return;
    }

    let cancelled = false;
    const cacheKey = `${overview.candidate.id}:${activeJobId}:${currentEntry?.updated_at ?? "none"}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setHistory(cached);
      setHistoryError(null);
      setHistoryLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setHistoryLoading(true);
    setHistoryError(null);

    void pipelineService
      .getCandidateHistory(activeJobId, overview.candidate.id)
      .then((result) => {
        if (cancelled) return;
        cacheRef.current.set(cacheKey, result);
        setHistory(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHistory(null);
        setHistoryError(
          formatContextError(
            err,
            "Não foi possível carregar o histórico deste candidato.",
            "Tente novamente.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeJobId, overview.candidate.id, currentEntry?.updated_at, cacheRef]);

  if (!activeJobId) {
    return (
      <EmptyTab
        title="Selecione uma vaga para ver o histórico"
        description="Abra este candidato a partir do pipeline para acompanhar as movimentações reais."
      />
    );
  }

  if (historyLoading) {
    return (
      <div className="p-5">
        <LoadingSkeleton />
      </div>
    );
  }

  if (historyError) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {historyError}
        </div>
        {currentEntry ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Estado atual nesta vaga
            </p>
            <p className="mt-1 text-sm text-amber-900">
              {STAGE_LABEL[currentEntry.stage] ?? currentEntry.stage} · {currentEntry.candidate_status}
            </p>
            <p className="mt-1 text-[11px] text-amber-800">
              Este bloco é apenas um fallback de estado atual. O histórico real não pôde ser carregado.
            </p>
          </div>
        ) : (
          <p className="text-xs text-[hsl(var(--text-muted))]">
            O candidato não possui estado atual visível nesta vaga.
          </p>
        )}
      </div>
    );
  }

  if (!history) {
    return (
      <EmptyTab
        title="Ainda não há histórico para esta vaga"
        description="Movimente o candidato no pipeline para gerar as primeiras entradas."
      />
    );
  }

  if (history.transitions.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <EmptyTab
          title="Ainda não há movimentações registradas"
          description="Movimente o candidato no pipeline para gerar o histórico desta vaga."
        />
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Estado atual
          </p>
          <p className="mt-1 text-sm text-[hsl(var(--text))]">
            {STAGE_LABEL[history.current_stage] ?? history.current_stage}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Histórico real do pipeline
        </p>
        <p className="mt-1 text-[11px] text-blue-900">
          Eventos registrados de movimentação para {history.job_title}.
        </p>
      </div>

      {history.transitions.map((transition) => (
        <div
          key={transition.id}
          className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[hsl(var(--text))]">
                {transition.from_stage
                  ? `${STAGE_LABEL[transition.from_stage] ?? transition.from_stage} → ${STAGE_LABEL[transition.to_stage] ?? transition.to_stage}`
                  : `Entrada em ${STAGE_LABEL[transition.to_stage] ?? transition.to_stage}`}
              </p>
              <p className="mt-1 text-[11px] text-[hsl(var(--text-muted))]">
                {TRIGGER_LABEL[transition.trigger]}
              </p>
              {transition.moved_by_name ? (
                <p className="mt-1 text-[11px] text-[hsl(var(--text-muted))]">
                  Por {transition.moved_by_name}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 text-[11px] text-[hsl(var(--text-muted))]">
              {formatDateTime(transition.moved_at)}
            </p>
          </div>

          {transition.reason ? (
            <p className="mt-3 text-xs text-[hsl(var(--text))]">
              <span className="font-semibold">Motivo:</span> {transition.reason}
            </p>
          ) : null}

          {transition.notes ? (
            <p className="mt-2 text-xs text-[hsl(var(--text-muted))]">
              <span className="font-semibold text-[hsl(var(--text))]">Notas:</span> {transition.notes}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ActionsTab({
  overview,
  activeJob,
  activeJobId,
  currentStage,
  availableJobs,
  canTransferCurrentJob,
  stageSaving,
  linkSaving,
  onStageChange,
  onLinkToActiveJob,
  onOpenAddJob,
  onOpenTransferJob,
}: {
  overview: CandidateOverview;
  activeJob: Job | null;
  activeJobId: string | null;
  currentStage: PipelineStage | null;
  availableJobs: Job[];
  canTransferCurrentJob: boolean;
  stageSaving: boolean;
  linkSaving: boolean;
  onStageChange: (stage: PipelineStage) => Promise<void>;
  onLinkToActiveJob: () => Promise<void>;
  onOpenAddJob: () => void;
  onOpenTransferJob: () => void;
}) {
  const activeEntry = activeJobId
    ? overview.pipeline_entries.find((entry) => entry.job_id === activeJobId) ?? null
    : null;
  const [selectedStage, setSelectedStage] = useState<PipelineStage>("entry");
  const [confirmStage, setConfirmStage] = useState<PipelineStage | null>(null);

  useEffect(() => {
    setSelectedStage(currentStage ?? "entry");
    setConfirmStage(null);
  }, [currentStage, activeJobId]);

  async function submitStage(stage: PipelineStage) {
    await onStageChange(stage);
    setConfirmStage(null);
  }

  if (!activeJobId || !activeJob) {
    return (
      <EmptyTab
        title="Selecione uma vaga para ver as ações"
        description="Abra o candidato com uma vaga ativa para mover etapa, adicionar a outra vaga ou transferir contexto."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      {!activeEntry ? (
        <Section title="Vínculo com a vaga ativa">
          <div className="rounded-xl border border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))] px-4 py-3">
            <p className="text-sm font-semibold text-[hsl(var(--text))]">
              Candidato criado, aguardando vínculo com a vaga
            </p>
            <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
              Ele ainda não aparece neste pipeline. Vincule novamente para recuperar o fluxo.
            </p>
            <button
              type="button"
              onClick={() => void onLinkToActiveJob()}
              disabled={linkSaving}
              className="mt-3 rounded-lg border border-[hsl(var(--warning))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--warning))] transition hover:bg-[hsl(var(--warning-soft))] disabled:opacity-50"
            >
              {linkSaving ? "Vinculando…" : "Adicionar a esta vaga"}
            </button>
          </div>
        </Section>
      ) : null}

      <Section title="Mover etapa">
        {activeEntry ? (
          <>
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[hsl(var(--text))]">{activeJob.title}</p>
                  <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                    {STAGE_LABEL[activeEntry.stage] ?? activeEntry.stage} · {activeEntry.candidate_status}
                  </p>
                </div>
                <StatusPill label={formatJobStatus(activeJob.status)} tone={jobStatusTone(activeJob.status)} />
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              <div className="flex gap-2">
                <select
                  value={selectedStage}
                  onChange={(event) => {
                    const nextStage = event.target.value as PipelineStage;
                    setSelectedStage(nextStage);
                    setConfirmStage(null);
                  }}
                  disabled={stageSaving}
                  className="ui-input h-10 flex-1 rounded-lg px-3 text-sm disabled:opacity-50"
                >
                  {STAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={stageSaving || selectedStage === currentStage}
                  onClick={() => {
                    if (DANGEROUS_STAGES.includes(selectedStage)) {
                      setConfirmStage(selectedStage);
                      return;
                    }
                    void submitStage(selectedStage);
                  }}
                  className="rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:opacity-40"
                >
                  {stageSaving ? "Salvando…" : "Salvar etapa"}
                </button>
              </div>

              {confirmStage ? (
                <DangerZone
                  title={confirmStage === "rejected" ? "Confirmar reprovação" : "Confirmar contratação"}
                  description={
                    confirmStage === "rejected"
                      ? "Esta ação move o candidato para Reprovado na vaga ativa."
                      : "Esta ação move o candidato para Contratado na vaga ativa."
                  }
                  confirmLabel={confirmStage === "rejected" ? "Confirmar reprovação" : "Confirmar contratação"}
                  loading={stageSaving}
                  onConfirm={() => void submitStage(confirmStage)}
                  onCancel={() => setConfirmStage(null)}
                />
              ) : null}
            </div>
          </>
        ) : (
          <EmptyTab
            title="O candidato ainda não está vinculado à vaga ativa"
            description="Vincule o candidato primeiro para liberar movimentações de etapa."
            compact
          />
        )}
      </Section>

      <Section title="Ações rápidas">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!activeEntry || currentStage === "rejected" || stageSaving}
            onClick={() => setConfirmStage("rejected")}
            className="rounded-xl border border-[hsl(var(--danger))]/25 bg-[hsl(var(--danger-soft))] px-4 py-3 text-left transition disabled:opacity-50"
          >
            <p className="text-sm font-semibold text-[hsl(var(--text))]">Reprovar candidato</p>
            <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
              Move o candidato para a etapa Reprovado com confirmação.
            </p>
          </button>

          <button
            type="button"
            disabled={!activeEntry || currentStage === "hired" || stageSaving}
            onClick={() => setConfirmStage("hired")}
            className="rounded-xl border border-[hsl(var(--success))]/25 bg-[hsl(var(--success-soft))] px-4 py-3 text-left transition disabled:opacity-50"
          >
            <p className="text-sm font-semibold text-[hsl(var(--text))]">Marcar contratado</p>
            <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
              Move o candidato para a etapa Contratado com confirmação.
            </p>
          </button>
        </div>
      </Section>

      <Section title="Gestão de vaga">
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onOpenAddJob}
            disabled={availableJobs.length === 0}
            className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3 text-left transition hover:border-[hsl(var(--primary))]/35 hover:bg-[hsl(var(--accent-soft))] disabled:opacity-50"
          >
            <p className="text-sm font-semibold text-[hsl(var(--text))]">Adicionar a outra vaga</p>
            <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
              Mantém o candidato na vaga atual e cria um novo vínculo com outra vaga.
            </p>
          </button>

          {canTransferCurrentJob ? (
            <button
              type="button"
              onClick={onOpenTransferJob}
              disabled={availableJobs.length === 0}
              className="rounded-xl border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning-soft))] px-4 py-3 text-left transition hover:border-[hsl(var(--warning))] disabled:opacity-50"
            >
              <p className="text-sm font-semibold text-[hsl(var(--text))]">Transferir/corrigir vaga</p>
              <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                Remove o candidato do pipeline atual e cria o vínculo na vaga destino.
              </p>
              <p className="mt-2 text-[11px] font-medium text-[hsl(var(--warning))]">
                Aviso de impacto: o vínculo atual será desativado na vaga ativa.
              </p>
            </button>
          ) : (
            <div className="rounded-xl border border-[hsl(var(--warning))]/25 bg-[hsl(var(--warning-soft))] px-4 py-3">
              <p className="text-sm font-semibold text-[hsl(var(--text))]">Transferência bloqueada</p>
              <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                Este candidato já avançou no processo. Para preservar o histórico, adicione-o a outra vaga em vez de transferir.
              </p>
            </div>
          )}
        </div>

        {availableJobs.length === 0 ? (
          <p className="mt-3 text-xs text-[hsl(var(--text-muted))]">
            Não há outras vagas disponíveis para esta ação.
          </p>
        ) : null}
      </Section>
    </div>
  );
}

function AddToJobModal({
  isOpen,
  candidateId,
  availableJobs,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  candidateId: string | null;
  availableJobs: Job[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [jobId, setJobId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setJobId(availableJobs[0]?.id ?? "");
    setSaving(false);
    setError(null);
  }, [isOpen, availableJobs]);

  if (!isOpen) return null;

  async function handleSubmit() {
    if (!candidateId || !jobId) return;
    setSaving(true);
    setError(null);
    try {
      await pipelineService.addCandidateToJob(candidateId, { job_id: jobId, initial_stage: "entry" });
      toast.success("Candidato adicionado a outra vaga");
      await onSuccess();
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível adicionar o candidato à vaga selecionada.",
          "Tente novamente.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="ui-card fixed left-1/2 top-1/2 z-[70] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[hsl(var(--text))]">Adicionar a outra vaga</h2>
            <p className="ui-text-muted mt-0.5 text-sm">
              O candidato permanecerá na vaga atual e será incluído na vaga destino em triagem inicial.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))] disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[hsl(var(--text))]">Vaga destino</span>
          <select
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
            disabled={saving || availableJobs.length === 0}
            className="ui-input h-10 rounded-lg px-3 text-sm disabled:opacity-50"
          >
            {availableJobs.length === 0 ? (
              <option value="">Nenhuma vaga disponível</option>
            ) : (
              availableJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))
            )}
          </select>
        </label>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || !jobId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? "Adicionando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </>
  );
}

function TransferJobModal({
  isOpen,
  candidateId,
  fromJobId,
  availableJobs,
  canTransfer,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  candidateId: string | null;
  fromJobId: string | null;
  availableJobs: Job[];
  canTransfer: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [jobId, setJobId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setJobId(availableJobs[0]?.id ?? "");
    setReason("");
    setSaving(false);
    setError(null);
  }, [isOpen, availableJobs]);

  if (!isOpen) return null;

  async function handleSubmit() {
    if (!candidateId || !fromJobId || !jobId) return;
    if (!reason.trim()) {
      setError("Informe o motivo da transferência.");
      return;
    }
    if (!canTransfer) {
      setError("Este candidato já avançou no processo. Para preservar o histórico, adicione-o a outra vaga em vez de transferir.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await pipelineService.transferCandidateJob(candidateId, {
        from_job_id: fromJobId,
        to_job_id: jobId,
        reason: reason.trim(),
      });
      toast.success("Candidato transferido para outra vaga");
      await onSuccess();
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível transferir o candidato para a vaga selecionada.",
          "Tente novamente.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="ui-card fixed left-1/2 top-1/2 z-[70] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[hsl(var(--text))]">Transferir/corrigir vaga</h2>
            <p className="ui-text-muted mt-0.5 text-sm">
              O vínculo atual será desativado e o candidato entrará em <code>entry</code> na vaga destino.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))] disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning-soft))] px-4 py-3">
          <p className="text-sm font-semibold text-[hsl(var(--text))]">Aviso de impacto</p>
          <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
            Esta ação retira o candidato do pipeline atual. Use apenas para corrigir o contexto da vaga.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Vaga destino</span>
            <select
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
              disabled={saving || availableJobs.length === 0}
              className="ui-input h-10 rounded-lg px-3 text-sm disabled:opacity-50"
            >
              {availableJobs.length === 0 ? (
                <option value="">Nenhuma vaga disponível</option>
              ) : (
                availableJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Motivo da transferência</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              disabled={saving}
              placeholder="Explique o impacto desta correção de vaga."
              className="ui-input rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || !jobId || !reason.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? "Transferindo…" : "Confirmar"}
          </button>
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-[hsl(var(--text))]">{title}</h3>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatusCard({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[hsl(var(--text))]">{title}</p>
      <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">{description}</p>
    </div>
  );
}

function DecisionCard({
  label,
  value,
  description,
  valueClassName,
}: {
  label: string;
  value: string;
  description: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
        {label}
      </p>
      <p className={["mt-1 text-lg font-extrabold tabular-nums text-[hsl(var(--text))]", valueClassName ?? ""].join(" ")}>
        {value}
      </p>
      <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">{description}</p>
    </div>
  );
}

function BreakdownItem({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2">
      <span className="text-xs text-[hsl(var(--text-muted))]">{label}</span>
      <span className={["text-xs font-semibold tabular-nums", scoreColorClass(value)].join(" ")}>
        {fmtScore(value)}
      </span>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
        {label}
      </div>
      <div className="mt-1 text-sm text-[hsl(var(--text))]">{value}</div>
    </div>
  );
}

function DangerZone({
  title,
  description,
  confirmLabel,
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <p className="text-sm font-semibold text-red-700">{title}</p>
      <p className="mt-1 text-xs text-red-700">{description}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-40"
        >
          {loading ? "Salvando…" : confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function EmptyTab({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-center",
        compact ? "px-4 py-4" : "mx-5 my-5 px-5 py-8",
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-[hsl(var(--text))]">{title}</p>
      <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">{description}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]"
        />
      ))}
    </div>
  );
}
