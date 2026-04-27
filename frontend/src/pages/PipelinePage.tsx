import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { CandidateDrawer } from "../features/pipeline/CandidateDrawer";
import { usePipeline } from "../features/pipeline/PipelineContext";
import { KanbanColumn } from "../components/kanban/KanbanColumn";
import { SkeletonRows } from "../components/common/Skeleton";
import { StatusPill } from "../components/common/StatusPill";
import { EmptyState } from "../components/common/EmptyState";
import { candidatesService } from "../services/candidatesService";
import { formatContextError } from "../services/errorMessages";
import { feedback } from "../services/feedback";
import { HttpError } from "../services/http";
import { getJobRanking } from "../services/jobsService";
import type { JobRanking, JobRankingEntry, PipelineStage } from "../types/domain";
import {
  formatJobStatus,
  formatSeniority,
  formatWorkModel,
  jobStatusTone,
} from "../utils/jobFormatters";

const MAIN_STAGES: ReadonlyArray<PipelineStage> = [
  "entry",
  "screening",
  "hr_interview",
  "technical_interview",
  "final",
  "offer",
  "hired",
];

// ── PipelinePage ───────────────────────────────────────────────────────────────

export function PipelinePage() {
  const { jobId: jobIdParam } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [ranking, setRanking] = useState<JobRanking | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const rankingCacheRef = useRef<Map<string, JobRanking>>(new Map());
  const rankingFetchInFlightRef = useRef<Map<string, Promise<JobRanking>>>(new Map());

  const {
    jobs,
    jobsLoading,
    jobsError,
    activeJobId,
    board,
    boardLoading,
    boardError,
    setActiveJob,
    refreshBoard,
    openCandidate,
  } = usePipeline();

  // ── Effect 1: URL → context sync ──────────────────────────────────────────
  // URL is the source of truth for which job is active.
  // When the user navigates directly (/pipeline/abc) or uses back/forward,
  // the URL param changes and this effect tells the context to load that job.
  useEffect(() => {
    if (!jobIdParam) return;
    if (jobIdParam !== activeJobId) {
      setActiveJob(jobIdParam);
    }
  }, [jobIdParam, activeJobId, setActiveJob]);

  async function loadRanking(jobId: string, force = false): Promise<JobRanking> {
    if (!force) {
      const cached = rankingCacheRef.current.get(jobId);
      if (cached) {
        return cached;
      }
    }

    let request = rankingFetchInFlightRef.current.get(jobId);
    if (!request || force) {
      request = getJobRanking(jobId)
        .then((result) => {
          rankingCacheRef.current.set(jobId, result);
          return result;
        })
        .finally(() => {
          rankingFetchInFlightRef.current.delete(jobId);
        });
      rankingFetchInFlightRef.current.set(jobId, request);
    }

    return await request;
  }

  useEffect(() => {
    if (!activeJobId) {
      setRanking(null);
      setRankingError(null);
      setRankingLoading(false);
      return;
    }

    let cancelled = false;
    setRankingLoading(true);
    setRankingError(null);

    void loadRanking(activeJobId)
      .then((result) => {
        if (cancelled) return;
        setRanking(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRanking(null);
        setRankingError(
          formatContextError(
            err,
            "Não foi possível carregar o ranking desta vaga.",
            "Tente atualizar novamente.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setRankingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeJobId]);

  // ── Effect 2: auto-redirect when no jobId in URL ──────────────────────────
  // /pipeline (no :jobId) is a valid entry point. Once jobs are ready,
  // redirect to /pipeline/:firstJobId so the URL always reflects what's shown.
  // replace: true prevents the bare /pipeline from polluting browser history.
  useEffect(() => {
    if (jobIdParam) return;
    if (jobsLoading || jobs.length === 0) return;
    navigate(`/pipeline/${jobs[0].id}`, { replace: true });
  }, [jobIdParam, jobsLoading, jobs, navigate]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === activeJobId) ?? null,
    [jobs, activeJobId],
  );

  const mainCols = useMemo(
    () =>
      (board?.columns ?? []).filter((c) =>
        (MAIN_STAGES as ReadonlyArray<string>).includes(c.stage),
      ),
    [board],
  );

  const rejectedCol = useMemo(
    () => board?.columns.find((c) => c.stage === "rejected") ?? null,
    [board],
  );

  const totalActive = mainCols.reduce((n, c) => n + c.candidates.length, 0);
  const totalRejected = rejectedCol?.candidates.length ?? 0;

  // ── Handler ───────────────────────────────────────────────────────────────
  // Navigate only. The URL change triggers Effect 1 which calls setActiveJob.
  // This avoids double-calling setActiveJob (once here, once in the effect).
  function handleSelectJob(nextJobId: string) {
    navigate(`/pipeline/${nextJobId}`, { replace: true });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-6 py-6 pb-12">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Pipeline</h1>
          <p className="mt-1 text-sm text-gray-500">
            Acompanhe e mova candidatos entre etapas do processo de admissão.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNewCandidate(true)}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            Novo candidato
          </button>
          <button
            type="button"
            onClick={() => void refreshBoard()}
            disabled={boardLoading || !activeJobId}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-40"
          >
            {boardLoading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </div>

      {/* ── Job selector ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          {/* Dropdown */}
          <div className="space-y-2">
            <label
              htmlFor="pipeline-job-select"
              className="text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Vaga
            </label>
            {jobsError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {jobsError}
              </p>
            ) : (
              <select
                id="pipeline-job-select"
                value={activeJobId ?? ""}
                onChange={(e) => handleSelectJob(e.target.value)}
                disabled={jobsLoading || jobs.length === 0}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
              >
                {jobsLoading ? (
                  <option value="">Carregando vagas…</option>
                ) : (
                  jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>

          {/* Job metadata grid */}
          {jobsLoading ? (
            <SkeletonRows rows={2} />
          ) : selectedJob ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetaCell label="Status">
                <StatusPill
                  label={formatJobStatus(selectedJob.status)}
                  tone={jobStatusTone(selectedJob.status)}
                />
              </MetaCell>
              <MetaCell label="Senioridade">
                {formatSeniority(selectedJob.seniority_level)}
              </MetaCell>
              <MetaCell label="Modelo">
                {formatWorkModel(selectedJob.work_model)}
              </MetaCell>
              <MetaCell label="Local">{selectedJob.location ?? "—"}</MetaCell>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Empty: no jobs at all ── */}
      {!jobsLoading && jobs.length === 0 && !jobsError ? (
        <EmptyState
          icon="🧭"
          title="Nenhuma vaga publicada ainda"
          description="Crie ou publique uma vaga para começar a acompanhar candidatos no pipeline."
        />
      ) : null}

      {/* ── Board section ── */}
      {activeJobId ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          {/* Board header */}
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {selectedJob ? selectedJob.title : "Candidatos"}
                </h2>
                {!boardLoading && board ? (
                  <p className="mt-0.5 text-xs text-gray-400">
                    {totalActive} em processo ·{" "}
                    {totalRejected} reprovado{totalRejected !== 1 ? "s" : ""}
                  </p>
                ) : null}
              </div>
              <p className="text-xs text-gray-500">
                Clique no card para abrir o drawer e mover a etapa.
              </p>
            </div>

          {/* Board error */}
            {boardError ? (
              <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span>{boardError}</span>
                <button
                  type="button"
                  onClick={() => void refreshBoard()}
                  className="ml-4 text-xs underline hover:no-underline"
                >
                  Tentar novamente
                </button>
              </div>
            ) : null}

          {/* Loading skeleton */}
            {boardLoading ? <SkeletonRows rows={6} /> : null}

          {/* Kanban columns — data from PipelineContext.board */}
            {!boardLoading && board && !boardError ? (
              <div className="overflow-x-auto pb-3">
                <div className="flex min-w-max items-start gap-3">
                  {mainCols.map((col, idx) => (
                    <KanbanColumn
                      key={col.stage}
                      column={col}
                      colIndex={idx}
                      onCardClick={openCandidate}
                    />
                  ))}

                  {rejectedCol ? (
                    <>
                      <div className="mx-1 w-px self-stretch bg-gray-200" />
                      <KanbanColumn
                        column={rejectedCol}
                        colIndex={mainCols.length}
                        onCardClick={openCandidate}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

          {/* Empty board */}
            {!boardLoading && board && !boardError && totalActive === 0 && totalRejected === 0 ? (
              <EmptyState
                icon="📋"
                title="Ainda não há candidatos nesta vaga"
                description="Adicione um candidato ou envie um currículo para iniciar o acompanhamento neste pipeline."
              />
            ) : null}
          </div>

          <RankingPanel
            jobTitle={selectedJob?.title ?? "vaga selecionada"}
            ranking={ranking}
            loading={rankingLoading}
            error={rankingError}
            onOpenCandidate={openCandidate}
            onRefresh={
              activeJobId
                ? () => {
                    setRankingLoading(true);
                    setRankingError(null);
                    void loadRanking(activeJobId, true)
                      .then((result) => setRanking(result))
                      .catch((err: unknown) => {
                        setRanking(null);
                        setRankingError(
                          formatContextError(
                            err,
                            "Não foi possível carregar o ranking desta vaga.",
                            "Tente atualizar novamente.",
                          ),
                        );
                      })
                      .finally(() => setRankingLoading(false));
                  }
                : undefined
            }
          />
        </div>
      ) : null}

      {/* ── New candidate modal ── */}
      {showNewCandidate && (
        <NewCandidateModal
          onClose={() => setShowNewCandidate(false)}
          onCreated={(id) => {
            setShowNewCandidate(false);
            void openCandidate(id);
          }}
        />
      )}

      {/* ── Candidate drawer — position: fixed, always rendered, open via context ── */}
      <CandidateDrawer />
    </div>
  );
}

function RankingPanel({
  jobTitle,
  ranking,
  loading,
  error,
  onOpenCandidate,
  onRefresh,
}: {
  jobTitle: string;
  ranking: JobRanking | null;
  loading: boolean;
  error: string | null;
  onOpenCandidate: (candidateId: string) => Promise<void>;
  onRefresh?: () => void;
}) {
  return (
    <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Ranking da vaga
          </p>
          <h3 className="mt-1 text-sm font-semibold text-gray-900">{jobTitle}</h3>
          <p className="mt-1 text-xs text-gray-500">
            Apoio a decisao. O ranking nao altera a etapa do pipeline.
          </p>
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        {loading ? <SkeletonRows rows={4} /> : null}

        {!loading && error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!loading && !error && ranking && ranking.candidates.length === 0 ? (
          <EmptyState
            icon="🏁"
            title="Ainda não há ranking para esta vaga"
            description="Assim que houver candidatos com análise concluída, o ranking aparecerá aqui."
          />
        ) : null}

        {!loading && !error && ranking && ranking.candidates.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
              {ranking.total_candidates} candidato{ranking.total_candidates !== 1 ? "s" : ""} no ranking
              {ranking.score_version ? ` · versao ${ranking.score_version}` : ""}
            </div>

            {ranking.candidates.map((entry) => (
              <RankingCard
                key={`${entry.rank}-${entry.candidate_id}`}
                entry={entry}
                onOpenCandidate={onOpenCandidate}
              />
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function RankingCard({
  entry,
  onOpenCandidate,
}: {
  entry: JobRankingEntry;
  onOpenCandidate: (candidateId: string) => Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={() => void onOpenCandidate(entry.candidate_id)}
      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Posicao #{entry.rank}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-gray-900">{entry.candidate_name}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Score final
          </p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-gray-900">
            {Math.round(entry.final_score)}%
          </p>
        </div>
      </div>

      {entry.explanation_text ? (
        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-gray-600">
          {entry.explanation_text}
        </p>
      ) : (
        <p className="mt-3 text-xs text-gray-400">
          A análise ainda não gerou um resumo para este candidato.
        </p>
      )}
    </button>
  );
}

// ── MetaCell ───────────────────────────────────────────────────────────────────
// Labeled metadata box inside the job info grid.

function MetaCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-sm font-medium text-gray-900">{children}</div>
    </div>
  );
}

// ── NewCandidateModal ──────────────────────────────────────────────────────────
// Creates a candidate and opens the drawer so the user can upload resume + request analysis.
// Validates fields and checks for email/CPF duplicates before submitting.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type NewCandidateFormErrors = {
  fullName?: string;
  email?: string;
  cpf?: string;
  form?: string;
};

function formatCpfInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length > 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`;
  return d;
}

function NewCandidateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (candidateId: string) => void;
}) {
  const { notifyCandidatesChanged } = usePipeline();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<NewCandidateFormErrors>({});
  const [duplicate, setDuplicate] = useState<{ id: string; full_name: string } | null>(null);

  function clearDuplicate(field?: keyof NewCandidateFormErrors) {
    if (duplicate) setDuplicate(null);
    setErrors((current) => {
      if (!field && !current.form) return current;
      if (!field) return {};
      return { ...current, [field]: undefined, form: undefined };
    });
  }

  function validateForm(): {
    trimmedName: string;
    trimmedEmail: string;
    trimmedPhone: string;
    cpfDigits: string;
  } | null {
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const cpfDigits = cpf.replace(/\D/g, "");
    const nextErrors: NewCandidateFormErrors = {};

    if (!trimmedName) {
      nextErrors.fullName = "Nome é obrigatório";
    }
    if (!trimmedEmail) {
      nextErrors.email = "E-mail é obrigatório";
    } else if (!EMAIL_RE.test(trimmedEmail)) {
      nextErrors.email = "Informe um e-mail válido";
    }
    if (cpfDigits && cpfDigits.length !== 11) {
      nextErrors.cpf = "CPF deve ter 11 dígitos";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return null;
    }

    setErrors({});
    return { trimmedName, trimmedEmail, trimmedPhone, cpfDigits };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validated = validateForm();
    if (!validated) {
      return;
    }
    const { trimmedName, trimmedEmail, trimmedPhone, cpfDigits } = validated;

    setLoading(true);
    setErrors({});
    setDuplicate(null);
    feedback.createCandidate.processing();

    try {
      const check = await candidatesService.checkDuplicate(
        trimmedEmail,
        cpfDigits || undefined,
      );
      if (check.exists && check.candidate_id) {
        setDuplicate({
          id: check.candidate_id,
          full_name: check.full_name ?? "Candidato existente",
        });
        setErrors({
          form: "Já existe um candidato com este email/CPF",
        });
        return;
      }

      const candidate = await candidatesService.create({
        full_name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone || undefined,
        cpf: cpfDigits || undefined,
      });
      notifyCandidatesChanged();
      feedback.createCandidate.success();
      onCreated(candidate.id);
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        if (err.status === 409) {
          feedback.createCandidate.error(err);
          setErrors({
            form: "Já existe um candidato com este email/CPF",
          });
          return;
        }
        if (err.status === 422) {
          feedback.createCandidate.error(err);
          setErrors({
            form: "Dados inválidos. Revise nome, e-mail e CPF antes de criar o candidato.",
          });
          return;
        }
      }
      feedback.createCandidate.error(err);
      setErrors({
        form: formatContextError(
          err,
          "Não foi possível criar o candidato.",
          "Revise os dados e tente novamente.",
        ),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Novo candidato"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Novo candidato</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Após criar, envie o currículo PDF. A interface vai informar se a análise começou automaticamente ou se ainda precisa de ação manual.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {duplicate ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">
              Candidato duplicado encontrado
            </p>
            <p className="mt-0.5 text-sm text-amber-700">
              Já existe um candidato com este email/CPF: <strong>{duplicate.full_name}</strong>
            </p>
            <button
              type="button"
              onClick={() => onCreated(duplicate.id)}
              className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-700"
            >
              Abrir candidato existente
            </button>
          </div>
        ) : null}

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-900">Nome completo *</span>
            <input
              type="text"
              required
              autoFocus
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                clearDuplicate("fullName");
              }}
              placeholder="Nome do candidato"
              className={[
                "h-10 w-full rounded-lg bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2",
                errors.fullName
                  ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                  : "border border-gray-200 focus:border-blue-500 focus:ring-blue-100",
              ].join(" ")}
            />
            {errors.fullName ? <span className="text-xs text-red-600">{errors.fullName}</span> : null}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-900">E-mail *</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearDuplicate("email");
              }}
              placeholder="email@exemplo.com"
              className={[
                "h-10 w-full rounded-lg bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2",
                errors.email
                  ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                  : "border border-gray-200 focus:border-blue-500 focus:ring-blue-100",
              ].join(" ")}
            />
            {errors.email ? <span className="text-xs text-red-600">{errors.email}</span> : null}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-900">Telefone</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  clearDuplicate();
                }}
                placeholder="(11) 99999-9999"
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-900">CPF</span>
              <input
                type="text"
                inputMode="numeric"
                value={cpf}
                onChange={(e) => {
                  setCpf(formatCpfInput(e.target.value));
                  clearDuplicate("cpf");
                }}
                placeholder="000.000.000-00"
                maxLength={14}
                className={[
                  "h-10 w-full rounded-lg bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2",
                  errors.cpf
                    ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                    : "border border-gray-200 focus:border-blue-500 focus:ring-blue-100",
                ].join(" ")}
              />
              {errors.cpf ? <span className="text-xs text-red-600">{errors.cpf}</span> : null}
            </label>
          </div>

          {errors.form ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errors.form}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              {loading ? "Verificando…" : "Criar e abrir perfil"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
