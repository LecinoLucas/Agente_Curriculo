import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { candidatesService } from "../../../../services/candidatesService";
import type {
  CandidateOverview,
  CandidateProcessHistory,
  CandidateProcessHistoryItem,
  PipelineStage,
} from "../../../../types/domain";
import { STAGE_LABEL } from "../../utils/profile";
import { formatDateTime } from "../profileFormatters";
import {
  DECISION_OUTCOME_LABEL,
  INTERVIEW_TYPE_LABEL,
  SIMPLE_STATUS_LABEL,
} from "../profileStatusLabels";
import { Badge, EmptyBlock, SectionCard } from "./ProfileSharedUI";

// ---------------------------------------------------------------------------
// CurrentProcessHistoryHint — exported for use in WorkflowTab (stays in page)
// ---------------------------------------------------------------------------

export function CurrentProcessHistoryHint({
  candidateId,
  jobId,
  onOpenHistory,
  className = "",
}: {
  candidateId: string | null;
  jobId: string | null;
  onOpenHistory: () => void;
  className?: string;
}) {
  const [hasPrevious, setHasPrevious] = useState(false);

  useEffect(() => {
    if (!candidateId || !jobId) {
      setHasPrevious(false);
      return;
    }
    let cancelled = false;
    void candidatesService
      .getProcessHistory(candidateId, jobId)
      .then((payload) => {
        if (cancelled) return;
        setHasPrevious(payload.processes.some((process) => !process.is_current));
      })
      .catch(() => {
        if (!cancelled) setHasPrevious(false);
      });
    return () => {
      cancelled = true;
    };
  }, [candidateId, jobId]);

  if (!hasPrevious) return null;

  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 ${className}`}
    >
      Este candidato possui processos anteriores nesta vaga.{" "}
      <button
        type="button"
        onClick={onOpenHistory}
        className="font-semibold underline underline-offset-2"
      >
        Ver histórico.
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CandidateProfileHistoryTab
// ---------------------------------------------------------------------------

interface CandidateProfileHistoryTabProps {
  overview: CandidateOverview;
  activeJobId: string | null;
  focusJobId: string | null;
}

export function CandidateProfileHistoryTab({
  overview,
  activeJobId,
  focusJobId,
}: CandidateProfileHistoryTabProps) {
  const [history, setHistory] = useState<CandidateProcessHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void candidatesService
      .getProcessHistory(overview.candidate.id)
      .then((payload) => {
        if (!cancelled) setHistory(payload);
      })
      .catch(() => {
        if (!cancelled)
          setHistory({ candidate_id: overview.candidate.id, processes: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [overview.candidate.id]);

  const processes = history?.processes ?? [];
  const current = processes.filter((process) => process.is_current);
  const previous = processes
    .filter((process) => !process.is_current)
    .sort((left, right) => {
      if (focusJobId && left.job_id === focusJobId && right.job_id !== focusJobId) return -1;
      if (focusJobId && right.job_id === focusJobId && left.job_id !== focusJobId) return 1;
      return 0;
    });

  const toggle = (pipelineId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(pipelineId)) next.delete(pipelineId);
      else next.add(pipelineId);
      return next;
    });
  };

  if (loading) {
    return <p className="text-sm text-text-muted">Carregando histórico de processos...</p>;
  }

  if (processes.length === 0) {
    return (
      <EmptyBlock
        title="Nenhum processo anterior"
        description="O histórico aparecerá quando o candidato tiver processos encerrados ou ciclos anteriores."
      />
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Processo atual">
        {current.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum processo ativo no momento.</p>
        ) : (
          <div className="space-y-3">
            {current.map((process) => (
              <ProcessHistoryCard
                key={process.pipeline_id}
                process={process}
                expanded={expanded.has(process.pipeline_id)}
                onToggle={() => toggle(process.pipeline_id)}
                activeJobId={activeJobId}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Processos anteriores">
        {previous.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum processo anterior.</p>
        ) : (
          <div className="space-y-3">
            {previous.map((process) => (
              <ProcessHistoryCard
                key={process.pipeline_id}
                process={process}
                expanded={expanded.has(process.pipeline_id)}
                onToggle={() => toggle(process.pipeline_id)}
                activeJobId={activeJobId}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers — not exported
// ---------------------------------------------------------------------------

function ProcessHistoryCard({
  process,
  expanded,
  onToggle,
  activeJobId,
}: {
  process: CandidateProcessHistoryItem;
  expanded: boolean;
  onToggle: () => void;
  activeJobId: string | null;
}) {
  const closedAt = process.closed_at ? formatDateTime(process.closed_at) : null;
  const startedAt = process.started_at ? formatDateTime(process.started_at) : null;
  const title = process.is_current
    ? `Processo atual - ${process.job_title}`
    : `Processo anterior encerrado${closedAt ? ` em ${closedAt}` : ""}`;
  const sameActiveJob = activeJobId && process.job_id === activeJobId;

  return (
    <article
      className={[
        "rounded-xl border bg-[hsl(var(--bg))] p-4",
        process.is_current
          ? "border-[hsl(var(--primary)/0.35)]"
          : sameActiveJob
            ? "border-amber-200"
            : "border-[hsl(var(--border)/0.7)]",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-text">{title}</h3>
            <Badge tone={process.is_current ? "success" : "neutral"}>
              {process.is_current ? "Atual" : "Histórico"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            {process.job_title} · Resultado: {process.result_label} · Última etapa:{" "}
            {STAGE_LABEL[process.current_or_final_stage as PipelineStage] ??
              process.current_or_final_stage}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {startedAt ? `Iniciado em ${startedAt}` : "Início não informado"}
            {process.events_count ? ` · ${process.events_count} evento(s)` : ""}
          </p>
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 transition ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <div className="mt-4 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
        <HistorySummaryLine
          label="Entrevistas"
          value={
            process.interviews.length
              ? `${process.interviews.length} registrada(s)`
              : "nenhuma"
          }
        />
        <HistorySummaryLine
          label="Scorecard"
          value={
            process.scorecards.some((item) => item.status === "submitted")
              ? "enviado"
              : "não enviado"
          }
        />
        <HistorySummaryLine
          label="Avaliação comportamental"
          value={
            process.behavioral_assessment
              ? (SIMPLE_STATUS_LABEL[process.behavioral_assessment.status] ??
                process.behavioral_assessment.status)
              : "nenhuma"
          }
        />
        <HistorySummaryLine
          label="Decisão"
          value={
            process.hiring_decision
              ? (DECISION_OUTCOME_LABEL[process.hiring_decision.outcome] ??
                process.hiring_decision.outcome)
              : "nenhuma"
          }
        />
      </div>

      {process.closure_reason ? (
        <p className="mt-3 rounded-lg border border-[hsl(var(--border)/0.6)] bg-surface px-3 py-2 text-sm text-text-muted">
          Motivo: {process.closure_reason}
        </p>
      ) : null}

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-[hsl(var(--border)/0.7)] pt-4">
          <HistoryDetailList
            title="Entrevistas"
            empty="Nenhuma entrevista registrada neste processo."
            items={process.interviews.map((interview) => ({
              id: interview.id,
              primary: `${INTERVIEW_TYPE_LABEL[interview.type] ?? interview.type}: ${SIMPLE_STATUS_LABEL[interview.status] ?? interview.status}`,
              secondary: [
                interview.scheduled_at ? formatDateTime(interview.scheduled_at) : null,
                interview.scorecard_status
                  ? `Scorecard: ${SIMPLE_STATUS_LABEL[interview.scorecard_status] ?? interview.scorecard_status}`
                  : null,
                interview.final_recommendation
                  ? `Recomendação: ${interview.final_recommendation}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
          <HistoryDetailList
            title="Scorecards"
            empty="Nenhum scorecard registrado neste processo."
            items={process.scorecards.map((scorecard) => ({
              id: scorecard.id,
              primary: `Scorecard: ${SIMPLE_STATUS_LABEL[scorecard.status] ?? scorecard.status}`,
              secondary: [
                scorecard.submitted_at
                  ? `Enviado em ${formatDateTime(scorecard.submitted_at)}`
                  : null,
                scorecard.final_recommendation
                  ? `Recomendação: ${scorecard.final_recommendation}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
          <HistoryDetailList
            title="Avaliação comportamental"
            empty="Nenhuma avaliação comportamental neste processo."
            items={
              process.behavioral_assessment
                ? [
                    {
                      id: process.behavioral_assessment.assignment_id,
                      primary: `Avaliação: ${SIMPLE_STATUS_LABEL[process.behavioral_assessment.status] ?? process.behavioral_assessment.status}`,
                      secondary: [
                        process.behavioral_assessment.submitted_at
                          ? `Concluída em ${formatDateTime(process.behavioral_assessment.submitted_at)}`
                          : null,
                        process.behavioral_assessment.ai_status
                          ? `IA: ${SIMPLE_STATUS_LABEL[process.behavioral_assessment.ai_status] ?? process.behavioral_assessment.ai_status}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    },
                  ]
                : []
            }
          />
          <HistoryDetailList
            title="Decisão"
            empty="Nenhuma decisão registrada neste processo."
            items={
              process.hiring_decision
                ? [
                    {
                      id: process.hiring_decision.id,
                      primary: `Decisão: ${DECISION_OUTCOME_LABEL[process.hiring_decision.outcome] ?? process.hiring_decision.outcome}`,
                      secondary: [
                        `Status: ${SIMPLE_STATUS_LABEL[process.hiring_decision.status] ?? process.hiring_decision.status}`,
                        process.hiring_decision.submitted_at
                          ? `Enviada em ${formatDateTime(process.hiring_decision.submitted_at)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    },
                  ]
                : []
            }
          />
        </div>
      ) : null}
    </article>
  );
}

function HistorySummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border)/0.5)] bg-surface px-3 py-2">
      <p className="text-xs font-semibold text-text-muted">{label}</p>
      <p className="mt-1 font-medium text-text">{value}</p>
    </div>
  );
}

function HistoryDetailList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; primary: string; secondary: string }>;
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-text">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-[hsl(var(--border)/0.5)] bg-surface px-3 py-2"
            >
              <p className="text-sm font-medium text-text">{item.primary}</p>
              {item.secondary ? (
                <p className="mt-1 text-xs text-text-muted">{item.secondary}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
