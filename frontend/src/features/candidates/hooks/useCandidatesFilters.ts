import { useEffect, useMemo, useState } from "react";

export type TalentBaseTab = "all" | "talent_pool" | "saved";
export type ResumeFilter = "all" | "with" | "without";
export type AiStatusFilter = "all" | "completed" | "processing_or_pending" | "failed";
export type ApplicationSourceFilter = "all" | "public_application" | "manual" | "import";
export type DesiredContractTypeFilter = "all" | "CLT" | "PJ" | "Indiferente";
export type LinkStatusFilter = "all" | "with_active_job" | "without_active_job" | "closed_process";

interface UseCandidatesFiltersProps {
  setPage: (page: number) => void;
}

export function useCandidatesFilters({ setPage }: UseCandidatesFiltersProps) {
  const [activeTab, setActiveTabState] = useState<TalentBaseTab>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [city, setCityState] = useState("");
  const [state, setStateState] = useState("");
  const [skill, setSkillState] = useState("");
  const [seniority, setSeniorityState] = useState("");
  const [salaryMin, setSalaryMinState] = useState("");
  const [salaryMax, setSalaryMaxState] = useState("");
  const [resumeFilter, setResumeFilterState] = useState<ResumeFilter>("all");
  const [aiFilter, setAiFilterState] = useState<AiStatusFilter>("all");
  const [applicationSourceFilter, setApplicationSourceFilterState] =
    useState<ApplicationSourceFilter>("all");
  const [desiredContractTypeFilter, setDesiredContractTypeFilterState] =
    useState<DesiredContractTypeFilter>("all");
  const [linkStatusFilter, setLinkStatusFilterState] = useState<LinkStatusFilter>("all");
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, setPage]);

  const setActiveTab = (tab: TalentBaseTab) => {
    setActiveTabState(tab);
    setPage(1);
  };

  const setCity = (value: string) => {
    setCityState(value);
    setPage(1);
  };

  const setState = (value: string) => {
    setStateState(value);
    setPage(1);
  };

  const setSkill = (value: string) => {
    setSkillState(value);
    setPage(1);
  };

  const setSeniority = (value: string) => {
    setSeniorityState(value);
    setPage(1);
  };

  const setSalaryMin = (value: string) => {
    setSalaryMinState(value);
    setPage(1);
  };

  const setSalaryMax = (value: string) => {
    setSalaryMaxState(value);
    setPage(1);
  };

  const setResumeFilter = (value: ResumeFilter) => {
    setResumeFilterState(value);
    setPage(1);
  };

  const setAiFilter = (value: AiStatusFilter) => {
    setAiFilterState(value);
    setPage(1);
  };

  const setApplicationSourceFilter = (value: ApplicationSourceFilter) => {
    setApplicationSourceFilterState(value);
    setPage(1);
  };

  const setDesiredContractTypeFilter = (value: DesiredContractTypeFilter) => {
    setDesiredContractTypeFilterState(value);
    setPage(1);
  };

  const setLinkStatusFilter = (value: LinkStatusFilter) => {
    setLinkStatusFilterState(value);
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setCityState("");
    setStateState("");
    setSkillState("");
    setSeniorityState("");
    setSalaryMinState("");
    setSalaryMaxState("");
    setResumeFilterState("all");
    setAiFilterState("all");
    setApplicationSourceFilterState("all");
    setDesiredContractTypeFilterState("all");
    setLinkStatusFilterState("all");
    setPage(1);
  };

  const hasActiveFilters = useMemo(
    () =>
      search.length > 0 ||
      city.trim().length > 0 ||
      state.trim().length > 0 ||
      skill.trim().length > 0 ||
      seniority.trim().length > 0 ||
      salaryMin.trim().length > 0 ||
      salaryMax.trim().length > 0 ||
      resumeFilter !== "all" ||
      aiFilter !== "all" ||
      applicationSourceFilter !== "all" ||
      desiredContractTypeFilter !== "all" ||
      linkStatusFilter !== "all" ||
      activeTab !== "all",
    [
      search,
      city,
      state,
      skill,
      seniority,
      salaryMin,
      salaryMax,
      resumeFilter,
      aiFilter,
      applicationSourceFilter,
      desiredContractTypeFilter,
      linkStatusFilter,
      activeTab,
    ],
  );

  return {
    activeTab,
    setActiveTab,
    searchInput,
    setSearchInput,
    search,
    city,
    setCity,
    state,
    setState,
    skill,
    setSkill,
    seniority,
    setSeniority,
    salaryMin,
    setSalaryMin,
    salaryMax,
    setSalaryMax,
    resumeFilter,
    setResumeFilter,
    aiFilter,
    setAiFilter,
    applicationSourceFilter,
    setApplicationSourceFilter,
    desiredContractTypeFilter,
    setDesiredContractTypeFilter,
    linkStatusFilter,
    setLinkStatusFilter,
    showAdvanced,
    setShowAdvanced,
    hasActiveFilters,
    clearFilters,
  };
}
