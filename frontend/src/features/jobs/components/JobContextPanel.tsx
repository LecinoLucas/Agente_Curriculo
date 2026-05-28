import {
  ChevronRight,
  KanbanSquare,
  Pencil,
  PauseCircle,
  ShieldAlert,
  Sparkles,
  CircleSlash,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "../../../components/common/StatusPill";
import { JobQualityBadge } from "../../../components/job/JobQualityBadge";
import { buildJobQualitySummary } from "../jobFormConfig";
import type { JobOperationalData } from "../hooks/useJobsList";
import {
  getJobOperationalInsights,
  getInsightMeta,
  getJobOperationalPresentation,
  getJobPipelineSnapshot,
  getOperationalMomentumLabel,
  getOperationalMomentumNote,
  getOperationalSurfaceClasses,
  getOperationalToneClasses,
} from "../utils/jobsPageHelpers";
import type { Job } from "../../../types/domain";
import {
  formatJobStatus,
  formatSeniority,
  formatWorkModel,
  jobStatusTone,
} from "../../../utils/jobFormatters";

interface JobContextPanelProps {
  job: Job | null;
  operational?: JobOperationalData | null;
  canManage: boolean;
  runningAction?: string | null;
  onNavigateEdit: (jobId: string) => void;
  onNavigatePipeline: (jobId: string) => void;
  onPause: (jobId: string) => void;
  onClose: (jobId: string) => void;
  onClearSelection: () => void;
}

function formatJobArea(value: string | null | undefined) {
  return value?.trim() || null;
}

function getAttractivenessLabel(snapshot: ReturnType<typeof getJobPipelineSnapshot>) {
  if (snapshot.totalCandidates === 0) return "Baixa";
  if (snapshot.strongCandidates >= 2) return "Alta";
  if (snapshot.totalCandidates >= 3) return "Moderada";
  return "Inicial";
}

function getMomentumLabel(snapshot: ReturnType<typeof getJobPipelineSnapshot>) {
  return getOperationalMomentumLabel(snapshot);
}

function MetricTile({
  label,
  value,
  note,
  emphasis = false,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border px-4 py-3",
        emphasis
          ? "border-border-strong/45 bg-surface-muted/72 shadow-[inset_0_1px_0_hsl(var(--surface))]"
          : "border-border bg-surface-muted/38",
      ].join(" ")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-text">{value}</p>
      {note ? <p className="mt-1 text-xs text-text-muted">{note}</p> : null}
    </div>
  );
}

