import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { AuthAccessLayout } from '../components/layout/AuthAccessLayout';
import { Button } from '../components/ui/Button';
import { candidateAuthService } from '../services/candidateAuthService';

export function RecoverAccessPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Informe um e-mail válido para receber as instruções.');
      setMessage('');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await candidateAuthService.requestPasswordSetup(cleanEmail);
      setMessage(response.message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível processar sua solicitação agora.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthAccessLayout>
            <div className="mb-7">
              <h1 className="text-2xl font-extrabold text-gray-900">Recupere seu acesso</h1>
              <p className="mt-1.5 text-sm text-gray-500">
                Informe o e-mail usado na sua candidatura. Se encontrarmos seu cadastro,
                enviaremos as instruções para acessar sua área.
              </p>
            </div>

            {message ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-green-800 leading-relaxed">{message}</p>
                </div>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-md text-sm font-semibold text-green-700 transition-colors hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Voltar para login
                </Link>
              </div>
            ) : (
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                <div>
                  <label htmlFor="recover-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                    <input
                      id="recover-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      required
                      autoComplete="email"
                      disabled={loading}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </div>

                {error && (
                  <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <div className="pt-1">
                  <Button type="submit" fullWidth loading={loading}>
                    Enviar instruções
                  </Button>
                </div>
              </form>
            )}

            <div className="mt-6 pt-5 border-t border-gray-100">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-md text-sm text-gray-500 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar para login
              </Link>
            </div>
    </AuthAccessLayout>
  );
}
