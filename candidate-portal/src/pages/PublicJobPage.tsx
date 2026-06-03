import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  MapPin,
  Briefcase,
  ChevronRight,
  Check,
  Share2,
  Clock,
  Users,
  GraduationCap,
  AlertCircle,
} from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/shared/LoadingState';
import { publicJobsService } from '../services/publicJobsService';
import type { PublicJob } from '../types/candidatePortal';
import { JOB_AREA_LABELS, WORK_MODEL_LABELS, SENIORITY_LABELS, PROCESS_STEPS } from '../types/candidatePortal';

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  responsibilities: Check,
  requirements: GraduationCap,
  benefits: Briefcase,
};

export function PublicJobPage() {
  // The route param is named :identifier — it carries a UUID (since the API
  // does not return a slug field; id is used as the route key).
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!identifier) return;
    publicJobsService
      .getJobById(identifier)
      .then((data) => {
        if (!data) setNotFound(true);
        else setJob(data);
      })
      .catch(() => setError('Não foi possível carregar a vaga. Tente novamente em instantes.'))
      .finally(() => setLoading(false));
  }, [identifier]);

  if (loading) {
    return (
      <CandidatePortalLayout>
        <LoadingState variant="spinner" />
      </CandidatePortalLayout>
    );
  }

  if (notFound || (!error && !job)) {
    return (
      <CandidatePortalLayout>
        <div className="py-20 text-center">
          <p className="text-xl font-bold text-gray-500">Vaga não encontrada</p>
          <Link to="/vagas" className="mt-4 inline-block text-sm text-primary-700 hover:underline">
            Ver todas as vagas
          </Link>
        </div>
      </CandidatePortalLayout>
    );
  }

  if (error) {
    return (
      <CandidatePortalLayout>
        <div className="flex flex-col items-center py-20 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
          <p className="text-base font-semibold text-gray-700">{error}</p>
          <Link to="/vagas" className="mt-4 inline-block text-sm text-primary-700 hover:underline">
            Ver todas as vagas
          </Link>
        </div>
      </CandidatePortalLayout>
    );
  }

  // job is guaranteed non-null here
  const j = job!;

  return (
    <CandidatePortalLayout maxWidth="page">
      {/* Breadcrumb */}
      <nav className="mb-5 flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/vagas" className="hover:text-primary-700 transition-colors">
          Todas as vagas
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-gray-900 font-medium">{j.title}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main content */}
        <div className="space-y-6">
          {/* Job hero */}
          <Card padding="lg">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 flex-shrink-0 rounded-xl bg-primary-50 flex items-center justify-center">
                <Briefcase className="h-7 w-7 text-primary-700" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-extrabold text-gray-900">{j.title}</h1>
                <p className="mt-0.5 text-base text-gray-600 font-medium">{j.company}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {j.area && JOB_AREA_LABELS[j.area] && (
                    <Badge variant="area">{JOB_AREA_LABELS[j.area]}</Badge>
                  )}
                  {j.work_model && WORK_MODEL_LABELS[j.work_model] && (
                    <Badge variant="model">{WORK_MODEL_LABELS[j.work_model]}</Badge>
                  )}
                  {j.location && (
                    <span className="flex items-center gap-1 text-sm text-gray-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {j.location}
                    </span>
                  )}
                  {j.published_at && (
                    <span className="flex items-center gap-1 text-sm text-gray-500">
                      <Clock className="h-3.5 w-3.5" />
                      Publicada em {j.published_at}
                    </span>
                  )}
                  {j.applicants_count !== undefined && (
                    <span className="flex items-center gap-1 text-sm text-gray-500">
                      <Users className="h-3.5 w-3.5" />
                      {j.applicants_count} candidatos
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile CTA */}
            <div className="mt-5 flex gap-3 lg:hidden">
              <Button
                fullWidth
                onClick={() => navigate(`/candidatar/${j.id}`)}
              >
                Candidatar-se
              </Button>
              <Button variant="secondary" size="md">
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>

          {/* About */}
          {j.about_role && (
            <Card padding="lg">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Sobre a vaga</h2>
              <p className="text-sm text-gray-700 leading-relaxed">{j.about_role}</p>
            </Card>
          )}

          {/* Responsibilities */}
          {j.responsibilities.length > 0 && (
            <Card padding="lg">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Responsabilidades e atividades</h2>
              <ul className="space-y-2">
                {j.responsibilities.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <div className="mt-1 h-4 w-4 flex-shrink-0 rounded-full bg-primary-100 flex items-center justify-center">
                      <SECTION_ICONS.responsibilities className="h-2.5 w-2.5 text-primary-700" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Requirements */}
          {j.requirements.length > 0 && (
            <Card padding="lg">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Requisitos</h2>
              <ul className="space-y-2">
                {j.requirements.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <div className="mt-1 h-4 w-4 flex-shrink-0 rounded-full bg-blue-50 flex items-center justify-center">
                      <SECTION_ICONS.requirements className="h-2.5 w-2.5 text-blue-600" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Benefits */}
          {j.benefits.length > 0 && (
            <Card padding="lg">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Benefícios</h2>
              <div className="flex flex-wrap gap-2">
                {j.benefits.map((b, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm text-green-800"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {b}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* Desktop CTA */}
          <Card padding="lg" className="hidden lg:block">
            <Button
              fullWidth
              size="lg"
              onClick={() => navigate(`/candidatar/${j.id}`)}
            >
              Candidatar-se
            </Button>
            <button className="mt-3 flex w-full items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              <Share2 className="h-4 w-4" />
              Compartilhar vaga
            </button>
          </Card>

          {/* Job summary */}
          <Card padding="md">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Resumo da vaga
            </h3>
            <div className="space-y-2.5 text-sm">
              {j.area && JOB_AREA_LABELS[j.area] && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Área</span>
                  <span className="font-medium text-gray-900">{JOB_AREA_LABELS[j.area]}</span>
                </div>
              )}
              {j.seniority && SENIORITY_LABELS[j.seniority] && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Senioridade</span>
                  <span className="font-medium text-gray-900">{SENIORITY_LABELS[j.seniority]}</span>
                </div>
              )}
              {j.work_model && WORK_MODEL_LABELS[j.work_model] && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Modelo</span>
                  <span className="font-medium text-gray-900">{WORK_MODEL_LABELS[j.work_model]}</span>
                </div>
              )}
              {j.location && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Localidade</span>
                  <span className="font-medium text-gray-900 text-right">{j.location}</span>
                </div>
              )}
              {j.salary_range && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Salário</span>
                  <span className="font-medium text-gray-900">{j.salary_range}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Process steps */}
          <Card padding="md">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Etapas do processo
            </h3>
            <div className="space-y-2">
              {PROCESS_STEPS.map((step, i) => (
                <div key={step.id} className="flex items-center gap-2.5">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">
                    {i + 1}
                  </div>
                  <span className="text-sm text-gray-700">{step.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </CandidatePortalLayout>
  );
}
