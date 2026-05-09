import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobSkill, PendingJobSkill, SkillEquivalenceGroup } from "../../../types/domain";
import { SkillSection } from "../components/SkillSection";
import { SectionCard } from "../../../shared/components/layout/SectionCard";

type JobFormDifferentialsStepProps = {
  form: {
    behavioral_requirements: string[];
    newBehavioralRequirement: string;
  };
  optionalSkills: Array<JobSkill | PendingJobSkill>;
  availableSkills: SkillEquivalenceGroup[];
  skillSearch: string;
  onSearchChange: (value: string) => void;
  onFormChange: (updates: { behavioral_requirements?: string[]; newBehavioralRequirement?: string }) => void;
  savingSkillId: string | null;
  onAddSkill: (skill: SkillEquivalenceGroup, isMandatory: boolean) => Promise<void>;
  onUpdateSkill: (skill: JobSkill | PendingJobSkill, patch: Partial<PendingJobSkill>) => Promise<void>;
  onRemoveSkill: (skill: JobSkill | PendingJobSkill) => Promise<void>;
  onAddBehavioralRequirement: () => void;
};

export function JobFormDifferentialsStep({
  form,
  optionalSkills,
  availableSkills,
  skillSearch,
  onSearchChange,
  onFormChange,
  savingSkillId,
  onAddSkill,
  onUpdateSkill,
  onRemoveSkill,
  onAddBehavioralRequirement,
}: JobFormDifferentialsStepProps) {
  return (
    <div className="space-y-6">
      <SkillSection
        title="Diferenciais"
        description="Use skills desejáveis para ferramentas, certificações, idiomas e experiências extras que ajudam no matching sem bloquear candidatos."
        emphasis={`${optionalSkills.length} skill(s) desejável(is)`}
        availableSkills={availableSkills}
        linkedSkills={optionalSkills}
        search={skillSearch}
        onSearchChange={onSearchChange}
        addLabel="Desejável"
        addMandatory={false}
        savingSkillId={savingSkillId}
        onAddSkill={onAddSkill}
        onUpdateSkill={onUpdateSkill}
        onRemoveSkill={onRemoveSkill}
      />

      <SectionCard
        title="Requisitos comportamentais"
        description="Esses itens ajudam a orientar a leitura da vaga e a futura avaliação."
      >
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            value={form.newBehavioralRequirement}
            onChange={(event) =>
              onFormChange({
                newBehavioralRequirement: event.target.value,
              })
            }
            className="ui-input h-11 flex-1 rounded-xl px-3 text-sm"
            placeholder="Ex: Comunicação com áreas de negócio"
          />
          <Button type="button" onClick={onAddBehavioralRequirement}>
            Adicionar
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {form.behavioral_requirements.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() =>
                onFormChange({
                  behavioral_requirements: form.behavioral_requirements.filter(
                    (value) => value !== item,
                  ),
                })
              }
              className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2 text-xs text-[hsl(var(--text))]"
            >
              {item}
              <Trash2 className="h-3.5 w-3.5 text-[hsl(var(--text-muted))]" />
            </button>
          ))}
          {form.behavioral_requirements.length === 0 ? (
            <p className="text-sm text-[hsl(var(--text-muted))]">
              Nenhum requisito comportamental adicionado.
            </p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
