import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Check,
  Clock,
  LogIn,
  MapPin,
  User,
} from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/shared/LoadingState';
import {
  candidatePortalService,
  getAnalysisStatusInfo,
  shouldPollAnalysis,
} from '../services/candidatePortalService';
import type {
  CandidateApplication,
  CandidateProfile,
  TimelineStep,
} from '../services/candidatePortalService';
import { HttpError } from '../services/publicApiClient';
import { useCandidateSession } from '../App';

interface CandidateHomeData {
  profile: CandidateProfile;
  applications: CandidateApplication[];
}

export function CandidateHomePage() {
  const navigate = useNavigate();
  const { setCandidateName } = useCandidateSession();
  const [data, setData] = useState<CandidateHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [profile, applications] = await Promise.all([
          candidatePortalService.getMe(),
          candidatePortalService.getApplications(),
        ]);
        if (cancelled) return;
        setData({ profile, applications });
        setCandidateName(profile.fullName);
      } catch (err) {
        if (cancelled) return;
        if (isSessionExpiredError(err)) {
          setCandidateName(null);
          navigate('/login');
          return;
        }
        setError('Não foi possível carregar suas candidaturas reais agora.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [navigate, setCandidateName]);

  const shouldRefreshApplications = useMemo(
    () => data?.applications.some((item) => shouldPollAnalysis(item.analysisStatus)) ?? false,
    [data?.applications],
  );

  useEffect(() => {
    if (!shouldRefreshApplications) return undefined;
    const interval = window.setInterval(() => {
      candidatePortalService
        .getApplications()
        .then((applications) => {
          setData((current) => (current ? { ...current, applications } : current));
        })
        .catch((err: unknown) => {
          if (isSessionExpiredError(err)) {
            setCandidateName(null);
            navigate('/login');
          }
        });
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [navigate, setCandidateName, shouldRefreshApplications]);

  if (loading) {
    return (
      <CandidatePortalLayout>
        <CandidateHomeLoading />
      </CandidatePortalLayout>
    );
  }

  if (error || !data) {
    return (
      <CandidatePortalLayout maxWidth="content">
        <CandidateHomeError message={error ?? 'Não foi possível carregar sua área.'} />
      </CandidatePortalLayout>
    );
  }

  return (
    <CandidatePortalLayout maxWidth="page">
      <CandidateHomeContent profile={data.profile} applications={data.applications} />
    </CandidatePortalLayout>
  );
}

export function CandidateHomeLoading() {
  return <LoadingState variant="spinner" />;
}

export function CandidateHomeError({ message }: { message: string }) {
  return (
    <div className="py-16 flex flex-col items-center text-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
        <AlertCircle className="h-7 w-7 text-red-500" />
      </div>
      <div>
        <p className="text-base font-semibold text-gray-900">{message}</p>
        <p className="mt-1 text-sm text-gray-500">Tente fazer login novamente.</p>
      </div>
      <Link to="/login">
        <Button variant="secondary" size="sm">
          <LogIn className="h-4 w-4" />
          Ir para o login
        </Button>
      </Link>
    </div>
  );
}

export function CandidateHomeContent({
  profile,
  applications,
}: CandidateHomeData) {
  const firstName = profile.fullName.split(' ')[0] || profile.fullName;
  const activeCount = applications.filter((item) => !isClosedApplication(item)).length;
  const latestUpdate = applications[0]?.updatedAt ?? null;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white px-5 py-5 shadow-card sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
              Área do candidato
            </p>
            <h1 className="mt-2 text-2xl font-extrabold text-gray-950 sm:text-3xl">
              Olá, {firstName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Seus dados e candidaturas abaixo vêm diretamente do sistema de RH.
            </p>
          </div>
          <ProfileSummary profile={profile} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Candidaturas reais" value={String(applications.length)} />
        <MetricCard label="Em andamento" value={String(activeCount)} />
        <MetricCard
          label="Última atualização"
          value={latestUpdate ? formatDate(latestUpdate) : 'Sem registro'}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-950">Minhas candidaturas</h2>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline"
            >
              Ver vagas abertas
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {applications.length === 0 ? (
            <EmptyApplicationsState />
          ) : (
            <div className="space-y-3">
              {applications.map((application) => (
                <ApplicationListCard
                  key={application.applicationId}
                  application={application}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card padding="md">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Perfil
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <ProfileLine icon={<User className="h-4 w-4" />} label={profile.fullName} />
              {profile.email && <ProfileLine label={profile.email} />}
              {profile.phone && <ProfileLine label={profile.phone} />}
              {(profile.city || profile.state) && (
                <ProfileLine
                  icon={<MapPin className="h-4 w-4" />}
                  label={[profile.city, profile.state].filter(Boolean).join(', ')}
                />
              )}
            </div>
          </Card>

          <Card padding="md">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Próximas ações
            </p>
            <div className="mt-3 space-y-2">
              {applications.filter((item) => item.nextAction).length === 0 ? (
                <p className="text-sm text-gray-500">
                  Nenhuma ação pendente foi retornada pela API.
                </p>
              ) : (
                applications
                  .filter((item) => item.nextAction)
                  .map((item) => (
                    <Link
                      key={item.applicationId}
                      to={`/minha-area/candidaturas/${item.applicationId}`}
                      className="block rounded-lg border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <span className="font-semibold text-gray-900">{item.nextAction}</span>
                      <span className="mt-0.5 block text-xs text-gray-500">{item.jobTitle}</span>
                    </Link>
                  ))
              )}
            </div>
          </Card>
        </aside>
      </section>
    </div>
  );
}

export function isSessionExpiredError(err: unknown) {
  return err instanceof HttpError && err.status === 401;
}

function ProfileSummary({ profile }: { profile: CandidateProfile }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-100">
        <User className="h-5 w-5 text-primary-700" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-gray-950">{profile.fullName}</p>
        {profile.email && <p className="truncate text-xs text-gray-500">{profile.email}</p>}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="md">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-xl font-extrabold text-gray-950">{value}</p>
    </Card>
  );
}

function EmptyApplicationsState() {
  return (
    <Card padding="lg">
      <div className="py-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <Briefcase className="h-7 w-7 text-gray-400" />
        </div>
        <h3 className="text-base font-bold text-gray-950">Nenhuma candidatura ativa</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
          Quando houver uma candidatura real vinculada ao seu cadastro, ela aparecerá aqui.
        </p>
        <Link to="/" className="mt-5 inline-flex">
          <Button>
            Ver vagas disponíveis
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function ApplicationListCard({ application }: { application: CandidateApplication }) {
  const analysisInfo = getAnalysisStatusInfo(application.analysisStatus);
  return (
    <Card padding="lg" hover>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {formatDate(application.submittedAt)}
          </p>
          <h3 className="mt-1 text-lg font-bold text-gray-950">{application.jobTitle}</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
            {application.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {application.location}
              </span>
            )}
            {analysisInfo && (
              <AnalysisStatusBadge
                label={analysisInfo.label}
                progress={analysisInfo.variant === 'progress'}
              />
            )}
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <StatusBadge label={application.statusLabel} closed={isClosedApplication(application)} />
          <Link to={`/minha-area/candidaturas/${application.applicationId}`}>
            <Button variant="secondary" size="sm">
              Ver detalhes
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
      {application.nextAction && (
        <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {application.nextAction}
        </div>
      )}
    </Card>
  );
}

function AnalysisStatusBadge({ label, progress }: { label: string; progress: boolean }) {
  return (
    <span>
      {label}
      {progress ? ' · Atualizando automaticamente' : ''}
    </span>
  );
}

export function ProcessTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="w-full overflow-x-auto pb-1">
      <div className="flex min-w-max items-start sm:min-w-0">
        {steps.map((step, index) => {
          const isCompleted = step.status === 'completed';
          const isCurrent = step.status === 'current';
          const isClosed = step.status === 'closed';
          return (
            <div key={step.key} className="flex min-w-[72px] flex-1 items-center">
              <div className="flex w-full flex-col items-center gap-1.5">
                <div className="flex w-full items-center">
                  {index > 0 && (
                    <div
                      className={[
                        'h-0.5 flex-1',
                        isCompleted || isCurrent || isClosed ? 'bg-primary-700' : 'bg-gray-200',
                      ].join(' ')}
                    />
                  )}
                  <div
                    className={[
                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm',
                      isCompleted
                        ? 'bg-primary-700 text-white'
                        : isCurrent
                          ? 'border-2 border-primary-700 bg-white font-bold text-primary-700'
                          : isClosed
                            ? 'bg-gray-800 text-white'
                            : 'border-2 border-gray-200 bg-white text-gray-400',
                    ].join(' ')}
                  >
                    {isCompleted ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : isCurrent ? (
                      <Clock className="h-3.5 w-3.5" />
                    ) : (
                      <span className="text-xs font-medium">{index + 1}</span>
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div className={['h-0.5 flex-1', isCompleted ? 'bg-primary-700' : 'bg-gray-200'].join(' ')} />
                  )}
                </div>
                <span className="max-w-[80px] break-words px-0.5 text-center text-[11px] font-medium leading-tight text-gray-600">
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

function StatusBadge({ label, closed }: { label: string; closed: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
        closed
          ? 'border-gray-200 bg-gray-50 text-gray-600'
          : 'border-primary-100 bg-primary-50 text-primary-700',
      ].join(' ')}
    >
      {label}
    </span>
  );
}

function ProfileLine({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <p className="flex items-center gap-2 text-gray-700">
      {icon ?? <span className="h-4 w-4" />}
      <span className="min-w-0 break-words">{label}</span>
    </p>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function isClosedApplication(application: CandidateApplication) {
  return ['finished', 'admitted', 'hired', 'dismissed'].includes(application.status);
}
