import type { CandidateOverview, Job, PipelineStage } from "../../../../types/domain";
import { Section, StatusCard } from "../components/DrawerSectionHelpers";
import { CandidateDecisionSummaryCard } from "../components/CandidateDecisionSummaryCard";

interface OverviewTabProps {
  overview: CandidateOverview;
  activeJobId: string | null;
  activeJob: Job | null;
  activePipelineEntry: CandidateOverview["pipeline_entries"][number] | null;
  onEdit: () => void;
  onLinkJob: () => void;
}

export function OverviewTab({
  overview,
  activeJobId,
  activeJob,
  activePipelineEntry,
  onEdit,
  onLinkJob,
}: OverviewTabProps) {
  const hasActiveRelationship = activePipelineEntry?.relationship_status === "active";
  const hasLinkedJobs = overview.pipeline_entries.length > 0;
  const currentStage = (activePipelineEntry?.stage as PipelineStage) ?? null;

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* No linked jobs state */}
      {!hasLinkedJobs ? (
        <section className="rounded-2xl border border-[hsl(var(--primary))]/15 bg-[hsl(var(--accent-soft))] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-base font-semibold text-text">
                Candidato aguardando vaga
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Vincule a uma vaga para análise, score e acompanhamento no funil.
              </p>
            </div>
            <button
              type="button"
              onClick={onLinkJob}
              className="rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90"
            >
              Vincular a uma vaga
            </button>
          </div>
        </section>
      ) : null}

      {/* Decision summary (critical info) */}
      {hasLinkedJobs && activeJobId && (
        <CandidateDecisionSummaryCard
          activeJobDecision={overview.active_job_decision}
          activeJobTitle={activeJob?.title ?? null}
          candidateName={overview.candidate.full_name}
        />
      )}

      {/* Current job status */}
      {hasLinkedJobs && activeJobId && hasActiveRelationship && (
        <Section title="Status atual na vaga">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              label="Vaga"
              title={activeJob?.title ?? "—"}
              description="Vaga ativa"
            />
            <StatusCard
              label="Etapa"
              title={activePipelineEntry?.candidate_status ?? "—"}
              description="Estado no funil"
            />
          </div>
        </Section>
      )}

      {/* Basic info — moved to secondary section */}
      <Section
        title="Dados cadastrais"
        action={
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition hover:bg-surface-muted hover:text-text"
          >
            Editar
          </button>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface-muted px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Nome
            </div>
            <div className="mt-1 text-sm text-text">{overview.candidate.full_name}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-muted px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              E-mail
            </div>
            <div className="mt-1 text-sm text-text">{overview.candidate.email ?? "—"}</div>
          </div>
        </div>
      </Section>
    </div>
  );
}
