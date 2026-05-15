import { AlertTriangle, CheckCircle2, Clock3, FileText, Link2, LoaderCircle } from "lucide-react";

import { getCandidateAnalysisUiState } from "../../utils/analysisStatus";
import { formatScorePercent } from "../../utils/scoreFormatting";

type SeverityTone = "neutral" | "info" | "success" | "danger" | "warning";

const SEVERITY_CLASS: Record<SeverityTone, string> = {
  neutral: "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/45 text-[hsl(var(--text))]",
  info: "border-sky-200 bg-sky-50/80 text-sky-950",
  success: "border-emerald-200 bg-emerald-50/90 text-emerald-950",
  danger: "border-rose-200 bg-rose-50/85 text-rose-950",
  warning: "border-amber-200 bg-amber-50/85 text-amber-950",
};

function getStatusIcon(state: ReturnType<typeof getCandidateAnalysisUiState>["state"]) {
  if (state === "no_resume") return FileText;
  if (state === "waiting_job") return Link2;
  if (state === "processing") return LoaderCircle;
  if (state === "completed") return CheckCircle2;
  if (state === "failed") return AlertTriangle;
  return Clock3;
}

interface CandidateAnalysisStatusCardProps {
  hasResume: boolean;
  activeJobId: string | null;
  analysisStatus: string | null | undefined;
  jobFitScore: number | null | undefined;
  scoreLabel?: string;
  aiStatus: string | null | undefined;
  errorMessage?: string | null;
  pollingAnalysisId?: string | null;
  highlights?: string[];
  onPrimaryAction?: () => void;
  compact?: boolean;
  extractionStatus?: string | null | undefined;
}

export function CandidateAnalysisStatusCard({
  hasResume,
  activeJobId,
  analysisStatus,
  jobFitScore,
  scoreLabel = "Aderência à vaga",
  aiStatus,
  errorMessage = null,
  pollingAnalysisId = null,
  highlights = [],
  onPrimaryAction,
  compact = false,
  extractionStatus = null,
}: CandidateAnalysisStatusCardProps) {
  const uiState = getCandidateAnalysisUiState({
    hasResume,
    activeJobId,
    analysisStatus: analysisStatus as any,
    jobFitScore,
    aiStatus,
    errorMessage,
    pollingAnalysisId,
    extractionStatus,
  });
  const Icon = getStatusIcon(uiState.state);
  const hasScore = jobFitScore !== null && jobFitScore !== undefined;
  const displayHighlights = highlights.filter(Boolean).slice(0, 3);

  if (compact && uiState.state === "completed") {
    return (
      <section className="px-5 pt-4">
        <div className={`rounded-xl border px-3 py-2.5 shadow-sm ${SEVERITY_CLASS[uiState.severity]}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-current/10 bg-white/70">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-xs font-semibold text-current">{uiState.title}</p>
                <p className="text-[10px] text-current/70">Análise e score disponíveis abaixo</p>
              </div>
            </div>
            {displayHighlights.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {displayHighlights.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-current/10 bg-white/75 px-2.5 py-0.5 text-xs font-medium text-current"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-5 pt-4">
      <div className={`rounded-2xl border px-4 py-4 shadow-sm ${SEVERITY_CLASS[uiState.severity]}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-current/10 bg-white/70">
                <Icon className={["h-4 w-4", uiState.inProgress ? "animate-spin" : ""].join(" ")} />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-current/70">
                  Status da análise
                </p>
                <p className="text-base font-semibold text-current">{uiState.title}</p>
              </div>
            </div>

            <p className="mt-3 text-sm leading-6 text-current/80">{uiState.description}</p>

            {uiState.state === "processing" ? (
              <div className="mt-3 flex flex-col gap-2">
                <div className="h-2.5 w-full max-w-xl animate-pulse rounded-full bg-white/70" />
                <div className="h-2.5 w-3/4 max-w-lg animate-pulse rounded-full bg-white/55" />
              </div>
            ) : null}

            {uiState.state === "completed" && hasScore ? (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-current/70">
                  {scoreLabel}
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-[-0.03em] tabular-nums text-current">
                  {formatScorePercent(jobFitScore)}
                </p>
                {displayHighlights.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {displayHighlights.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-current/10 bg-white/75 px-3 py-1 text-xs font-medium text-current"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {onPrimaryAction ? (
            <div className="lg:pl-4">
              <button
                type="button"
                onClick={onPrimaryAction}
                disabled={uiState.inProgress}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-current/15 bg-white/75 px-4 text-sm font-semibold text-current transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uiState.primaryAction}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
