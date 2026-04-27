import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CandidateDrawer } from "../features/pipeline/CandidateDrawer";
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
  completed:  { label: "Concluída",    cls: "bg-green-100 text-green-700" },
  processing: { label: "Processando",  cls: "bg-blue-100 text-blue-700" },
  pending:    { label: "Aguardando",   cls: "bg-yellow-100 text-yellow-700" },
  failed:     { label: "Falhou",       cls: "bg-red-100 text-red-700" },
  cancelled:  { label: "Cancelado",    cls: "bg-gray-100 text-gray-500" },
};

function AiStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-400">—</span>;
  const c = AI_STATUS_CONFIG[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

function ResumeBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
      {count} currículo{count !== 1 ? "s" : ""}
    </span>
  );
}

function ScoreCell({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-gray-400">—</span>;
  const rounded = Math.round(score);
  const cls =
    rounded >= 80 ? "text-green-700 font-semibold" :
    rounded >= 60 ? "text-yellow-700 font-semibold" :
    "text-red-600 font-semibold";
  return <span className={`text-sm ${cls}`}>{rounded}</span>;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function CandidatesPage() {
  const { openCandidate, candidatesSyncTick } = usePipeline();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [resumeFilter, setResumeFilter] = useState<ResumeFilter>("all");
  const [aiFilter, setAiFilter] = useState<AiStatusFilter>("all");
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-5">
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
            <button
              type="button"
              onClick={() => navigate("/pipeline")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              + Novo candidato
            </button>
          }
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <div className="relative min-w-[240px] flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
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
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <select
          value={resumeFilter}
          onChange={(e) => handleResumeFilter(e.target.value as ResumeFilter)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">Todos os currículos</option>
          <option value="with">Com currículo</option>
          <option value="without">Sem currículo</option>
        </select>

        <select
          value={aiFilter}
          onChange={(e) => handleAiFilter(e.target.value as AiStatusFilter)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          >
            Limpar filtros
          </button>
        ) : null}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              <p className="text-sm text-gray-500">Carregando candidatos…</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={fetchCandidates}
              className="text-sm text-blue-600 hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-lg font-medium text-gray-500">
              {hasActiveFilters
                ? "Nenhum candidato corresponde aos filtros atuais"
                : "Ainda não há candidatos cadastrados"}
            </p>
            <p className="text-sm text-gray-400">
              {hasActiveFilters
                ? "Ajuste ou limpe os filtros para ver outros perfis."
                : "Crie um candidato para começar a montar sua base."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-1 text-sm text-blue-600 hover:underline"
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-[280px]">
                      Nome
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      E-mail
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Telefone
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Currículo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Status IA
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Score
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Criado em
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
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
              <div className="border-t border-gray-100 px-6 py-4">
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

      <CandidateDrawer />
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
      className="cursor-pointer transition-colors hover:bg-blue-50"
    >
      <td className="px-6 py-4">
        <div className="font-medium text-gray-900 leading-tight">{c.full_name}</div>
        {c.tags.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {c.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500"
              >
                {t}
              </span>
            ))}
            {c.tags.length > 3 ? (
              <span className="text-xs text-gray-400">+{c.tags.length - 3}</span>
            ) : null}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-4 text-gray-600">
        {c.email ?? <span className="text-gray-400">—</span>}
      </td>
      <td className="px-4 py-4 text-gray-600">
        {c.phone ?? <span className="text-gray-400">—</span>}
      </td>
      <td className="px-4 py-4">
        <ResumeBadge count={c.resume_count} />
      </td>
      <td className="px-4 py-4">
        <AiStatusBadge status={c.ai_status} />
      </td>
      <td className="px-4 py-4">
        <ScoreCell score={c.ai_score} />
      </td>
      <td className="px-4 py-4 text-gray-500 text-xs">
        {new Date(c.created_at).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })}
      </td>
    </tr>
  );
}
