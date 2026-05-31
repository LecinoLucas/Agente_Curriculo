import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  ClipboardList,
  ArrowLeft,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/shared/LoadingState';
import { candidateAssessmentService } from '../services/candidateAssessmentService';
import type {
  AssessmentSummary,
  AssessmentDetail,
  AssessmentQuestion,
  AnswerPayload,
} from '../services/candidateAssessmentService';
import { HttpError } from '../services/publicApiClient';
import { useSessionRestore } from '../hooks/useSessionRestore';

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | 'loading'
  | 'empty'
  | 'pending'
  | 'starting'
  | 'active'
  | 'saving'
  | 'submitting'
  | 'submitted'
  | 'expired'
  | 'error';

interface LocalAnswer {
  answerText: string | null;
  answerValue: number | null;
  selectedOptions: string[] | null;
}

// ── Option parsers ────────────────────────────────────────────────────────────

function parseScaleOptions(optionsJson: unknown): { value: number; label: string }[] {
  if (Array.isArray(optionsJson) && optionsJson.length > 0) {
    const first = optionsJson[0];
    if (typeof first === 'number') {
      return (optionsJson as number[]).map((v) => ({ value: v, label: String(v) }));
    }
    if (typeof first === 'object' && first !== null && 'value' in first) {
      return (optionsJson as { value: number; label?: string }[]).map((o) => ({
        value: Number(o.value),
        label: String(o.label ?? o.value),
      }));
    }
  }
  if (typeof optionsJson === 'object' && optionsJson !== null && !Array.isArray(optionsJson)) {
    const obj = optionsJson as Record<string, unknown>;
    const min = Number(obj.min ?? 1);
    const max = Number(obj.max ?? 5);
    const labels = (obj.labels ?? {}) as Record<string, string>;
    return Array.from({ length: max - min + 1 }, (_, i) => {
      const v = min + i;
      return { value: v, label: labels[String(v)] ?? String(v) };
    });
  }
  // Default 1-5 scale
  return [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }));
}

function parseMultipleChoiceOptions(optionsJson: unknown): { value: string; label: string }[] {
  if (!Array.isArray(optionsJson)) return [];
  return optionsJson.map((item) => {
    if (typeof item === 'string') return { value: item, label: item };
    if (typeof item === 'object' && item !== null) {
      const o = item as Record<string, unknown>;
      const val = String(o.value ?? o.label ?? o.text ?? '');
      const label = String(o.label ?? o.text ?? o.value ?? '');
      return { value: val, label };
    }
    return { value: String(item), label: String(item) };
  });
}

// ── Answer helpers ────────────────────────────────────────────────────────────

function initAnswersFromDetail(detail: AssessmentDetail): Record<string, LocalAnswer> {
  const map: Record<string, LocalAnswer> = {};
  for (const comp of detail.competencies) {
    for (const q of comp.questions) {
      const sa = q.savedAnswer;
      map[q.id] = {
        answerText: sa?.answerText ?? null,
        answerValue: sa?.answerValue ?? null,
        selectedOptions: sa?.selectedOptions ?? null,
      };
    }
  }
  return map;
}

function buildPayload(answers: Record<string, LocalAnswer>): AnswerPayload[] {
  return Object.entries(answers).map(([qId, a]) => ({
    question_id: qId,
    answer_text: a.answerText ?? null,
    answer_value: a.answerValue ?? null,
    selected_options_json: a.selectedOptions ?? null,
  }));
}

function isAnswered(q: AssessmentQuestion, answers: Record<string, LocalAnswer>): boolean {
  const a = answers[q.id];
  if (!a) return false;
  if (q.answerType === 'text') return !!(a.answerText?.trim());
  if (q.answerType === 'scale') return a.answerValue !== null;
  if (q.answerType === 'multiple_choice') return (a.selectedOptions?.length ?? 0) > 0;
  return !!(a.answerText?.trim()) || a.answerValue !== null;
}

