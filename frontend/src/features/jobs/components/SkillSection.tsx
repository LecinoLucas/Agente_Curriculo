import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobSkill, PendingJobSkill, SkillEquivalenceGroup } from "../../../types/domain";

type SkillSectionProps = {
  title: string;
  description: string;
  emphasis: string;
  availableSkills: SkillEquivalenceGroup[];
  linkedSkills: Array<JobSkill | PendingJobSkill>;
  search: string;
  onSearchChange: (value: string) => void;
  addLabel: string;
  addMandatory: boolean;
  savingSkillId: string | null;
  onAddSkill: (skill: SkillEquivalenceGroup, isMandatory: boolean) => Promise<void>;
  onUpdateSkill: (skill: JobSkill | PendingJobSkill, patch: Partial<PendingJobSkill>) => Promise<void>;
  onRemoveSkill: (skill: JobSkill | PendingJobSkill) => Promise<void>;
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
  addMandatory,
  savingSkillId,
  onAddSkill,
  onUpdateSkill,
  onRemoveSkill,
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
                    onClick={() => void onAddSkill(skill, addMandatory)}
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
            {availableSkills.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] px-4 py-6 text-sm text-[hsl(var(--text-muted))] md:col-span-2 xl:col-span-3">
                Nenhuma skill disponível para este filtro.
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
                    {skill.is_mandatory ? "Obrigatória" : "Desejável"}
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
                  onClick={() =>
                    void onUpdateSkill(skill, { is_mandatory: !skill.is_mandatory })
                  }
                >
                  {skill.is_mandatory ? "Mover para desejáveis" : "Mover para obrigatórias"}
                </Button>
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
