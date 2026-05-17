import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader, RefreshCw, Sparkles } from "lucide-react";
import type { BehavioralAIEvaluationResponse } from "../../../../types/domain";
import {
  triggerBehavioralAnalysis,
  getBehavioralEvaluation,
} from "../../../../services/behavioralAIEvaluationService";

interface BehavioralAIEvaluationPanelProps {
  jobId: string | null;
  candidateId: string | null;
  assignmentStatus: "pending" | "in_progress" | "submitted" | "expired" | "cancelled" | null;
}

export function BehavioralAIEvaluationPanel({
  jobId,
  candidateId,
  assignmentStatus,
}: BehavioralAIEvaluationPanelProps) {
  const [evaluation, setEvaluation] = useState<BehavioralAIEvaluationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isMountedRef = useRef(true);
  const isPollingRef = useRef(false);
  const pollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Load evaluation on mount
  useEffect(() => {
    const loadEvaluation = async () => {
      if (!jobId || !candidateId) return;

      setLoading(true);
      const result = await getBehavioralEvaluation(jobId, candidateId);
      setEvaluation(result);
      setLoading(false);
    };

    loadEvaluation();
  }, [jobId, candidateId]);

  const handleGenerateAnalysis = async () => {
    if (!jobId || !candidateId) return;

    setTriggering(true);
    setError(null);

    try {
      const result = await triggerBehavioralAnalysis(jobId, candidateId);
      if (result) {
        setEvaluation({ ...result, assignment_id: "" } as BehavioralAIEvaluationResponse);

        // Clear any previous interval before starting a new one
        if (pollIntervalRef.current !== null) {
          clearInterval(pollIntervalRef.current);
        }

        const poll = async () => {
          if (document.hidden) return;
          if (isPollingRef.current) return;
          if (!isMountedRef.current) return;

          isPollingRef.current = true;
          try {
            const updated = await getBehavioralEvaluation(jobId, candidateId);
            if (!isMountedRef.current) return;
            if (updated) {
              setEvaluation(updated);
              if (updated.status === "completed" || updated.status === "failed") {
                if (pollIntervalRef.current !== null) {
                  clearInterval(pollIntervalRef.current);
                  pollIntervalRef.current = null;
                }
              }
            }
          } finally {
            isPollingRef.current = false;
          }
        };

        pollIntervalRef.current = window.setInterval(poll, 3000);

        // Hard stop after 5 minutes
        window.setTimeout(() => {
          if (pollIntervalRef.current !== null) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }, 300_000);
      } else {
        setError("Falha ao disparar análise assistida");
      }
    } catch (err) {
      setError("Erro ao disparar análise");
    } finally {
      setTriggering(false);
    }
  };

  // Only show for submitted assignments
  if (!assignmentStatus || assignmentStatus !== "submitted") {
    return null;
  }

  // Show button to generate analysis if no evaluation exists
  if (!evaluation) {
    if (loading) {
      return (
        <div className="flex items-center justify-center p-6">
          <Loader className="h-5 w-5 animate-spin text-[hsl(var(--text-muted))]" />
        </div>
      );
    }

    return (
      <div className="space-y-3 border-t border-[hsl(var(--border))]/30 p-6">
        <button
          onClick={handleGenerateAnalysis}
          disabled={triggering}
          className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-900 transition hover:bg-blue-100 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {triggering ? "Gerando análise..." : "Gerar análise assistida por IA"}
        </button>
      </div>
    );
  }

  // Show evaluation
  return (
    <div className="border-t border-[hsl(var(--border))]/30 p-6">
      {/* Header with collapse toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="mb-4 flex w-full items-center gap-2 text-left"
      >
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Análise assistida por IA
          </p>
        </div>
        <span className="text-xs text-[hsl(var(--text-muted))]">
          {isCollapsed ? "Expandir" : "Recolher"}
        </span>
      </button>

      {isCollapsed && (
        <div className="rounded-lg bg-blue-50/50 px-3 py-2">
          <p className="text-sm font-medium text-blue-900">
            {evaluation.status === "processing" && "Análise em processamento..."}
            {evaluation.status === "completed" && `Confiança: ${evaluation.confidence?.toUpperCase()}`}
            {evaluation.status === "failed" && "Análise falhou"}
            {evaluation.status === "pending" && "Aguardando processamento"}
          </p>
        </div>
      )}

      {!isCollapsed && (
        <div className="space-y-6">
          {/* Loading/Processing State */}
          {evaluation.status === "processing" && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <Loader className="h-5 w-5 animate-spin text-blue-600" />
              <div className="text-sm">
                <p className="font-medium text-blue-900">Análise em processamento</p>
                <p className="text-xs text-blue-800">
                  Está gerando análise assistida por IA. Isso pode levar alguns minutos.
                </p>
              </div>
            </div>
          )}

          {/* Failed State */}
          {evaluation.status === "failed" && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
                <div className="text-sm">
                  <p className="font-medium text-red-900">Análise não disponível</p>
                  <p className="mt-1 text-xs text-red-800">
                    {evaluation.error_message || "Erro ao processar análise assistida"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleGenerateAnalysis}
                disabled={triggering}
                className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-900 transition hover:bg-red-100 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </button>
            </div>
          )}

          {/* Completed State */}
          {evaluation.status === "completed" && (
            <div className="space-y-6">
              {/* Confidence Indicator */}
              <div className="flex items-center gap-3 rounded-lg bg-green-50 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div className="text-sm">
                  <p className="font-medium text-green-900">
                    Análise disponível - Confiança:{" "}
                    <span className="font-semibold">
                      {evaluation.confidence === "high" && "Alta"}
                      {evaluation.confidence === "medium" && "Média"}
                      {evaluation.confidence === "low" && "Baixa"}
                    </span>
                  </p>
                </div>
              </div>

              {/* Summary */}
              {evaluation.summary && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                    Resumo
                  </p>
                  <p className="rounded-lg bg-[hsl(var(--surface-muted))]/30 p-3 text-sm leading-relaxed">
                    {evaluation.summary}
                  </p>
                </div>
              )}

              {/* Competency Signals */}
              {evaluation.competency_signals && evaluation.competency_signals.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                    Sinais por Competência
                  </p>
                  <div className="space-y-2">
                    {evaluation.competency_signals.map((signal, idx) => (
                      <div key={idx} className="rounded-lg border border-[hsl(var(--border))] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-[hsl(var(--text))]">{signal.competency}</p>
                          <span
                            className={`rounded px-2 py-1 text-xs font-medium whitespace-nowrap ${
                              signal.signal === "strong"
                                ? "bg-green-50 text-green-700"
                                : signal.signal === "moderate"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {signal.signal === "strong" && "Forte"}
                            {signal.signal === "moderate" && "Moderado"}
                            {signal.signal === "weak" && "Fraco"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-[hsl(var(--text))]">{signal.evidence}</p>
                        {signal.concerns.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {signal.concerns.map((concern, cidx) => (
                              <div key={cidx} className="text-xs text-[hsl(var(--text-muted))]">
                                • {concern}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strengths */}
              {evaluation.strengths && evaluation.strengths.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                    Forças Identificadas
                  </p>
                  <div className="space-y-1">
                    {evaluation.strengths.map((strength, idx) => (
                      <div key={idx} className="flex gap-2 rounded-lg bg-green-50/50 px-3 py-2 text-sm text-green-900">
                        <span className="mt-0.5">✓</span>
                        <span>{strength}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Concerns/Points of Attention */}
              {evaluation.concerns && evaluation.concerns.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                    Pontos de Atenção
                  </p>
                  <div className="space-y-1">
                    {evaluation.concerns.map((concern, idx) => (
                      <div key={idx} className="flex gap-2 rounded-lg bg-amber-50/50 px-3 py-2 text-sm text-amber-900">
                        <span className="mt-0.5">!</span>
                        <span>{concern}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Interview Questions */}
              {evaluation.suggested_interview_questions && evaluation.suggested_interview_questions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                    Perguntas Sugeridas para Entrevista
                  </p>
                  <div className="space-y-2">
                    {evaluation.suggested_interview_questions.map((question, idx) => (
                      <div key={idx} className="rounded-lg bg-blue-50/30 px-3 py-2 text-sm text-[hsl(var(--text))]">
                        {idx + 1}. {question}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk Flags */}
              {evaluation.risk_flags && evaluation.risk_flags.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                    Limitações da Análise
                  </p>
                  <div className="space-y-1">
                    {evaluation.risk_flags.map((flag, idx) => (
                      <div key={idx} className="flex gap-2 rounded-lg bg-orange-50/50 px-3 py-2 text-sm text-orange-900">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span>{flag.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
