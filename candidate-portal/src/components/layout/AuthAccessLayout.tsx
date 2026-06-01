import type { ReactNode } from 'react';
import { Briefcase, ClipboardList, MapPin } from 'lucide-react';
import { CandidatePortalLayout } from './CandidatePortalLayout';

const HERO_BENEFITS = [
  {
    Icon: MapPin,
    title: 'Postos em rodovias estratégicas',
    subtitle: 'Presença nos principais corredores do país.',
  },
  {
    Icon: Briefcase,
    title: 'Oportunidades em operação e corporativo',
    subtitle: 'Diversas áreas para você crescer com a gente.',
  },
  {
    Icon: ClipboardList,
    title: 'Acompanhamento online do processo',
    subtitle: 'Transparência em cada etapa da sua jornada.',
  },
] as const;

interface AuthAccessLayoutProps {
  children: ReactNode;
  heroTitle?: ReactNode;
  heroSubtitle?: string;
}

function DefaultHeroTitle() {
  return (
    <>
      Sua carreira na <span className="text-primary-700">estrada certa</span>
    </>
  );
}

function RoadIllustration() {
  return (
    <svg
      viewBox="0 0 420 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-full"
      aria-hidden="true"
    >
      <path d="M0 96 C70 70 112 74 180 91 C252 109 315 88 420 58 V180 H0 V96Z" fill="#F3F4F6" />
      <path d="M0 124 C82 91 127 94 194 113 C262 132 323 111 420 80" stroke="#D1D5DB" strokeWidth="2" />
      <path d="M122 180 L188 44 H236 L302 180 H122Z" fill="#E5E7EB" />
      <path d="M142 180 L197 44" stroke="#9CA3AF" strokeWidth="2" />
      <path d="M282 180 L226 44" stroke="#9CA3AF" strokeWidth="2" />
      <path d="M212 180 L212 48" stroke="#C62828" strokeOpacity="0.38" strokeWidth="3" strokeDasharray="16 12" />
      <path d="M42 89 H112 V106 H42 V89Z" fill="#D1D5DB" />
      <path d="M52 68 H102 V89 H52 V68Z" fill="#F9FAFB" stroke="#9CA3AF" strokeWidth="2" />
      <path d="M69 106 V128" stroke="#9CA3AF" strokeWidth="4" />
      <path d="M91 106 V128" stroke="#9CA3AF" strokeWidth="4" />
      <path d="M57 78 H97" stroke="#C62828" strokeOpacity="0.5" strokeWidth="4" />
      <circle cx="345" cy="62" r="22" fill="#FEE2E2" />
      <path d="M328 62 H362" stroke="#C62828" strokeOpacity="0.42" strokeWidth="3" />
      <path d="M345 45 V79" stroke="#C62828" strokeOpacity="0.32" strokeWidth="3" />
    </svg>
  );
}

export function AuthAccessLayout({
  children,
  heroTitle = <DefaultHeroTitle />,
  heroSubtitle = 'Acompanhe suas candidaturas e cada etapa do processo de forma simples e segura.',
}: AuthAccessLayoutProps) {
  return (
    <CandidatePortalLayout maxWidth="page">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(390px,430px)] lg:gap-8">
        <aside
          className="relative hidden min-h-[640px] overflow-hidden rounded-2xl border border-gray-200 bg-white px-10 py-9 shadow-card lg:flex lg:flex-col"
          aria-label="Portal do candidato Marajó"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.32]"
            style={{
              backgroundImage:
                'radial-gradient(circle, rgba(198,40,40,0.16) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full border border-primary-100 bg-primary-50/50" aria-hidden="true" />
          <div className="pointer-events-none absolute -left-20 bottom-24 h-40 w-40 rounded-full border border-gray-200 bg-gray-50" aria-hidden="true" />

          <div className="relative z-10">
            <div className="flex items-center gap-1">
              <span className="text-2xl font-extrabold tracking-tight text-primary-700">Marajó</span>
              <span className="text-2xl font-extrabold tracking-tight text-gray-950">RH</span>
            </div>
            <p className="mt-10 text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
              Portal do candidato
            </p>
            <h2 className="mt-3 max-w-md text-4xl font-extrabold leading-tight text-gray-950">
              {heroTitle}
            </h2>
            <p className="mt-4 max-w-sm text-base leading-relaxed text-gray-600">
              {heroSubtitle}
            </p>
          </div>

          <ul className="relative z-10 mt-8 space-y-3">
            {HERO_BENEFITS.map(({ Icon, title, subtitle }) => (
              <li key={title} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-card">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50">
                  <Icon className="h-4 w-4 text-primary-700" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold leading-snug text-gray-900">{title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{subtitle}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="relative z-0 mt-auto h-44 translate-y-3" aria-hidden="true">
            <RoadIllustration />
          </div>
        </aside>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card sm:p-8 lg:p-9">
          <div className="mb-8 flex items-center gap-1 lg:hidden">
            <span className="text-xl font-extrabold tracking-tight text-primary-700">Marajó</span>
            <span className="text-xl font-extrabold tracking-tight text-gray-950">RH</span>
          </div>
          {children}
        </section>
      </div>
    </CandidatePortalLayout>
  );
}
