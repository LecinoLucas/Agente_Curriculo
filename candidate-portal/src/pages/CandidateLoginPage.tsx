import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, AlertCircle, CheckCircle2, KeyRound, Info } from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { candidateAuthService } from '../services/candidateAuthService';
import { HttpError } from '../services/publicApiClient';

// Read at module load — stable across re-renders.
const GOOGLE_CLIENT_ID: string =
  (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.VITE_GOOGLE_CLIENT_ID ?? '';

// Minimal type shim for Google Identity Services injected by the GSI script.
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            ux_mode?: string;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: string;
              theme?: string;
              size?: string;
              text?: string;
              locale?: string;
              width?: number;
            },
          ) => void;
          cancel: () => void;
        };
      };
    };
  }
}

export function CandidateLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ── Local login ───────────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Password recovery form ────────────────────────────────────────────────
  const [showAccessForm, setShowAccessForm] = useState(
    searchParams.get('firstAccess') === '1',
  );
  const [accessEmail, setAccessEmail] = useState('');
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [accessMessage, setAccessMessage] = useState('');

  // ── Google login ──────────────────────────────────────────────────────────
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [googleError, setGoogleError] = useState('');
  const [googleMessage, setGoogleMessage] = useState('');

  // Stable ref so the GSI callback always sees the latest handler.
  const googleCallbackRef = useRef<(cred: { credential: string }) => void>(
    () => undefined,
  );

  // Keep the callback ref fresh without re-triggering the GSI load effect.
  useEffect(() => {
    googleCallbackRef.current = async (response: { credential: string }) => {
      const idToken = response.credential;
      // idToken is used only for this request — never stored.
      setGoogleError('');
      setGoogleMessage('');
      try {
        const result = await candidateAuthService.loginWithGoogle(idToken);
        if (result.status === 'authenticated') {
          navigate('/minha-area');
        } else {
          // needs_completion: account exists but profile is incomplete.
          setGoogleMessage(
            'Seu acesso com Google foi criado. Complete sua candidatura escolhendo uma vaga.',
          );
        }
      } catch (err) {
        if (err instanceof HttpError && err.status === 409) {
          setGoogleError(
            'Não foi possível concluir o acesso com Google. Use o e-mail e senha ou solicite instruções de acesso.',
          );
        } else {
          setGoogleError(
            err instanceof Error
              ? err.message
              : 'Não foi possível acessar com Google. Tente novamente.',
          );
        }
      }
    };
  });

  // Load Google Identity Services script and render the official button.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleButtonRef.current) return;

    const container = googleButtonRef.current;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google?.accounts?.id || !container) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (cred) => googleCallbackRef.current(cred),
        ux_mode: 'popup',
      });
      window.google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        locale: 'pt-BR',
        width: 330,
      });
    };
    document.body.appendChild(script);

    return () => {
      window.google?.accounts?.id?.cancel();
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Informe um e-mail válido para acessar sua área.');
      return;
    }
    if (!password) {
      setError('Informe sua senha para continuar.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await candidateAuthService.login(cleanEmail, password);
      navigate('/minha-area');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'E-mail ou senha incorretos. Tente novamente.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAccessRequest(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = accessEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAccessError('Informe um e-mail válido para receber as instruções.');
      setAccessMessage('');
      return;
    }
    setAccessLoading(true);
    setAccessError('');
    setAccessMessage('');
    try {
      const response = await candidateAuthService.requestPasswordSetup(cleanEmail);
      setAccessMessage(response.message);
    } catch (err) {
      setAccessError(
        err instanceof Error ? err.message : 'Não foi possível processar sua solicitação agora.',
      );
    } finally {
      setAccessLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <CandidatePortalLayout maxWidth="content">
      <div className="py-8 max-w-sm mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-gray-900">Acesse sua área</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Entre com seu e-mail e senha para acompanhar suas candidaturas.
          </p>
        </div>

        {/* ── E-mail / password login ───────────────────────────────────── */}
        <Card padding="lg">
          <form onSubmit={(e) => void handleLogin(e)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
                  disabled={loading}
                  className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  required
                  autoComplete="current-password"
                  disabled={loading}
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

          {/* ── Google login — only rendered when client ID is configured ── */}
          {GOOGLE_CLIENT_ID && (
            <div className="mt-5">
              <div className="relative flex items-center gap-3">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400 font-medium">ou</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>

              <div className="mt-4 flex flex-col items-center gap-2">
                {/* GSI renderButton mounts here */}
                <div ref={googleButtonRef} />

                {googleError && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 w-full">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{googleError}</p>
                  </div>
                )}
                {googleMessage && (
                  <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 w-full">
                    <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-blue-800">{googleMessage}</p>
                      <Link
                        to="/"
                        className="mt-1 inline-block text-xs font-medium text-blue-700 hover:underline"
                      >
                        Ver vagas disponíveis →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* ── Recovery + new candidate CTAs ────────────────────────────── */}
        <div className="mt-4 flex flex-col items-center gap-3">
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setShowAccessForm((current) => !current);
                setAccessError('');
                setAccessMessage('');
              }}
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700 hover:text-primary-800"
            >
              <KeyRound className="h-4 w-4" />
              Recuperar ou criar senha de acesso
            </button>
            <p className="mt-1 text-xs text-gray-400">
              Use esta opção se você já enviou uma candidatura ou possui cadastro no portal.
            </p>
          </div>
          <p className="text-sm text-gray-500">
            Novo candidato?{' '}
            <Link to="/" className="font-medium text-primary-700 hover:underline">
              Veja as vagas abertas
            </Link>
            {' '}para se candidatar.
          </p>
        </div>

        {/* ── Password recovery form ───────────────────────────────────── */}
        {showAccessForm && (
          <Card padding="md" className="mt-4">
            <form onSubmit={(e) => void handleAccessRequest(e)} className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">Receber instruções de acesso</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Informe o e-mail usado na sua candidatura. Se encontrarmos seu cadastro,
                  enviaremos as instruções para acessar sua área.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={accessEmail}
                    onChange={(e) => setAccessEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    autoComplete="email"
                    disabled={accessLoading}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20"
                  />
                </div>
              </div>

              {accessMessage && (
                <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-700">{accessMessage}</p>
                </div>
              )}

              {accessError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{accessError}</p>
                </div>
              )}

              <Button type="submit" fullWidth loading={accessLoading}>
                Enviar instruções
              </Button>
            </form>
          </Card>
        )}
      </div>
    </CandidatePortalLayout>
  );
}
