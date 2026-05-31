import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/shared/LoadingState';
import { getAssessmentQuestions, submitMockAssessment } from '../services/mockCandidatePortalService';
import { MOCK_CANDIDATE } from '../data/mockCandidatePortal';
import type { AssessmentQuestion, AssessmentAnswers } from '../types/candidatePortal';

export function CandidateAssessmentPage() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [answers, setAnswers] = useState<AssessmentAnswers>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getAssessmentQuestions().then((data) => {
      setQuestions(data);
      setLoading(false);
    });
  }, []);

  const answered = Object.keys(answers).length;
  const total = questions.length;
  const progress = total > 0 ? Math.round((answered / total) * 100) : 0;

  async function handleSubmit() {
    if (answered < total) return;
    setSubmitting(true);
    await submitMockAssessment(answers);
    setSubmitting(false);
    navigate('/minha-area');
  }

  if (loading) {
    return (
      <CandidatePortalLayout>
        <LoadingState variant="spinner" />
      </CandidatePortalLayout>
    );
  }

  const activeApp = MOCK_CANDIDATE.applications[0];

  return (
    <CandidatePortalLayout maxWidth="page">
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Main */}
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Avaliação comportamental</h1>
            <p className="mt-1 text-sm text-gray-500">
              Responda com sinceridade. Não há respostas certas ou erradas.
            </p>
          </div>

          {/* Progress */}
          <Card padding="md">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium text-gray-700">
                {answered} de {total} respondidas
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

          {/* Questions */}
          <div className="space-y-4">
            {questions.map((question, index) => (
              <Card key={question.id} padding="lg">
                <p className="text-sm font-semibold text-gray-500 mb-1.5">
                  Pergunta {index + 1} de {total}
                </p>
                <p className="text-base font-semibold text-gray-900 mb-4 leading-snug">
                  {question.text}
                </p>
                <div className="space-y-2">
                  {question.options.map((option) => (
                    <label
                      key={option.value}
                      className={[
                        'flex items-center gap-3 rounded-lg border cursor-pointer p-3 transition-colors',
                        answers[question.id] === option.value
                          ? 'border-primary-700 bg-primary-50'
                          : 'border-gray-200 bg-white hover:border-primary-700/40 hover:bg-primary-50/30',
                      ].join(' ')}
                    >
                      <div
                        className={[
                          'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          answers[question.id] === option.value
                            ? 'border-primary-700 bg-primary-700'
                            : 'border-gray-300 bg-white',
                        ].join(' ')}
                      >
                        {answers[question.id] === option.value && (
                          <div className="h-2 w-2 rounded-full bg-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <span className="text-sm text-gray-700">{option.label}</span>
                      </div>
                      <span className="text-xs text-gray-400 font-medium">{option.value}</span>
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        value={option.value}
                        checked={answers[question.id] === option.value}
                        onChange={() =>
                          setAnswers((prev) => ({ ...prev, [question.id]: option.value }))
                        }
                        className="sr-only"
                      />
                    </label>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between">
            <Button variant="secondary" onClick={() => navigate('/minha-area')}>
              Salvar e continuar depois
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={answered < total}
              loading={submitting}
            >
              Finalizar avaliação
            </Button>
          </div>

          {answered < total && (
            <p className="text-center text-xs text-gray-400">
              Responda todas as perguntas para finalizar.
            </p>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card padding="md">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Vaga em avaliação
            </p>
            <p className="font-bold text-gray-900">{activeApp.job_title}</p>
            <p className="text-sm text-gray-500">{activeApp.company}</p>
          </Card>

          <Card padding="md">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Seu progresso
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-full border-4 border-primary-700 bg-white">
                <span className="text-lg font-extrabold text-primary-700">{answered}</span>
                <span className="text-[10px] text-gray-400">de {total}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{progress}% concluído</p>
                <p className="text-xs text-gray-500">
                  {total - answered} perguntas restantes
                </p>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </CandidatePortalLayout>
  );
}
