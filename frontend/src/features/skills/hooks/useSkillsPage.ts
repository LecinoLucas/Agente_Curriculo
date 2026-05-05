import { useState, useEffect } from "react";
import { useAsyncState } from "../../../hooks/useAsyncState";
import { formatErrorForToast, handleApiError } from "../../../shared/utils/errorHandler";
import { skillsService } from "../../../services/skillsService";
import { toast } from "../../../shared/utils/toast";
import type { Skill } from "../../../types/domain";

export function useSkillsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");
  const { data, error, loading, run } = useAsyncState<Skill[]>();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void run(() => skillsService.list(searchQuery || undefined));
  }, [run, searchQuery, page, pageSize]);

  async function handleDelete() {
    if (!confirmDeleteId) return;
    try {
      await skillsService.delete(confirmDeleteId);
      toast.success("Skill excluída com sucesso");
      void run(() => skillsService.list(searchQuery || undefined));
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
    reloadList: () => run(() => skillsService.list(searchQuery || undefined)),
  };
}