function allRequiredAnswered(
  detail: AssessmentDetail,
  answers: Record<string, LocalAnswer>,
): boolean {
  return detail.competencies
    .flatMap((c) => c.questions)
    .filter((q) => q.isRequired)
    .every((q) => isAnswered(q, answers));
}

function countAnswered(detail: AssessmentDetail, answers: Record<string, LocalAnswer>): number {
  return detail.competencies
    .flatMap((c) => c.questions)
    .filter((q) => isAnswered(q, answers)).length;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export function CandidateAssessmentPage() {
  useSessionRestore();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [summary, setSummary] = useState<AssessmentSummary | null>(null);
  const [detail, setDetail] = useState<AssessmentDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({});
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof HttpError && err.status === 401) {
        navigate('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Erro inesperado. Tente novamente.');
      setPhase('error');
    },
    [navigate],
  );

  // Load on mount
  useEffect(() => {
    (async () => {
      try {
        const list = await candidateAssessmentService.listAssessments();

        if (list.length === 0) {
          setPhase('empty');
          return;
        }

        // Priority: in_progress → pending → submitted → expired → other
        const active =
          list.find((a) => a.status === 'in_progress') ??
          list.find((a) => a.status === 'pending') ??
          list.find((a) => a.status === 'submitted') ??
          list[0];

        setSummary(active);

        if (active.status === 'in_progress' || active.status === 'submitted') {
          const d = await candidateAssessmentService.getAssessment(active.id);
          setDetail(d);
          setAnswers(initAnswersFromDetail(d));
          setPhase(active.status === 'submitted' ? 'submitted' : 'active');
        } else if (active.status === 'expired') {
          setPhase('expired');
        } else {
          // pending
          setPhase('pending');
        }
      } catch (err) {
        handleError(err);
      }
    })();
  }, [handleError]);

  async function handleStart() {
    if (!summary) return;
    setPhase('starting');
    try {
      const d = await candidateAssessmentService.startAssessment(summary.id);
      setDetail(d);
      setSummary({ ...summary, status: 'in_progress' });
      setAnswers(initAnswersFromDetail(d));
      setPhase('active');
    } catch (err) {
      // 409 = already started; try loading the detail directly
      if (err instanceof HttpError && err.status === 409) {
        try {
          const d = await candidateAssessmentService.getAssessment(summary.id);
          setDetail(d);
          setAnswers(initAnswersFromDetail(d));
          setPhase(d.status === 'submitted' ? 'submitted' : 'active');
          return;
        } catch (inner) {
          handleError(inner);
          return;
        }
      }
      handleError(err);
    }
  }

  async function handleSaveAndContinue() {
    if (!detail) return;
    setPhase('saving');
    try {
      await candidateAssessmentService.saveAnswers(detail.id, buildPayload(answers));
      navigate('/minha-area');
    } catch (err) {
      setPhase('active');
      handleError(err);
    }
  }

  async function handleSubmit() {
    if (!detail) return;
    setPhase('submitting');
    try {
      const d = await candidateAssessmentService.submitAssessment(
        detail.id,
        buildPayload(answers),
      );
      setDetail(d);
      setSummary((prev) => (prev ? { ...prev, status: 'submitted' } : prev));
      setPhase('submitted');
    } catch (err) {
      setPhase('active');
      handleError(err);
    }
  }

  // ── Render phases ─────────────────────────────────────────────────────────

  if (phase === 'loading' || phase === 'starting') {
    return (
      <CandidatePortalLayout>
        <LoadingState variant="spinner" />
      </CandidatePortalLayout>
    );
  }

  if (phase === 'error') {
    return (
      <CandidatePortalLayout maxWidth="content">
        <div className="flex flex-col items-center py-20 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
          <p className="text-base font-semibold text-gray-700">{error ?? 'Erro ao carregar avaliação.'}</p>
          <button
            onClick={() => { setPhase('loading'); setError(null); window.location.reload(); }}
            className="mt-4 text-sm text-primary-700 underline hover:text-primary-800"
          >
            Tentar novamente
          </button>
        </div>
      </CandidatePortalLayout>
    );
  }

  if (phase === 'empty') {
    return (
      <CandidatePortalLayout maxWidth="content">
        <div className="flex flex-col items-center py-20 text-center">
          <ClipboardList className="mb-3 h-10 w-10 text-gray-300" />
          <h1 className="text-xl font-extrabold text-gray-700">Nenhuma avaliação disponível</h1>
          <p className="mt-2 text-sm text-gray-500">
            Você não possui avaliações comportamentais pendentes no momento.
          </p>
          <Link to="/minha-area" className="mt-6 text-sm text-primary-700 hover:underline">
            Voltar à minha área
          </Link>
        </div>
      </CandidatePortalLayout>
    );
  }

  if (phase === 'expired') {
    return (
      <CandidatePortalLayout maxWidth="content">
        <div className="flex flex-col items-center py-20 text-center">
          <Clock className="mb-3 h-10 w-10 text-amber-400" />
          <h1 className="text-xl font-extrabold text-gray-700">Avaliação expirada</h1>
          <p className="mt-2 text-sm text-gray-500">
            O prazo para realizar a avaliação{summary?.templateName ? ` "${summary.templateName}"` : ''} expirou
            {summary?.expiresAt ? ` em ${formatDate(summary.expiresAt)}` : ''}.
          </p>
          <p className="mt-1 text-sm text-gray-500">Entre em contato com o RH para mais informações.</p>
          <Link to="/minha-area" className="mt-6 text-sm text-primary-700 hover:underline">
            Voltar à minha área
          </Link>
        </div>
      </CandidatePortalLayout>
    );
  }

  if (phase === 'submitted') {
    return (
      <CandidatePortalLayout maxWidth="content">
        <div className="py-8">
          <Card padding="lg">
            <div className="text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-9 w-9 text-green-600" />
              </div>
              <h1 className="mt-4 text-2xl font-extrabold text-gray-900">
                Avaliação enviada!
              </h1>
              {detail?.templateName && (
                <p className="mt-1 text-base text-gray-500">{detail.templateName}</p>
              )}
              <p className="mt-3 text-sm text-gray-500">
                Obrigado por responder. Nossa equipe irá analisar suas respostas em breve.
              </p>
              {detail?.submittedAt && (
                <p className="mt-1 text-xs text-gray-400">
                  Enviada em {formatDate(detail.submittedAt)}
                </p>
              )}
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <Link to="/minha-area">
                <Button fullWidth>
                  Voltar à minha área
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </CandidatePortalLayout>
    );
  }

  if (phase === 'pending') {
    return (
      <CandidatePortalLayout maxWidth="content">
        <div className="py-8">
          <Card padding="lg">
            <div className="text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
                <ClipboardList className="h-9 w-9 text-primary-700" />
              </div>
              <h1 className="mt-4 text-2xl font-extrabold text-gray-900">
                Avaliação comportamental
              </h1>
              {summary?.templateName && (
                <p className="mt-1 text-base font-medium text-gray-600">{summary.templateName}</p>
              )}
              {summary?.jobTitle && (
                <p className="mt-0.5 text-sm text-gray-500">Para a vaga: {summary.jobTitle}</p>
              )}
              <p className="mt-4 text-sm text-gray-600 leading-relaxed">
                Esta avaliação contém{' '}
                <strong>{summary?.questionCount ?? '—'} perguntas</strong> sobre comportamentos
                e situações de trabalho. Responda com sinceridade — não há respostas certas ou erradas.
              </p>
              {summary?.expiresAt && (
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-amber-600">
                  <Clock className="h-3.5 w-3.5" />
                  Prazo: {formatDate(summary.expiresAt)}
                </p>
              )}
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <Button fullWidth size="lg" onClick={() => void handleStart()}>
                Iniciar avaliação
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Link to="/minha-area">
                <Button fullWidth variant="secondary">
                  Fazer depois
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </CandidatePortalLayout>
    );
  }

  // ── Active / saving / submitting ─────────────────────────────────────────
  // phase === 'active' | 'saving' | 'submitting'

  if (!detail) return null;

  const totalQuestions = detail.competencies.flatMap((c) => c.questions).length;
  const answeredCount = countAnswered(detail, answers);
  const progress = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const canSubmit = allRequiredAnswered(detail, answers);
  const isBusy = phase === 'saving' || phase === 'submitting';

  return (
    <CandidatePortalLayout maxWidth="page">
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Main */}
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Avaliação comportamental</h1>
            {detail.templateName && (
              <p className="mt-0.5 text-sm text-gray-500">{detail.templateName}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              Responda com sinceridade. Não há respostas certas ou erradas.
            </p>
          </div>

          {/* Error inline */}
          {phase === 'active' && error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Progress */}
          <Card padding="md">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium text-gray-700">
                {answeredCount} de {totalQuestions} respondidas
              </span>
              <span className="font-bold text-primary-700">{progress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-primary-700 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </Card>

          {/* Questions by competency */}
          {detail.competencies.map((comp) => (
            <div key={comp.id} className="space-y-4">
              <div className="border-b border-gray-200 pb-2">
                <h2 className="text-base font-bold text-gray-800">{comp.name}</h2>
                {comp.description && (
                  <p className="mt-0.5 text-sm text-gray-500">{comp.description}</p>
                )}
              </div>
              {comp.questions.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  index={
                    detail.competencies
                      .slice(0, detail.competencies.indexOf(comp))
                      .reduce((sum, c) => sum + c.questions.length, 0) + index + 1
                  }
                  total={totalQuestions}
                  answer={answers[question.id] ?? { answerText: null, answerValue: null, selectedOptions: null }}
                  disabled={isBusy}
                  onChange={(updated) =>
                    setAnswers((prev) => ({ ...prev, [question.id]: updated }))
                  }
                />
              ))}
            </div>
          ))}

          {/* Actions */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <Button
              variant="secondary"
              onClick={() => void handleSaveAndContinue()}
              disabled={isBusy}
            >
              {phase === 'saving' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowLeft className="h-4 w-4" />
              )}
              {phase === 'saving' ? 'Salvando…' : 'Salvar e continuar depois'}
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit || isBusy}
              loading={phase === 'submitting'}
            >
              Finalizar avaliação
            </Button>
          </div>

          {!canSubmit && (
            <p className="text-center text-xs text-gray-400">
              Responda todas as perguntas obrigatórias para finalizar.
            </p>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {detail.jobTitle && (
            <Card padding="md">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Vaga em avaliação
              </p>
              <p className="font-bold text-gray-900">{detail.jobTitle}</p>
            </Card>
          )}

          <Card padding="md">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Seu progresso
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-full border-4 border-primary-700 bg-white">
                <span className="text-lg font-extrabold text-primary-700 leading-none">
                  {answeredCount}
                </span>
                <span className="text-[10px] text-gray-400 leading-none">de {totalQuestions}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{progress}% concluído</p>
                <p className="text-xs text-gray-500">
                  {totalQuestions - answeredCount} restantes
                </p>
              </div>
            </div>
          </Card>

          {detail.expiresAt && (
            <Card padding="md">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Prazo
              </p>
              <p className="text-sm text-amber-600 font-medium flex items-start gap-1">
                <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                {formatDate(detail.expiresAt)}
              </p>
            </Card>
          )}
        </aside>
      </div>
    </CandidatePortalLayout>
  );
}

