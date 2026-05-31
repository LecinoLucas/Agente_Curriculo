import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { candidateAuthService } from '../services/candidateAuthService';

export function CandidateLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await candidateAuthService.login(email, password);
      // The backend sets an HttpOnly session cookie on success.
      // CandidateHomePage will read the candidate name from the overview endpoint.
      navigate('/minha-area');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'E-mail ou senha incorretos. Tente novamente.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <CandidatePortalLayout maxWidth="content">
      <div className="py-8 max-w-sm mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-gray-900">Acesse sua área</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Entre com seu e-mail e senha para acompanhar suas candidaturas.
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
                  autoComplete="email"
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
                  autoComplete="current-password"
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
        </Card>
      </div>
    </CandidatePortalLayout>
  );
}
