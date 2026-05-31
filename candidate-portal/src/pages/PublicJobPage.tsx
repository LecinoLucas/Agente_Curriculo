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
} from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/shared/LoadingState';
import { getPublicJobBySlug } from '../services/mockCandidatePortalService';
import type { PublicJob } from '../types/candidatePortal';
import { JOB_AREA_LABELS, WORK_MODEL_LABELS, SENIORITY_LABELS, PROCESS_STEPS } from '../types/candidatePortal';

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  responsibilities: Check,
  requirements: GraduationCap,
  benefits: Briefcase,
};

export function PublicJobPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    void getPublicJobBySlug(slug).then((data) => {
      if (!data) setNotFound(true);
      else setJob(data);
      setLoading(false);
    });
  }, [slug]);

  if (loading) {
    return (
      <CandidatePortalLayout>
        <LoadingState variant="spinner" />
      </CandidatePortalLayout>
    );
  }

  if (notFound || !job) {
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

  return (
    <CandidatePortalLayout maxWidth="page">
      {/* Breadcrumb */}
      <nav className="mb-5 flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/vagas" className="hover:text-primary-700 transition-colors">
          Todas as vagas
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-gray-900 font-medium">{job.title}</span>
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
                <h1 className="text-2xl font-extrabold text-gray-900">{job.title}</h1>
                <p className="mt-0.5 text-base text-gray-600 font-medium">{job.company}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="area">{JOB_AREA_LABELS[job.area]}</Badge>
                  <Badge variant="model">{WORK_MODEL_LABELS[job.work_model]}</Badge>
                  <span className="flex items-center gap-1 text-sm text-gray-500">
                    <MapPin className="h-3.5 w-3.5" />
                    {job.location}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-gray-500">
                    <Clock className="h-3.5 w-3.5" />
                    Publicada em {job.published_at}
                  </span>
                  {job.applicants_count !== undefined && (
                    <span className="flex items-center gap-1 text-sm text-gray-500">
                      <Users className="h-3.5 w-3.5" />
                      {job.applicants_count} candidatos
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile CTA */}
            <div className="mt-5 flex gap-3 lg:hidden">
              <Button
                fullWidth
                onClick={() => navigate(`/candidatar/${job.slug}`)}
              >
                Candidatar-se
              </Button>
              <Button variant="secondary" size="md">
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>

          {/* About */}
          <Card padding="lg">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Sobre a vaga</h2>
            <p className="text-sm text-gray-700 leading-relaxed">{job.about_role}</p>
          </Card>

          {/* Responsibilities */}
          <Card padding="lg">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Responsabilidades e atividades</h2>
            <ul className="space-y-2">
              {job.responsibilities.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <div className="mt-1 h-4 w-4 flex-shrink-0 rounded-full bg-primary-100 flex items-center justify-center">
                    <SECTION_ICONS.responsibilities className="h-2.5 w-2.5 text-primary-700" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          {/* Requirements */}
          <Card padding="lg">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Requisitos</h2>
            <ul className="space-y-2">
              {job.requirements.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <div className="mt-1 h-4 w-4 flex-shrink-0 rounded-full bg-blue-50 flex items-center justify-center">
                    <SECTION_ICONS.requirements className="h-2.5 w-2.5 text-blue-600" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          {/* Benefits */}
          <Card padding="lg">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Benefícios</h2>
            <div className="flex flex-wrap gap-2">
              {job.benefits.map((b, i) => (
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
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* Desktop CTA */}
          <Card padding="lg" className="hidden lg:block">
            <Button
              fullWidth
              size="lg"
              onClick={() => navigate(`/candidatar/${job.slug}`)}
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
              <div className="flex justify-between">
                <span className="text-gray-500">Área</span>
                <span className="font-medium text-gray-900">{JOB_AREA_LABELS[job.area]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Senioridade</span>
                <span className="font-medium text-gray-900">{SENIORITY_LABELS[job.seniority]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Modelo</span>
                <span className="font-medium text-gray-900">{WORK_MODEL_LABELS[job.work_model]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Localidade</span>
                <span className="font-medium text-gray-900 text-right">{job.location}</span>
              </div>
              {job.salary_range && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Salário</span>
                  <span className="font-medium text-gray-900">{job.salary_range}</span>
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
