import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  User,
  Briefcase,
  Check,
  Clock,
  AlertCircle,
  Video,
  MapPin,
  ClipboardList,
} from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/shared/LoadingState';
import { candidatePortalService } from '../services/candidatePortalService';
import type { CandidateOverview, TimelineStep } from '../services/candidatePortalService';
import { HttpError } from '../services/publicApiClient';
import { useCandidateSession } from '../App';

export function CandidateHomePage() {
  const navigate = useNavigate();
  const { setCandidateName } = useCandidateSession();
  const [overview, setOverview] = useState<CandidateOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    candidatePortalService
      .getOverview()
      .then((data) => {
        setOverview(data);
        // Populate header with the candidate's name
        setCandidateName(data.candidateName);
      })
      .catch((err) => {
        if (err instanceof HttpError && err.status === 401) {
          // Session expired or not logged in — redirect to login
          navigate('/login');
        } else if (err instanceof HttpError && err.status === 403) {
          setError(
            'Seu perfil está incompleto. Entre em contato com o RH para mais informações.',
          );
        } else {
          setError('Não foi possível carregar seus dados. Tente novamente em instantes.');
        }
      })
      .finally(() => setLoading(false));
  }, [navigate, setCandidateName]);

  if (loading) {
    return (
      <CandidatePortalLayout>
        <LoadingState variant="spinner" />
      </CandidatePortalLayout>
    );
  }

  if (error || !overview) {
    return (
      <CandidatePortalLayout>
        <div className="flex flex-col items-center py-20 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
          <p className="text-base font-semibold text-gray-700">
            {error ?? 'Não foi possível carregar seus dados.'}
          </p>
          <button
            onClick={() => navigate('/login')}
            className="mt-4 text-sm text-primary-700 underline hover:text-primary-800"
          >
            Voltar ao login
          </button>
        </div>
      </CandidatePortalLayout>
    );
  }

  const firstName = overview.candidateName.split(' ')[0];

  return (
    <CandidatePortalLayout maxWidth="page">
      {/* Welcome */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900">
          Bem-vindo à sua área, {firstName}!
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Acompanhe o status das suas candidaturas na Rede Marajó.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {/* Active application */}
          {overview.activeApplication ? (
            <Card padding="lg">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                    {overview.activeApplication.isTalentPool
                      ? 'Banco de talentos'
                      : 'Candidatura em andamento'}
                  </p>
                  <h2 className="text-lg font-bold text-gray-900">
                    {overview.activeApplication.jobTitle}
                  </h2>
                </div>
                <span className="flex-shrink-0 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
                  {overview.activeApplication.statusPublic}
                </span>
              </div>

              {/* Process timeline */}
              {overview.timelineSteps.length > 0 && (
                <ProcessTimeline steps={overview.timelineSteps} />
              )}

              {/* Current status label */}
              {overview.statusLabel && (
                <p className="mt-4 text-sm text-gray-600">
                  <span className="font-medium text-gray-900">Status: </span>
                  {overview.statusLabel}
                </p>
              )}

              {/* Behavioral assessment nudge */}
              {overview.requiresBehavioralAssessment && (
                <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                  <div className="flex items-start gap-2">
                    <ClipboardList className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <div>
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">
                        Ação necessária
                      </p>
                      <p className="text-sm font-medium text-gray-900">
                        Avaliação comportamental pendente
                      </p>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => navigate('/avaliacao')}>
                    Fazer agora
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </Card>
          ) : overview.talentPool ? (
            <Card padding="lg">
              <div className="flex items-start gap-3">
                <Briefcase className="mt-1 h-5 w-5 flex-shrink-0 text-primary-700" />
                <div>
                  <h2 className="text-base font-bold text-gray-900">Banco de talentos</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Seu currículo está no nosso banco de talentos. Entraremos em contato quando surgir uma oportunidade compatível.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card padding="lg">
              <div className="py-6 text-center">
                <Briefcase className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                <p className="text-base font-semibold text-gray-500">
                  Nenhuma candidatura ativa no momento.
                </p>
                <Link to="/" className="mt-3 inline-block text-sm text-primary-700 hover:underline">
                  Ver vagas disponíveis
                </Link>
              </div>
            </Card>
          )}

          {/* Scheduled interview */}
          {overview.publicInterview?.scheduledAt && (
            <Card padding="lg">
              <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-gray-900">
                {overview.publicInterview.isOnline ? (
                  <Video className="h-4 w-4 text-primary-700" />
                ) : (
                  <MapPin className="h-4 w-4 text-primary-700" />
                )}
                Entrevista agendada
              </h2>
              <div className="space-y-1.5 text-sm text-gray-700">
                <p>
                  <span className="font-medium">Data: </span>
                  {new Date(overview.publicInterview.scheduledAt).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                {overview.publicInterview.typeLabel && (
                  <p>
                    <span className="font-medium">Tipo: </span>
                    {overview.publicInterview.typeLabel}
                    {overview.publicInterview.formatLabel
                      ? ` — ${overview.publicInterview.formatLabel}`
                      : ''}
                  </p>
                )}
                {overview.publicInterview.location && (
                  <p>
                    <span className="font-medium">Local: </span>
                    {overview.publicInterview.location}
                  </p>
                )}
                {overview.publicInterview.meetingUrl && (
                  <p>
                    <a
                      href={overview.publicInterview.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-700 hover:underline"
                    >
                      Acessar link da reunião
                    </a>
                  </p>
                )}
                {overview.publicInterview.notes && (
                  <p className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3 text-gray-600">
                    {overview.publicInterview.notes}
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Process closed notice */}
          {overview.isProcessClosed && (
            <Card padding="lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400" />
                <div>
                  <p className="text-sm font-semibold text-gray-700">Processo encerrado</p>
                  {overview.closedReasonLabel && (
                    <p className="mt-1 text-sm text-gray-500">{overview.closedReasonLabel}</p>
                  )}
                  {overview.activeApplication?.isTalentPool === false && (
                    <Link
                      to="/"
                      className="mt-2 inline-block text-sm text-primary-700 hover:underline"
                    >
                      Ver novas vagas
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* Profile */}
          <Card padding="md">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 flex-shrink-0">
                <User className="h-6 w-6 text-primary-700" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-gray-900 text-sm truncate">
                  {overview.candidateName}
                </p>
                {overview.candidateEmail && (
                  <p className="text-xs text-gray-500 truncate">{overview.candidateEmail}</p>
                )}
              </div>
            </div>
            {overview.candidatePhone && (
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">Telefone: </span>
                {overview.candidatePhone}
              </p>
            )}
          </Card>

          {/* Applications count */}
          {overview.applicationHistoryCount > 0 && (
            <Card padding="md">
              <div className="flex items-center gap-3">
                <Briefcase className="h-5 w-5 text-gray-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {overview.applicationHistoryCount}{' '}
                    {overview.applicationHistoryCount === 1 ? 'candidatura' : 'candidaturas'}
                  </p>
                  <p className="text-xs text-gray-500">no histórico</p>
                </div>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </CandidatePortalLayout>
  );
}

// ── Inline timeline renderer ──────────────────────────────────────────────────
// Renders the public_timeline steps from the API without coupling to the
// fixed ProcessStep labels used by the public vacancy pages.

function ProcessTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-start">
        {steps.map((step, index) => {
          const isCompleted = step.status === 'completed';
          const isCurrent = step.status === 'current';

          return (
            <div key={step.key} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1.5 w-full">
                <div className="flex items-center w-full">
                  {index > 0 && (
                    <div
                      className={[
                        'flex-1 h-0.5',
                        isCompleted || isCurrent ? 'bg-primary-700' : 'bg-gray-200',
                      ].join(' ')}
                    />
                  )}
                  <div
                    className={[
                      'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm transition-colors',
                      isCompleted
                        ? 'bg-primary-700 text-white'
                        : isCurrent
                          ? 'border-2 border-primary-700 bg-white text-primary-700 font-bold'
                          : 'border-2 border-gray-200 bg-white text-gray-400',
                    ].join(' ')}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : isCurrent ? (
                      <Clock className="h-4 w-4" />
                    ) : (
                      <span className="font-medium text-xs">{index + 1}</span>
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={[
                        'flex-1 h-0.5',
                        isCompleted ? 'bg-primary-700' : 'bg-gray-200',
                      ].join(' ')}
                    />
                  )}
                </div>
                <span
                  className={[
                    'text-xs text-center leading-tight px-0.5',
                    isCurrent
                      ? 'font-semibold text-primary-700'
                      : isCompleted
                        ? 'text-gray-600 font-medium'
                        : 'text-gray-400',
                  ].join(' ')}
                >
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
