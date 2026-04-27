import { type DragEvent, type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { CandidateDrawer } from "../features/pipeline/CandidateDrawer";
import { usePipeline } from "../features/pipeline/PipelineContext";
import { KanbanColumn } from "../components/kanban/KanbanColumn";
import { SkeletonRows } from "../components/common/Skeleton";
import { StatusPill } from "../components/common/StatusPill";
import { EmptyState } from "../components/common/EmptyState";
import { candidatesService } from "../services/candidatesService";
import { toast } from "../services/toast";
import type { PipelineStage } from "../types/domain";
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

// Placeholder DnD handlers — no drag behavior yet (integrated in the next step).
const noopVoid = () => {};
const noopDrop = (e: DragEvent) => e.preventDefault();
const noopId = (_id: string) => {};

// ── PipelinePage ───────────────────────────────────────────────────────────────

export function PipelinePage() {
  const { jobId: jobIdParam } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [showNewCandidate, setShowNewCandidate] = useState(false);

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
          title="Nenhuma vaga disponível"
          description="Crie ou publique uma vaga para abrir o fluxo de admissão."
        />
      ) : null}

      {/* ── Board section ── */}
      {activeJobId ? (
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
                    isDragOver={false}
                    dropPulse={false}
                    savingCandidateId={null}
                    draggingCandidateId={null}
                    onDragEnter={noopVoid}
                    onDragLeave={noopVoid}
                    onDrop={noopDrop}
                    onCardDragStart={noopId}
                    onCardDragEnd={noopVoid}
                    onCardClick={openCandidate}
                  />
                ))}

                {rejectedCol ? (
                  <>
                    <div className="mx-1 w-px self-stretch bg-gray-200" />
                    <KanbanColumn
                      column={rejectedCol}
                      colIndex={mainCols.length}
                      isDragOver={false}
                      dropPulse={false}
                      savingCandidateId={null}
                      draggingCandidateId={null}
                      onDragEnter={noopVoid}
                      onDragLeave={noopVoid}
                      onDrop={noopDrop}
                      onCardDragStart={noopId}
                      onCardDragEnd={noopVoid}
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
              title="Nenhum candidato neste pipeline"
              description="Candidatos aparecem aqui quando são vinculados a esta vaga."
            />
          ) : null}
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

function NewCandidateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (candidateId: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const candidate = await candidatesService.create({
        full_name: fullName.trim(),
        email: email.trim() || undefined,
      });
      toast.success(`Candidato "${candidate.full_name}" criado. Envie o currículo na aba Documentos.`);
      onCreated(candidate.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar candidato");
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
              Após criar, envie o currículo PDF e solicite a análise para que o candidato apareça no pipeline.
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

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-900">Nome completo *</span>
            <input
              type="text"
              required
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome do candidato"
              className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-900">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
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
              disabled={loading || !fullName.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              {loading ? "Criando…" : "Criar e abrir perfil"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
