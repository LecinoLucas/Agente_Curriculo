import { useMemo, useState, useEffect } from "react";
import { jobSkillsService } from "../../../services/jobSkillsService";
import { skillsService, SkillCatalog } from "../../../services/skillsService";
import { formatErrorForToast, handleApiError } from "../../../shared/utils/errorHandler";
import { toast } from "../../../shared/utils/toast";
import type { JobSkill } from "../../../types/domain";
import type { PendingJobSkill } from "../jobFormConfig";

interface UseJobSkillsOptions {
  currentJob: { id: string } | null;
  onRefreshQuality: (jobId: string) => Promise<void>;
}

function normalizeSkillName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isSkillAlreadyLinked(
  linkedSkills: Array<JobSkill | PendingJobSkill>,
  skillName: string,
): boolean {
  const normalizedSkillName = normalizeSkillName(skillName);
  return linkedSkills.some((skill) => normalizeSkillName(skill.skill_name) === normalizedSkillName);
}

export function useJobSkills(options: UseJobSkillsOptions) {
  const [jobSkills, setJobSkills] = useState<JobSkill[]>([]);
  const [pendingSkills, setPendingSkills] = useState<PendingJobSkill[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [skillCategoryFilter, setSkillCategoryFilter] = useState("");
  const [skillTypeFilter, setSkillTypeFilter] = useState("");
  const [savingSkillId, setSavingSkillId] = useState<string | null>(null);
  const [allSkills, setAllSkills] = useState<SkillCatalog[]>([]);
  const [skillFilterOptionsSource, setSkillFilterOptionsSource] = useState<SkillCatalog[]>([]);

  useEffect(() => {
    let cancelled = false;

    void skillsService
      .listSkills({
        page_size: 100,
        is_active: true,
      })
      .then((response) => {
        if (!cancelled) {
          setSkillFilterOptionsSource(response.data);
        }
      })
      .catch((error) => {
        console.error("Erro ao buscar filtros de skills:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handler = setTimeout(async () => {
      try {
        const response = await skillsService.listSkills({
          search: skillSearch.trim() || undefined,
          category: skillCategoryFilter || undefined,
          catalog_type: skillTypeFilter || undefined,
          page_size: 50,
          is_active: true,
        });
        if (!cancelled) {
          setAllSkills(response.data);
        }
      } catch (error) {
        console.error("Erro ao buscar skills:", error);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handler);
    };
  }, [skillSearch, skillCategoryFilter, skillTypeFilter]);

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
    () => combinedSkills.filter((skill) => skill.priority_level === "priority"),
    [combinedSkills],
  );

  const optionalSkills = useMemo(
    () => combinedSkills.filter((skill) => skill.priority_level === "complementary"),
    [combinedSkills],
  );

  const eliminatorySkills = useMemo(
    () => combinedSkills.filter((skill) => skill.priority_level === "eliminatory"),
    [combinedSkills],
  );

  const availableSkills = useMemo(() => {
    const linkedIds = new Set(combinedSkills.map((skill) => skill.skill_id));
    return allSkills.filter((skill) => {
      if (linkedIds.has(skill.id)) return false;
      return true;
    });
  }, [allSkills, combinedSkills]);

  const skillCategoryOptions = useMemo(() => {
    const categories = new Set<string>();
    for (const skill of [...skillFilterOptionsSource, ...allSkills]) {
      const category = skill.category?.trim();
      if (category) categories.add(category);
    }
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [allSkills, skillFilterOptionsSource]);

  const skillTypeOptions = useMemo(() => {
    const types = new Set<string>();
    for (const skill of [...skillFilterOptionsSource, ...allSkills]) {
      const type = skill.catalog_type?.trim();
      if (type) types.add(type);
    }
    return Array.from(types).sort((a, b) => a.localeCompare(b));
  }, [allSkills, skillFilterOptionsSource]);

  async function handleAddSkill(
    skill: SkillCatalog | string,
    priorityLevel: "priority" | "complementary" | "eliminatory",
  ) {
    const skillName = typeof skill === "string" ? skill.trim() : skill.name;
    const skillId = typeof skill === "string" ? crypto.randomUUID() : skill.id;

    if (!skillName) return;

    if (isSkillAlreadyLinked(combinedSkills, skillName)) {
      toast.warning("Skill já vinculada a esta vaga.");
      return;
    }

    setSavingSkillId(skillId);
    try {
      if (options.currentJob) {
        await jobSkillsService.addJobSkill(options.currentJob.id, {
          skill_name: skillName,
          priority_level: priorityLevel,
          weight: 1,
        });
        const refreshedSkills = await jobSkillsService.listJobSkills(options.currentJob.id);
        setJobSkills(refreshedSkills);
        await options.onRefreshQuality(options.currentJob.id);
      } else {
        setPendingSkills((current) => [
          ...current,
          {
            skill_id: skillId,
            skill_name: skillName,
            priority_level: priorityLevel,
            minimum_level: null,
            minimum_years: null,
            weight: 1,
          },
        ]);
      }
    } catch (error) {
      if (options.currentJob) {
        try {
          const refreshedSkills = await jobSkillsService.listJobSkills(options.currentJob.id);
          setJobSkills(refreshedSkills);
        } catch {
          // Keep original error feedback if the follow-up refresh fails.
        }
      }
      toast.error(formatErrorForToast(handleApiError(error)));
      return;
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
        setJobSkills((current) =>
          current.map((item) =>
            item.id === skill.id ? { ...item, ...patch } : item,
          ),
        );
        await jobSkillsService.updateJobSkill(options.currentJob.id, skill, {
          priority_level: patch.priority_level ?? skill.priority_level,
          minimum_level: patch.minimum_level ?? skill.minimum_level,
          minimum_years: patch.minimum_years ?? skill.minimum_years,
          weight: patch.weight ?? skill.weight,
        });
        const refreshedSkills = await jobSkillsService.listJobSkills(options.currentJob.id);
        setJobSkills(refreshedSkills);
        await options.onRefreshQuality(options.currentJob.id);
      } catch (error) {
        try {
          const refreshedSkills = await jobSkillsService.listJobSkills(options.currentJob.id);
          setJobSkills(refreshedSkills);
        } catch {
          // Keep original error feedback if the follow-up refresh fails.
        }
        toast.error(formatErrorForToast(handleApiError(error)));
        throw error;
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
        await jobSkillsService.removeJobSkill(options.currentJob.id, skill.id);
        const refreshedSkills = await jobSkillsService.listJobSkills(options.currentJob.id);
        setJobSkills(refreshedSkills);
        await options.onRefreshQuality(options.currentJob.id);
      } catch (error) {
        try {
          const refreshedSkills = await jobSkillsService.listJobSkills(options.currentJob.id);
          setJobSkills(refreshedSkills);
        } catch {
          // Keep original error feedback if the follow-up refresh fails.
        }
        toast.error(formatErrorForToast(handleApiError(error)));
        throw error;
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
        priority_level: skill.priority_level,
        minimum_level: skill.minimum_level ?? undefined,
        minimum_years: skill.minimum_years ?? undefined,
        weight: skill.weight,
      });
    }

    const refreshedSkills = await jobSkillsService.listJobSkills(jobIdToSync);
    setJobSkills(refreshedSkills);
    setPendingSkills([]);
  }

  const onSkillCreated = (skill: SkillCatalog) => {
    setAllSkills((current) => [skill, ...current]);
    setSkillFilterOptionsSource((current) => [skill, ...current]);
  };

  return {
    jobSkills,
    setJobSkills,
    pendingSkills,
    setPendingSkills,
    skillSearch,
    setSkillSearch,
    skillCategoryFilter,
    setSkillCategoryFilter,
    skillTypeFilter,
    setSkillTypeFilter,
    skillCategoryOptions,
    skillTypeOptions,
    savingSkillId,
    allSkills,
    setAllSkills,
    combinedSkills,
    mandatorySkills,
    optionalSkills,
    eliminatorySkills,
    availableSkills,
    handleAddSkill,
    handleUpdateSkill,
    handleRemoveSkill,
    syncPendingSkills,
    onSkillCreated,
  };
}
