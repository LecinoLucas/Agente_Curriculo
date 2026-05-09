import { AnalysisGlobalItem } from "../../../types/domain";
import { AnalysisRow } from "./AnalysisRow";
import Pagination from "../../../components/common/Pagination";

const PAGE_SIZE = 20;

interface AnalysesTableProps {
  items: AnalysisGlobalItem[];
  total: number;
  totalPages: number;
  page: number;
  onPageChange: (page: number) => void;
  isRefreshing: boolean;
  actionId: string | null;
  onOpen: (item: AnalysisGlobalItem) => void;
  onRetry: (item: AnalysisGlobalItem) => void;
  onForceFail: (item: AnalysisGlobalItem) => void;
  onDiscard: (item: AnalysisGlobalItem) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function AnalysesTable({
  items,
  total,
  totalPages,
  page,
  onPageChange,
  isRefreshing,
  actionId,
  onOpen,
  onRetry,
  onForceFail,
  onDiscard,
  hasActiveFilters,
  onClearFilters,
}: AnalysesTableProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <p className="text-lg font-medium text-[hsl(var(--text-muted))]">
          {hasActiveFilters ? "Nenhuma análise corresponde aos filtros atuais" : "Ainda não há análises registradas"}
        </p>
        <p className="ui-text-muted text-sm">
          {hasActiveFilters
            ? "Ajuste ou limpe os filtros para ver outras execuções."
            : "Envie um currículo e inicie uma análise para acompanhar as execuções aqui."}
        </p>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-1 text-sm text-[hsl(var(--primary))] hover:underline"
          >
            Limpar filtros
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {isRefreshing ? (
        <div className="border-b border-[hsl(var(--primary))]/15 bg-[hsl(var(--accent-soft))] px-6 py-2 text-xs text-[hsl(var(--primary))]">
          Atualizando as análises…
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]">
              <th className="ui-text-muted w-[200px] px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                Candidato
              </th>
              <th className="ui-text-muted px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                Arquivo
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Status da IA
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Uso de IA
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Criado em
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Duração
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--surface))]">
            {items.map((item) => (
              <AnalysisRow
                key={item.id}
                item={item}
                actionInFlight={actionId === item.id}
                onOpen={() => onOpen(item)}
                onRetry={() => onRetry(item)}
                onForceFail={() => onForceFail(item)}
                onDiscard={() => onDiscard(item)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="border-t border-[hsl(var(--border))] px-6 py-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
            total={total}
            pageSize={PAGE_SIZE}
          />
        </div>
      ) : null}
    </>
  );
}