// ── Question card ─────────────────────────────────────────────────────────────

interface QuestionCardProps {
  question: AssessmentQuestion;
  index: number;
  total: number;
  answer: LocalAnswer;
  disabled: boolean;
  onChange: (a: LocalAnswer) => void;
}

function QuestionCard({ question, index, total, answer, disabled, onChange }: QuestionCardProps) {
  return (
    <Card padding="lg">
      <p className="text-xs font-semibold text-gray-400 mb-1.5">
        Pergunta {index} de {total}
        {question.isRequired && <span className="text-red-500 ml-1">*</span>}
      </p>
      <p className="text-base font-semibold text-gray-900 mb-4 leading-snug">
        {question.text}
      </p>

      {question.answerType === 'text' && (
        <TextInput
          value={answer.answerText ?? ''}
          disabled={disabled}
          onChange={(v) => onChange({ ...answer, answerText: v || null })}
        />
      )}

      {question.answerType === 'scale' && (
        <ScaleInput
          options={parseScaleOptions(question.optionsJson)}
          value={answer.answerValue}
          disabled={disabled}
          onChange={(v) => onChange({ ...answer, answerValue: v })}
        />
      )}

      {question.answerType === 'multiple_choice' && (
        <MultipleChoiceInput
          options={parseMultipleChoiceOptions(question.optionsJson)}
          selected={answer.selectedOptions?.[0] ?? null}
          disabled={disabled}
          onChange={(v) =>
            onChange({ ...answer, selectedOptions: v !== null ? [v] : null })
          }
        />
      )}

      {/* Fallback for unknown answer types — plain text */}
      {question.answerType !== 'text' &&
        question.answerType !== 'scale' &&
        question.answerType !== 'multiple_choice' && (
          <TextInput
            value={answer.answerText ?? ''}
            disabled={disabled}
            onChange={(v) => onChange({ ...answer, answerText: v || null })}
          />
        )}
    </Card>
  );
}

