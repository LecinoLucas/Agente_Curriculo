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
  Brain,
  CheckCircle2,
  Loader2,
  LogIn,
} from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/shared/LoadingState';
import {
  candidatePortalService,
  shouldPollAnalysis,
  getAnalysisStatusInfo,
} from '../services/candidatePortalService';
import type { CandidateOverview, TimelineStep } from '../services/candidatePortalService';
import { HttpError } from '../services/publicApiClient';
import { useCandidateSession } from '../App';

export function CandidateHomePage() {
  const navigate = useNavigate();
  const { setCandidateName } = useCandidateSession();
  const [overview, setOverview] = useState<CandidateOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    candidatePortalService
      .getOverview()
      .then((data) => {
        setOverview(data);
        setCandidateName(data.candidateName);
      })
      .catch((err) => {
        if (err instanceof HttpError && err.status === 401) {
          navigate('/login');
        } else if (err instanceof HttpError && err.status === 403) {
          setError('Seu perfil está incompleto. Entre em contato com o RH para mais informações.');
        } else {
          setError('Não foi possível carregar seus dados. Tente novamente em instantes.');
        }
      })
      .finally(() => setLoading(false));
  }, [navigate, setCandidateName]);

  // Analysis polling — runs only while status is in-progress; stops automatically when terminal.
  const analysisStatus = overview?.activeApplication?.analysisStatus;
  useEffect(() => {
    if (!shouldPollAnalysis(analysisStatus)) return;

    const id = setInterval(() => {
      candidatePortalService
        .getOverview()
        .then(setOverview)
        .catch((err: unknown) => {
          if (err instanceof HttpError && err.status === 401) {
            navigate('/login');
          }
          // All other errors: keep last known state, next tick will retry.
        });
    }, 10_000);

    return () => clearInterval(id);
  }, [analysisStatus, navigate]);

  if (loading) {
    return (
      <CandidatePortalLayout>
        <LoadingState variant="spinner" />
      </CandidatePortalLayout>
    );
  }

  if (error || !overview) {
    return (
      <CandidatePortalLayout maxWidth="content">
        <div className="py-16 flex flex-col items-center text-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <AlertCircle className="h-7 w-7 text-red-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">
              {error ?? 'Não foi possível carregar seus dados.'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Tente fazer login novamente.
            </p>
          </div>
          <Button onClick={() => navigate('/login')} variant="secondary" size="sm">
            <LogIn className="h-4 w-4" />
            Ir para o login
          </Button>
        </div>
      </CandidatePortalLayout>
    );
  }

  const firstName = overview.candidateName.split(' ')[0];
  const analysisInfo = getAnalysisStatusInfo(overview.activeApplication?.analysisStatus);

  return (
    <CandidatePortalLayout maxWidth="page">

      {/* Welcome line */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900">
          Olá, {firstName}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Aqui você acompanha suas candidaturas na Rede Marajó.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">

        {/* ── Main column ───────────────────────────────────────────────── */}
        <div className="space-y-5 min-w-0">

          {/* Active application ----------------------------------------- */}
          {overview.activeApplication ? (
            <Card padding="lg">
              {/* Eyebrow */}
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {overview.activeApplication.isTalentPool
                  ? 'Banco de talentos'
                  : 'Candidatura em andamento'}
              </p>

              {/* Title + status badge */}
              <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                <h2 className="text-lg font-bold text-gray-900 leading-snug">
                  {overview.activeApplication.jobTitle}
                </h2>
                <span className="inline-flex flex-shrink-0 items-center rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
                  {overview.activeApplication.statusPublic}
                </span>
              </div>

              {/* Timeline */}
              {overview.timelineSteps.length > 0 && (
                <ProcessTimeline steps={overview.timelineSteps} />
              )}

              {/* Status description */}
              {overview.statusLabel && (
                <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-3.5 py-2.5">
                  <p className="text-sm text-gray-700">{overview.statusLabel}</p>
                </div>
              )}

              {/* Analysis status */}
              {analysisInfo && <AnalysisStatusBadge info={analysisInfo} />}

              {/* Behavioral assessment nudge — highest-priority CTA */}
              {overview.requiresBehavioralAssessment && (
                <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <ClipboardList className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-0.5">
                        Ação necessária
                      </p>
                      <p className="text-sm font-medium text-gray-900">
                        Avaliação comportamental pendente
                      </p>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => navigate('/avaliacao')} className="flex-shrink-0">
                    Fazer agora
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {/* Secondary CTA — browse more jobs */}
              <div className="mt-5 pt-4 border-t border-gray-100">
                <Link
                  to="/"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-primary-700 transition-colors"
                >
                  Ver outras vagas abertas
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Card>

          ) : overview.talentPool ? (
            /* Talent pool ------------------------------------------------ */
            <Card padding="lg">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50">
                  <Briefcase className="h-5 w-5 text-primary-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-gray-900">Banco de talentos</h2>
                  <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">
                    Seu currículo está cadastrado na Rede Marajó. Entraremos em contato quando surgir uma vaga compatível.
                  </p>
                  <Link
                    to="/"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline"
                  >
                    Ver vagas abertas
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </Card>

          ) : (
            /* No active application -------------------------------------- */
            <Card padding="lg">
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                  <Briefcase className="h-7 w-7 text-gray-400" />
                </div>
                <h2 className="text-base font-bold text-gray-900">Nenhuma candidatura ativa</h2>
                <p className="mt-2 mx-auto max-w-sm text-sm text-gray-500 leading-relaxed">
                  Quando você se candidatar a uma vaga, o acompanhamento do processo aparecerá aqui.
                </p>
                <div className="mt-5">
                  <Link to="/">
                    <Button>
                      Ver vagas disponíveis
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          )}

          {/* Scheduled interview ----------------------------------------- */}
          {overview.publicInterview?.scheduledAt && (
            <Card padding="lg">
              <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-gray-900">
                {overview.publicInterview.isOnline
                  ? <Video className="h-4 w-4 text-primary-700" />
                  : <MapPin className="h-4 w-4 text-primary-700" />}
                Entrevista agendada
              </h2>
              <div className="space-y-1.5 text-sm text-gray-700">
                <p>
                  <span className="font-medium">Data: </span>
                  {new Date(overview.publicInterview.scheduledAt).toLocaleString('pt-BR', {
                    day: '2-digit', month: 'long', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
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

          {/* Process closed notice --------------------------------------- */}
          {overview.isProcessClosed && (
            <Card padding="md">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400" />
                <div>
                  <p className="text-sm font-semibold text-gray-700">Processo encerrado</p>
                  {overview.closedReasonLabel && (
                    <p className="mt-1 text-sm text-gray-500">{overview.closedReasonLabel}</p>
                  )}
                  <Link
                    to="/"
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline"
                  >
                    Ver novas vagas
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* Profile card */}
          <Card padding="md">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-100">
                <User className="h-5 w-5 text-primary-700" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 text-sm truncate">{overview.candidateName}</p>
                {overview.candidateEmail && (
                  <p className="text-xs text-gray-500 truncate">{overview.candidateEmail}</p>
                )}
                {overview.candidatePhone && (
                  <p className="text-xs text-gray-400 mt-0.5">{overview.candidatePhone}</p>
                )}
              </div>
            </div>
            {overview.applicationHistoryCount > 0 && (
              <p className="mt-3 text-xs text-gray-400 pt-3 border-t border-gray-100">
                {overview.applicationHistoryCount}{' '}
                {overview.applicationHistoryCount === 1 ? 'candidatura' : 'candidaturas'} no histórico
              </p>
            )}
          </Card>

          {/* Quick links */}
          <Card padding="md">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Acesso rápido
            </p>
            <div className="space-y-2">
              <Link
                to="/"
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Ver vagas abertas
                <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
              </Link>
              <Link
                to="/duvidas-frequentes"
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Dúvidas frequentes
                <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </CandidatePortalLayout>
  );
}

// ── Analysis status badge ─────────────────────────────────────────────────────

import type { AnalysisStatusInfo } from '../services/candidatePortalService';

function AnalysisStatusBadge({ info }: { info: AnalysisStatusInfo }) {
  const { label, description, variant } = info;

  if (variant === 'done') {
    return (
      <div className="mt-4 flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
        <div>
          <span className="text-sm font-medium text-green-700">{label}</span>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'progress') {
    return (
      <div className="mt-4 space-y-1.5">
        <div className="flex items-center gap-2 rounded-lg border border-primary-100 bg-primary-50 px-3 py-2">
          <Brain className="h-4 w-4 flex-shrink-0 text-primary-700" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-primary-800">{label}</span>
            {description && (
              <p className="text-xs text-primary-600 mt-0.5">{description}</p>
            )}
          </div>
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-primary-400" />
        </div>
        <p className="text-xs text-gray-400 pl-1">
          Atualizando automaticamente. Você pode sair e voltar depois.
        </p>
      </div>
    );
  }

  // muted
  return (
    <div className="mt-4 flex items-start gap-2 text-gray-500">
      <Brain className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div>
        <span className="text-sm">{label}</span>
        {description && (
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}

// ── Process timeline ──────────────────────────────────────────────────────────

function ProcessTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="w-full overflow-x-auto pb-1">
      <div className="flex items-start min-w-max sm:min-w-0">
        {steps.map((step, index) => {
          const isCompleted = step.status === 'completed';
          const isCurrent = step.status === 'current';
          return (
            <div key={step.key} className="flex items-center flex-1 min-w-[64px]">
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
                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm transition-colors',
                      isCompleted
                        ? 'bg-primary-700 text-white'
                        : isCurrent
                          ? 'border-2 border-primary-700 bg-white text-primary-700 font-bold'
                          : 'border-2 border-gray-200 bg-white text-gray-400',
                    ].join(' ')}
                  >
                    {isCompleted
                      ? <Check className="h-3.5 w-3.5" />
                      : isCurrent
                        ? <Clock className="h-3.5 w-3.5" />
                        : <span className="text-xs font-medium">{index + 1}</span>}
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
                    'text-[11px] text-center leading-tight px-0.5 max-w-[72px] break-words',
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
