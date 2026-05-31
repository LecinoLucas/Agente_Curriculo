import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Clock, Loader2, Send, Users } from "lucide-react";

import { collaborationService } from "../../services/collaborationService";
import {
  managerService,
  type ManagerCandidateDetailResponse,
  type ScorecardResponse,
} from "../../services/managerService";
import type { InterviewScorecardPayload } from "../../types/domain";
import { InterviewScorecardForm } from "../candidates/drawer/components/InterviewScorecardForm";
import type { ReviewRequestItem } from "../../types/domain";

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-surface-muted text-text-muted",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-rose-100 text-rose-800",
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  advance: "Avançar no processo",
  hold: "Aguardar",
  reject: "Não recomendo",
  request_interview: "Solicitar entrevista adicional",
};

type ActiveTab = "requests" | "candidates";

function formatCandidateCount(count: number) {
  return count === 1 ? "1 candidato atribuído" : `${count} candidatos atribuídos`;
}

export function ManagerReviewPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("requests");

  // Review requests state
  const [requests, setRequests] = useState<ReviewRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<ReviewRequestItem | null>(null);
  const [candidateSummary, setCandidateSummary] = useState<ManagerCandidateDetailResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Feedback form state
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [recommendation, setRecommendation] = useState<"advance" | "hold" | "reject" | "request_interview">("advance");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  // Scorecard state
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
  const [loadingScorecard, setLoadingScorecard] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [savingScorecard, setSavingScorecard] = useState(false);
  const [submittingScorecard, setSubmittingScorecard] = useState(false);
  const [scorecardError, setScorecardError] = useState<string | null>(null);
  const [scorecardLoadError, setScorecardLoadError] = useState<string | null>(null);

  // Candidate browse state (tab 2)
  const [jobs, setJobs] = useState<{ id: string; title: string; candidate_count: number; assigned_count: number }[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<{ id: string; name: string; email: string; pipeline_stage: string | null; scorecard_status: string | null }[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [browseSummary, setBrowseSummary] = useState<ManagerCandidateDetailResponse | null>(null);
  const [loadingBrowseSummary, setLoadingBrowseSummary] = useState(false);
  const [browseSummaryError, setBrowseSummaryError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReviewRequests();
  }, []);

  useEffect(() => {
    if (activeTab === "candidates" && jobs.length === 0) {
      loadJobs();
    }
  }, [activeTab]);

  async function loadReviewRequests() {
    try {
      setLoadingRequests(true);
      setError(null);
      const resp = await collaborationService.listReviewRequests();
      setRequests(resp.requests);
    } catch {
      setError("Não foi possível carregar as solicitações de revisão.");
    } finally {
      setLoadingRequests(false);
    }
  }

  async function handleSelectRequest(req: ReviewRequestItem) {
    setSelectedRequest(req);
    setFeedbackMessage("");
    setFeedbackSent(false);
    setCandidateSummary(null);
    setSummaryError(null);
    setScorecard(null);
    setSuggestedQuestions([]);
    setQuestionsOpen(false);
    setScorecardError(null);
    setScorecardLoadError(null);
    setLoadingSummary(true);
    setLoadingScorecard(true);

    void managerService.getCandidateSummary(req.job_id, req.candidate_id)
      .then(setCandidateSummary)
      .catch(() => setSummaryError("Não foi possível carregar o resumo seguro deste candidato."))
      .finally(() => setLoadingSummary(false));

    void managerService.getScorecard(req.job_id, req.candidate_id)
      .then((env) => {
        setScorecard(env.scorecard);
        setSuggestedQuestions(env.suggested_behavioral_questions ?? []);
      })
      .catch(() => setScorecardLoadError("Não foi possível carregar a avaliação do gestor."))
      .finally(() => setLoadingScorecard(false));
  }

  async function handleSaveScorecard(payload: InterviewScorecardPayload): Promise<ScorecardResponse> {
    if (!selectedRequest) {
      throw new Error("manager_scorecard_context_missing");
    }
    setSavingScorecard(true);
    setScorecardError(null);
    try {
      const saved = scorecard
        ? await managerService.patchScorecard(scorecard.id, payload)
        : await managerService.createScorecard(selectedRequest.job_id, selectedRequest.candidate_id, {
            final_recommendation: payload.final_recommendation ?? null,
            overall_notes: payload.overall_notes ?? null,
            items: payload.items ?? [],
          });
      setScorecard(saved);
      return saved;
    } catch {
      setScorecardError("Não foi possível salvar o rascunho.");
      throw new Error("manager_scorecard_save_failed");
    } finally {
      setSavingScorecard(false);
    }
  }

  async function handleSubmitScorecard(scorecardId: string) {
    setSubmittingScorecard(true);
    setScorecardError(null);
    try {
      const submitted = await managerService.submitScorecard(scorecardId);
      setScorecard(submitted);
    } catch {
      setScorecardError("Não foi possível enviar a avaliação.");
      throw new Error("manager_scorecard_submit_failed");
    } finally {
      setSubmittingScorecard(false);
    }
  }

  async function handleSendFeedback() {
    if (!selectedRequest || !feedbackMessage.trim()) return;
    setSubmittingFeedback(true);
    try {
      await collaborationService.submitManagerFeedback(
        selectedRequest.job_id,
        selectedRequest.candidate_id,
        { message: feedbackMessage.trim(), recommendation },
      );
      setFeedbackSent(true);
      setFeedbackMessage("");
      await loadReviewRequests();
    } catch {
      setError("Não foi possível enviar o feedback.");
    } finally {
      setSubmittingFeedback(false);
    }
  }

  async function loadJobs() {
    try {
      setLoadingJobs(true);
      setError(null);
      const resp = await managerService.listJobs();
      setJobs(resp.jobs);
    } catch {
      setError("Não foi possível carregar as vagas.");
    } finally {
      setLoadingJobs(false);
    }
  }

  async function handleJobSelect(jobId: string) {
    setSelectedJobId(jobId);
    setBrowseSummary(null);
    setBrowseSummaryError(null);
    setLoadingCandidates(true);
    try {
      setError(null);
      const resp = await managerService.listCandidates(jobId);
      setCandidates(resp.candidates);
    } catch {
      setError("Não foi possível carregar os candidatos.");
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function handleBrowseCandidateSelect(candidateId: string) {
    if (!selectedJobId) return;
    setBrowseSummary(null);
    setBrowseSummaryError(null);
    setLoadingBrowseSummary(true);
    try {
      setError(null);
      const summary = await managerService.getCandidateSummary(selectedJobId, candidateId);
      setBrowseSummary(summary);
    } catch {
      setBrowseSummaryError("Não foi possível carregar o resumo seguro deste candidato.");
    } finally {
      setLoadingBrowseSummary(false);
    }
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-0 p-6">
      {/* Header */}
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-text">Revisão de Candidatos</h1>
        <p className="text-sm text-text-muted">
          Avalie candidatos e envie sua recomendação ao recrutador.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 flex gap-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={[
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors",
            activeTab === "requests"
              ? "border-b-2 border-[hsl(var(--primary))] text-[hsl(var(--primary))]"
              : "text-text-muted hover:text-text",
          ].join(" ")}
        >
          <Clock className="h-4 w-4" />
          Solicitações
          {pendingCount > 0 && (
            <span className="rounded-full bg-[hsl(var(--primary))] px-1.5 py-0.5 text-[10px] font-bold text-white">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("candidates")}
          className={[
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors",
            activeTab === "candidates"
              ? "border-b-2 border-[hsl(var(--primary))] text-[hsl(var(--primary))]"
              : "text-text-muted hover:text-text",
          ].join(" ")}
        >
          <Users className="h-4 w-4" />
          Candidatos
        </button>
      </div>

      {/* ── Tab: Solicitações ─────────────────────────────────────────── */}
      {activeTab === "requests" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-text">Pendentes de revisão</p>
              <button
                type="button"
                onClick={loadReviewRequests}
                className="text-xs text-[hsl(var(--primary))] hover:underline"
              >
                Atualizar
              </button>
            </div>

            {loadingRequests ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--primary))]" />
              </div>
            ) : requests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-text-muted mb-2" />
                <p className="text-sm font-medium text-text-muted">Nenhuma solicitação pendente</p>
                <p className="text-xs text-text-muted mt-1">
                  Quando um recrutador solicitar sua revisão, ela aparecerá aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
                {requests.map((req) => (
                  <button
                    key={req.request_id}
                    type="button"
                    onClick={() => handleSelectRequest(req)}
                    className={[
                      "w-full text-left rounded-xl border p-3.5 transition-all",
                      selectedRequest?.request_id === req.request_id
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)]"
                        : "border-border hover:border-[hsl(var(--primary)/0.4)] bg-surface",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-semibold text-text truncate">{req.candidate_name}</p>
                      <div className="flex gap-1.5 flex-shrink-0">
                        {req.is_directed_to_me && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">
                            Direcionada a você
                          </span>
                        )}
                        {req.priority && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${PRIORITY_COLORS[req.priority] ?? ""}`}>
                            {PRIORITY_LABELS[req.priority]}
                          </span>
                        )}
                        <span className={[
                          "px-1.5 py-0.5 rounded text-[10px] font-bold",
                          req.status === "answered"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800",
                        ].join(" ")}>
                          {req.status === "answered" ? "Respondido" : "Pendente"}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-text-muted mb-1.5 truncate">{req.job_title}</p>
                    <p className="text-xs text-text line-clamp-2">{req.latest_message}</p>
                    <p className="mt-1.5 text-[10px] text-text-muted">
                      {new Date(req.requested_at).toLocaleDateString("pt-BR", { dateStyle: "short" })}
                      {req.pipeline_stage && ` · Etapa: ${req.pipeline_stage}`}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail + Feedback */}
          <div>
            {!selectedRequest ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center h-full flex flex-col items-center justify-center">
                <p className="text-sm text-text-muted">Selecione uma solicitação para ver detalhes</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
                {/* Request header */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Solicitação do recrutador</p>
                  <p className="text-sm text-text">{selectedRequest.latest_message}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {new Date(selectedRequest.requested_at).toLocaleDateString("pt-BR", { dateStyle: "long" })}
                  </p>
                  {selectedRequest.is_directed_to_me && (
                    <p className="mt-2 inline-flex rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-800">
                      Direcionada a você
                    </p>
                  )}
                </div>

                {/* Candidate summary */}
                {loadingSummary ? (
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando resumo...
                  </div>
                ) : candidateSummary ? (
                  <div className="rounded-lg border border-border/60 bg-[hsl(var(--bg))] p-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Resumo seguro</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-text-muted">Candidato</p>
                        <p className="font-medium text-text">{candidateSummary.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted">Vaga</p>
                        <p className="font-medium text-text truncate">{selectedRequest.job_title}</p>
                      </div>
                      {candidateSummary.pipeline_stage && (
                        <div>
                          <p className="text-xs text-text-muted">Etapa</p>
                          <p className="font-medium text-text capitalize">{candidateSummary.pipeline_stage}</p>
                        </div>
                      )}
                      {selectedRequest.interview_status && (
                        <div>
                          <p className="text-xs text-text-muted">Entrevista</p>
                          <p className="font-medium text-text capitalize">{selectedRequest.interview_status}</p>
                        </div>
                      )}
                      {candidateSummary.scorecard && (
                        <div className="col-span-2">
                          <p className="text-xs text-text-muted">Scorecard</p>
                          <p className="font-medium text-text capitalize">
                            {candidateSummary.scorecard.status}
                            {candidateSummary.scorecard.recommendation && ` · ${candidateSummary.scorecard.recommendation.replace(/_/g, " ")}`}
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      Documentos, ERP e logs técnicos não são exibidos ao gestor.
                    </p>
                  </div>
                ) : summaryError ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                    {summaryError}
                  </div>
                ) : null}

                {/* Scorecard panel */}
                <div className="rounded-lg border border-border/60 bg-[hsl(var(--bg))] p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Avaliação do Gestor</p>
                  {loadingScorecard ? (
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando avaliação...
                    </div>
                  ) : scorecardLoadError ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                      {scorecardLoadError}
                    </div>
                  ) : scorecard?.status === "submitted" ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-1 text-sm text-emerald-800">
                      <div className="flex items-center gap-2 font-semibold">
                        <CheckCircle2 className="h-4 w-4" />
                        Avaliação enviada
                      </div>
                      {scorecard.final_recommendation && (
                        <p className="text-xs">Recomendação: {scorecard.final_recommendation.replace(/_/g, " ")}</p>
                      )}
                      {scorecard.overall_notes && (
                        <p className="text-xs text-emerald-700">{scorecard.overall_notes}</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {scorecardError && (
                        <p className="text-xs text-rose-600">{scorecardError}</p>
                      )}
                      <InterviewScorecardForm
                        scorecard={scorecard}
                        saving={savingScorecard}
                        submitting={submittingScorecard}
                        onSave={handleSaveScorecard}
                        onSubmit={handleSubmitScorecard}
                      />
                      {suggestedQuestions.length > 0 ? (
                        <div className="rounded-lg border border-blue-100 bg-blue-50/40">
                          <button
                            type="button"
                            onClick={() => setQuestionsOpen((current) => !current)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-blue-950"
                          >
                            Perguntas sugeridas pela IA comportamental
                            <ChevronDown className={`h-4 w-4 transition ${questionsOpen ? "rotate-180" : ""}`} />
                          </button>
                          {questionsOpen ? (
                            <div className="space-y-2 border-t border-blue-100 px-4 py-3">
                              {suggestedQuestions.map((question, index) => (
                                <p key={`${question}-${index}`} className="text-sm text-blue-950">
                                  {index + 1}. {question}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Feedback form */}
                {feedbackSent ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3 text-sm text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    <div>
                      <p className="font-semibold">Feedback registrado.</p>
                      <p className="text-xs mt-0.5">O recrutador poderá considerar na decisão final.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Seu feedback</p>
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Recomendação</label>
                      <select
                        value={recommendation}
                        onChange={(e) => setRecommendation(e.target.value as typeof recommendation)}
                        className="w-full rounded-lg border border-border bg-[hsl(var(--bg))] px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
                        disabled={submittingFeedback}
                      >
                        {Object.entries(RECOMMENDATION_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Mensagem</label>
                      <textarea
                        value={feedbackMessage}
                        onChange={(e) => setFeedbackMessage(e.target.value)}
                        placeholder="Descreva sua avaliação do candidato..."
                        rows={3}
                        disabled={submittingFeedback}
                        className="w-full rounded-lg border border-border bg-[hsl(var(--bg))] px-3 py-2 text-sm text-text placeholder-[hsl(var(--text-muted))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] resize-none"
                      />
                    </div>
                    <p className="text-[10px] text-text-muted">
                      Sua recomendação não move o candidato automaticamente. O recrutador é responsável pela decisão final.
                    </p>
                    <button
                      type="button"
                      onClick={handleSendFeedback}
                      disabled={submittingFeedback || !feedbackMessage.trim()}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submittingFeedback ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Enviar feedback
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Candidatos ────────────────────────────────────────────── */}
      {activeTab === "candidates" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Jobs */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text">Minhas Vagas</p>
            {loadingJobs ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--primary))]" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-muted">
                Nenhuma vaga atribuída
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {jobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => handleJobSelect(job.id)}
                    className={[
                      "w-full text-left rounded-xl border p-3 transition-all text-sm",
                      selectedJobId === job.id
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)] text-[hsl(var(--primary))]"
                        : "border-border hover:border-[hsl(var(--primary)/0.4)] bg-surface text-text",
                    ].join(" ")}
                  >
                    <p className="font-medium truncate">{job.title}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {formatCandidateCount(job.candidate_count)}
                      {job.assigned_count !== job.candidate_count
                        ? ` · ${job.assigned_count} com scorecard`
                        : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Candidates */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text">Candidatos</p>
            {loadingCandidates ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--primary))]" />
              </div>
            ) : candidates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-muted">
                {selectedJobId ? "Nenhum candidato atribuído nesta vaga" : "Selecione uma vaga"}
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleBrowseCandidateSelect(c.id)}
                    className={[
                      "w-full text-left rounded-xl border p-3 transition-all text-sm",
                      browseSummary?.id === c.id
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)]"
                        : "border-border hover:border-[hsl(var(--primary)/0.4)] bg-surface",
                    ].join(" ")}
                  >
                    <p className="font-medium truncate text-text">{c.name}</p>
                    <p className="text-xs text-text-muted truncate">{c.email}</p>
                    {c.scorecard_status && (
                      <p className="text-xs text-text-muted mt-0.5 capitalize">
                        Scorecard: {c.scorecard_status}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text">Resumo seguro</p>
            {loadingBrowseSummary ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--primary))]" />
              </div>
            ) : browseSummaryError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                {browseSummaryError}
              </div>
            ) : !browseSummary ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-muted">
                Selecione um candidato
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <div>
                  <p className="text-xs text-text-muted">Nome</p>
                  <p className="text-sm font-semibold text-text">{browseSummary.name}</p>
                </div>
                {browseSummary.pipeline_stage && (
                  <div>
                    <p className="text-xs text-text-muted">Etapa</p>
                    <p className="text-sm capitalize text-text">{browseSummary.pipeline_stage}</p>
                  </div>
                )}
                {browseSummary.scorecard && (
                  <div>
                    <p className="text-xs text-text-muted">Scorecard</p>
                    <div className="rounded bg-[hsl(var(--bg))] border border-border/40 p-3 space-y-1.5 mt-1">
                      <p className="text-xs text-text-muted">Status: <span className="font-medium text-text capitalize">{browseSummary.scorecard.status}</span></p>
                      {browseSummary.scorecard.recommendation && (
                        <p className="text-xs text-text-muted">Recomendação: <span className="font-medium text-text">{browseSummary.scorecard.recommendation.replace(/_/g, " ")}</span></p>
                      )}
                      {browseSummary.scorecard.submitted_at && (
                        <p className="text-xs text-text-muted">Enviado: {new Date(browseSummary.scorecard.submitted_at).toLocaleDateString("pt-BR")}</p>
                      )}
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  Documentos, ERP e logs técnicos não são exibidos ao gestor.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
