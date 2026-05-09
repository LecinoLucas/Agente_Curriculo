import { useMemo, useState } from "react";
import { jobSkillsService } from "../../../services/jobSkillsService";
import type { JobSkill, PendingJobSkill, SkillEquivalenceGroup } from "../../../types/domain";

interface UseJobSkillsOptions {
  currentJob: { id: string } | null;
  onRefreshQuality: (jobId: string) => Promise<void>;
}

export function useJobSkills(options: UseJobSkillsOptions) {
  const [jobSkills, setJobSkills] = useState<JobSkill[]>([]);
  const [pendingSkills, setPendingSkills] = useState<PendingJobSkill[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [savingSkillId, setSavingSkillId] = useState<string | null>(null);
  const [allSkills, setAllSkills] = useState<SkillEquivalenceGroup[]>([]);

  const combinedSkills = useMemo<Array<JobSkill | PendingJobSkill>>(() => {
    if (jobSkills.length === 0) return pendingSkills;

    const items: Array<JobSkill | PendingJobSkill> = [...jobSkills];
    for (const pending of pendingSkills) {
      if (!items.some((skill) => skill.skill_id === pending.skill_id)) {
        items.push(pending);
      }
    }
    return items;
  }, [jobSkills, pendingSkills]);

  const mandatorySkills = useMemo(
    () => combinedSkills.filter((skill) => skill.is_mandatory),
    [combinedSkills],
  );

  const optionalSkills = useMemo(
    () => combinedSkills.filter((skill) => !skill.is_mandatory),
    [combinedSkills],
  );

  const availableSkills = useMemo(() => {
    const linkedIds = new Set(combinedSkills.map((skill) => skill.skill_id));
    return allSkills.filter((skill) => {
      if (linkedIds.has(skill.id)) return false;
      if (!skillSearch.trim()) return true;
      const query = skillSearch.trim().toLowerCase();
      return (
        skill.canonical.toLowerCase().includes(query) ||
        skill.aliases.some((alias) => alias.toLowerCase().includes(query)) ||
        skill.domains.some((domain) => domain.toLowerCase().includes(query))
      );
    });
  }, [allSkills, combinedSkills, skillSearch]);

  async function handleAddSkill(skill: SkillEquivalenceGroup, isMandatory: boolean) {
    setSavingSkillId(skill.id);
    try {
      if (options.currentJob) {
        await jobSkillsService.addJobSkill(options.currentJob.id, {
          skill_name: skill.canonical,
          is_mandatory: isMandatory,
          weight: 1,
        });
        const refreshedSkills = await jobSkillsService.listJobSkills(options.currentJob.id);
        setJobSkills(refreshedSkills);
        await options.onRefreshQuality(options.currentJob.id);
      } else {
        setPendingSkills((current) => [
          ...current,
          {
            skill_id: skill.id,
            skill_name: skill.canonical,
            is_mandatory: isMandatory,
            minimum_level: null,
            minimum_years: null,
            weight: 1,
          },
        ]);
      }
    } finally {
      setSavingSkillId(null);
    }
  }

  async function handleUpdateSkill(
    skill: JobSkill | PendingJobSkill,
    patch: Partial<PendingJobSkill>,
  ) {
    if (options.currentJob && "id" in skill) {
      setSavingSkillId(skill.skill_id);
      try {
        await jobSkillsService.updateJobSkill(options.currentJob.id, skill, {
          is_mandatory: patch.is_mandatory ?? skill.is_mandatory,
          minimum_level: patch.minimum_level ?? skill.minimum_level,
          minimum_years: patch.minimum_years ?? skill.minimum_years,
          weight: patch.weight ?? skill.weight,
        });
        const refreshedSkills = await jobSkillsService.listJobSkills(options.currentJob.id);
        setJobSkills(refreshedSkills);
        await options.onRefreshQuality(options.currentJob.id);
      } finally {
        setSavingSkillId(null);
      }
      return;
    }

    setPendingSkills((current) =>
      current.map((item) =>
        item.skill_id === skill.skill_id ? { ...item, ...patch } : item,
      ),
    );
  }

  async function handleRemoveSkill(skill: JobSkill | PendingJobSkill) {
    if (options.currentJob && "id" in skill) {
      setSavingSkillId(skill.skill_id);
      try {
        await jobSkillsService.removeJobSkill(options.currentJob.id, skill.skill_id);
        const refreshedSkills = await jobSkillsService.listJobSkills(options.currentJob.id);
        setJobSkills(refreshedSkills);
        await options.onRefreshQuality(options.currentJob.id);
      } finally {
        setSavingSkillId(null);
      }
      return;
    }

    setPendingSkills((current) => current.filter((item) => item.skill_id !== skill.skill_id));
  }

  async function syncPendingSkills(jobIdToSync: string) {
    if (pendingSkills.length === 0) return;

    for (const skill of pendingSkills) {
      await jobSkillsService.addJobSkill(jobIdToSync, {
        skill_name: skill.skill_name,
        is_mandatory: skill.is_mandatory,
        minimum_level: skill.minimum_level ?? undefined,
        minimum_years: skill.minimum_years ?? undefined,
        weight: skill.weight,
      });
    }

    const refreshedSkills = await jobSkillsService.listJobSkills(jobIdToSync);
    setJobSkills(refreshedSkills);
    setPendingSkills([]);
  }

  return {
    jobSkills,
    setJobSkills,
    pendingSkills,
    setPendingSkills,
    skillSearch,
    setSkillSearch,
    savingSkillId,
    allSkills,
    setAllSkills,
    combinedSkills,
    mandatorySkills,
    optionalSkills,
    availableSkills,
    handleAddSkill,
    handleUpdateSkill,
    handleRemoveSkill,
    syncPendingSkills,
  };
}
