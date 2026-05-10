import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobSkill, SkillEquivalenceGroup } from "../../../types/domain";
import type { PendingJobSkill } from "../jobFormConfig";

type SkillSectionProps = {
  title: string;
  description: string;
  emphasis: string;
  availableSkills: SkillEquivalenceGroup[];
  linkedSkills: Array<JobSkill | PendingJobSkill>;
  search: string;
  onSearchChange: (value: string) => void;
  addLabel: string;
  addPriorityLevel: "priority" | "complementary" | "eliminatory";
  savingSkillId: string | null;
  onAddSkill: (
    skill: SkillEquivalenceGroup | string,
    priorityLevel: "priority" | "complementary" | "eliminatory",
  ) => Promise<void>;
  onUpdateSkill: (skill: JobSkill | PendingJobSkill, patch: Partial<PendingJobSkill>) => Promise<void>;
  onRemoveSkill: (skill: JobSkill | PendingJobSkill) => Promise<void>;
  warning?: string | null;
};

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
  warning,
}: SkillSectionProps) {
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
          <label className="flex flex-col gap-2 text-sm font-medium text-[hsl(var(--text))]">
            Buscar skill
            <input
              type="text"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Digite nome de skill, ferramenta ou certificação"
              className="ui-input h-11 rounded-xl px-3 text-sm"
            />
          </label>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {availableSkills.slice(0, 18).map((skill) => (
              <div
                key={skill.id}
                className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">{skill.canonical}</p>
                    <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                      {skill.domains.join(", ") || skill.type || "Sem domínio"}
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
            {search.trim() && !availableSkills.some(s => s.canonical.toLowerCase() === search.trim().toLowerCase()) ? (
              <div className="rounded-2xl border border-dashed border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary-soft))]/30 p-4 md:col-span-2 xl:col-span-3 flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-semibold text-[hsl(var(--text))]">"{search.trim()}"</span> não foi encontrada no catálogo.
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  disabled={savingSkillId === search.trim()}
                  onClick={() => void onAddSkill(search.trim(), addPriorityLevel)}
                >
                  {savingSkillId === search.trim() ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="mr-1 h-3.5 w-3.5" />
                  )}
                  Adicionar {addLabel}
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
            <div
              key={skill.skill_id}
              className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/40 p-4"
            >
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
                      value={skill.weight}
                      onChange={(event) =>
                        void onUpdateSkill(skill, { weight: Number(event.target.value) })
                      }
                      className="ui-input h-10 rounded-xl px-3 text-sm"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-[hsl(var(--text-muted))]">
                    Nível mínimo
                    <select
                      value={skill.minimum_level ?? ""}
                      onChange={(event) =>
                        void onUpdateSkill(skill, { minimum_level: event.target.value || null })
                      }
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
                      value={skill.minimum_years ?? ""}
                      onChange={(event) =>
                        void onUpdateSkill(skill, {
                          minimum_years: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                      className="ui-input h-10 rounded-xl px-3 text-sm"
                      placeholder="—"
                    />
                  </label>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onRemoveSkill(skill)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remover
                </Button>
              </div>
            </div>
          ))}

          {linkedSkills.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] px-4 py-8 text-sm text-[hsl(var(--text-muted))]">
              Nenhuma skill adicionada nesta etapa.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
