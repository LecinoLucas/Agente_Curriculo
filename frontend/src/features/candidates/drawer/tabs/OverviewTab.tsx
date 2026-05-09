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
  const hasActiveRelationship = activePipelineEntry?.relationship_status === "active";
  const activeEntryById =
    activeJobId != null
      ? overview.pipeline_entries.find((entry) => entry.job_id === activeJobId) ?? null
      : null;
  const latestLinkedEntry = overview.pipeline_entries[0] ?? null;
  const relationshipTitle = hasActiveRelationship ? "Vaga ativa" : "Última vaga vinculada";
  const relationshipJobTitle =
    hasActiveRelationship
      ? activeJob?.title ?? activeEntryById?.job_title ?? "Nenhuma vaga ativa"
      : latestLinkedEntry?.job_title ?? "Nenhuma vaga vinculada";
  const relationshipStatusLabel = hasActiveRelationship ? "Etapa atual" : "Status final";
  const relationshipStatusTitle =
    hasActiveRelationship
      ? activePipelineEntry?.candidate_status ?? "Não vinculado"
      : latestLinkedEntry?.candidate_status ?? "Não vinculado";
  const relationshipStatusDescription = hasActiveRelationship ? "Estado no pipeline" : "Candidatura encerrada";

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
      <Section title={relationshipTitle}>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusCard label="Vaga" title={relationshipJobTitle} description="Score final disponível no ranking" />
          <StatusCard
            label={relationshipStatusLabel}
            title={relationshipStatusTitle}
            description={relationshipStatusDescription}
          />
        </div>
      </Section>
    </div>
  );
}
