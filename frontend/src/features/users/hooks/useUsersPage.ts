import { useEffect, useState } from "react";
import { usersService } from "../../../services/usersService";
import { formatErrorDetails, handleApiError } from "../../../shared/utils/errorHandler";
import { toast } from "../../../shared/utils/toast";
import { Paginated, UserSummary } from "../../../types/domain";

export function useUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [data, setData] = useState<Paginated<UserSummary> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function toFriendlyText(error: unknown): string {
    return formatErrorDetails(handleApiError(error)).join(" ");
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setData(
        await usersService.list(
          page,
          20,
          search || undefined,
          roleFilter || undefined,
          statusFilter || undefined,
        ),
      );
    } catch (err) {
      setLoadError(toFriendlyText(err) || "Falha ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page, search, roleFilter, statusFilter]);

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function clearFilters() {
    setSearch("");
    setSearchInput("");
    setRoleFilter("");
    setStatusFilter("");
    setPage(1);
  }

  async function handleActivate(id: string) {
    try {
      await usersService.activate(id);
      toast.success("Usuário ativado");
      await load();
    } catch (err) {
      toast.error(toFriendlyText(handleApiError(err)));
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await usersService.deactivate(id);
      toast.success("Usuário desativado");
      await load();
    } catch (err) {
      toast.error(toFriendlyText(handleApiError(err)));
    }
  }

  function setDeleteId(id: string | null) {
    setConfirmDeleteId(id);
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    const user = data?.data.find((item) => item.id === confirmDeleteId);
    try {
      await usersService.delete(confirmDeleteId);
      toast.success(`Usuário "${user?.full_name ?? ""}" excluído`);
      setConfirmDeleteId(null);
      await load();
    } catch (err) {
      toast.error(toFriendlyText(handleApiError(err)));
      setConfirmDeleteId(null);
    }
  }

  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const items = data?.data ?? [];
  const hasFilters = !!(search || roleFilter || statusFilter);

  const activeCount = items.filter((user) => user.status === "active").length;
  const adminCount = items.filter((user) => user.role === "admin").length;
  const pendingPasswordCount = items.filter((user) => user.must_change_password).length;

  return {
    page,
    setPage,
    search,
    setSearch,
    searchInput,
    setSearchInput,
    roleFilter,
    setRoleFilter,
    statusFilter,
    setStatusFilter,
    data,
    loading,
    loadError,
    items,
    total,
    totalPages,
    hasFilters,
    activeCount,
    adminCount,
    pendingPasswordCount,
    confirmDeleteId,
    setDeleteId,
    load,
    handleSearchSubmit,
    clearFilters,
    handleActivate,
    handleDeactivate,
    handleDelete,
  };
}
