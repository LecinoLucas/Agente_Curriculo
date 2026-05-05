import type { JobSkill, PendingJobSkill, Skill } from "../../../types/domain";
import { SkillSection } from "../components/SkillSection";

type JobFormMandatorySkillsStepProps = {
  mandatorySkills: Array<JobSkill | PendingJobSkill>;
  availableSkills: Skill[];
  skillSearch: string;
  onSearchChange: (value: string) => void;
  savingSkillId: string | null;
  onAddSkill: (skill: Skill, isMandatory: boolean) => Promise<void>;
  onUpdateSkill: (skill: JobSkill | PendingJobSkill, patch: Partial<PendingJobSkill>) => Promise<void>;
  onRemoveSkill: (skill: JobSkill | PendingJobSkill) => Promise<void>;
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
}: JobFormMandatorySkillsStepProps) {
  return (
    <SkillSection
      title="Skills obrigatórias"
      description="Defina o que realmente impacta o score e o ranking. A publicação exige pelo menos 2 skills obrigatórias."
      emphasis={`${mandatorySkills.length} skill(s) obrigatória(s) • mínimo 2`}
      availableSkills={availableSkills}
      linkedSkills={mandatorySkills}
      search={skillSearch}
      onSearchChange={onSearchChange}
      addLabel="Obrigatória"
      addMandatory
      savingSkillId={savingSkillId}
      onAddSkill={onAddSkill}
      onUpdateSkill={onUpdateSkill}
      onRemoveSkill={onRemoveSkill}
    />
  );
}
