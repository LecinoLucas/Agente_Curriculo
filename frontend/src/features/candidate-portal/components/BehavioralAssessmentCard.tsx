import { ClipboardCheck, Lock } from "lucide-react";

import { Button } from "../../../components/ui/button";
import type { BehavioralAssignmentSummary } from "../../../services/candidatePortalService";

function statusLabel(status: string): string {
  if (status === "pending") return "Pendente";
  if (status === "in_progress") return "Em andamento";
  if (status === "submitted") return "Enviada";
  if (status === "expired") return "Expirada";
  if (status === "cancelled") return "Cancelada";
  return status;
}

function formatDeadline(deadline: string | null): string | null {
  if (!deadline) return null;
  return new Date(deadline).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function BehavioralAssessmentCard({
  assignment,
  onOpen,
  disabled,
}: {
  assignment: BehavioralAssignmentSummary;
  onOpen: (assignment: BehavioralAssignmentSummary) => void;
  disabled?: boolean;
}) {
  const isEvaluated =
    assignment.status === "submitted" && assignment.ai_evaluation_status === "completed";
  const isSubmitted = assignment.status === "submitted";
  const deadline = formatDeadline(assignment.expires_at);
  const primaryStatus = isEvaluated ? "Avaliada" : statusLabel(assignment.status);

  return (
    <div className="rounded-xl border border-border/70 bg-background/80 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Avaliação comportamental {isSubmitted ? "enviada" : "pendente"}
          </div>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{assignment.template_name}</p>
            <p>{assignment.job_title || "Vaga vinculada"}</p>
            <p>
              {assignment.answered_count} de {assignment.question_count} respostas
            </p>
            {deadline ? <p>Prazo: {deadline}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            {primaryStatus}
          </span>
          <Button
            type="button"
            onClick={() => onOpen(assignment)}
            disabled={disabled}
            variant={isSubmitted ? "outline" : "default"}
          >
            {isSubmitted ? <Lock className="mr-2 h-4 w-4" /> : null}
            {isSubmitted ? "Ver respostas" : "Responder avaliação"}
          </Button>
        </div>
      </div>
    </div>
  );
}
