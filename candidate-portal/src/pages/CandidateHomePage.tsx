import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Check,
  ClipboardCheck,
  FileText,
  Home,
  Lock,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Search,
  User,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import {
  candidatePortalService,
  getAnalysisStatusInfo,
  shouldPollAnalysis,
} from '../services/candidatePortalService';
import type {
  CandidateApplication,
  CandidateProfile,
} from '../services/candidatePortalService';
import { candidateAuthService } from '../services/candidateAuthService';
import { HttpError } from '../services/publicApiClient';
import { useCandidateSession } from '../App';

interface CandidateHomeData {
  profile: CandidateProfile;
  applications: CandidateApplication[];
}

type AreaSection = 'home' | 'applications' | 'assessments' | 'documents' | 'messages' | 'profile';

interface AreaMenuItem {
  id: AreaSection;
  label: string;
  icon: ReactNode;
}

const AREA_MENU: AreaMenuItem[] = [
  { id: 'home', label: 'Início', icon: <Home className="h-4 w-4" /> },
  { id: 'applications', label: 'Minhas candidaturas', icon: <Briefcase className="h-4 w-4" /> },
  { id: 'assessments', label: 'Avaliações', icon: <ClipboardCheck className="h-4 w-4" /> },
  { id: 'documents', label: 'Documentos', icon: <FileText className="h-4 w-4" /> },
  { id: 'messages', label: 'Mensagens', icon: <MessageCircle className="h-4 w-4" /> },
  { id: 'profile', label: 'Meu perfil', icon: <User className="h-4 w-4" /> },
];

const JOURNEY_STEPS = [
  { id: 'application', label: 'Candidatura enviada', keys: ['applied', 'application', 'submitted', 'received'] },
  { id: 'screening', label: 'Análise do RH', keys: ['screening', 'triagem', 'analysis', 'review', 'rh'] },
  { id: 'assessment', label: 'Avaliação', keys: ['assessment', 'avaliacao', 'behavioral', 'test'] },
  { id: 'interview', label: 'Entrevista', keys: ['interview', 'entrevista'] },
  { id: 'documents', label: 'Documentos', keys: ['document', 'documentos', 'pre_admission', 'admission'] },
  { id: 'result', label: 'Resultado', keys: ['result', 'hired', 'admitted', 'approved', 'rejected', 'finished'] },
];

