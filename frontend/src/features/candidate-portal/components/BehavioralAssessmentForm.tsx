import { Loader2, Save, Send } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "../../../components/ui/button";
import type {
  BehavioralAssignmentAnswerPayload,
  BehavioralAssignmentDetail,
  BehavioralAssignmentQuestion,
} from "../../../services/candidatePortalService";

type DraftAnswer = {
  answer_text: string;
  answer_value: string;
  selected_options_json: string[];
};

function buildInitialAnswers(assignment: BehavioralAssignmentDetail): Record<string, DraftAnswer> {
  const result: Record<string, DraftAnswer> = {};
  for (const competency of assignment.competencies) {
    for (const question of competency.questions) {
      result[question.id] = {
        answer_text: question.answer?.answer_text ?? "",
        answer_value: question.answer?.answer_value != null ? String(question.answer.answer_value) : "",
        selected_options_json: question.answer?.selected_options_json ?? [],
      };
    }
  }
  return result;
}

import { parseQuestionText } from "../../behavioral-templates/behavioralTemplateHelper";

function optionList(question: BehavioralAssignmentQuestion): string[] {
  if (Array.isArray(question.options_json)) {
    return question.options_json.map((item) => String(item));
  }
  return [];
}

function toPayload(assignment: BehavioralAssignmentDetail, answers: Record<string, DraftAnswer>): BehavioralAssignmentAnswerPayload[] {
  return assignment.competencies.flatMap((competency) =>
    competency.questions.map((question) => {
      const answer = answers[question.id] ?? { answer_text: "", answer_value: "", selected_options_json: [] };
      if (question.answer_type === "text") {
        return { question_id: question.id, answer_text: answer.answer_text.trim() || null };
      }
      if (question.answer_type === "scale") {
        return {
          question_id: question.id,
          answer_value: answer.answer_value ? Number(answer.answer_value) : null,
        };
      }
      return {
        question_id: question.id,
        selected_options_json: answer.selected_options_json.length ? answer.selected_options_json : null,
      };
    })
  );
}

function requiredMissing(assignment: BehavioralAssignmentDetail, answers: Record<string, DraftAnswer>): boolean {
  return assignment.competencies.some((competency) =>
    competency.questions.some((question) => {
      if (!question.is_required) return false;
      const answer = answers[question.id];
      if (!answer) return true;
      if (question.answer_type === "text") return !answer.answer_text.trim();
      if (question.answer_type === "scale") return !answer.answer_value;
      return answer.selected_options_json.length === 0;
    })
  );
}

export function BehavioralAssessmentForm({
  assignment,
  onSave,
  onSubmit,
  onClose,
  saving,
}: {
  assignment: BehavioralAssignmentDetail;
  onSave: (answers: BehavioralAssignmentAnswerPayload[]) => Promise<void>;
  onSubmit: (answers: BehavioralAssignmentAnswerPayload[]) => Promise<void>;
  onClose: () => void;
  saving?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, DraftAnswer>>(() => buildInitialAnswers(assignment));
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const isSubmitted = assignment.status === "submitted";
  const payload = useMemo(() => toPayload(assignment, answers), [assignment, answers]);

  const updateAnswer = (questionId: string, patch: Partial<DraftAnswer>) => {
    setAnswers((current) => ({
      ...current,
      [questionId]: {
        answer_text: "",
        answer_value: "",
        selected_options_json: [],
        ...(current[questionId] ?? {}),
        ...patch,
      },
    }));
  };

  const handleSubmit = async () => {
    if (requiredMissing(assignment, answers)) {
      setValidationMessage("Responda todas as perguntas obrigatórias antes de enviar.");
      return;
      return;
    }
    setValidationMessage(null);
    await onSubmit(payload);
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">{assignment.template_name}</h3>
          <p className="text-sm text-muted-foreground">{assignment.job_title || "Vaga vinculada"}</p>
        </div>
        <Button type="button" variant="outline" onClick={onClose}>
          Fechar
        </Button>
      </div>

      {isSubmitted ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Avaliação enviada
        </div>
      ) : null}

      <div className="mt-5 space-y-6">
        {assignment.competencies.map((competency) => (
          <section key={competency.id} className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground">{competency.name}</h4>
              {competency.description ? (
                <p className="text-sm text-muted-foreground">{competency.description}</p>
              ) : null}
            </div>
            {competency.questions.map((question) => {
              const current = answers[question.id] ?? {
                answer_text: "",
                answer_value: "",
                selected_options_json: [],
              };
              const options = optionList(question);
              const parsed = parseQuestionText(question.question_text);
              return (
                <div key={question.id} className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                  <label className="block text-sm font-medium text-foreground">
                    {parsed.text}
                    {question.is_required ? <span className="text-destructive"> *</span> : null}
                  </label>
                  
                  {parsed.instruction ? (
                    <p className="text-xs text-muted-foreground mt-1 mb-2">{parsed.instruction}</p>
                  ) : null}

                  {question.answer_type === "text" ? (
                    <textarea
                      className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={current.answer_text}
                      disabled={isSubmitted}
                      onChange={(event) => updateAnswer(question.id, { answer_text: event.target.value })}
                    />
                  ) : null}
                  {question.answer_type === "scale" ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <label key={value} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                            <input
                              type="radio"
                              name={question.id}
                              value={value}
                              disabled={isSubmitted}
                              checked={current.answer_value === String(value)}
                              onChange={() => updateAnswer(question.id, { answer_value: String(value) })}
                            />
                            {value}
                          </label>
                        ))}
                      </div>
                      {parsed.scale_labels ? (
                        <div className="flex justify-between w-full text-xs text-muted-foreground px-1">
                          <span>1 = {parsed.scale_labels[1] ?? "Muito baixo"}</span>
                          <span>3 = {parsed.scale_labels[3] ?? "Médio"}</span>
                          <span>5 = {parsed.scale_labels[5] ?? "Alto"}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {question.answer_type === "multiple_choice" ? (
                    <div className="space-y-2">
                      {options.map((option) => (
                        <label key={option} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={question.id}
                            value={option}
                            disabled={isSubmitted}
                            checked={current.selected_options_json.includes(option)}
                            onChange={() => updateAnswer(question.id, { selected_options_json: [option] })}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        ))}
      </div>

      {validationMessage ? (
        <p className="mt-4 text-sm font-medium text-destructive">{validationMessage}</p>
      ) : null}

      {!isSubmitted ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => void onSave(payload)} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar rascunho
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar avaliação
          </Button>
        </div>
      ) : null}
    </div>
  );
}
