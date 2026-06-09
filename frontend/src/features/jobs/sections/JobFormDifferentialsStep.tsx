import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobSkill } from "../../../types/domain";
import type { PendingJobSkill } from "../jobFormConfig";
import { SkillSection } from "../components/SkillSection";
import { SectionCard } from "../../../shared/components/layout/SectionCard";
import type { SkillCatalog } from "../../../services/skillsService";

type JobFormDifferentialsStepProps = {
  form: {
    behavioral_requirements: string[];
    newBehavioralRequirement: string;
  };
  optionalSkills: Array<JobSkill | PendingJobSkill>;
  availableSkills: SkillCatalog[];
  skillSearch: string;
  onSearchChange: (value: string) => void;
  skillCategoryFilter: string;
  onSkillCategoryFilterChange: (value: string) => void;
  skillCategoryOptions: string[];
  skillTypeFilter: string;
  onSkillTypeFilterChange: (value: string) => void;
  skillTypeOptions: string[];
  onFormChange: (updates: { behavioral_requirements?: string[]; newBehavioralRequirement?: string }) => void;
  savingSkillId: string | null;
  onAddSkill: (
    skill: SkillCatalog | string,
    priorityLevel: "priority" | "complementary" | "eliminatory",
  ) => Promise<void>;
  onUpdateSkill: (skill: JobSkill | PendingJobSkill, patch: Partial<PendingJobSkill>) => Promise<void>;
  onRemoveSkill: (skill: JobSkill | PendingJobSkill) => Promise<void>;
  onAddBehavioralRequirement: () => void;
  onSkillCreated: (skill: SkillCatalog) => void;
  jobContext?: { title?: string; jobArea?: string };
  hideBehavioral?: boolean;
};

export function JobFormDifferentialsStep({
  form,
  optionalSkills,
  availableSkills,
  skillSearch,
  onSearchChange,
  skillCategoryFilter,
  onSkillCategoryFilterChange,
  skillCategoryOptions,
  skillTypeFilter,
  onSkillTypeFilterChange,
  skillTypeOptions,
  onFormChange,
  savingSkillId,
  onAddSkill,
  onUpdateSkill,
  onRemoveSkill,
  onAddBehavioralRequirement,
  onSkillCreated,
  jobContext,
  hideBehavioral = false,
}: JobFormDifferentialsStepProps) {
  return (
    <div className="space-y-6">
      <SkillSection
        title="Diferenciais"
        description="Somam pontos no ranking, mas não punem forte se ausentes."
        emphasis={`${optionalSkills.length} skill(s) diferencial(is)`}
        availableSkills={availableSkills}
        linkedSkills={optionalSkills}
        search={skillSearch}
        onSearchChange={onSearchChange}
        categoryFilter={skillCategoryFilter}
        onCategoryFilterChange={onSkillCategoryFilterChange}
        categoryOptions={skillCategoryOptions}
        typeFilter={skillTypeFilter}
        onTypeFilterChange={onSkillTypeFilterChange}
        typeOptions={skillTypeOptions}
        addLabel="Diferencial"
        addPriorityLevel="complementary"
        savingSkillId={savingSkillId}
        onAddSkill={onAddSkill}
        onUpdateSkill={onUpdateSkill}
        onRemoveSkill={onRemoveSkill}
        onSkillCreated={onSkillCreated}
        secondaryAction={{
          label: "Tornar essencial",
          targetPriorityLevel: "priority",
        }}
        jobContext={jobContext}
      />

      {!hideBehavioral && (
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
              className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-11 flex-1 rounded-xl px-3 text-sm"
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
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-2 text-xs text-text"
              >
                {item}
                <Trash2 className="h-3.5 w-3.5 text-text-muted" />
              </button>
            ))}
            {form.behavioral_requirements.length === 0 ? (
              <p className="text-sm text-text-muted">
                Nenhum requisito comportamental adicionado.
              </p>
            ) : null}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
