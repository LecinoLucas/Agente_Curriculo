import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Briefcase,
  ChevronRight,
  MapPin,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { LoadingState } from '../components/shared/LoadingState';
import { publicJobsService } from '../services/publicJobsService';
import type { JobArea, PublicJob } from '../types/candidatePortal';
import { JOB_AREA_LABELS } from '../types/candidatePortal';
import { useCandidateSession } from '../App';

const AREAS: Array<{ value: JobArea | 'all'; label: string }> = [
  { value: 'all', label: 'Todas as áreas' },
  { value: 'tecnologia', label: 'Tecnologia' },
  { value: 'operacional', label: 'Operacional' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'rh', label: 'RH' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'logistica', label: 'Logística' },
];

export function PublicJobsPage() {
  const { candidateName } = useCandidateSession();
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState<JobArea | 'all'>('all');

  function loadJobs() {
    setLoading(true);
    setError(null);
    publicJobsService
      .listJobs()
      .then(setJobs)
      .catch(() => setError('Não foi possível carregar as vagas. Tente novamente em instantes.'))
      .finally(() => setLoading(false));
  }

  useEffect(loadJobs, []);

  const filteredJobs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchSearch =
        !normalizedSearch ||
        job.title.toLowerCase().includes(normalizedSearch) ||
        job.location.toLowerCase().includes(normalizedSearch) ||
        job.company.toLowerCase().includes(normalizedSearch);
      const matchArea = areaFilter === 'all' || job.area === areaFilter;
      return matchSearch && matchArea;
    });
  }, [areaFilter, jobs, search]);

  return (
    <CandidatePortalLayout maxWidth="page">
      <div className="mb-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
            Vagas
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900">
            Vagas disponíveis
          </h1>
          <p className="mt-1.5 max-w-2xl text-base text-gray-500">
            Busque manualmente oportunidades reais publicadas pela Rede Marajó.
          </p>
        </div>

        <Link
          to="/portal-2"
          className="flex items-center gap-3 rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-800 transition-colors hover:bg-primary-100"
        >
          <Sparkles className="h-5 w-5 flex-shrink-0" />
          <span>
            Prefere ajuda? <strong>Encontrar vaga com assistente</strong>
          </span>
        </Link>
      </div>

      {candidateName ? (
        <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-xl border border-primary-100 bg-white px-4 py-3 sm:flex-row sm:items-center">
          <p className="text-sm text-gray-700">
            Você está conectado.{' '}
            <Link to="/minha-area" className="font-semibold text-primary-700 underline">
              Acompanhe suas candidaturas
            </Link>
            {' '}ou veja novas vagas abaixo.
          </p>
        </div>
      ) : (
        <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-xl border border-primary-100 bg-white px-4 py-3 sm:flex-row sm:items-center">
          <p className="text-sm text-gray-700">
            Já tem cadastro?{' '}
            <Link to="/login" className="font-semibold text-primary-700 underline">
              Acesse sua área
            </Link>
            {' '}para acompanhar candidaturas.
          </p>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por cargo ou localidade..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {AREAS.map((area) => (
            <button
              key={area.value}
              type="button"
              onClick={() => setAreaFilter(area.value)}
              className={[
                'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                areaFilter === area.value
                  ? 'border-primary-700 bg-primary-700 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-primary-700/50 hover:text-primary-700',
              ].join(' ')}
            >
              {area.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && !error && (
        <p className="mb-4 text-sm text-gray-500">
          {filteredJobs.length} {filteredJobs.length === 1 ? 'vaga encontrada' : 'vagas encontradas'}
        </p>
      )}

      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((item) => (
            <Card key={item} padding="lg">
              <LoadingState variant="skeleton" lines={4} />
            </Card>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center py-16 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
          <p className="text-base font-semibold text-gray-700">{error}</p>
          <button
            type="button"
            onClick={loadJobs}
            className="mt-4 text-sm font-semibold text-primary-700 underline hover:text-primary-800"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !error && filteredJobs.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <p className="text-lg font-semibold text-gray-500">Nenhuma vaga encontrada</p>
          <p className="mt-1 text-sm text-gray-400">Tente ajustar os filtros ou a busca.</p>
        </div>
      )}

      {!loading && !error && filteredJobs.length > 0 && (
        <div className="space-y-4">
          {filteredJobs.map((job) => (
            <Card key={job.id} padding="none" hover>
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50">
                  <Briefcase className="h-6 w-6 text-primary-700" />
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-gray-900">{job.title}</h2>
                  <p className="text-sm text-gray-500">{job.company}</p>
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
