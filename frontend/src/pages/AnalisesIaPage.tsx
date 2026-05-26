import { Activity, AlertTriangle, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { CandidatePreviewDrawer } from "../features/candidates/components/CandidatePreviewDrawer";
import { PageHeader } from "../components/common/PageHeader";
import { AnalysisFilters } from "../features/analyses/components/AnalysisFilters";
import { AnalysesTable } from "../features/analyses/components/AnalysesTable";
import { DiscardAnalysisModal } from "../features/analyses/components/DiscardAnalysisModal";
import { useAnalysesPage } from "../features/analyses/hooks/useAnalysesPage";
import { useState } from "react";

export function AnalisesIaPage() {
  const [previewCandidateId, setPreviewCandidateId] = useState<string | null>(null);

  const {
    page,
    setPage,
    searchInput,
    setSearchInput,
    statusFilter,
    handleStatusFilter,
    aiFilter,
    handleAiFilter,
    typeFilter,
    handleTypeFilter,
    providerFilter,
    handleProviderFilter,
    modelFilter,
    handleModelFilter,
    providerOptions,
    modelOptions,
    actionId,
    discardTarget,
    setDiscardTarget,
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
    handleDiscard,
  } = useAnalysesPage();

  const summary = {
    pending: items.filter((item) => item.status === "waiting_extraction" || item.status === "pending").length,
    processing: items.filter((item) => item.status === "processing").length,
    completed: items.filter((item) => item.status === "completed").length,
    issues: items.filter((item) => item.status === "failed" || item.status === "retry_scheduled").length,
  };

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

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Filters */}
          <AnalysisFilters
            searchInput={searchInput}
            onSearchChange={setSearchInput}
            statusFilter={statusFilter}
            onStatusChange={handleStatusFilter}
            aiFilter={aiFilter}
            onAiChange={handleAiFilter}
            typeFilter={typeFilter}
            onTypeChange={handleTypeFilter}
            providerFilter={providerFilter}
            onProviderChange={handleProviderFilter}
            modelFilter={modelFilter}
            onModelChange={handleModelFilter}
            providerOptions={providerOptions}
            modelOptions={modelOptions}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
          />

          <div className="grid gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--bg))] px-6 py-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Pendentes", value: summary.pending, icon: Clock3, tone: "text-[hsl(var(--text-muted))]" },
              { label: "Processando", value: summary.processing, icon: Activity, tone: "text-[hsl(var(--primary))]" },
              { label: "Concluídas", value: summary.completed, icon: CheckCircle2, tone: "text-[hsl(var(--success))]" },
              { label: "Falhas / retry", value: summary.issues, icon: AlertTriangle, tone: "text-[hsl(var(--warning))]" },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div
                key={label}
                className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--text-muted))]">
                    {label}
                  </p>
                  <Icon className={`h-4 w-4 ${tone}`} />
                </div>
                <p className="mt-2 text-2xl font-semibold text-[hsl(var(--text))]">{value}</p>
                <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                  {typeFilter === "all"
                    ? "Todos os tipos"
                    : typeFilter === "behavioral_ai"
                      ? "IA comportamental"
                      : "Currículos"}
                </p>
              </div>
            ))}
          </div>

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
              if (!item.candidate_id) return;
              setPreviewCandidateId(item.candidate_id);
            }}
            onRetry={(item) => void handleRetry(item)}
            onForceFail={(item) => void handleForceFail(item)}
            onDiscard={(item) => setDiscardTarget(item)}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
          />
        )}
          </div>
        </div>
      </div>
      <DiscardAnalysisModal
        open={discardTarget != null}
        loading={discardTarget != null && actionId === discardTarget.id}
        onClose={() => setDiscardTarget(null)}
        onConfirm={handleDiscard}
      />
      <CandidatePreviewDrawer
        candidateId={previewCandidateId}
        onClose={() => setPreviewCandidateId(null)}
      />
    </div>
  );
}
