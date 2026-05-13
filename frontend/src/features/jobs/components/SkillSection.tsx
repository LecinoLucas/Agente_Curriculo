import { ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobSkill } from "../../../types/domain";
import type { PendingJobSkill } from "../jobFormConfig";
import type { SkillCatalog } from "../../../services/skillsService";
import { useEffect, useState } from "react";
import { CreateSkillModal } from "./CreateSkillModal";

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
};

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
  const hasUnsavedDetails =
    hasUnsavedWeight || hasUnsavedMinimumYears;
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

export function SkillSection({
  title,
  description,
  emphasis,
  availableSkills,
  linkedSkills,
  search,
  onSearchChange,
  categoryFilter = "",
  onCategoryFilterChange,
  categoryOptions = [],
  typeFilter = "",
  onTypeFilterChange,
  typeOptions = [],
  addLabel,
  addPriorityLevel,
  savingSkillId,
  onAddSkill,
  onUpdateSkill,
  onRemoveSkill,
  onSkillCreated,
  secondaryAction,
  warning,
}: SkillSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
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
          <div className="flex flex-col gap-2">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_160px_auto] lg:items-end">
              <label className="flex flex-col gap-2 text-sm font-medium text-[hsl(var(--text))] flex-1">
                Buscar skill
                <input
                  type="text"
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Digite nome de skill, ferramenta ou certificação"
                  className="ui-input h-11 rounded-xl px-3 text-sm"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-[hsl(var(--text))]">
                Categoria
                <select
                  value={categoryFilter}
                  onChange={(event) => onCategoryFilterChange?.(event.target.value)}
                  className="ui-input h-11 rounded-xl px-3 text-sm"
                >
                  <option value="">Todas</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-[hsl(var(--text))]">
                Tipo
                <select
                  value={typeFilter}
                  onChange={(event) => onTypeFilterChange?.(event.target.value)}
                  className="ui-input h-11 rounded-xl px-3 text-sm"
                >
                  <option value="">Todos</option>
                  {typeOptions.map((type) => (
                    <option key={type} value={type}>
                      {formatSkillType(type)}
                    </option>
                  ))}
                </select>
              </label>
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

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {availableSkills.slice(0, 18).map((skill) => (
              <div
                key={skill.id}
                className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">{skill.name}</p>
                    <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                      {skill.category || "Sem categoria"}
                    </p>
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
            {availableSkills.length === 0 && !search.trim() ? (
              <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] px-4 py-6 text-sm text-[hsl(var(--text-muted))] md:col-span-2 xl:col-span-3">
                Nenhuma skill disponível para este filtro.
              </div>
            ) : null}
            {search.trim() && availableSkills.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/30 p-6 text-center md:col-span-2 xl:col-span-3 flex flex-col items-center gap-3">
                <div className="text-sm text-[hsl(var(--text-muted))]">
                  Nenhuma skill encontrada para <span className="font-semibold text-[hsl(var(--text))]">"{search.trim()}"</span>
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
