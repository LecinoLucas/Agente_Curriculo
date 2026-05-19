import { ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobSkill } from "../../../types/domain";
import type { PendingJobSkill } from "../jobFormConfig";
import type { SkillCatalog } from "../../../services/skillsService";
import { useEffect, useMemo, useState } from "react";
import { CreateSkillModal } from "./CreateSkillModal";

// ── UX category chip definitions ─────────────────────────────────────────────

const UI_CATEGORIES = [
  "Todas",
  "Gestão",
  "Comportamental",
  "Operacional",
  "Ferramentas",
  "Técnica",
  "Diferenciais",
  "Outros",
] as const;
type UiCategory = (typeof UI_CATEGORIES)[number];

// Keywords explícitos de gestão humana — não usam "pega-tudo"
const MANAGEMENT_SKILL_KEYWORDS = [
  "gestão de equipe", "gestao de equipe",
  "gestão de pessoas", "gestao de pessoas",
  "liderança", "lideranca", "líder", "lider",
  "supervisor", "coordenador", "gerente",
  "feedback", "treinamento",
  "metas", "indicadores", "escala",
];

// Keywords explícitos de rotina operacional
const OPERATIONAL_KEYWORDS = [
  "atendimento", "caixa", "estoque",
  "conferência", "conferencia",
  "loja", "posto",
  "operação", "operacao",
  "rotina", "abertura", "fechamento",
  "inventário", "inventario",
];

const MANAGEMENT_JOB_SIGNALS = [
  "gestor", "gerente", "coordenador", "coordenadora",
  "supervisor", "supervisora", "líder", "lider",
  "manager", "diretor", "diretora", "gerência", "gerencia",
  "liderança", "lideranca",
];

const MANAGEMENT_SUGGESTION_SIGNALS = [
  "gestão de equipe", "gestao de equipe",
  "liderança", "lideranca",
  "comunicação", "comunicacao",
  "conflito",
  "indicador", "kpi",
  "treinamento",
  "decisão", "decisao",
  "organização", "organizacao",
  "atendimento",
  "excel",
  "feedback",
  "coaching",
  "gestão de pessoas", "gestao de pessoas",
];

// catalog_type tem prioridade sobre keywords — evita ambiguidade
const CATALOG_TYPE_TO_UX: Record<string, UiCategory> = {
  hard_skill: "Técnica",
  soft_skill: "Comportamental",
  tool: "Ferramentas",
  platform: "Ferramentas",
  certification: "Diferenciais",
};

function getUiCategory(skill: SkillCatalog): UiCategory {
  const fromType = skill.catalog_type ? CATALOG_TYPE_TO_UX[skill.catalog_type] : undefined;
  if (fromType) return fromType;

  const name = skill.name.toLowerCase();
  const cat = (skill.category ?? "").toLowerCase();

  if (MANAGEMENT_SKILL_KEYWORDS.some((kw) => name.includes(kw) || cat.includes(kw)))
    return "Gestão";
  if (OPERATIONAL_KEYWORDS.some((kw) => name.includes(kw) || cat.includes(kw)))
    return "Operacional";

  return "Outros";
}

function isManagementJob(title?: string, jobArea?: string): boolean {
  const text = `${title ?? ""} ${jobArea ?? ""}`.toLowerCase();
  return MANAGEMENT_JOB_SIGNALS.some((kw) => text.includes(kw));
}

function matchesManagementSuggestion(skill: SkillCatalog): boolean {
  const name = skill.name.toLowerCase();
  return MANAGEMENT_SUGGESTION_SIGNALS.some((s) => name.includes(s));
}

function getUiCategoryPredicate(cat: UiCategory): (skill: SkillCatalog) => boolean {
  if (cat === "Todas") return () => true;
  return (s) => getUiCategory(s) === cat;
}

// ── Catalog type display ──────────────────────────────────────────────────────

function formatSkillType(value: string): string {
  const labels: Record<string, string> = {
    skill: "Skill",
    hard_skill: "Hard skill",
    soft_skill: "Soft skill",
    tool: "Ferramenta",
    platform: "Plataforma",
    certification: "Certificação",
  };
  return labels[value] ?? value.replace(/_/g, " ");
}

const CATALOG_TYPE_BADGE: Record<string, string> = {
  hard_skill: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  soft_skill: "bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400",
  tool: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  platform: "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400",
  certification: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
};

