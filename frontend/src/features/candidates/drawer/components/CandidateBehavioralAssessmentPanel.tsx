import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader } from "lucide-react";
import type { BehavioralAssignmentDetailResponse } from "../../../../types/domain";
import { getCandidateBehavioralAssessment } from "../../../../services/behavioralAssessmentService";
import { BehavioralAIEvaluationPanel } from "./BehavioralAIEvaluationPanel";
import { parseQuestionText } from "../../../behavioral-templates/behavioralTemplateHelper";


interface CandidateBehavioralAssessmentPanelProps {
  jobId: string | null;
  candidateId: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Avaliação pendente", color: "bg-amber-50 border-amber-200 text-amber-900" },
  in_progress: { label: "Em progresso", color: "bg-blue-50 border-blue-200 text-blue-900" },
  submitted: { label: "Enviada", color: "bg-emerald-50 border-emerald-200 text-emerald-900" },
  expired: { label: "Expirada", color: "bg-gray-50 border-gray-200 text-gray-900" },
  cancelled: { label: "Cancelada", color: "bg-slate-50 border-slate-200 text-slate-900" },
};

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("pt-BR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderAnswer(answer: any) {
  if (!answer) return <span className="text-[hsl(var(--text-muted))]">Não respondida</span>;

  if (answer.answer_text) {
    return <p className="whitespace-pre-wrap text-sm">{answer.answer_text}</p>;
  }

  if (answer.answer_value !== null) {
    return <span className="text-lg font-semibold">{answer.answer_value}</span>;
  }

  if (answer.selected_options_json && Array.isArray(answer.selected_options_json)) {
    return (
      <div className="space-y-1">
        {answer.selected_options_json.map((option: string, i: number) => (
          <div key={i} className="text-sm">
            ✓ {option}
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-[hsl(var(--text-muted))]">—</span>;
}

export function CandidateBehavioralAssessmentPanel({
  jobId,
  candidateId,
}: CandidateBehavioralAssessmentPanelProps) {
  const [assessment, setAssessment] = useState<BehavioralAssignmentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAssessment = async () => {
      setLoading(true);
      setError(null);

      if (!jobId || !candidateId) {
        setLoading(false);
        return;
      }

      try {
        const data = await getCandidateBehavioralAssessment(jobId, candidateId);
        setAssessment(data);
      } catch (err) {
        setError("Erro ao carregar avaliação comportamental");
      } finally {
        setLoading(false);
      }
    };

    loadAssessment();
  }, [jobId, candidateId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="h-5 w-5 animate-spin text-[hsl(var(--text-muted))]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  if (!assessment || !assessment.template_name) {
    return (
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/30 p-6 text-center">
        <p className="text-sm text-[hsl(var(--text-muted))]">
          Esta vaga não possui avaliação comportamental vinculada.
        </p>
      </div>
    );
  }

  const statusConfig = STATUS_LABELS[assessment.status] || STATUS_LABELS.pending;

  return (
    <div className="space-y-6 p-6">
      {/* Header with status and template name */}
      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Avaliação comportamental
          </p>
          <p className="mt-1 text-base font-semibold">{assessment.template_name}</p>
        </div>

        <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${statusConfig.color}`}>
          {statusConfig.label}
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-2 border-l-2 border-[hsl(var(--border))] pl-4">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-4 w-4 text-[hsl(var(--text-muted))]" />
          <div className="text-sm">
            <p className="text-xs text-[hsl(var(--text-muted))]">Assignada em</p>
            <p className="font-medium">{formatDate(assessment.assigned_at)}</p>
          </div>
        </div>

        {assessment.started_at && (
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-4 w-4 text-[hsl(var(--text-muted))]" />
            <div className="text-sm">
              <p className="text-xs text-[hsl(var(--text-muted))]">Iniciada em</p>
              <p className="font-medium">{formatDate(assessment.started_at)}</p>
            </div>
          </div>
        )}

        {assessment.submitted_at && (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
            <div className="text-sm">
              <p className="text-xs text-[hsl(var(--text-muted))]">Enviada em</p>
              <p className="font-medium">{formatDate(assessment.submitted_at)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <p className="font-medium">Progresso</p>
          <p className="text-[hsl(var(--text-muted))]">
            {assessment.answered_count} de {assessment.question_count}
          </p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--surface-muted))]">
          <div
            className="h-full bg-[hsl(var(--primary))]"
            style={{
              width: `${assessment.question_count > 0 ? (assessment.answered_count / assessment.question_count) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Competencies and questions */}
      {assessment.status === "submitted" && assessment.competencies.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Respostas
          </p>
          {assessment.competencies.map((competency) => (
            <div key={competency.id} className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-4">
              <div>
                <p className="font-semibold text-[hsl(var(--text))]">{competency.name}</p>
                {competency.description && (
                  <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">{competency.description}</p>
                )}
              </div>

              <div className="space-y-3">
                {competency.questions.map((question) => {
                  const parsed = parseQuestionText(question.question_text);
                  return (
                    <div key={question.id} className="space-y-2 rounded-lg bg-[hsl(var(--surface-muted))]/30 p-3">
                      <p className="text-sm font-medium text-[hsl(var(--text))]">{parsed.text}</p>
                      <div className="text-sm">
                        {renderAnswer(question.answer)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending/In Progress state */}
      {(assessment.status === "pending" || assessment.status === "in_progress") && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 text-blue-600" />
          <div className="text-sm">
            <p className="font-medium text-blue-900">
              {assessment.status === "pending"
                ? "Aguardando resposta do candidato"
                : "Candidato está respondendo a avaliação"}
            </p>
            <p className="mt-1 text-blue-800">
              Respostas são feitas pelo candidato no Portal do Candidato, em /candidato/portal.
            </p>
          </div>
        </div>
      )}

      {/* IA-Assisted Analysis Panel */}
      <BehavioralAIEvaluationPanel
        jobId={jobId}
        candidateId={candidateId}
        assignmentStatus={assessment.status}
      />
    </div>
  );
}
