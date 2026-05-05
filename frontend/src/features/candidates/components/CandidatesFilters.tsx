type ResumeFilter = "all" | "with" | "without";
type AiStatusFilter = "all" | "completed" | "processing_or_pending" | "failed";

interface CandidatesFiltersProps {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  resumeFilter: ResumeFilter;
  onResumeFilterChange: (value: ResumeFilter) => void;
  aiFilter: AiStatusFilter;
  onAiFilterChange: (value: AiStatusFilter) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function CandidatesFilters({
  searchInput,
  onSearchInputChange,
  resumeFilter,
  onResumeFilterChange,
  aiFilter,
  onAiFilterChange,
  hasActiveFilters,
  onClearFilters,
}: CandidatesFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--bg))] px-6 py-3">
      <div className="relative min-w-[240px] flex-1">
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
          placeholder="Buscar por nome ou e-mail…"
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          className="ui-input h-9 w-full rounded-lg pl-9 pr-3 text-sm"
        />
      </div>

      <select
        value={resumeFilter}
        onChange={(e) => onResumeFilterChange(e.target.value as ResumeFilter)}
        className="ui-input h-9 rounded-lg px-3 text-sm"
      >
        <option value="all">Todos os currículos</option>
        <option value="with">Com currículo</option>
        <option value="without">Sem currículo</option>
      </select>

      <select
        value={aiFilter}
        onChange={(e) => onAiFilterChange(e.target.value as AiStatusFilter)}
        className="ui-input h-9 rounded-lg px-3 text-sm"
      >
        <option value="all">Todos os status IA</option>
        <option value="completed">IA Concluída</option>
        <option value="processing_or_pending">IA Pendente / Processando</option>
        <option value="failed">IA Falhou</option>
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
