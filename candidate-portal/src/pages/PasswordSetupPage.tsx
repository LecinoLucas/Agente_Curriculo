import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Lock, ArrowLeft } from 'lucide-react';
import { AuthAccessLayout } from '../components/layout/AuthAccessLayout';
import { Button } from '../components/ui/Button';
import { candidateAuthService } from '../services/candidateAuthService';

export function PasswordSetupPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? '' : 'Link inválido ou expirado.');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError('Link inválido ou expirado.');
      return;
    }
    if (password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('A confirmação de senha não confere.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await candidateAuthService.confirmPasswordSetup(token, password);
      setSuccess(response.message);
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível definir sua senha agora.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthAccessLayout
      heroTitle={
        <>
          Acesso seguro para sua <span className="text-primary-700">área do candidato</span>
        </>
      }
      heroSubtitle="Crie uma senha forte para proteger sua conta e acompanhar sua jornada com segurança."
    >
            <div className="mb-7">
              <h1 className="text-2xl font-extrabold text-gray-900">Definir senha</h1>
              <p className="mt-1.5 text-sm text-gray-500">
                Crie uma senha para acessar sua área do candidato.
              </p>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nova senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    autoComplete="new-password"
                    disabled={loading || Boolean(success)}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Confirmar senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    required
                    autoComplete="new-password"
                    disabled={loading || Boolean(success)}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>

              {success && (
                <div role="status" className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-green-700">{success}</p>
                </div>
              )}

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {success ? (
                <Link
                  to="/login"
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2"
                >
                  Ir para login
                </Link>
              ) : (
                <Button type="submit" fullWidth loading={loading} disabled={!token}>
                  Definir senha
                </Button>
              )}
            </form>

            {!success && (
              <div className="mt-6 pt-5 border-t border-gray-100">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-md text-sm text-gray-500 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Voltar para login
                </Link>
              </div>
            )}
    </AuthAccessLayout>
  );
}
