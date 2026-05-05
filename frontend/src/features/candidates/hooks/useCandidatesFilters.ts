import { useEffect, useState } from "react";

export type ResumeFilter = "all" | "with" | "without";
export type AiStatusFilter = "all" | "completed" | "processing_or_pending" | "failed";

interface UseCandidatesFiltersProps {
  setPage: (page: number) => void;
}

export function useCandidatesFilters({ setPage }: UseCandidatesFiltersProps) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [resumeFilter, setResumeFilterState] = useState<ResumeFilter>("all");
  const [aiFilter, setAiFilterState] = useState<AiStatusFilter>("all");

  // Debounce search input — resets page on new search term
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, setPage]);

  function setResumeFilter(v: ResumeFilter) {
    setResumeFilterState(v);
    setPage(1);
  }

  function setAiFilter(v: AiStatusFilter) {
    setAiFilterState(v);
    setPage(1);
  }

  function clearFilters() {
    setSearchInput("");
    setResumeFilterState("all");
    setAiFilterState("all");
    setPage(1);
  }

  const hasActiveFilters = search || resumeFilter !== "all" || aiFilter !== "all";

  return {
    searchInput,
    setSearchInput,
    search,
    resumeFilter,
    setResumeFilter,
    aiFilter,
    setAiFilter,
    hasActiveFilters,
    clearFilters,
  };
}
