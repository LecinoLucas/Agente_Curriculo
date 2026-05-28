import { Search } from "lucide-react";

import type {
  AiStatusFilter,
  ApplicationSourceFilter,
  DesiredContractTypeFilter,
  LinkStatusFilter,
  ResumeFilter,
  TalentBaseTab,
} from "../hooks/useCandidatesFilters";

interface CandidatesFiltersProps {
  activeTab: TalentBaseTab;
  onActiveTabChange: (value: TalentBaseTab) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  city: string;
  onCityChange: (value: string) => void;
  state: string;
  onStateChange: (value: string) => void;
  skill: string;
  onSkillChange: (value: string) => void;
  seniority: string;
  onSeniorityChange: (value: string) => void;
  salaryMin: string;
  onSalaryMinChange: (value: string) => void;
  salaryMax: string;
  onSalaryMaxChange: (value: string) => void;
  resumeFilter: ResumeFilter;
  onResumeFilterChange: (value: ResumeFilter) => void;
  aiFilter: AiStatusFilter;
  onAiFilterChange: (value: AiStatusFilter) => void;
  applicationSourceFilter: ApplicationSourceFilter;
  onApplicationSourceFilterChange: (value: ApplicationSourceFilter) => void;
  desiredContractTypeFilter: DesiredContractTypeFilter;
  onDesiredContractTypeFilterChange: (value: DesiredContractTypeFilter) => void;
  linkStatusFilter: LinkStatusFilter;
  onLinkStatusFilterChange: (value: LinkStatusFilter) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

type FilterChip = {
  key: string;
  label: string;
};

function buildActiveChips({
  activeTab,
  city,
  state,
  skill,
  seniority,
  salaryMin,
  salaryMax,
  resumeFilter,
  aiFilter,
  applicationSourceFilter,
  desiredContractTypeFilter,
  linkStatusFilter,
}: {
  activeTab: TalentBaseTab;
  city: string;
  state: string;
  skill: string;
  seniority: string;
  salaryMin: string;
  salaryMax: string;
  resumeFilter: ResumeFilter;
  aiFilter: AiStatusFilter;
  applicationSourceFilter: ApplicationSourceFilter;
  desiredContractTypeFilter: DesiredContractTypeFilter;
  linkStatusFilter: LinkStatusFilter;
}): FilterChip[] {
  const chips: FilterChip[] = [];
  if (activeTab === "talent_pool") chips.push({ key: "tab", label: "Banco de Talentos" });
  if (city.trim()) chips.push({ key: "city", label: `Cidade: ${city.trim()}` });
  if (state.trim()) chips.push({ key: "state", label: `UF: ${state.trim().toUpperCase()}` });
  if (skill.trim()) chips.push({ key: "skill", label: `Skill: ${skill.trim()}` });
  if (seniority.trim()) chips.push({ key: "seniority", label: `Senioridade: ${seniority.trim()}` });
  if (salaryMin.trim()) chips.push({ key: "salaryMin", label: `Salário mín.: ${salaryMin.trim()}` });
  if (salaryMax.trim()) chips.push({ key: "salaryMax", label: `Salário máx.: ${salaryMax.trim()}` });
  if (resumeFilter === "with") chips.push({ key: "resume", label: "Com currículo" });
  if (resumeFilter === "without") chips.push({ key: "resume", label: "Sem currículo" });
  if (aiFilter !== "all") chips.push({ key: "ai", label: `IA: ${aiFilter}` });
  if (applicationSourceFilter !== "all") chips.push({ key: "source", label: `Origem: ${applicationSourceFilter}` });
  if (desiredContractTypeFilter !== "all") {
    chips.push({ key: "contract", label: `Regime: ${desiredContractTypeFilter}` });
  }
  if (linkStatusFilter !== "all") {
    const map: Record<LinkStatusFilter, string> = {
      all: "",
      with_active_job: "Com vaga ativa",
      without_active_job: "Sem vaga ativa",
      closed_process: "Processo encerrado",
    };
    chips.push({ key: "link", label: map[linkStatusFilter] });
  }
  return chips;
}

export function CandidatesFilters({
  activeTab,
  onActiveTabChange,
  searchInput,
  onSearchInputChange,
  city,
  onCityChange,
  state,
  onStateChange,
  skill,
  onSkillChange,
  seniority,
  onSeniorityChange,
  salaryMin,
  onSalaryMinChange,
  salaryMax,
  onSalaryMaxChange,
  resumeFilter,
  onResumeFilterChange,
  aiFilter,
  onAiFilterChange,
  applicationSourceFilter,
  onApplicationSourceFilterChange,
  desiredContractTypeFilter,
  onDesiredContractTypeFilterChange,
  linkStatusFilter,
  onLinkStatusFilterChange,
  showAdvanced,
  onToggleAdvanced,
  hasActiveFilters,
  onClearFilters,
}: CandidatesFiltersProps) {
  const chips = buildActiveChips({
    activeTab,
    city,
    state,
    skill,
    seniority,
    salaryMin,
    salaryMax,
    resumeFilter,
    aiFilter,
    applicationSourceFilter,
    desiredContractTypeFilter,
    linkStatusFilter,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onActiveTabChange("all")}
          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
            activeTab === "all"
              ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]"
              : "border-border text-text-muted"
          }`}
        >
          Todos
        </button>
        <button
          type="button"
          onClick={() => onActiveTabChange("talent_pool")}
          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
            activeTab === "talent_pool"
              ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]"
              : "border-border text-text-muted"
          }`}
        >
          Banco de Talentos
        </button>
        <button
          type="button"
          onClick={() => onActiveTabChange("saved")}
          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
            activeTab === "saved"
              ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]"
              : "border-border text-text-muted"
          }`}
        >
          Buscas salvas
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Buscar nome, e-mail, CPF, telefone ou skill..."
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 w-full rounded-lg pl-9 pr-3 text-sm"
          />
        </div>

        <input
          type="text"
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          placeholder="Cidade"
          className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 w-[180px] rounded-lg px-3 text-sm"
        />

        <input
          type="text"
          value={state}
          onChange={(e) => onStateChange(e.target.value.toUpperCase())}
          maxLength={2}
          placeholder="UF"
          className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 w-[80px] rounded-lg px-3 text-sm"
        />

        <input
          type="text"
          value={skill}
          onChange={(e) => onSkillChange(e.target.value)}
          placeholder="Skill"
          className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 w-[170px] rounded-lg px-3 text-sm"
        />

        <button
          type="button"
          onClick={onToggleAdvanced}
          className="border border-border bg-surface text-text hover:bg-surface-muted transition shadow-sm h-9 rounded-lg px-3 text-sm"
        >
          {showAdvanced ? "Ocultar avançados" : "Filtros avançados"}
        </button>

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

      {showAdvanced ? (
        <div className="grid gap-3 rounded-lg border border-border bg-surface p-3 md:grid-cols-3 xl:grid-cols-4">
          <input
            type="number"
            min={0}
            value={salaryMin}
            onChange={(e) => onSalaryMinChange(e.target.value)}
            placeholder="Pretensão mín."
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 rounded-lg px-3 text-sm"
          />
          <input
            type="number"
            min={0}
            value={salaryMax}
            onChange={(e) => onSalaryMaxChange(e.target.value)}
            placeholder="Pretensão máx."
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 rounded-lg px-3 text-sm"
          />
          <select
            value={desiredContractTypeFilter}
            onChange={(e) =>
              onDesiredContractTypeFilterChange(e.target.value as DesiredContractTypeFilter)
            }
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 rounded-lg px-3 text-sm"
          >
            <option value="all">Regime desejado</option>
            <option value="CLT">CLT</option>
            <option value="PJ">PJ</option>
            <option value="Indiferente">Indiferente</option>
          </select>

          <select
            value={linkStatusFilter}
            onChange={(e) => onLinkStatusFilterChange(e.target.value as LinkStatusFilter)}
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 rounded-lg px-3 text-sm"
          >
            <option value="all">Status de vínculo</option>
            <option value="with_active_job">Com vaga ativa</option>
            <option value="without_active_job">Sem vaga ativa</option>
            <option value="closed_process">Processo encerrado</option>
          </select>

          <select
            value={applicationSourceFilter}
            onChange={(e) => onApplicationSourceFilterChange(e.target.value as ApplicationSourceFilter)}
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 rounded-lg px-3 text-sm"
          >
            <option value="all">Origem</option>
            <option value="public_application">Candidatura pública</option>
            <option value="manual">Manual</option>
            <option value="import">Importação</option>
          </select>

          <select
            value={resumeFilter}
            onChange={(e) => onResumeFilterChange(e.target.value as ResumeFilter)}
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 rounded-lg px-3 text-sm"
          >
            <option value="all">Currículo</option>
            <option value="with">Com currículo</option>
            <option value="without">Sem currículo</option>
          </select>

          <select
            value={aiFilter}
            onChange={(e) => onAiFilterChange(e.target.value as AiStatusFilter)}
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 rounded-lg px-3 text-sm"
          >
            <option value="all">Status IA</option>
            <option value="completed">Concluída</option>
            <option value="processing_or_pending">Pendente/processando</option>
            <option value="failed">Falhou</option>
          </select>

          <input
            type="text"
            value={seniority}
            onChange={(e) => onSeniorityChange(e.target.value)}
            placeholder="Senioridade"
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 rounded-lg px-3 text-sm"
          />
        </div>
      ) : null}

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={`${chip.key}:${chip.label}`}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted"
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
