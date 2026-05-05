import { RefreshCw } from "lucide-react";
import { CandidateDrawer } from "../features/pipeline/CandidateDrawer";
import { usePipeline } from "../features/pipeline/PipelineContext";
import { PageHeader } from "../components/common/PageHeader";
import { AnalysisFilters } from "../features/analyses/components/AnalysisFilters";
import { AnalysesTable } from "../features/analyses/components/AnalysesTable";
import { useAnalysesPage } from "../features/analyses/hooks/useAnalysesPage";

export function AnalisesIaPage() {
  const { openCandidate, selectedCandidateId } = usePipeline();

  const {
    page,
    setPage,
    searchInput,
    setSearchInput,
    statusFilter,
    handleStatusFilter,
    aiFilter,
    handleAiFilter,
    actionId,
    loading,
    error,
    items,
    total,
    totalPages,
    isRefreshing,
    showInitialLoading,
    hasActiveFilters,
    fetchData,
    clearFilters,
    handleRetry,
    handleForceFail,
  } = useAnalysesPage();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--bg))] px-6 py-5">
        <PageHeader
          title="Análises IA"
          subtitle={
            loading
              ? "Carregando…"
              : total === 0
                ? hasActiveFilters
                  ? "Nenhuma análise corresponde aos filtros atuais"
                  : "Ainda não há análises registradas"
                : `${total} análise${total !== 1 ? "s" : ""} no total`
          }
          actions={
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="ui-btn-secondary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          }
        />
      </div>

      {/* Filters */}
      <AnalysisFilters
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        statusFilter={statusFilter}
        onStatusChange={handleStatusFilter}
        aiFilter={aiFilter}
        onAiChange={handleAiFilter}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {showInitialLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[hsl(var(--primary))] border-t-transparent" />
            <p className="ui-text-muted text-sm">Carregando análises…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <p className="text-sm text-[hsl(var(--danger))]">{error}</p>
            <button
              type="button"
              onClick={fetchData}
              className="text-sm text-[hsl(var(--primary))] hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <AnalysesTable
            items={items}
            total={total}
            totalPages={totalPages}
            page={page}
            onPageChange={setPage}
            isRefreshing={isRefreshing}
            actionId={actionId}
            onOpen={(item) => {
              if (item.candidate_id) void openCandidate(item.candidate_id);
            }}
            onRetry={(item) => void handleRetry(item)}
            onForceFail={(item) => void handleForceFail(item)}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
          />
        )}
      </div>

      <CandidateDrawer key={selectedCandidateId ?? "none"} />
    </div>
  );
}
