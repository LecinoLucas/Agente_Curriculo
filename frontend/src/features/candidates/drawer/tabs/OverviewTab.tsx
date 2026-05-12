import type { CandidateOverview, Job } from "../../../../types/domain";
import { Section, StatusCard } from "../components/DrawerSectionHelpers";

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
  const relationshipStatusTitle =
    hasActiveRelationship
      ? activePipelineEntry?.candidate_status ?? "Não vinculado"
      : latestLinkedEntry?.candidate_status ?? "Não vinculado";
  const relationshipStatusDescription = hasActiveRelationship ? "Estado no pipeline" : "Candidatura encerrada";
  const latestAnalysisLabel =
    overview.latest_analysis?.status === "completed"
      ? "Análise concluída"
      : overview.latest_analysis?.status === "failed"
        ? "Falha na análise"
        : overview.latest_analysis?.status === "processing" ||
            overview.latest_analysis?.status === "pending" ||
            overview.latest_analysis?.status === "retry_scheduled"
          ? "Analisando com IA"
          : "Aguardando análise";

  return (
    <div className="flex flex-col gap-5 p-5">
      {!hasLinkedJobs ? (
        <section className="rounded-2xl border border-[hsl(var(--primary))]/15 bg-[hsl(var(--accent-soft))] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-base font-semibold text-[hsl(var(--text))]">
                Este candidato ainda não está vinculado a nenhuma vaga
              </h2>
              <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
                Vincule o candidato a uma vaga para gerar análise, score, ranking e acompanhamento no funil.
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
      {hasLinkedJobs ? (
        <Section title={relationshipTitle}>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatusCard label="Vaga" title={relationshipJobTitle} description="Aderência à Vaga disponível no ranking" />
            <StatusCard
              label="Status na Vaga"
              title={relationshipStatusTitle}
              description={relationshipStatusDescription}
            />
            <StatusCard
              label="Próximo passo"
              title={latestAnalysisLabel}
              description="Use as abas de currículo e score para acompanhar análise, aderência e histórico."
            />
          </div>
        </Section>
      ) : (
        <Section title="Processos seletivos">
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-5 py-6 text-center">
            <p className="text-sm font-semibold text-[hsl(var(--text))]">Nenhuma vaga vinculada</p>
            <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
              Este candidato ainda não participa de nenhum processo seletivo.
            </p>
            <button
              type="button"
              onClick={onLinkJob}
              className="mt-4 rounded-xl border border-[hsl(var(--primary))]/15 bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90"
            >
              Vincular vaga
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}