// ── Input components ──────────────────────────────────────────────────────────

function TextInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={4}
      placeholder="Escreva sua resposta…"
      className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 resize-y focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20 disabled:bg-gray-50 disabled:text-gray-500"
    />
  );
}

function ScaleInput({
  options,
  value,
  disabled,
  onChange,
}: {
  options: { value: number; label: string }[];
  value: number | null;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const hasLabels = options.some((o) => o.label !== String(o.value));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={[
              'flex h-11 min-w-[2.75rem] flex-col items-center justify-center rounded-lg border-2 px-3 text-sm font-bold transition-colors',
              value === opt.value
                ? 'border-primary-700 bg-primary-700 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-primary-700/50 disabled:cursor-not-allowed disabled:opacity-60',
            ].join(' ')}
          >
            {opt.value}
          </button>
        ))}
      </div>
      {hasLabels && (
        <div className="flex justify-between text-xs text-gray-400 px-1">
          <span>{options[0]?.label}</span>
          <span>{options[options.length - 1]?.label}</span>
        </div>
      )}
    </div>
  );
}

function MultipleChoiceInput({
  options,
  selected,
  disabled,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string | null;
  disabled: boolean;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={[
            'flex items-center gap-3 rounded-lg border cursor-pointer p-3 transition-colors',
            selected === opt.value
              ? 'border-primary-700 bg-primary-50'
              : 'border-gray-200 bg-white hover:border-primary-700/40 hover:bg-primary-50/30',
            disabled ? 'cursor-not-allowed opacity-60' : '',
          ].join(' ')}
        >
          <div
            className={[
              'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              selected === opt.value
                ? 'border-primary-700 bg-primary-700'
                : 'border-gray-300 bg-white',
            ].join(' ')}
          >
            {selected === opt.value && <div className="h-2 w-2 rounded-full bg-white" />}
          </div>
          <span className="text-sm text-gray-700">{opt.label}</span>
          <input
            type="radio"
            name={`mcq-${opt.value}`}
            value={opt.value}
            checked={selected === opt.value}
            disabled={disabled}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
        </label>
      ))}
    </div>
  );
}
