import { Link } from 'react-router-dom';
import { Sparkles, User } from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { useCandidateSession } from '../App';

export function PublicHomePage() {
  const { candidateName } = useCandidateSession();

  return (
    <CandidatePortalLayout maxWidth="page">
      <div className="flex min-h-[calc(100vh-theme(spacing.24))] flex-col items-center justify-start px-4 pb-12 pt-2 sm:px-6 sm:pt-4 lg:pt-6">
        <div className="mb-12 max-w-2xl text-center">
          <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Escolha como deseja começar
          </h1>
          <p className="text-lg text-gray-600">
            Encontre vagas com ajuda do assistente ou acompanhe sua jornada na área do candidato.
          </p>
        </div>

        <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
          <Link
            to="/portal-2"
            className="group relative flex flex-col items-start overflow-hidden rounded-3xl bg-primary-700 p-8 text-white shadow-xl transition-all hover:-translate-y-1 hover:bg-primary-800 hover:shadow-2xl"
          >
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary-600/50 blur-3xl transition-all group-hover:bg-primary-500/50" />

            <div className="relative mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
              <Sparkles className="h-7 w-7" />
            </div>

            <h2 className="relative mb-3 text-2xl font-bold">Encontrar vaga com assistente</h2>
            <p className="relative mb-8 flex-1 text-base text-primary-100">
              Responda poucas perguntas e receba oportunidades que combinam com você.
            </p>

            <div className="relative mt-auto w-full">
              <div className="inline-flex w-full items-center justify-center rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-primary-700 shadow-sm transition-colors group-hover:bg-gray-50">
                Começar com assistente
              </div>
            </div>
          </Link>

          <Link
            to={candidateName ? '/minha-area' : '/login'}
            className="group flex flex-col items-start rounded-3xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md"
          >
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 text-gray-600 transition-colors group-hover:bg-primary-50 group-hover:text-primary-700">
              <User className="h-7 w-7" />
            </div>

            <h2 className="mb-3 text-2xl font-bold text-gray-900 transition-colors group-hover:text-primary-800">
              Área do candidato
            </h2>
            <p className="mb-8 flex-1 text-base text-gray-500">
              Acompanhe candidaturas, conclua etapas e veja seu andamento.
            </p>

            <div className="mt-auto w-full">
              <div className="inline-flex w-full items-center justify-center rounded-xl border-2 border-primary-100 bg-white px-6 py-3 text-sm font-bold text-primary-700 transition-colors group-hover:border-primary-200 group-hover:bg-primary-50">
                Acessar minha área
              </div>
            </div>
          </Link>
        </div>
      </div>
    </CandidatePortalLayout>
  );
}
