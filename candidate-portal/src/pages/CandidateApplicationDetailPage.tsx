import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  FileText,
  Mail,
  MapPin,
  Video,
} from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { LoadingState } from '../components/shared/LoadingState';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { candidatePortalService } from '../services/candidatePortalService';
import type { CandidateApplicationDetail } from '../services/candidatePortalService';
import { HttpError } from '../services/publicApiClient';
import { isSessionExpiredError, ProcessTimeline } from './CandidateHomePage';

export function CandidateApplicationDetailPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<CandidateApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!applicationId) {
      setError('Candidatura não informada.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    candidatePortalService
      .getApplicationDetail(applicationId)
      .then((payload) => {
        if (!cancelled) setDetail(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isSessionExpiredError(err)) {
          navigate('/login');
          return;
        }
        if (err instanceof HttpError && err.status === 404) {
          setError('Candidatura não encontrada.');
          return;
        }
        setError('Não foi possível carregar esta candidatura.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [applicationId, navigate]);

  if (loading) {
    return (
      <CandidatePortalLayout>
        <LoadingState variant="spinner" />
      </CandidatePortalLayout>
    );
  }

  if (error || !detail) {
    return (
      <CandidatePortalLayout maxWidth="content">
        <div className="py-16 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
          <p className="mt-4 font-semibold text-gray-950">{error}</p>
          <Link to="/minha-area" className="mt-5 inline-flex">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
        </div>
      </CandidatePortalLayout>
    );
  }

  return (
    <CandidatePortalLayout maxWidth="page">
      <CandidateApplicationDetailContent detail={detail} />
    </CandidatePortalLayout>
  );
}

export function CandidateApplicationDetailContent({
  detail,
}: {
  detail: CandidateApplicationDetail;
}) {
  const { application, job } = detail;

  return (
    <div className="space-y-6">
      <Link
        to="/minha-area"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-primary-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para minha área
      </Link>

      <section className="rounded-xl border border-gray-200 bg-white px-5 py-5 shadow-card sm:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
              Candidatura real
            </p>
            <h1 className="mt-2 text-2xl font-extrabold text-gray-950">{job.title}</h1>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-500">
              {job.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {job.location}
                </span>
              )}
              <span>{formatDate(application.submittedAt)}</span>
            </div>
          </div>
          <span className="inline-flex rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
            {application.statusLabel}
          </span>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <main className="space-y-5">
          {detail.timelineSteps.length > 0 && (
            <Card padding="lg">
              <h2 className="mb-5 text-lg font-bold text-gray-950">Andamento</h2>
              <ProcessTimeline steps={detail.timelineSteps} />
            </Card>
          )}

          <Card padding="lg">
            <h2 className="text-lg font-bold text-gray-950">Dados da vaga</h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-gray-700">
              {job.description && <p>{job.description}</p>}
              {job.responsibilities && <TextBlock title="Responsabilidades" value={job.responsibilities} />}
              {job.requirements && <TextBlock title="Requisitos" value={job.requirements} />}
              {job.workingHours && <TextBlock title="Horário" value={job.workingHours} />}
              {job.benefits.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-950">Benefícios</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {job.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          {detail.timelineEvents.length > 0 && (
            <Card padding="lg">
              <h2 className="text-lg font-bold text-gray-950">Histórico registrado</h2>
              <div className="mt-4 space-y-3">
                {detail.timelineEvents.map((event) => (
                  <div key={event.id} className="rounded-lg border border-gray-100 px-3 py-2">
                    <p className="text-sm font-semibold text-gray-900">{event.eventType}</p>
                    <p className="text-xs text-gray-500">{formatDate(event.createdAt)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {detail.messages.length > 0 && (
            <Card padding="lg">
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-950">
                <Mail className="h-5 w-5 text-primary-700" />
                Mensagens
              </h2>
              <div className="mt-4 space-y-3">
                {detail.messages.map((message) => (
                  <article key={message.id} className="rounded-lg border border-gray-100 px-3 py-3">
                    {message.subject && (
                      <h3 className="text-sm font-bold text-gray-950">{message.subject}</h3>
                    )}
                    <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{message.body}</p>
                  </article>
                ))}
              </div>
            </Card>
          )}
        </main>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card padding="md">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Resumo
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <SummaryLine label="Etapa" value={application.currentStageLabel} />
              {application.analysisStatus && (
                <SummaryLine label="IA" value={application.analysisStatus} />
              )}
              {application.nextAction && (
                <SummaryLine label="Próxima ação" value={application.nextAction} />
              )}
            </dl>
          </Card>

          {detail.interview?.scheduledAt && (
            <Card padding="md">
              <h2 className="flex items-center gap-2 text-base font-bold text-gray-950">
                {detail.interview.isOnline ? (
                  <Video className="h-4 w-4 text-primary-700" />
                ) : (
                  <CalendarClock className="h-4 w-4 text-primary-700" />
                )}
                Entrevista
              </h2>
              <div className="mt-3 space-y-2 text-sm text-gray-700">
                <p>{formatDateTime(detail.interview.scheduledAt)}</p>
                {detail.interview.typeLabel && <p>{detail.interview.typeLabel}</p>}
                {detail.interview.location && <p>{detail.interview.location}</p>}
                {detail.interview.meetingUrl && (
                  <a
                    href={detail.interview.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary-700 hover:underline"
                  >
                    Acessar reunião
                  </a>
                )}
                {detail.interview.notes && (
                  <p className="rounded-lg bg-gray-50 p-3 text-gray-600">{detail.interview.notes}</p>
                )}
              </div>
            </Card>
          )}

          {detail.documents.length > 0 && (
            <Card padding="md">
              <h2 className="flex items-center gap-2 text-base font-bold text-gray-950">
                <FileText className="h-4 w-4 text-primary-700" />
                Documentos
              </h2>
              <div className="mt-3 space-y-2">
                {detail.documents.map((document) => (
                  <p key={document.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm">
                    {document.title}
                  </p>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function TextBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <h3 className="font-semibold text-gray-950">{title}</h3>
      <p className="mt-1 whitespace-pre-line">{value}</p>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
