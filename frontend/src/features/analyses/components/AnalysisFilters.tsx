import type { StatusFilter, AiFilter } from "../hooks/useAnalysesPage";

interface AnalysisFiltersProps {
  searchInput: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  aiFilter: AiFilter;
  onAiChange: (value: AiFilter) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function AnalysisFilters({
  searchInput,
  onSearchChange,
  statusFilter,
  onStatusChange,
  aiFilter,
  onAiChange,
  hasActiveFilters,
  onClearFilters,
}: AnalysisFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--bg))] px-6 py-3">
      <div className="relative min-w-[220px] flex-1">
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-muted))]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="8" />
          <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Buscar por candidato…"
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          className="ui-input h-9 w-full rounded-lg pl-9 pr-3 text-sm"
        />
      </div>

      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
        className="ui-input h-9 rounded-lg px-3 text-sm"
      >
        <option value="all">Todos os status</option>
        <option value="pending">Aguardando</option>
        <option value="processing">Processando</option>
        <option value="completed">Concluída</option>
        <option value="failed">Falhou</option>
        <option value="cancelled">Cancelado</option>
        <option value="discarded">Descartada</option>
      </select>

      <select
        value={aiFilter}
        onChange={(e) => onAiChange(e.target.value as AiFilter)}
        className="ui-input h-9 rounded-lg px-3 text-sm"
      >
        <option value="all">IA real e mock</option>
        <option value="real">Somente IA real</option>
        <option value="mock">Somente mock</option>
      </select>

      {hasActiveFilters ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="ui-btn-secondary h-9 rounded-lg px-3 text-sm"
        >
          Limpar filtros
        </button>
      ) : null}
    </div>
  );
}
