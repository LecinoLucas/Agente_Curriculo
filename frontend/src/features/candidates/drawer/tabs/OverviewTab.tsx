import type { CandidateOverview, Job } from "../../../../types/domain";
import { EmptyTab, Section, StatusCard } from "../components/DrawerSectionHelpers";

interface OverviewTabProps {
  overview: CandidateOverview;
  activeJobId: string | null;
  activeJob: Job | null;
  activePipelineEntry: CandidateOverview["pipeline_entries"][number] | null;
  onEdit: () => void;
}

export function OverviewTab({
  overview,
  activeJobId,
  activeJob,
  activePipelineEntry,
  onEdit,
}: OverviewTabProps) {
  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Summary Section */}
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
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
              Nome
            </div>
            <div className="mt-1 text-sm text-[hsl(var(--text))]">{overview.candidate.full_name}</div>
          </div>
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
              E-mail
            </div>
            <div className="mt-1 text-sm text-[hsl(var(--text))]">{overview.candidate.email ?? "—"}</div>
          </div>
        </div>
      </Section>

      {/* Score Section */}
      <Section title="Vaga ativa">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusCard
            label="Match da vaga ativa"
            title={
              activePipelineEntry?.match_score != null
                ? `${Math.round(activePipelineEntry.match_score)}%`
                : "—"
            }
            description={activeJob?.title ?? "Nenhuma vaga ativa"}
          />
          <StatusCard
            label="Etapa atual"
            title={activePipelineEntry?.candidate_status ?? "Não vinculado"}
            description="Estado no pipeline"
          />
        </div>
      </Section>
    </div>
  );
}