// ── Selected skill row ────────────────────────────────────────────────────────

type SkillSectionProps = {
  title: string;
  description: string;
  emphasis: string;
  availableSkills: SkillCatalog[];
  linkedSkills: Array<JobSkill | PendingJobSkill>;
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter?: string;
  onCategoryFilterChange?: (value: string) => void;
  categoryOptions?: string[];
  typeFilter?: string;
  onTypeFilterChange?: (value: string) => void;
  typeOptions?: string[];
  addLabel: string;
  addPriorityLevel: "priority" | "complementary" | "eliminatory";
  savingSkillId: string | null;
  onAddSkill: (
    skill: SkillCatalog | string,
    priorityLevel: "priority" | "complementary" | "eliminatory",
  ) => Promise<void>;
  onUpdateSkill: (skill: JobSkill | PendingJobSkill, patch: Partial<PendingJobSkill>) => Promise<void>;
  onRemoveSkill: (skill: JobSkill | PendingJobSkill) => Promise<void>;
  onSkillCreated: (skill: SkillCatalog) => void;
  secondaryAction?: {
    label: string;
    targetPriorityLevel: "priority" | "complementary" | "eliminatory";
  };
  warning?: string | null;
  jobContext?: { title?: string; jobArea?: string };
};

type SelectedSkillRowProps = {
  skill: JobSkill | PendingJobSkill;
  savingSkillId: string | null;
  onUpdateSkill: (skill: JobSkill | PendingJobSkill, patch: Partial<PendingJobSkill>) => Promise<void>;
  onRemoveSkill: (skill: JobSkill | PendingJobSkill) => Promise<void>;
  secondaryAction?: {
    label: string;
    targetPriorityLevel: "priority" | "complementary" | "eliminatory";
  };
};

