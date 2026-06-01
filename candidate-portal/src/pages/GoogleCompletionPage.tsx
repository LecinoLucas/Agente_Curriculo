import { Link } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Button } from '../components/ui/Button';

export function GoogleCompletionPage() {
  return (
    <CandidatePortalLayout maxWidth="content">
      <div className="py-12 flex flex-col items-center text-center gap-6 max-w-sm mx-auto">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-9 w-9 text-green-600" aria-hidden="true" />
        </div>

        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Complete seu cadastro</h1>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            Seu acesso foi criado com Google, mas ainda faltam informações para concluir
            candidaturas. Acesse sua área ou escolha uma vaga para continuar.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Link to="/minha-area">
            <Button fullWidth>
              Ir para minha área
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/">
            <Button fullWidth variant="secondary">
              Ver vagas abertas
            </Button>
          </Link>
        </div>
      </div>
    </CandidatePortalLayout>
  );
}