export function CandidateHomePage() {
  const navigate = useNavigate();
  const { setCandidateName } = useCandidateSession();
  const [data, setData] = useState<CandidateHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function loadCandidateArea() {
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
        setError('Não conseguimos carregar suas candidaturas agora.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }

  useEffect(loadCandidateArea, [navigate, setCandidateName]);

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

  async function handleLogout() {
    try {
      await candidateAuthService.logout();
    } catch {
      // Logout is idempotent; local session cleanup still happens.
    }
    setCandidateName(null);
    navigate('/login');
  }

  if (loading) {
    return <CandidateHomeLoading />;
  }

  if (error || !data) {
    return (
      <CandidateHomeError
        message={error ?? 'Não conseguimos carregar sua área agora.'}
        onRetry={loadCandidateArea}
      />
    );
  }

  return (
    <CandidateHomeContent
      profile={data.profile}
      applications={data.applications}
      onLogout={() => void handleLogout()}
    />
  );
}

export function CandidateHomeLoading() {
  return (
    <div className="min-h-screen bg-[#f6f7f9] lg:grid lg:grid-cols-[260px_1fr]">
      <div className="hidden border-r border-gray-200 bg-white p-5 lg:block">
        <div className="h-8 w-32 rounded bg-gray-100" />
        <div className="mt-8 h-14 rounded-lg bg-gray-100" />
        <div className="mt-8 space-y-3">
          {AREA_MENU.map((item) => (
            <div key={item.id} className="h-10 rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
      <main className="px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="h-24 rounded-xl border border-gray-200 bg-white" />
          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <div className="h-96 rounded-xl border border-gray-200 bg-white" />
            <div className="h-72 rounded-xl border border-gray-200 bg-white" />
          </div>
        </div>
      </main>
    </div>
  );
}

export function CandidateHomeError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-card">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <AlertCircle className="h-6 w-6 text-primary-700" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-gray-950">{message}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Tente novamente. Se a sessão tiver expirado, acesse sua conta outra vez.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {onRetry && (
            <Button type="button" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          )}
          <Link to="/login">
            <Button type="button" variant="secondary" size="sm">
              Ir para o login
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function CandidateHomeContent({
  profile,
  applications,
  onLogout,
}: CandidateHomeData & { onLogout?: () => void }) {
  const [activeSection, setActiveSection] = useState<AreaSection>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const firstName = getFirstName(profile.fullName);
  const pendingActions = applications.filter((item) => item.nextAction);
  const featuredApplication = pendingActions[0] ?? applications[0] ?? null;
  const activeCount = applications.filter((item) => !isClosedApplication(item)).length;

  function selectSection(section: AreaSection) {
    setActiveSection(section);
    setMobileMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] lg:flex">
      <div className="hidden lg:block lg:w-20 lg:shrink-0 relative z-50">
        <CandidateSidebar
          profile={profile}
          activeSection={activeSection}
          onSelect={selectSection}
          onLogout={onLogout}
        />
      </div>
      <CandidateMobileHeader
        profile={profile}
        menuOpen={mobileMenuOpen}
        onToggleMenu={() => setMobileMenuOpen((current) => !current)}
      />
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="h-full w-[min(320px,88vw)] bg-[#0F0F12] shadow-2xl transition-transform duration-300"
            onClick={(event) => event.stopPropagation()}
          >
            <CandidateSidebar
              profile={profile}
              activeSection={activeSection}
              onSelect={selectSection}
              onLogout={onLogout}
              mobile
            />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 pb-20 pt-16 lg:pt-0">
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
          <CandidateAreaHeader
            firstName={firstName}
            activeCount={activeCount}
          />
          <div className="mt-6">
            {renderAreaSection({
              activeSection,
              profile,
              applications,
              featuredApplication,
              pendingActions,
              onSelect: selectSection,
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

export function isSessionExpiredError(err: unknown) {
  return err instanceof HttpError && err.status === 401;
}

function renderAreaSection({
  activeSection,
  profile,
  applications,
  featuredApplication,
  pendingActions,
  onSelect,
}: {
  activeSection: AreaSection;
  profile: CandidateProfile;
  applications: CandidateApplication[];
  featuredApplication: CandidateApplication | null;
  pendingActions: CandidateApplication[];
  onSelect: (section: AreaSection) => void;
}) {
  if (applications.length === 0) {
    return <CandidateEmptyApplicationsState />;
  }

  // The tabs to display below the hero
  const TABS: Array<{ id: AreaSection; label: string }> = [
    { id: 'applications', label: 'Minhas Candidaturas' },
    { id: 'assessments', label: 'Avaliações' },
    { id: 'documents', label: 'Documentos' },
    { id: 'messages', label: 'Mensagens' },
    { id: 'profile', label: 'Meu Perfil' },
  ];

  // If activeSection is 'home', we can default the tab to 'applications' or 'assessments'
  const currentTab = activeSection === 'home' ? 'applications' : activeSection;

  return (
    <div className="space-y-6">
      {featuredApplication && (
        <CandidateApplicationHeroCard application={featuredApplication} />
      )}

      <div>
        <div className="bg-zinc-100 p-1.5 rounded-xl inline-flex w-full overflow-x-auto scrollbar-none border border-zinc-200/50 shadow-inner">
          <nav className="flex space-x-1 w-full min-w-max" aria-label="Tabs">
            {TABS.map((tab) => {
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelect(tab.id)}
                  className={[
                    'flex-1 whitespace-nowrap py-2.5 px-5 text-xs sm:text-sm font-bold transition-all duration-200 rounded-lg text-center',
                    isActive
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/40',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-6">
          {currentTab === 'applications' && <CandidateApplicationsList applications={applications} />}
          {currentTab === 'assessments' && <CandidateAssessmentsSection pendingActions={pendingActions} />}
          {currentTab === 'documents' && <HonestPlaceholder title="Nenhum documento solicitado no momento." />}
          {currentTab === 'messages' && <HonestPlaceholder title="Você não possui mensagens no momento." />}
          {currentTab === 'profile' && <CandidateProfileSummaryCard profile={profile} expanded />}
        </div>
      </div>
    </div>
  );
}

function CandidateSidebar({
  profile,
  activeSection,
  onSelect,
  onLogout,
  mobile = false,
}: {
  profile: CandidateProfile;
  activeSection: AreaSection;
  onSelect: (section: AreaSection) => void;
  onLogout?: () => void;
  mobile?: boolean;
}) {
  return (
    <aside
      className={[
        'flex h-full flex-col border-r border-zinc-800 bg-[#0F0F12] text-zinc-300 transition-all duration-300 overflow-hidden',
        mobile ? 'p-5 w-full bg-[#0F0F12]' : 'hidden min-h-screen p-5 lg:flex fixed left-0 top-0 w-[84px] hover:w-[260px] group z-50 shadow-[4px_0_24px_rgba(0,0,0,0.15)]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <Link to="/" className="text-lg font-black tracking-tight text-white whitespace-nowrap overflow-hidden flex items-center gap-1">
          <span className="text-red-500 text-2xl leading-none font-extrabold">M</span>
          <span className="transition-opacity duration-300 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 font-extrabold">arajó <span className="text-red-500">RH</span></span>
        </Link>
        {mobile && (
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white"
            onClick={() => onSelect(activeSection)}
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <CandidateUserBlock profile={profile} />

      <nav className="mt-7 space-y-1.5" aria-label="Menu da área do candidato">
        {AREA_MENU.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={[
              'group relative flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition-all duration-200',
              'before:absolute before:left-0 before:top-2.5 before:h-6 before:w-0.5 before:rounded-full before:transition-colors',
              activeSection === item.id
                ? 'bg-zinc-900 text-white before:bg-red-500 shadow-sm shadow-black/10'
                : 'text-zinc-400 before:bg-transparent hover:bg-zinc-900/40 hover:text-white hover:before:bg-red-500',
            ].join(' ')}
            aria-current={activeSection === item.id ? 'page' : undefined}
          >
            <span className={activeSection === item.id ? 'text-red-500' : 'text-zinc-500 group-hover:text-red-500 transition-colors'}>
              {item.icon}
            </span>
            <span className="whitespace-nowrap transition-opacity duration-300 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto space-y-2 pt-8 overflow-hidden">
        <Link to="/vagas" className="flex items-center gap-3 px-3 h-10 rounded-lg border border-zinc-800 text-sm font-semibold text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors whitespace-nowrap">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <span className="transition-opacity duration-300 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">Ver vagas abertas</span>
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="flex h-10 w-full items-center gap-3 px-3 rounded-lg text-sm font-semibold text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors whitespace-nowrap"
        >
          <LogOut className="h-4 w-4 shrink-0 text-zinc-500" />
          <span className="transition-opacity duration-300 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">Sair</span>
        </button>
      </div>
    </aside>
  );
}

function CandidateUserBlock({ profile }: { profile: CandidateProfile }) {
  return (
    <div className="mt-7 rounded-xl border border-zinc-800 bg-zinc-900/30 p-2 sm:p-2.5 overflow-hidden">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-xs font-extrabold text-white shadow-sm shadow-red-900/30">
          {getInitials(profile.fullName)}
        </div>
        <div className="min-w-0 transition-opacity duration-300 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
          <p className="truncate text-sm font-bold text-zinc-100">{profile.fullName}</p>
          {profile.email && <p className="truncate text-[10px] text-zinc-400">{profile.email}</p>}
        </div>
      </div>
    </div>
  );
}

function CandidateMobileHeader({
  profile,
  menuOpen,
  onToggleMenu,
}: {
  profile: CandidateProfile;
  menuOpen: boolean;
  onToggleMenu: () => void;
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 backdrop-blur lg:hidden shadow-sm">
      <button
        type="button"
        onClick={onToggleMenu}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100"
        aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
      >
        {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      <Link to="/" className="text-base font-extrabold text-gray-950 tracking-tight">
        Marajó <span className="text-red-500">RH</span>
      </Link>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-sm shadow-red-900/20">
        {getInitials(profile.fullName)}
      </div>
    </header>
  );
}

function CandidateAreaHeader({
  firstName,
  activeCount,
}: {
  firstName: string;
  activeCount: number;
}) {
  return (
    <header className="flex flex-col gap-4 pb-6 border-b border-gray-100 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-50 text-red-600">
            Área do candidato
          </span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          Olá, {firstName}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-gray-500">
          Tudo que importa no seu processo, sem ruído.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {activeCount > 0 && (
          <span className="inline-flex min-h-9 items-center rounded-full border border-red-100 bg-red-50/50 px-3.5 text-xs font-bold text-red-600">
            <span className="mr-1.5 flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
            {activeCount} {activeCount === 1 ? 'candidatura em andamento' : 'candidaturas em andamento'}
          </span>
        )}
        <Link to="/vagas">
          <Button type="button" size="sm" className="shadow-sm shadow-primary-900/10 hover:translate-y-[-1px] transition-transform">
            <Search className="mr-1.5 h-4 w-4" />
            Ver vagas abertas
          </Button>
        </Link>
      </div>
    </header>
  );
}

function CandidateApplicationHeroCard({ application }: { application: CandidateApplication }) {
  const nextAction = getNextAction(application);
  const hasPendingAction = Boolean(application.nextAction);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-md hover:shadow-lg transition-all duration-300">
      <div className="border-b border-gray-100 px-5 py-5 sm:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-red-50 text-red-600">
              Processo Atual
            </span>
            <h2 className="mt-2 text-2xl font-black leading-tight tracking-tight text-gray-950 sm:text-3xl">
              {application.jobTitle}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-gray-500">
              {application.companyUnit && <span className="font-semibold text-gray-800">{application.companyUnit}</span>}
              {application.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                  {application.location}
                </span>
              )}
              <span>Candidatura em {formatDate(application.submittedAt)}</span>
            </div>
          </div>
          <StatusBadge label={application.statusLabel} closed={isClosedApplication(application)} />
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 px-5 py-5 sm:px-7 sm:py-6">
          <div className="rounded-xl border border-gray-200/60 bg-gray-50/40 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-950 flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-3.5 bg-[#C62828] rounded-full" />
                  Etapa atual: {getCurrentStepLabel(application)}
                </p>
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-gray-600">
                  {application.nextAction
                    ? application.nextAction
                    : 'Nenhuma ação pendente no momento. Acompanhe os detalhes para ver atualizações do RH.'}
                </p>
              </div>
              {!hasPendingAction && (
                <Link to={`/minha-area/candidaturas/${application.applicationId}`} className="shrink-0">
                  <Button type="button" variant="secondary" size="sm" className="shadow-sm">
                    Ver detalhes
                  </Button>
                </Link>
              )}
            </div>
            <CandidateApplicationTimeline application={application} />
          </div>
        </div>

        <div className="order-first border-t border-zinc-800 bg-gradient-to-br from-[#3D0A11] via-[#1E0508] to-[#0D0204] p-6 text-white sm:p-8 lg:order-none lg:border-l lg:border-t-0 flex flex-col justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/10 text-red-200">
              Próxima Ação
            </span>
            <h3 className="mt-4 text-xl font-extrabold leading-tight tracking-tight text-white">
              {hasPendingAction ? nextAction.label : 'Acompanhar candidatura'}
            </h3>
            <p className="mt-2.5 text-sm leading-relaxed text-zinc-300">
              {hasPendingAction
                ? 'Resolva este passo para manter seu processo andando.'
                : 'Seu processo está em acompanhamento. Veja detalhes quando precisar.'}
            </p>
          </div>
          <div className="mt-8 space-y-2.5">
            <Link to={nextAction.href} className="block">
              <Button
                type="button"
                fullWidth
                className="bg-white text-[#3D0A11] hover:bg-zinc-100 hover:translate-y-[-1px] active:translate-y-[0px] shadow-lg shadow-black/10 transition-all font-bold focus-visible:ring-white"
              >
                {hasPendingAction ? 'Iniciar agora' : 'Acessar'}
                <ArrowRight className="ml-1.5 h-4 w-4 shrink-0" />
              </Button>
            </Link>
            {hasPendingAction && (
              <Link to={`/minha-area/candidaturas/${application.applicationId}`} className="block">
                <Button
                  type="button"
                  variant="ghost"
                  fullWidth
                  className="text-zinc-200 hover:bg-white/5 hover:text-white hover:translate-y-[-1px] transition-all font-semibold focus-visible:ring-white"
                >
                  Ver detalhes
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}



function CandidateApplicationTimeline({ application }: { application: CandidateApplication }) {
  const steps = getJourneySteps(application);

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {steps.map((step) => (
        <div key={step.id} className="min-w-0">
          <div
            className={[
              'h-full rounded-xl border p-3.5 transition-all duration-200',
              step.state === 'completed'
                ? 'border-red-100 bg-red-50/20'
                : step.state === 'current'
                  ? 'border-primary shadow-sm bg-white ring-1 ring-primary/10'
                  : 'border-gray-100 bg-gray-50/30 opacity-75',
            ].join(' ')}
          >
            <div
              className={[
                'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-transform duration-300',
                step.state === 'completed'
                  ? 'border-[#C62828] bg-[#C62828] text-white scale-100'
                  : step.state === 'current'
                    ? 'border-[#C62828] bg-white text-[#C62828] ring-4 ring-red-50'
                    : 'border-gray-200 bg-white text-gray-400',
              ].join(' ')}
            >
              {step.state === 'completed' ? <Check className="h-4 w-4 stroke-[3]" /> : step.index}
            </div>
            <div className="mt-3 min-w-0">
              <p className={[
                'text-xs font-bold leading-tight',
                step.state === 'current' ? 'text-gray-900 font-extrabold' : 'text-gray-700'
              ].join(' ')}>{step.label}</p>
              <p className="mt-1 text-[10px] font-medium tracking-wide uppercase">
                {step.state === 'completed' ? (
                  <span className="text-red-700">Concluído</span>
                ) : step.state === 'current' ? (
                  <span className="text-primary font-bold animate-pulse">Em andamento</span>
                ) : (
                  <span className="text-gray-400">Pendente</span>
                )}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProcessTimeline({
  steps,
}: {
  steps: Array<{ key: string; label: string; status: 'completed' | 'current' | 'pending' | 'upcoming' | 'closed' }>;
}) {
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

function CandidateApplicationsList({
  applications,
  compact = false,
}: {
  applications: CandidateApplication[];
  compact?: boolean;
}) {
  return (
    <section className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <h2 className="text-base font-extrabold text-gray-950">Minhas Candidaturas</h2>
        {!compact && (
          <Link to="/vagas" className="text-xs font-bold text-primary hover:text-primary-hover transition-colors">
            Ver todas as vagas
          </Link>
        )}
      </div>
      <div className="divide-y divide-gray-100">
        {applications.map((application) => (
          <ApplicationRow key={application.applicationId} application={application} />
        ))}
      </div>
    </section>
  );
}

function ApplicationRow({ application }: { application: CandidateApplication }) {
  const analysisInfo = getAnalysisStatusInfo(application.analysisStatus);

  return (
    <article className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h3 className="text-base font-bold text-gray-950">{application.jobTitle}</h3>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
          <span>{formatDate(application.submittedAt)}</span>
          {application.location && <span>{application.location}</span>}
          {analysisInfo && (
            <AnalysisStatusBadge
              label={analysisInfo.label}
              progress={analysisInfo.variant === 'progress'}
            />
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={application.statusLabel} closed={isClosedApplication(application)} />
        <Link to={`/minha-area/candidaturas/${application.applicationId}`}>
          <Button type="button" variant="secondary" size="sm">
            Ver detalhes
          </Button>
        </Link>
      </div>
    </article>
  );
}

function CandidateAssessmentsSection({ pendingActions }: { pendingActions: CandidateApplication[] }) {
  const assessmentActions = pendingActions.filter((item) => (
    item.nextAction ? isAssessmentAction(item.nextAction) : false
  ));

  if (assessmentActions.length === 0) {
    return <HonestPlaceholder title="Nenhuma avaliação pendente no momento." />;
  }

  return (
    <section className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-extrabold text-gray-950 border-b border-gray-100 pb-4">Avaliações Pendentes</h2>
      <div className="mt-5 space-y-4">
        {assessmentActions.map((application) => (
          <div
            key={application.applicationId}
            className="rounded-xl border border-red-100 bg-gradient-to-br from-red-50/50 to-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          >
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 mb-2 animate-pulse">
                Pendente
              </span>
              <h3 className="text-base font-bold text-gray-950">{application.jobTitle}</h3>
              <p className="mt-1 text-sm text-gray-600">{application.nextAction}</p>
            </div>
            <Link to="/avaliacao" className="shrink-0">
              <Button type="button" size="sm" className="shadow-sm shadow-primary-900/10">
                Responder avaliação
              </Button>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function CandidateProfileSummaryCard({
  profile,
  expanded = false,
}: {
  profile: CandidateProfile;
  expanded?: boolean;
}) {
  return (
    <section className="rounded-xl border border-gray-200/80 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-sm font-extrabold text-red-600 shadow-inner">
          {getInitials(profile.fullName)}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-gray-950">Meu Perfil</h2>
          <p className="truncate text-sm text-gray-500">{profile.fullName}</p>
        </div>
      </div>
      <div className="mt-5 space-y-3.5 text-sm text-gray-600">
        {profile.email && (
          <ProfileLine
            icon={<span className="text-gray-400 font-semibold">@</span>}
            label={profile.email}
          />
        )}
        {profile.phone && (
          <ProfileLine
            icon={<span className="text-gray-400 font-semibold">📞</span>}
            label={profile.phone}
          />
        )}
        {(profile.city || profile.state) && (
          <ProfileLine
            icon={<MapPin className="h-4 w-4 text-gray-400" />}
            label={[profile.city, profile.state].filter(Boolean).join(', ')}
          />
        )}
        {expanded && (
          <>
            <ProfileLine
              icon={<Lock className="h-4 w-4 text-gray-400" />}
              label={`Origem: ${profile.applicationSourceLabel}`}
            />
            <ProfileLine
              icon={<span className="text-gray-400">📅</span>}
              label={`Cadastro em ${formatDate(profile.createdAt)}`}
            />
          </>
        )}
      </div>
    </section>
  );
}

function CandidateEmptyApplicationsState() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-card">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <Briefcase className="h-6 w-6 text-gray-400" />
      </div>
      <h2 className="mt-4 text-lg font-extrabold text-gray-950">
        Você ainda não possui candidaturas.
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500">
        Nenhuma candidatura ativa foi encontrada. Quando você se candidatar a uma vaga,
        o acompanhamento do processo aparecerá aqui.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link to="/portal-2">
          <Button type="button">
            Encontrar vaga com assistente
          </Button>
        </Link>
        <Link to="/vagas">
          <Button type="button" variant="secondary">
            Ver vagas disponíveis
          </Button>
        </Link>
      </div>
    </section>
  );
}

function HonestPlaceholder({ title }: { title: string }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-zinc-50 border border-zinc-100 text-zinc-400 mb-4">
        <FileText className="h-5 w-5" />
      </div>
      <h3 className="text-base font-bold text-gray-900">{title}</h3>
      <p className="mt-1.5 max-w-sm mx-auto text-xs text-gray-400">
        Esta área exibe informações oficiais vindas diretamente do RH. Se houver alguma solicitação, ela aparecerá aqui de forma segura.
      </p>
    </section>
  );
}

function StatusBadge({ label, closed }: { label: string; closed: boolean }) {
  return (
    <span
      className={[
        'inline-flex min-h-[26px] items-center rounded-full border px-3.5 text-xs font-bold leading-none tracking-wide shadow-sm',
        closed
          ? 'border-zinc-200 bg-zinc-50 text-zinc-600'
          : 'border-red-100 bg-red-50 text-red-700',
      ].join(' ')}
    >
      {label}
    </span>
  );
}

function AnalysisStatusBadge({ label, progress }: { label: string; progress: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-md">
      {progress && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />}
      {label}
      {progress ? ' · Atualizando automaticamente' : ''}
    </span>
  );
}

function ProfileLine({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <p className="flex items-center gap-2">
      {icon ?? <span className="h-4 w-4" />}
      <span className="min-w-0 break-words">{label}</span>
    </p>
  );
}

function getNextAction(application: CandidateApplication) {
  if (application.nextAction) {
    return {
      label: isAssessmentAction(application.nextAction)
        ? 'Responder avaliação comportamental'
        : application.nextAction,
      href: isAssessmentAction(application.nextAction)
        ? '/avaliacao'
        : `/minha-area/candidaturas/${application.applicationId}`,
    };
  }

  return {
    label: 'Ver detalhes',
    href: `/minha-area/candidaturas/${application.applicationId}`,
  };
}

function getJourneySteps(application: CandidateApplication) {
  const currentIndex = getCurrentJourneyIndex(application);

  return JOURNEY_STEPS.map((step, index) => {
    let state: 'completed' | 'current' | 'pending' = 'pending';
    
    // As requested: ensure steps strictly map completed before current
    if (index < currentIndex) {
      state = 'completed';
    } else if (index === currentIndex) {
      state = 'current';
    }

    return {
      id: step.id,
      label: step.label,
      index: index + 1,
      state,
    };
  });
}

function getCurrentJourneyIndex(application: CandidateApplication) {
  const stage = `${application.currentStage} ${application.currentStageLabel} ${application.status} ${application.statusLabel}`.toLowerCase();
  if (application.nextAction && isAssessmentAction(application.nextAction)) return 2;

  const matchedIndex = JOURNEY_STEPS.findIndex((step) => (
    step.keys.some((key) => stage.includes(key))
  ));

  if (matchedIndex >= 0) return matchedIndex;
  return 1;
}

function getCurrentStepLabel(application: CandidateApplication) {
  if (application.nextAction && isAssessmentAction(application.nextAction)) return 'Avaliação';
  return application.currentStageLabel || application.statusLabel || 'Em andamento';
}

function isAssessmentAction(action: string) {
  const normalized = action.toLowerCase();
  return normalized.includes('avalia') || normalized.includes('assessment') || normalized.includes('comportamental');
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getFirstName(value: string) {
  return value.trim().split(/\s+/)[0] || value;
}

function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('');
  return initials || 'C';
}

function isClosedApplication(application: CandidateApplication) {
  return ['finished', 'admitted', 'hired', 'dismissed', 'rejected', 'closed'].includes(application.status);
}
