import type { JobSkill } from "../../../types/domain";
import type { PendingJobSkill } from "../jobFormConfig";
import { SkillSection } from "../components/SkillSection";
import type { SkillCatalog } from "../../../services/skillsService";

type JobFormMandatorySkillsStepProps = {
  mandatorySkills: Array<JobSkill | PendingJobSkill>;
  availableSkills: SkillCatalog[];
  skillSearch: string;
  onSearchChange: (value: string) => void;
  savingSkillId: string | null;
  onAddSkill: (
    skill: SkillCatalog | string,
    priorityLevel: "priority" | "complementary" | "eliminatory",
  ) => Promise<void>;
  onUpdateSkill: (skill: JobSkill | PendingJobSkill, patch: Partial<PendingJobSkill>) => Promise<void>;
  onRemoveSkill: (skill: JobSkill | PendingJobSkill) => Promise<void>;
  onSkillCreated: (skill: SkillCatalog) => void;
};

export function JobFormMandatorySkillsStep({
  mandatorySkills,
  availableSkills,
  skillSearch,
  onSearchChange,
  savingSkillId,
  onAddSkill,
  onUpdateSkill,
  onRemoveSkill,
  onSkillCreated,
}: JobFormMandatorySkillsStepProps) {
  return (
    <SkillSection
      title="Essenciais"
      description="Use para as 3–5 competências centrais da vaga."
      emphasis={`${mandatorySkills.length} skill(s) essencial(is) • mínimo 2`}
      availableSkills={availableSkills}
      linkedSkills={mandatorySkills}
      search={skillSearch}
      onSearchChange={onSearchChange}
      addLabel="Essencial"
      addPriorityLevel="priority"
      savingSkillId={savingSkillId}
      onAddSkill={onAddSkill}
      onUpdateSkill={onUpdateSkill}
      onRemoveSkill={onRemoveSkill}
      onSkillCreated={onSkillCreated}
      warning={
        mandatorySkills.length > 5
          ? "Muitas skills essenciais podem deixar o ranking restritivo. Considere mover algumas para diferenciais."
          : null
      }
    />
  );
}
