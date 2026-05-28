import type { StatusFilter, AiFilter, AnalysisTypeFilter } from "../hooks/useAnalysesPage";

interface AnalysisFiltersProps {
  searchInput: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  aiFilter: AiFilter;
  onAiChange: (value: AiFilter) => void;
  typeFilter: AnalysisTypeFilter;
  onTypeChange: (value: AnalysisTypeFilter) => void;
  providerFilter: string;
  onProviderChange: (value: string) => void;
  modelFilter: string;
  onModelChange: (value: string) => void;
  providerOptions: string[];
  modelOptions: string[];
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
  typeFilter,
  onTypeChange,
  providerFilter,
  onProviderChange,
  modelFilter,
  onModelChange,
  providerOptions,
  modelOptions,
  hasActiveFilters,
  onClearFilters,
}: AnalysisFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-[hsl(var(--bg))] px-6 py-3">
      <div className="relative min-w-[220px] flex-1">
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
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
          className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 w-full rounded-lg pl-9 pr-3 text-sm"
        />
      </div>

      <select
        value={typeFilter}
        onChange={(e) => onTypeChange(e.target.value as AnalysisTypeFilter)}
        className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 rounded-lg px-3 text-sm"
      >
        <option value="all">Todas</option>
        <option value="resume">Currículo</option>
        <option value="behavioral_ai">Comportamental</option>
      </select>

      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
        className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 rounded-lg px-3 text-sm"
      >
        <option value="all">Todos os status</option>
        <option value="waiting_extraction">Aguardando extração</option>
        <option value="pending">Aguardando</option>
        <option value="processing">Processando</option>
        <option value="retry_scheduled">Nova tentativa agendada</option>
        <option value="completed">Concluída</option>
        <option value="failed">Falhou</option>
        <option value="cancelled">Cancelado</option>
        <option value="discarded">Descartada</option>
      </select>

      <select
        value={aiFilter}
        onChange={(e) => onAiChange(e.target.value as AiFilter)}
        disabled={typeFilter === "behavioral_ai"}
        className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 rounded-lg px-3 text-sm disabled:opacity-50"
      >
        <option value="all">IA real e mock</option>
        <option value="real">Somente IA real</option>
        <option value="mock">Somente mock</option>
      </select>

      {typeFilter === "behavioral_ai" ? (
        <>
          <select
            value={providerFilter}
            onChange={(e) => onProviderChange(e.target.value)}
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 rounded-lg px-3 text-sm"
          >
            <option value="all">Todos os providers</option>
            {providerOptions.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>

          <select
            value={modelFilter}
            onChange={(e) => onModelChange(e.target.value)}
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 rounded-lg px-3 text-sm"
          >
            <option value="all">Todos os modelos</option>
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {hasActiveFilters ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="border border-border bg-surface text-text hover:bg-surface-muted transition shadow-sm h-9 rounded-lg px-3 text-sm"
        >
          Limpar filtros
        </button>
      ) : null}
    </div>
  );
}
