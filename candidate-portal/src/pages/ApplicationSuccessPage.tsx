import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, ArrowRight, Clock, Brain } from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PROCESS_STEPS } from '../types/candidatePortal';

interface SuccessState {
  analysisAutoRequested?: boolean;
  applicationStatus?: string;
}

export function ApplicationSuccessPage() {
  const location = useLocation();
  const state = location.state as SuccessState | null;
  const analysisAutoRequested = state?.analysisAutoRequested ?? false;
  const isTalentPool = state?.applicationStatus === 'awaiting_job';

  return (
    <CandidatePortalLayout maxWidth="content">
      <div className="py-8">
        <Card padding="lg">
          <div className="text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-9 w-9 text-green-600" />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-gray-900">
              {isTalentPool ? 'Cadastro realizado!' : 'Candidatura enviada!'}
            </h1>
            <p className="mt-2 text-base text-gray-500">
              {isTalentPool
                ? 'Você está no banco de talentos. Entraremos em contato quando surgir uma vaga compatível.'
                : 'Recebemos sua candidatura com sucesso. Nossa equipe de RH vai analisá-la em breve.'}
            </p>
          </div>

          {analysisAutoRequested && (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-primary-100 bg-primary-50 p-4">
              <Brain className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary-700" />
              <p className="text-sm text-primary-800">
                Seu currículo será analisado automaticamente pela IA. Acompanhe o resultado na sua área do candidato.
              </p>
            </div>
          )}

          <div className="mt-8 rounded-xl bg-gray-50 border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary-700" />
              Próximas etapas do processo
            </h2>
            <div className="space-y-3">
              {PROCESS_STEPS.map((step, i) => (
                <div key={step.id} className="flex items-center gap-3">
                  <div
                    className={[
                      'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      i === 0
                        ? 'bg-primary-700 text-white'
                        : 'border-2 border-gray-200 text-gray-400 bg-white',
                    ].join(' ')}
                  >
                    {i === 0 ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <span
                    className={[
                      'text-sm',
                      i === 0 ? 'font-semibold text-primary-700' : 'text-gray-500',
                    ].join(' ')}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <Link to="/minha-area">
              <Button fullWidth>
                Acessar minha área
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/vagas">
              <Button fullWidth variant="secondary">
                Ver mais vagas
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </CandidatePortalLayout>
  );
}