function SelectedSkillRow({
  skill,
  savingSkillId,
  onUpdateSkill,
  onRemoveSkill,
  secondaryAction,
}: SelectedSkillRowProps) {
  const [weightDraft, setWeightDraft] = useState(String(skill.weight ?? ""));
  const [minimumYearsDraft, setMinimumYearsDraft] = useState(
    skill.minimum_years == null ? "" : String(skill.minimum_years),
  );
  const isSaving = savingSkillId === skill.skill_id;

  useEffect(() => {
    setWeightDraft(String(skill.weight ?? ""));
    setMinimumYearsDraft(skill.minimum_years == null ? "" : String(skill.minimum_years));
  }, [skill.skill_id, skill.weight, skill.minimum_years]);

  const parsedWeight = weightDraft.trim() === "" ? null : Number(weightDraft);
  const parsedMinimumYears = minimumYearsDraft.trim() === "" ? null : Number(minimumYearsDraft);
  const hasUnsavedWeight =
    weightDraft.trim() === ""
      ? true
      : Number.isFinite(parsedWeight) && parsedWeight !== Number(skill.weight);
  const hasUnsavedMinimumYears =
    parsedMinimumYears !== null && !Number.isFinite(parsedMinimumYears)
      ? true
      : parsedMinimumYears !== (skill.minimum_years ?? null);
  const hasUnsavedDetails = hasUnsavedWeight || hasUnsavedMinimumYears;
  const actionDisabled = isSaving || hasUnsavedDetails;

  async function safeUpdate(patch: Partial<PendingJobSkill>) {
    try {
      await onUpdateSkill(skill, patch);
    } catch {
      // Error feedback is handled by the shared skill hook.
    }
  }

  async function commitWeight() {
    const nextWeight = Number(weightDraft);
    if (weightDraft.trim() === "" || !Number.isFinite(nextWeight)) {
      setWeightDraft(String(skill.weight ?? ""));
      return;
    }
    if (nextWeight === Number(skill.weight)) return;
    try {
      await onUpdateSkill(skill, { weight: nextWeight });
    } catch {
      setWeightDraft(String(skill.weight ?? ""));
    }
  }

  async function commitMinimumYears() {
    const nextMinimumYears = minimumYearsDraft.trim() ? Number(minimumYearsDraft) : null;
    if (nextMinimumYears !== null && !Number.isFinite(nextMinimumYears)) {
      setMinimumYearsDraft(skill.minimum_years == null ? "" : String(skill.minimum_years));
      return;
    }
    if (nextMinimumYears === (skill.minimum_years ?? null)) return;
    try {
      await onUpdateSkill(skill, { minimum_years: nextMinimumYears });
    } catch {
      setMinimumYearsDraft(skill.minimum_years == null ? "" : String(skill.minimum_years));
    }
  }

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/40 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--text))]">{skill.skill_name}</p>
          <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
            {skill.priority_level === "priority"
              ? "Essencial"
              : skill.priority_level === "eliminatory"
                ? "Eliminatória"
                : "Diferencial"}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3 lg:w-[520px]">
          <label className="flex flex-col gap-1 text-xs font-medium text-[hsl(var(--text-muted))]">
            Peso
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={weightDraft}
              onChange={(event) => setWeightDraft(event.target.value)}
              onBlur={() => void commitWeight()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitWeight();
                }
              }}
              disabled={isSaving}
              className="ui-input h-10 rounded-xl px-3 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-[hsl(var(--text-muted))]">
            Nível mínimo
            <select
              value={skill.minimum_level ?? ""}
              onChange={(event) =>
                void safeUpdate({ minimum_level: event.target.value || null })
              }
              disabled={isSaving}
              className="ui-input h-10 rounded-xl px-3 text-sm"
            >
              <option value="">—</option>
              <option value="intern">Estagiário</option>
              <option value="junior">Júnior</option>
              <option value="mid">Pleno</option>
              <option value="senior">Sênior</option>
              <option value="lead">Lead</option>
              <option value="principal">Principal</option>
              <option value="director">Diretor</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-[hsl(var(--text-muted))]">
            Anos mínimos
            <input
              type="number"
              min="0"
              max="50"
              step="0.5"
              value={minimumYearsDraft}
              onChange={(event) => setMinimumYearsDraft(event.target.value)}
              onBlur={() => void commitMinimumYears()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitMinimumYears();
                }
              }}
              disabled={isSaving}
              className="ui-input h-10 rounded-xl px-3 text-sm"
              placeholder="—"
            />
          </label>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {secondaryAction ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={actionDisabled}
            onClick={() =>
              void safeUpdate({
                priority_level: secondaryAction.targetPriorityLevel,
              })
            }
          >
            {isSaving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUp className="mr-1 h-3.5 w-3.5" />
            )}
            {secondaryAction.label}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={actionDisabled}
          onClick={() => void onRemoveSkill(skill).catch(() => undefined)}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Remover
        </Button>
        {hasUnsavedDetails ? (
          <span className="text-xs text-[hsl(var(--text-muted))]">
            Pressione Enter ou saia do campo para salvar os ajustes.
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ── Main SkillSection component ───────────────────────────────────────────────

export function SkillSection({
  title,
  description,
  emphasis,
  availableSkills,
  linkedSkills,
  search,
  onSearchChange,
  addLabel,
  addPriorityLevel,
  savingSkillId,
  onAddSkill,
  onUpdateSkill,
  onRemoveSkill,
  onSkillCreated,
  secondaryAction,
  warning,
  jobContext,
}: SkillSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uiCategory, setUiCategory] = useState<UiCategory>("Todas");

  const isManagement = useMemo(
    () => isManagementJob(jobContext?.title, jobContext?.jobArea),
    [jobContext?.title, jobContext?.jobArea],
  );

  const suggestions = useMemo(() => {
    if (!isManagement) return [];
    return availableSkills.filter(matchesManagementSuggestion).slice(0, 8);
  }, [availableSkills, isManagement]);

  const sortedFilteredSkills = useMemo(() => {
    const predicate = getUiCategoryPredicate(uiCategory);
    const filtered = availableSkills.filter(predicate);
    return [...filtered].sort((a, b) => {
      const aCat = a.category ? 0 : 1;
      const bCat = b.category ? 0 : 1;
      return aCat - bCat;
    });
  }, [availableSkills, uiCategory]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-[hsl(var(--text))]">{title}</h3>
          <p className="text-sm text-[hsl(var(--text-muted))]">{description}</p>
          <div className="inline-flex w-fit rounded-full border border-[hsl(var(--primary))]/20 bg-[hsl(var(--accent-soft))] px-3 py-1 text-xs font-medium text-[hsl(var(--primary))]">
            {emphasis}
          </div>
          {warning ? (
            <div className="mt-2 rounded-2xl border border-[hsl(var(--warning))]/25 bg-[hsl(var(--warning))]/10 px-3 py-2 text-xs text-[hsl(var(--warning))]">
              {warning}
            </div>
          ) : null}
        </div>

        <div className="mt-5">
          {/* Search + Nova skill */}
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-2 text-sm font-medium text-[hsl(var(--text))]">
              Buscar skill
              <input
                type="text"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Digite nome de skill, ferramenta ou certificação"
                className="ui-input h-11 rounded-xl px-3 text-sm"
              />
            </label>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl"
                onClick={() => setIsModalOpen(true)}
              >
                <Plus className="mr-1 h-4 w-4" />
                Nova skill
              </Button>
            </div>
          </div>

          {/* Category chips */}
          <div
            role="group"
            aria-label="Filtrar por categoria"
            className="mt-3 flex flex-wrap gap-1.5"
          >
            {UI_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                aria-pressed={uiCategory === cat}
                onClick={() => setUiCategory(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  uiCategory === cat
                    ? "bg-[hsl(var(--primary))] text-white"
                    : "border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))] hover:border-[hsl(var(--primary))]/30 hover:text-[hsl(var(--primary))]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Suggestions for management jobs */}
          {isManagement && suggestions.length > 0 && (
            <div className="mt-4 rounded-2xl border border-[hsl(var(--primary))]/20 bg-[hsl(var(--accent-soft))] p-4">
              <p className="mb-2 text-xs font-semibold text-[hsl(var(--primary))]">
                Sugestões para esta vaga
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    disabled={savingSkillId === skill.id}
                    onClick={() => void onAddSkill(skill, addPriorityLevel)}
                    className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--primary))]/25 bg-white px-2.5 py-1 text-xs font-medium text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--primary))]/5 disabled:opacity-50 dark:bg-slate-900"
                  >
                    {savingSkillId === skill.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    {skill.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Skill grid */}
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sortedFilteredSkills.slice(0, 18).map((skill) => (
              <div
                key={skill.id}
                className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">{skill.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-[hsl(var(--text-muted))]">
                        {skill.category || "Sem categoria"}
                      </span>
                      {skill.catalog_type && skill.catalog_type !== "skill" && CATALOG_TYPE_BADGE[skill.catalog_type] && (
                        <span
                          className={`rounded-full px-1.5 py-px text-[10px] font-medium ${CATALOG_TYPE_BADGE[skill.catalog_type]}`}
                        >
                          {formatSkillType(skill.catalog_type)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={savingSkillId === skill.id}
                    onClick={() => void onAddSkill(skill, addPriorityLevel)}
                  >
                    {savingSkillId === skill.id ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="mr-1 h-3.5 w-3.5" />
                    )}
                    {addLabel}
                  </Button>
                </div>
              </div>
            ))}
            {sortedFilteredSkills.length === 0 && !search.trim() ? (
              <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] px-4 py-6 text-sm text-[hsl(var(--text-muted))] md:col-span-2 xl:col-span-3">
                Nenhuma skill disponível para este filtro.
              </div>
            ) : null}
            {search.trim() && sortedFilteredSkills.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/30 p-6 text-center md:col-span-2 xl:col-span-3 flex flex-col items-center gap-3">
                <div className="text-sm text-[hsl(var(--text-muted))]">
                  Nenhuma skill encontrada para{" "}
                  <span className="font-semibold text-[hsl(var(--text))]">
                    "{search.trim()}"
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsModalOpen(true)}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Criar "{search.trim()}"
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-[hsl(var(--text))]">Skills selecionadas</h4>
            <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
              {linkedSkills.length} item(ns) nesta etapa.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {linkedSkills.map((skill) => (
            <SelectedSkillRow
              key={"id" in skill ? skill.id : skill.skill_id}
              skill={skill}
              savingSkillId={savingSkillId}
              onUpdateSkill={onUpdateSkill}
              onRemoveSkill={onRemoveSkill}
              secondaryAction={secondaryAction}
            />
          ))}

          {linkedSkills.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] px-4 py-8 text-sm text-[hsl(var(--text-muted))]">
              Nenhuma skill adicionada nesta etapa.
            </div>
          ) : null}
        </div>
      </section>

      <CreateSkillModal
        open={isModalOpen}
        initialName={search.trim()}
        onClose={() => setIsModalOpen(false)}
        onSuccess={onSkillCreated}
      />
    </div>
  );
}
