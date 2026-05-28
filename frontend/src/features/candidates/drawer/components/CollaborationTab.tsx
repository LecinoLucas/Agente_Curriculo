import { useEffect, useState } from "react";
import { LoaderCircle, MessageSquare, UserCheck, AlertCircle } from "lucide-react";
import { collaborationService } from "../../../../services/collaborationService";
import { usersService } from "../../../../services/usersService";
import type { CollaborationComment, ManagerListItem } from "../../../../types/domain";

interface CollaborationTabProps {
  candidateId: string;
  jobId: string;
}

type Mode = "comment" | "review_request";

const PRIORITY_OPTIONS = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
] as const;

export function CollaborationTab({ candidateId, jobId }: CollaborationTabProps) {
  const [comments, setComments] = useState<CollaborationComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<Mode>("comment");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [submitting, setSubmitting] = useState(false);
  const [reviewSent, setReviewSent] = useState(false);
  const [managers, setManagers] = useState<ManagerListItem[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [loadedManagers, setLoadedManagers] = useState(false);
  const [reviewTargetLabel, setReviewTargetLabel] = useState<string | null>(null);

  const fetchComments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await collaborationService.listCollaboration(jobId, candidateId);
      setComments(response.comments);
    } catch {
      setError("Não foi possível carregar os comentários de colaboração.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [candidateId, jobId]);

  useEffect(() => {
    if (mode !== "review_request" || loadedManagers || loadingManagers) {
      return;
    }

    const loadManagers = async () => {
      try {
        setLoadingManagers(true);
        setError(null);
        const response = await usersService.listManagers();
        setManagers(response.managers);
      } catch {
        setError("Não foi possível carregar a lista de gestores.");
      } finally {
        setLoadingManagers(false);
        setLoadedManagers(true);
      }
    };

    loadManagers();
  }, [loadedManagers, loadingManagers, mode]);

  const hasManagerFeedback = comments.some((c) => c.comment_type === "manager_feedback");
  const hasPendingRequest = comments.some((c) => c.comment_type === "review_request") && !hasManagerFeedback;
  const requiresTargetManager = mode === "review_request" && managers.length > 0;
  const selectedManager = managers.find((item) => item.id === selectedManagerId) ?? null;

  const handleSubmit = async () => {
    if (!message.trim()) return;
    if (mode === "review_request" && requiresTargetManager && !selectedManagerId) {
      setError("Selecione o gestor responsável pela revisão.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "comment") {
        const comment = await collaborationService.createComment(jobId, candidateId, {
          message: message.trim(),
          comment_type: "comment",
        });
        setComments((prev) => [comment, ...prev]);
      } else {
        const comment = await collaborationService.requestManagerReview(jobId, candidateId, {
          message: message.trim(),
          target_manager_id: selectedManagerId || undefined,
          priority,
        });
        setComments((prev) => [comment, ...prev]);
        setReviewTargetLabel(selectedManager?.name ?? null);
        setReviewSent(true);
      }
      setMessage("");
      if (mode === "review_request") {
        setSelectedManagerId("");
      }
    } catch {
      setError(mode === "comment" ? "Não foi possível enviar o comentário." : "Não foi possível enviar a solicitação.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--bg))]">
      {/* Status badges */}
      {(hasPendingRequest || hasManagerFeedback) && (
        <div className="mx-5 mt-4 flex gap-2">
          {hasPendingRequest && (
            <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              <LoaderCircle className="h-3 w-3" />
              Revisão solicitada
            </span>
          )}
          {hasManagerFeedback && (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
              <UserCheck className="h-3 w-3" />
              Feedback recebido
            </span>
          )}
        </div>
      )}

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <LoaderCircle className="h-6 w-6 animate-spin text-[hsl(var(--primary))]" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-950 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-text-muted">
            <p className="text-sm">Sem comentários de colaboração ainda</p>
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-lg border border-border/50 bg-surface p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-text">
                      {comment.author_role === "recruiter" && "Recrutador"}
                      {comment.author_role === "manager" && "Gestor"}
                      {comment.author_role === "admin" && "Admin"}
                      {!["recruiter", "manager", "admin"].includes(comment.author_role) && comment.author_role}
                    </span>
                    <span className="text-xs text-text-muted">
                      {new Date(comment.created_at).toLocaleDateString("pt-BR", {
                        dateStyle: "short",
                      })}
                    </span>
                  </div>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-surface-muted text-text-muted flex-shrink-0">
                    {comment.comment_type === "review_request" && "Solicitação de revisão"}
                    {comment.comment_type === "manager_feedback" && "Feedback do gestor"}
                    {comment.comment_type === "comment" && "Comentário"}
                    {!["review_request", "manager_feedback", "comment"].includes(comment.comment_type) && comment.comment_type}
                  </span>
                </div>
                <p className="text-sm text-text">{comment.message}</p>
                {comment.recommendation && (
                  <div className="pt-2 border-t border-border/30">
                    <span className="text-xs font-medium text-text-muted">Recomendação:</span>
                    <span className="ml-2 text-xs font-semibold text-[hsl(var(--primary))]">
                      {comment.recommendation === "advance" && "Avançar"}
                      {comment.recommendation === "hold" && "Aguardar"}
                      {comment.recommendation === "reject" && "Não recomendo"}
                      {comment.recommendation === "request_interview" && "Solicitar entrevista"}
                      {!["advance", "hold", "reject", "request_interview"].includes(comment.recommendation) && comment.recommendation}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      {!loading && (
        <div className="border-t border-border/30 bg-surface p-5 space-y-3">
          {/* Mode toggle */}
          <div className="flex gap-1 rounded-lg border border-border/50 p-1 bg-[hsl(var(--bg))]">
            <button
              type="button"
              onClick={() => setMode("comment")}
              className={[
                "flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors",
                mode === "comment"
                  ? "bg-surface text-text shadow-sm"
                  : "text-text-muted hover:text-text",
              ].join(" ")}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Comentário
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("review_request");
                setReviewSent(false);
                setReviewTargetLabel(null);
              }}
              className={[
                "flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors",
                mode === "review_request"
                  ? "bg-surface text-[hsl(var(--primary))] shadow-sm"
                  : "text-text-muted hover:text-text",
              ].join(" ")}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Solicitar revisão do gestor
            </button>
          </div>

          {/* Priority (review_request only) */}
          {mode === "review_request" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Prioridade:</span>
                <div className="flex gap-1">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPriority(opt.value)}
                      className={[
                        "px-2.5 py-1 rounded-full text-xs font-semibold transition-colors",
                        priority === opt.value
                          ? opt.value === "high"
                            ? "bg-rose-500 text-white"
                            : opt.value === "medium"
                              ? "bg-amber-500 text-white"
                              : "bg-[hsl(var(--primary))] text-white"
                          : "border border-border text-text-muted hover:text-text",
                      ].join(" ")}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="target-manager"
                  className="block text-xs text-text-muted"
                >
                  Gestor responsável
                </label>
                {loadingManagers ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-[hsl(var(--bg))] px-3 py-2 text-sm text-text-muted">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Carregando gestores...
                  </div>
                ) : managers.length > 0 ? (
                  <select
                    id="target-manager"
                    value={selectedManagerId}
                    onChange={(e) => setSelectedManagerId(e.target.value)}
                    className="w-full rounded-lg border border-border/50 bg-[hsl(var(--bg))] px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
                    disabled={submitting}
                  >
                    <option value="">Selecione um gestor</option>
                    {managers.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.name} ({manager.email})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-900">
                    Nenhum gestor cadastrado. A solicitação será genérica.
                  </div>
                )}
              </div>

              <p className="text-[11px] text-text-muted">
                A revisão do gestor só será considerada concluída quando o usuário Gestor enviar feedback.
              </p>
            </div>
          )}

          {reviewSent && mode === "review_request" ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 text-sm text-emerald-800">
              <UserCheck className="h-4 w-4 flex-shrink-0" />
              {reviewTargetLabel ? (
                <span>Revisão solicitada para {reviewTargetLabel}.</span>
              ) : (
                <span>Revisão solicitada. A solicitação ficou genérica para gestores elegíveis.</span>
              )}
            </div>
          ) : (
            <>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  mode === "comment"
                    ? "Adicione um comentário interno..."
                    : "Descreva o que o gestor deve avaliar..."
                }
                className="w-full p-3 rounded-lg border border-border/50 bg-[hsl(var(--bg))] text-sm text-text placeholder-[hsl(var(--text-muted))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] resize-none"
                rows={3}
                disabled={submitting}
              />
              <button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  !message.trim() ||
                  (mode === "review_request" && requiresTargetManager && !selectedManagerId)
                }
                className={[
                  "w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                  mode === "review_request"
                    ? "bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/30 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/15"
                    : "bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary))]/90",
                ].join(" ")}
              >
                {submitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : mode === "review_request" ? (
                  <UserCheck className="h-4 w-4" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
                {mode === "comment" ? "Enviar comentário" : "Solicitar revisão do gestor"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
