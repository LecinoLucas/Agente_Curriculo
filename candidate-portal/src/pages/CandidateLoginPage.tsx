import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { loginMockCandidate } from '../services/mockCandidatePortalService';
import { useMockAuth } from '../App';

export function CandidateLoginPage() {
  const navigate = useNavigate();
  const { login } = useMockAuth();
  const [email, setEmail] = useState('lucas.ferreira@email.com');
  const [password, setPassword] = useState('senha123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const candidate = await loginMockCandidate(email, password);
    setLoading(false);
    if (candidate) {
      login(candidate);
      navigate('/minha-area');
    } else {
      setError('E-mail ou senha incorretos. Use qualquer e-mail válido para entrar.');
    }
  }

  return (
    <CandidatePortalLayout maxWidth="content">
      <div className="py-8 max-w-sm mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-gray-900">Acesse sua área</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Entre com seu e-mail para acompanhar suas candidaturas.
          </p>
        </div>

        <Card padding="lg">
          <form onSubmit={(e) => void handleLogin(e)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  required
                  className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="pt-1">
              <Button type="submit" fullWidth loading={loading}>
                Entrar
              </Button>
            </div>
          </form>

          <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5">
            <p className="text-xs text-blue-700">
              <strong>Modo demo:</strong> Use qualquer e-mail com @ para entrar. O candidato pré-carregado é{' '}
              <code className="font-mono">lucas.ferreira@email.com</code>.
            </p>
          </div>
        </Card>
      </div>
    </CandidatePortalLayout>
  );
}
