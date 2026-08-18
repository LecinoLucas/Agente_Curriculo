import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/common/EmptyState";
import { mapStageToMacroColumn } from "../../pipeline/utils/pipelineKanbanColumns";
import type { PipelineJobSummary } from "../../../services/pipelineService";
import type { PipelineStage } from "../../../types/domain";

type Props = {
  jobs: PipelineJobSummary[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function predominantStageLabel(job: PipelineJobSummary): string {
  const entries = Object.entries(job.stage_counts ?? {});
  if (entries.length === 0) return "Sem candidatos";

  const [topStage] = entries.reduce((best, current) => (current[1] > best[1] ? current : best), ["triagem", 0]);
  return mapStageToMacroColumn(topStage as PipelineStage)?.label ?? topStage;
}

export function ActiveJobsCard({ jobs, loading, error, onRetry }: Props) {
  const visibleJobs = jobs.slice(0, 5);

  return (
    <section className="rounded-xl border border-border/80 bg-surface p-5 shadow-xs" data-testid="rh-active-jobs">
      <div className="flex items-center justify-between border-b border-border/70 pb-3.5">
        <h2 className="text-base font-bold tracking-tight text-text">Vagas em andamento</h2>
        <Link
          to="/vagas"
          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Ver todas
        </Link>
      </div>

      {loading ? (
        <div className="mt-4 space-y-3 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon="!"
          title="Não foi possível carregar as vagas."
          description="Tente novamente em instantes."
          action={{ label: "Tentar novamente", onClick: onRetry }}
        />
      ) : visibleJobs.length === 0 ? (
        <EmptyState icon="0" title="Nenhuma vaga ativa no momento." description="Crie uma nova vaga para acompanhá-la aqui." />
      ) : (
        <div className="mt-2 overflow-x-auto" data-testid="rh-active-jobs-list">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-text-muted/70">
                <th className="py-2.5 px-2">Vaga</th>
                <th className="py-2.5 px-2">Área / Depto</th>
                <th className="py-2.5 px-2">Etapa predominante</th>
                <th className="py-2.5 px-2 text-right">Candidatos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-xs">
              {visibleJobs.map((job) => (
                <tr key={job.id} className="hover:bg-surface-muted/40 transition-colors" data-testid={`rh-active-job-${job.id}`}>
                  <td className="py-3 px-2 min-w-[13rem]">
                    <Link to={`/pipeline/${job.id}`} className="font-bold text-text hover:text-indigo-600 transition-colors truncate block">
                      {job.title}
                    </Link>
                    <span className="text-[10px] text-text-muted block mt-0.5">Criada em {formatDate(job.created_at)}</span>
                  </td>
                  <td className="py-3 px-2 text-text-muted font-medium min-w-[7rem]">
                    {job.job_area ?? "Sem área definida"}
                  </td>
                  <td className="py-3 px-2 min-w-[8rem]">
                    <span className="font-medium text-text">{predominantStageLabel(job)}</span>
                  </td>
                  <td className="py-3 px-2 text-right font-bold text-text">
                    {job.total_candidates}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
