import { useEffect, useState } from "react";
import { LoaderCircle, SendIcon, AlertCircle } from "lucide-react";
import { collaborationService } from "../../../../services/collaborationService";
import type { CollaborationComment } from "../../../../types/domain";

interface CollaborationTabProps {
  candidateId: string;
  jobId: string;
}

export function CollaborationTab({ candidateId, jobId }: CollaborationTabProps) {
  const [comments, setComments] = useState<CollaborationComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await collaborationService.listCollaboration(jobId, candidateId);
      setComments(response.comments);
    } catch (err) {
      setError("Não foi possível carregar os comentários de colaboração.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [candidateId, jobId]);

  const handleCreateComment = async () => {
    if (!message.trim()) return;

    setSubmitting(true);
    try {
      const comment = await collaborationService.createComment(jobId, candidateId, {
        message: message.trim(),
        comment_type: "comment",
      });
      setComments((prev) => [comment, ...prev]);
      setMessage("");
    } catch (err) {
      setError("Não foi possível enviar o comentário.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestReview = async () => {
    if (!message.trim()) return;

    setSubmitting(true);
    try {
      const comment = await collaborationService.requestManagerReview(jobId, candidateId, {
        message: message.trim(),
      });
      setComments((prev) => [comment, ...prev]);
      setMessage("");
    } catch (err) {
      setError("Não foi possível enviar a solicitação de revisão.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--bg))]">
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
          <div className="flex items-center justify-center py-8 text-[hsl(var(--text-muted))]">
            <p className="text-sm">Sem comentários de colaboração ainda</p>
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-lg border border-[hsl(var(--border))]/50 bg-[hsl(var(--surface))] p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-[hsl(var(--text))]">
                      {comment.author_role === "recruiter" && "Recrutador"}
                      {comment.author_role === "manager" && "Gestor"}
                      {comment.author_role === "admin" && "Admin"}
                      {!["recruiter", "manager", "admin"].includes(comment.author_role) && comment.author_role}
                    </span>
                    <span className="text-xs text-[hsl(var(--text-muted))]">
                      {new Date(comment.created_at).toLocaleDateString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]">
                    {comment.comment_type === "review_request" && "Solicitação de revisão"}
                    {comment.comment_type === "manager_feedback" && "Feedback do gestor"}
                    {comment.comment_type === "comment" && "Comentário"}
                    {!["review_request", "manager_feedback", "comment"].includes(comment.comment_type) && comment.comment_type}
                  </span>
                </div>
                <p className="text-sm text-[hsl(var(--text))]">{comment.message}</p>
                {comment.recommendation && (
                  <div className="pt-2 border-t border-[hsl(var(--border))]/30">
                    <span className="text-xs font-medium text-[hsl(var(--text-muted))]">
                      Recomendação:
                    </span>
                    <span className="ml-2 text-xs font-semibold text-[hsl(var(--primary))]">
                      {comment.recommendation === "advance" && "Avançar"}
                      {comment.recommendation === "hold" && "Aguardar"}
                      {comment.recommendation === "reject" && "Rejeitar"}
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

      {/* Comment input */}
      {!loading && (
        <div className="border-t border-[hsl(var(--border))]/30 bg-[hsl(var(--surface))] p-5 space-y-3">
          <div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Adicione um comentário ou solicite revisão do gestor..."
              className="w-full p-3 rounded-lg border border-[hsl(var(--border))]/50 bg-[hsl(var(--bg))] text-sm text-[hsl(var(--text))] placeholder-[hsl(var(--text-muted))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] resize-none"
              rows={3}
              disabled={submitting}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCreateComment}
              disabled={submitting || !message.trim()}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <SendIcon className="h-4 w-4" />
                  <span>Comentário</span>
                </>
              )}
            </button>

            <button
              onClick={handleRequestReview}
              disabled={submitting || !message.trim()}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5 px-4 py-2 text-sm font-semibold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary))]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                </>
              ) : (
                <>
                  <SendIcon className="h-4 w-4" />
                </>
              )}
              <span>Solicitar revisão</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
