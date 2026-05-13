import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  candidatePortalService,
  type CandidateAssessmentAnswerPayload,
  type CandidateAssessmentDetail,
  type CandidateAssessmentQuestion,
} from "../services/candidatePortalService";
import { HttpError } from "../services/http";
import { toast } from "../shared/utils/toast";

type AnswerState = Record<string, string | string[]>;

function typeLabel(type: CandidateAssessmentDetail["type"]) {
  return type === "behavioral_test" ? "Teste comportamental" : "Pesquisa comportamental";
}

function buildPayload(question: CandidateAssessmentQuestion, value: string | string[] | undefined): CandidateAssessmentAnswerPayload {
  if (question.question_type === "multiple_choice") {
    return { question_id: question.id, option_ids: Array.isArray(value) ? value : [] };
  }
  if (question.question_type === "single_choice") {
    return { question_id: question.id, option_id: typeof value === "string" ? value : null };
  }
  if (question.question_type === "scale") {
    return { question_id: question.id, answer_value: typeof value === "string" ? Number(value) : null };
  }
  return { question_id: question.id, answer_text: typeof value === "string" ? value : "" };
}

export function CandidateAssessmentPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState<CandidateAssessmentDetail | null>(null);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!assignmentId) return;
      setLoading(true);
      setError(null);
      try {
        const detail = await candidatePortalService.startAssessment(assignmentId);
        setAssessment(detail);
      } catch (err) {
        if (err instanceof HttpError && err.status === 401) {
          navigate("/candidato/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Não foi possível carregar a avaliação.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [assignmentId, navigate]);

  function updateAnswer(questionId: string, value: string | string[]) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  function toggleMultiple(questionId: string, optionId: string) {
    setAnswers((current) => {
      const currentValues = Array.isArray(current[questionId]) ? current[questionId] as string[] : [];
      const next = currentValues.includes(optionId)
        ? currentValues.filter((item) => item !== optionId)
        : [...currentValues, optionId];
      return { ...current, [questionId]: next };
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!assessment || !assignmentId) return;

    const missing = assessment.questions.find((question) => {
      if (!question.required) return false;
      const value = answers[question.id];
      return Array.isArray(value) ? value.length === 0 : !value;
    });
    if (missing) {
      toast.error("Responda todas as perguntas obrigatórias.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = assessment.questions.map((question) => buildPayload(question, answers[question.id]));
      const result = await candidatePortalService.submitAssessment(assignmentId, payload);
      toast.success(result.message);
      navigate("/candidato/portal", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar suas respostas.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando avaliação...
        </div>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Avaliação</CardTitle>
            <CardDescription>{error ?? "Avaliação não encontrada."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/candidato/portal">Voltar ao portal</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (assessment.status === "completed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>{assessment.title}</CardTitle>
            <CardDescription>Esta avaliação já foi concluída.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/candidato/portal">Voltar ao portal</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              {typeLabel(assessment.type)}
            </p>
            <CardTitle>{assessment.title}</CardTitle>
            <CardDescription>{assessment.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              {assessment.privacy_notice}
            </p>
          </CardContent>
        </Card>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {assessment.questions.map((question, index) => (
            <Card key={question.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {index + 1}. {question.question_text}
                </CardTitle>
                {question.required ? <CardDescription>Obrigatória</CardDescription> : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {question.question_type === "single_choice"
                  ? question.options.map((option) => (
                      <label key={option.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
                        <input
                          type="radio"
                          name={question.id}
                          value={option.id}
                          checked={answers[question.id] === option.id}
                          onChange={() => updateAnswer(question.id, option.id)}
                        />
                        {option.option_text}
                      </label>
                    ))
                  : null}

                {question.question_type === "multiple_choice"
                  ? question.options.map((option) => (
                      <label key={option.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
                        <input
                          type="checkbox"
                          checked={Array.isArray(answers[question.id]) && (answers[question.id] as string[]).includes(option.id)}
                          onChange={() => toggleMultiple(question.id, option.id)}
                        />
                        {option.option_text}
                      </label>
                    ))
                  : null}

                {question.question_type === "scale" ? (
                  <input
                    className="ui-input h-11 w-full rounded-xl px-3"
                    type="range"
                    min={Number(question.metadata?.min ?? 1)}
                    max={Number(question.metadata?.max ?? 5)}
                    value={typeof answers[question.id] === "string" ? answers[question.id] as string : String(question.metadata?.min ?? 1)}
                    onChange={(event) => updateAnswer(question.id, event.target.value)}
                  />
                ) : null}

                {question.question_type === "text" ? (
                  <textarea
                    className="ui-input min-h-28 w-full rounded-xl px-3 py-2"
                    value={typeof answers[question.id] === "string" ? answers[question.id] as string : ""}
                    onChange={(event) => updateAnswer(question.id, event.target.value)}
                  />
                ) : null}
              </CardContent>
            </Card>
          ))}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" asChild>
              <Link to="/candidato/portal">Voltar</Link>
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enviar respostas
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
