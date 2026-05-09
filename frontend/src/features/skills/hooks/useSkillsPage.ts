import { useState, useEffect } from "react";
import { useAsyncState } from "../../../hooks/useAsyncState";
import { formatErrorForToast, handleApiError } from "../../../shared/utils/errorHandler";
import { skillEquivalencesService } from "../../../services/skillEquivalencesService";
import { toast } from "../../../shared/utils/toast";
import type { SkillEquivalenceGroup } from "../../../types/domain";

export function useSkillsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");
  const { data, error, loading, run } = useAsyncState<SkillEquivalenceGroup[]>();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void run(() => skillEquivalencesService.list(searchQuery || undefined));
  }, [run, searchQuery, page, pageSize]);

  async function handleDelete() {
    if (!confirmDeleteId) return;
    try {
      await skillEquivalencesService.delete(confirmDeleteId);
      toast.success("Equivalência excluída com sucesso");
      void run(() => skillEquivalencesService.list(searchQuery || undefined));
    } catch (err) {
      toast.error(formatErrorForToast(handleApiError(err)));
    } finally {
      setConfirmDeleteId(null);
    }
  }

  const items = data ?? [];
  const total = items.length;
  const hasActiveSearch = searchQuery.trim().length > 0;
  const isEmptyState = !loading && !error && total === 0;

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    searchQuery,
    setSearchQuery,
    loading,
    error,
    items,
    total,
    hasActiveSearch,
    isEmptyState,
    confirmDeleteId,
    setConfirmDeleteId,
    handleDelete,
    reloadList: () => run(() => skillEquivalencesService.list(searchQuery || undefined)),
  };
}
