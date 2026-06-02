import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Briefcase, Users, Search, ChevronRight, AlertCircle, Sparkles } from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/shared/LoadingState';
import { publicJobsService } from '../services/publicJobsService';
import type { PublicJob, JobArea } from '../types/candidatePortal';
import { JOB_AREA_LABELS } from '../types/candidatePortal';
import { useCandidateSession } from '../App';

const AREAS: Array<{ value: JobArea | 'all'; label: string }> = [
  { value: 'all', label: 'Todas as áreas' },
  { value: 'tecnologia', label: 'Tecnologia' },
  { value: 'operacional', label: 'Operacional' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'rh', label: 'RH' },
];

export function PublicJobsPage() {
  const { candidateName } = useCandidateSession();
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState<JobArea | 'all'>('all');

  useEffect(() => {
    publicJobsService
      .listJobs()
      .then(setJobs)
      .catch(() => setError('Não foi possível carregar as vagas. Tente novamente em instantes.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = jobs.filter((job) => {
    const matchSearch =
      !search ||
      job.title.toLowerCase().includes(search.toLowerCase()) ||
      job.location.toLowerCase().includes(search.toLowerCase());
    const matchArea = areaFilter === 'all' || job.area === areaFilter;
    return matchSearch && matchArea;
  });

  return (
    <CandidatePortalLayout maxWidth="page">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900">Vagas disponíveis</h1>
        <p className="mt-1.5 text-base text-gray-500">
          Encontre a oportunidade certa para você na Rede Marajó.
        </p>
      </div>

      {/* Assistant CTA → Portal 2 */}
      <Link
        to="/portal-2"
        className="mb-6 flex items-center gap-4 rounded-2xl bg-primary-700 px-5 py-4 text-white shadow-card transition-colors hover:bg-primary-800"
      >
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <p className="text-base font-bold">Encontrar vaga com assistente</p>
          <p className="text-sm text-white/80">
            Responda algumas perguntas simples e a gente encontra a vaga certa para você.
          </p>
        </div>
        <ChevronRight className="h-5 w-5 flex-shrink-0" />
      </Link>

      {/* Session-aware entry banner */}
      {candidateName ? (
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-primary-100 bg-primary-50 px-4 py-3">
          <p className="text-sm text-primary-800">
            Você está conectado.{' '}
            <Link to="/minha-area" className="font-semibold underline hover:text-primary-900">
              Acompanhe sua candidatura
            </Link>
            {' '}ou candidate-se a uma nova vaga abaixo.
          </p>
          <Link to="/minha-area" className="text-xs font-medium text-primary-700 hover:underline whitespace-nowrap flex-shrink-0">
            Minha área →
          </Link>
        </div>
      ) : (
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-primary-100 bg-primary-50 px-4 py-3">
          <p className="text-sm text-primary-800">
            <span className="font-semibold">Já tem cadastro?</span>{' '}
            <Link to="/login" className="underline hover:text-primary-900">
              Acesse sua área
            </Link>
            {' '}para acompanhar sua candidatura.
          </p>
          <Link to="/duvidas-frequentes" className="text-xs font-medium text-primary-700 hover:underline whitespace-nowrap flex-shrink-0">
            Dúvidas sobre o processo →
          </Link>
        </div>
      )}

      {/* Search + filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por cargo ou localidade…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {AREAS.map((a) => (
            <button
              key={a.value}
              onClick={() => setAreaFilter(a.value as JobArea | 'all')}
              className={[
                'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                areaFilter === a.value
                  ? 'border-primary-700 bg-primary-700 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-primary-700/50',
              ].join(' ')}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {!loading && !error && (
        <p className="mb-4 text-sm text-gray-500">
          {filtered.length} {filtered.length === 1 ? 'vaga encontrada' : 'vagas encontradas'}
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} padding="lg">
              <LoadingState variant="skeleton" lines={4} />
            </Card>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center py-16 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
          <p className="text-base font-semibold text-gray-700">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              publicJobsService
                .listJobs()
                .then(setJobs)
                .catch(() => setError('Não foi possível carregar as vagas. Tente novamente em instantes.'))
                .finally(() => setLoading(false));
            }}
            className="mt-4 text-sm text-primary-700 underline hover:text-primary-800"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-lg font-semibold text-gray-500">Nenhuma vaga encontrada</p>
          <p className="mt-1 text-sm text-gray-400">Tente ajustar os filtros ou a busca.</p>
        </div>
      )}

      {/* Job list */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((job) => (
            <Card key={job.id} padding="none" hover>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5">
                {/* Icon placeholder */}
                <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-primary-50 flex items-center justify-center">
                  <Briefcase className="h-6 w-6 text-primary-700" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-gray-900">{job.title}</h2>
                      <p className="text-sm text-gray-500">{job.company}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {job.area && JOB_AREA_LABELS[job.area] && (
                      <Badge variant="area">{JOB_AREA_LABELS[job.area]}</Badge>
                    )}
                    {job.location && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <MapPin className="h-3 w-3" />
                        {job.location}
                      </span>
                    )}
                    {job.applicants_count !== undefined && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Users className="h-3 w-3" />
                        {job.applicants_count} candidatos
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0">
                  <Link to={`/vagas/${job.id}`}>
                    <Button variant="outline" size="sm">
                      Ver vaga
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </CandidatePortalLayout>
  );
}