export function JobContextPanel({
  job,
  operational,
  canManage,
  runningAction,
  onNavigateEdit,
  onNavigatePipeline,
  onPause,
  onClose,
  onClearSelection,
}: JobContextPanelProps) {
  if (!job) {
    return (
      <Card className="overflow-hidden rounded-[30px] border-border-strong/55 bg-surface shadow-[0_24px_60px_-34px_hsl(var(--text)/0.24)] lg:sticky lg:top-24">
        <CardContent className="px-6 py-8">
          <p className="text-sm font-semibold text-text">Selecione uma vaga</p>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            O contexto operacional da vaga escolhida vai aparecer aqui com saúde, insights, pipeline e próximas ações.
          </p>
        </CardContent>
      </Card>
    );
  }

  const summaryParts = [
    formatJobArea(job.job_area),
    formatSeniority(job.seniority_level),
    formatWorkModel(job.work_model),
    job.location ?? null,
  ].filter((value) => value && value !== "—");
  const operationalPresentation = getJobOperationalPresentation(job, operational);
  const hasOperationalContext = operational != null;
  const toneClasses = getOperationalToneClasses(operationalPresentation.tone);
  const surfaceClasses = getOperationalSurfaceClasses(operationalPresentation.tone);
  const pipelineSnapshot = getJobPipelineSnapshot(operational);
  const insights = getJobOperationalInsights(job, operational);
  const quality = buildJobQualitySummary(job);
  const primaryAction =
    operationalPresentation.actionTarget === "edit"
      ? {
          label: operationalPresentation.actionLabel,
          onClick: () => onNavigateEdit(job.id),
          icon: <Pencil className="mr-2 h-4 w-4" />,
        }
      : {
          label: operationalPresentation.actionLabel,
          onClick: () => onNavigatePipeline(job.id),
          icon: <KanbanSquare className="mr-2 h-4 w-4" />,
        };

  return (
    <Card className="job-context-panel-enter overflow-hidden rounded-[30px] border-border-strong/55 bg-surface shadow-[0_24px_60px_-34px_hsl(var(--text)/0.24)] transition-all duration-200 lg:sticky lg:top-24">
      <CardContent className="p-0">
        <div className="border-b border-border bg-surface-muted/38 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                <ChevronRight className="h-3.5 w-3.5" />
                <span>Diagnóstico da vaga</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-text">{job.title}</h3>
                <StatusPill label={formatJobStatus(job.status)} tone={jobStatusTone(job.status)} />
              </div>
              {summaryParts.length > 0 ? (
                <p className="text-sm text-text-muted">{summaryParts.join(" • ")}</p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <div
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]",
                  surfaceClasses.emphasis,
                  toneClasses.label,
                ].join(" ")}
              >
                <span className={`h-2 w-2 rounded-full ${toneClasses.marker}`} />
                <span>{operationalPresentation.healthLabel}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-text-muted hover:bg-surface-muted hover:text-text"
                onClick={onClearSelection}
                aria-label="Fechar contexto da vaga"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <p className={`mt-3 text-sm leading-6 ${toneClasses.note}`}>{operationalPresentation.healthNote}</p>
        </div>

        <div className="space-y-4 px-5 py-5">
          <section className="space-y-3 rounded-[24px] border border-border bg-surface px-4 py-4 shadow-[inset_0_1px_0_hsl(var(--surface-muted))]">
            <div>
              <p className="text-sm font-semibold text-text">Job Health</p>
              <p className="text-xs text-text-muted">Essa vaga está bem ou mal, e por quê.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                label="Saúde"
                value={operationalPresentation.healthLabel}
                note={operationalPresentation.pipelineNote}
                emphasis
              />
              <MetricTile
                label="Qualidade"
                value={quality ? `${quality.quality_score}/100` : "Sem avaliação"}
                note={quality ? "Estrutura da vaga" : "A avaliação ainda não foi gerada"}
              />
              <MetricTile
                label="Atratividade"
                value={hasOperationalContext ? getAttractivenessLabel(pipelineSnapshot) : "Monitorando"}
                note={hasOperationalContext ? `${pipelineSnapshot.totalCandidates} no funil` : "Sinais de pipeline em atualização"}
              />
              <MetricTile
                label="Momentum"
                value={hasOperationalContext ? getMomentumLabel(pipelineSnapshot) : "Estável"}
                note={hasOperationalContext ? getOperationalMomentumNote(pipelineSnapshot) : "Aguardando atividade suficiente para leitura"}
              />
            </div>

            {quality ? (
              <div className="rounded-2xl border border-border bg-surface-muted/25 px-4 py-3">
                <JobQualityBadge quality={quality} compact />
              </div>
            ) : null}
          </section>

          <section className="space-y-3 rounded-[24px] border border-[hsl(var(--primary))]/14 bg-[hsl(var(--accent-soft))]/35 px-4 py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" />
              <div>
                <p className="text-sm font-semibold text-text">AI Insights</p>
                <p className="text-xs text-text-muted">Leituras operacionais com foco em ação.</p>
              </div>
            </div>

            <div className="space-y-3">
              {insights.map((insight) => {
                const classes = getOperationalToneClasses(insight.tone);
                const insightSurface = getOperationalSurfaceClasses(insight.tone);
                return (
                  <div
                    key={`${insight.title}-${insight.action}`}
                    className={[
                      "rounded-2xl border px-4 py-3 shadow-[inset_0_1px_0_hsl(var(--surface))]",
                      insightSurface.emphasis,
                    ].join(" ")}
                  >
                    <div className={`flex items-center gap-2 text-sm font-medium ${classes.label}`}>
                      <span className={`h-2 w-2 rounded-full ${classes.marker}`} />
                      <span>{insight.title}</span>
                    </div>
                    <div className="mt-2 inline-flex items-center rounded-full border border-border bg-surface/72 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                      {getInsightMeta(insight.confidence, insight.momentum)}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-text-muted">
                      {insight.signal} {insight.cause} {insight.impact}
                    </p>
                    <p className={`mt-3 text-sm font-medium ${classes.label}`}>Próxima ação: {insight.action}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-3 rounded-[24px] border border-border bg-surface px-4 py-4 shadow-[inset_0_1px_0_hsl(var(--surface-muted))]">
            <div>
              <p className="text-sm font-semibold text-text">Candidate Pipeline Snapshot</p>
              <p className="text-xs text-text-muted">Volume, gargalo e força do funil em leitura rápida.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile label="Entrada" value={hasOperationalContext ? String(pipelineSnapshot.entryCount) : "—"} emphasis />
              <MetricTile label="Triagem" value={hasOperationalContext ? String(pipelineSnapshot.screeningCount) : "—"} />
              <MetricTile label="Entrevistas" value={hasOperationalContext ? String(pipelineSnapshot.interviewCount) : "—"} />
              <MetricTile label="Avançados" value={hasOperationalContext ? String(pipelineSnapshot.advancedCount) : "—"} />
              <MetricTile
                label="Candidatos fortes"
                value={hasOperationalContext ? String(pipelineSnapshot.strongCandidates) : "—"}
                note={
                  hasOperationalContext
                    ? pipelineSnapshot.topScore != null
                      ? `Melhor score ${Math.round(pipelineSnapshot.topScore)}`
                      : undefined
                    : "Aguardando leitura de candidatos"
                }
              />
              <MetricTile
                label="Último movimento"
                value={hasOperationalContext ? pipelineSnapshot.latestActivityLabel ?? "Sem atividade" : "Em atualização"}
                note={
                  hasOperationalContext
                    ? pipelineSnapshot.totalCandidates > 0
                      ? `${pipelineSnapshot.totalCandidates} no pipeline`
                      : "Nenhum candidato ainda"
                    : "O histórico do pipeline ainda está carregando"
                }
              />
            </div>
          </section>

          <section className="space-y-3 rounded-[24px] border border-border bg-surface px-4 py-4 shadow-[inset_0_1px_0_hsl(var(--surface-muted))]">
            <div>
              <p className="text-sm font-semibold text-text">Quick Actions</p>
              <p className="text-xs text-text-muted">Ações diretas para destravar ou acelerar a vaga.</p>
            </div>

            <div className="grid gap-2">
              <Button type="button" className="h-10 justify-start rounded-xl px-4 shadow-sm" onClick={primaryAction.onClick}>
                {primaryAction.icon}
                {primaryAction.label}
              </Button>

              {primaryAction.label !== "Abrir pipeline" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 justify-start rounded-xl border-border-strong/45 bg-surface px-4 hover:bg-surface-muted/70"
                  onClick={() => onNavigatePipeline(job.id)}
                >
                  <KanbanSquare className="mr-2 h-4 w-4" />
                  Abrir pipeline
                </Button>
              ) : null}

              {canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 justify-start rounded-xl border-border-strong/45 bg-surface px-4 hover:bg-surface-muted/70"
                  onClick={() => onNavigateEdit(job.id)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar detalhes
                </Button>
              ) : null}

              {canManage && job.status === "published" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 justify-start rounded-xl border-border-strong/45 bg-surface px-4 hover:bg-surface-muted/70"
                  onClick={() => onPause(job.id)}
                  disabled={runningAction === `pause:${job.id}`}
                >
                  <PauseCircle className="mr-2 h-4 w-4" />
                  Pausar vaga
                </Button>
              ) : null}

              {canManage && (job.status === "published" || job.status === "paused") ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 justify-start rounded-xl border-border-strong/45 bg-surface px-4 hover:bg-surface-muted/70"
                  onClick={() => onClose(job.id)}
                  disabled={runningAction === `close:${job.id}`}
                >
                  <CircleSlash className="mr-2 h-4 w-4" />
                  Encerrar vaga
                </Button>
              ) : null}
            </div>

            {operationalPresentation.actionTarget === "edit" ? (
              <div className="rounded-2xl border border-[hsl(var(--warning))]/15 bg-warning-soft/35 px-4 py-3 text-sm text-warning">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>Antes de acelerar o pipeline, vale ajustar a estrutura da vaga para evitar ruído operacional.</p>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
