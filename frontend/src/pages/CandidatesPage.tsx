import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { CandidateDrawer } from "../features/pipeline/CandidateDrawer";
import { NewCandidateModal } from "../features/pipeline/NewCandidateModal";
import { usePipeline } from "../features/pipeline/PipelineContext";
import { PageHeader } from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import { candidatesService } from "../services/candidatesService";
import { formatContextError } from "../services/errorMessages";
import { CandidateListSummary } from "../types/domain";
import { Paginated } from "../types/api";
import { useAsyncState } from "../hooks/useAsyncState";

// ── Types ──────────────────────────────────────────────────────────────────────

type ResumeFilter = "all" | "with" | "without";
type AiStatusFilter = "all" | "completed" | "processing_or_pending" | "failed";

const PAGE_SIZE = 20;

// ── Sub-components ─────────────────────────────────────────────────────────────

const AI_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  completed:  { label: "Concluída",    cls: "ui-badge-success" },
  processing: { label: "Processando",  cls: "ui-badge-info" },
  pending:    { label: "Aguardando",   cls: "ui-badge-warning" },
  failed:     { label: "Falhou",       cls: "ui-badge-danger" },
  cancelled:  { label: "Cancelado",    cls: "ui-badge-neutral" },
};

function AiStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="ui-text-muted text-xs">—</span>;
  const c = AI_STATUS_CONFIG[status] ?? { label: status, cls: "ui-badge-neutral" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

function ResumeBadge({ count }: { count: number }) {
  if (count === 0) return <span className="ui-text-muted text-xs">—</span>;
  return (
    <span className="ui-badge-info inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
      {count} currículo{count !== 1 ? "s" : ""}
    </span>
  );
}

function ScoreCell({ score }: { score: number | null }) {
  if (score == null) return <span className="ui-text-muted text-xs">—</span>;
  const rounded = Math.round(score);
  const cls =
    rounded >= 80 ? "text-[hsl(var(--success))] font-semibold" :
    rounded >= 60 ? "text-[hsl(var(--warning))] font-semibold" :
    "text-[hsl(var(--danger))] font-semibold";
  return <span className={`text-sm ${cls}`}>{rounded}</span>;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function CandidatesPage() {
  const { openCandidate, candidatesSyncTick, selectedCandidateId } = usePipeline();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [resumeFilter, setResumeFilter] = useState<ResumeFilter>("all");
  const [aiFilter, setAiFilter] = useState<AiStatusFilter>("all");
  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const hasActiveFilters = search || resumeFilter !== "all" || aiFilter !== "all";

  const { data, loading, error, run } = useAsyncState<Paginated<CandidateListSummary>>();

  // Debounce search input — resets page on new search term
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchCandidates = useCallback(() => {
    const hasResume =
      resumeFilter === "with" ? true :
      resumeFilter === "without" ? false :
      undefined;

    const aiStatus =
      aiFilter === "all" ? undefined :
      aiFilter === "processing_or_pending" ? ["processing", "pending"] :
      [aiFilter];

    void run(() =>
      candidatesService
        .listSummaries(page, PAGE_SIZE, search || undefined, hasResume, aiStatus)
        .catch((err: unknown) => {
          throw new Error(
            formatContextError(
              err,
              "Não foi possível carregar os candidatos.",
              hasActiveFilters ? "Revise os filtros ou tente novamente." : "Tente novamente.",
            ),
          );
        }),
    );
  }, [page, search, resumeFilter, aiFilter, run, hasActiveFilters]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates, candidatesSyncTick]);

  function handleResumeFilter(v: ResumeFilter) {
    setResumeFilter(v);
    setPage(1);
  }

  function handleAiFilter(v: AiStatusFilter) {
    setAiFilter(v);
    setPage(1);
  }

  function clearFilters() {
    setSearchInput("");
    setResumeFilter("all");
    setAiFilter("all");
  }

  const candidates = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const isRefreshing = loading && candidates.length > 0;
  const showInitialLoading = loading && candidates.length === 0 && !error;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--bg))] px-6 py-5">
        <PageHeader
          title="Candidatos"
          subtitle={
            loading ? "Carregando…" :
            total === 0
              ? hasActiveFilters
                ? "Nenhum candidato corresponde aos filtros atuais"
                : "Ainda não há candidatos cadastrados"
              :
            `${total} candidato${total !== 1 ? "s" : ""} no total`
          }
          actions={
            <>
              <button
                type="button"
                onClick={fetchCandidates}
                disabled={loading}
                className="ui-btn-secondary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Atualizando…" : "Atualizar"}
              </button>
              <button
                type="button"
                onClick={() => setShowNewCandidate(true)}
                className="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90"
              >
                + Novo candidato
              </button>
            </>
          }
        />
        <p className="mt-3 text-xs text-[hsl(var(--text-muted))]">
          Candidatos são perfis externos gerenciados pelo sistema. Eles não possuem acesso ao sistema interno.
        </p>
        <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
          Sem vínculo = candidato ainda não associado a nenhuma vaga.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--bg))] px-6 py-3">
        <div className="relative min-w-[240px] flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-muted))]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="ui-input h-9 w-full rounded-lg pl-9 pr-3 text-sm"
          />
        </div>

        <select
          value={resumeFilter}
          onChange={(e) => handleResumeFilter(e.target.value as ResumeFilter)}
          className="ui-input h-9 rounded-lg px-3 text-sm"
        >
          <option value="all">Todos os currículos</option>
          <option value="with">Com currículo</option>
          <option value="without">Sem currículo</option>
        </select>

        <select
          value={aiFilter}
          onChange={(e) => handleAiFilter(e.target.value as AiStatusFilter)}
          className="ui-input h-9 rounded-lg px-3 text-sm"
        >
          <option value="all">Todos os status IA</option>
          <option value="completed">IA Concluída</option>
          <option value="processing_or_pending">IA Pendente / Processando</option>
          <option value="failed">IA Falhou</option>
        </select>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="ui-btn-secondary h-9 rounded-lg px-3 text-sm"
          >
            Limpar filtros
          </button>
        ) : null}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {showInitialLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[hsl(var(--primary))] border-t-transparent" />
              <p className="ui-text-muted text-sm">Carregando candidatos…</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-sm text-[hsl(var(--danger))]">{error}</p>
            <button
              type="button"
              onClick={fetchCandidates}
              className="text-sm text-[hsl(var(--primary))] hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-lg font-medium text-[hsl(var(--text-muted))]">
              {hasActiveFilters
                ? "Nenhum candidato corresponde aos filtros atuais"
                : "Ainda não há candidatos cadastrados"}
            </p>
            <p className="ui-text-muted text-sm">
              {hasActiveFilters
                ? "Ajuste ou limpe os filtros para ver outros perfis."
                : "Crie um candidato para começar a montar sua base."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-1 text-sm text-[hsl(var(--primary))] hover:underline"
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {isRefreshing ? (
              <div className="border-b border-[hsl(var(--primary))]/15 bg-[hsl(var(--accent-soft))] px-6 py-2 text-xs text-[hsl(var(--primary))]">
                Atualizando a lista de candidatos…
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]">
                    <th className="ui-text-muted w-[280px] px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                      Nome
                    </th>
                    <th className="ui-text-muted px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                      E-mail
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Telefone
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Currículo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Vínculo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Vagas
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Status da IA
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Score da IA
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Criado em
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--surface))]">
                  {candidates.map((c) => (
                    <CandidateRow
                      key={c.id}
                      candidate={c}
                      onOpen={() => void openCandidate(c.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="border-t border-[hsl(var(--border))] px-6 py-4">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  total={total}
                  pageSize={PAGE_SIZE}
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      {showNewCandidate ? (
        <NewCandidateModal
          isOpen={showNewCandidate}
          defaultJobId={null}
          onClose={() => setShowNewCandidate(false)}
          onCreated={async (candidateId) => {
            setShowNewCandidate(false);
            await openCandidate(candidateId);
          }}
        />
      ) : null}

      <CandidateDrawer key={selectedCandidateId ?? "none"} />
    </div>
  );
}

// ── CandidateRow ───────────────────────────────────────────────────────────────
// Extracted to prevent inline arrow functions from causing full-list re-renders.

function CandidateRow({
  candidate: c,
  onOpen,
}: {
  candidate: CandidateListSummary;
  onOpen: () => void;
}) {
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer transition-colors hover:bg-[hsl(var(--accent-soft))]"
    >
      <td className="px-6 py-4">
        <div className="font-medium leading-tight text-[hsl(var(--text))]">{c.full_name}</div>
        {c.tags.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {c.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded bg-[hsl(var(--surface-muted))] px-1.5 py-0.5 text-xs text-[hsl(var(--text-muted))]"
              >
                {t}
              </span>
            ))}
            {c.tags.length > 3 ? (
              <span className="ui-text-muted text-xs">+{c.tags.length - 3}</span>
            ) : null}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-4 text-[hsl(var(--text-muted))]">
        {c.email ?? <span className="ui-text-muted">—</span>}
      </td>
      <td className="px-4 py-4 text-[hsl(var(--text-muted))]">
        {c.phone ?? <span className="ui-text-muted">—</span>}
      </td>
      <td className="px-4 py-4">
        <ResumeBadge count={c.resume_count} />
      </td>
      <td className="px-4 py-4">
        <span
          className={[
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
            c.linked_job_count > 0
              ? "border-[hsl(var(--success))]/20 bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]"
              : "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]",
          ].join(" ")}
        >
          {c.linked_job_count > 0 ? "Vinculado" : "Sem vínculo"}
        </span>
      </td>
      <td className="px-4 py-4 text-[hsl(var(--text-muted))]">
        {c.linked_job_count > 0 ? `${c.linked_job_count} vaga${c.linked_job_count !== 1 ? "s" : ""}` : "—"}
      </td>
      <td className="px-4 py-4">
        <AiStatusBadge status={c.ai_status} />
      </td>
      <td className="px-4 py-4">
        <ScoreCell score={c.ai_score} />
      </td>
      <td className="ui-text-muted px-4 py-4 text-xs">
        {new Date(c.created_at).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })}
      </td>
    </tr>
  );
}
