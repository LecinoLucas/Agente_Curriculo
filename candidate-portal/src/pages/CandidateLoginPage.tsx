import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Mail,
  Lock,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { AuthAccessLayout } from '../components/layout/AuthAccessLayout';
import { Button } from '../components/ui/Button';
import { candidateAuthService } from '../services/candidateAuthService';
import { HttpError } from '../services/publicApiClient';

const GOOGLE_CLIENT_ID: string =
  (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.VITE_GOOGLE_CLIENT_ID ?? '';

export function shouldShowDevCandidateLogin(env: {
  DEV?: boolean;
  VITE_ENABLE_DEV_CANDIDATE_LOGIN?: string;
}) {
  return Boolean(env.DEV) && env.VITE_ENABLE_DEV_CANDIDATE_LOGIN === 'true';
}

export function shouldEnableGoogleLogin(
  clientId: string,
  env: { DEV?: boolean },
  hostname: string,
) {
  if (!clientId) return false;
  // The configured local OAuth origin is localhost. Loading GSI from 127.0.0.1
  // produces a public 403 and noisy console errors before the user interacts.
  if (env.DEV && hostname === '127.0.0.1') return false;
  return true;
}

const SHOW_DEV_CANDIDATE_LOGIN = shouldShowDevCandidateLogin(
  (import.meta as ImportMeta & {
    env?: { DEV?: boolean; VITE_ENABLE_DEV_CANDIDATE_LOGIN?: string };
  }).env ?? {},
);

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

  // Redirect legacy firstAccess param to the dedicated recover page.
  useEffect(() => {
    if (searchParams.get('firstAccess') === '1') {
      navigate('/recuperar-acesso', { replace: true });
    }
  }, [navigate, searchParams]);

  // ── Local login ───────────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [devEmail, setDevEmail] = useState('dev-candidato@local.test');
  const [devName, setDevName] = useState('Candidato Teste');
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState('');

  // ── Google login ──────────────────────────────────────────────────────────
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [googleError, setGoogleError] = useState('');
  const googleLoginEnabled = shouldEnableGoogleLogin(
    GOOGLE_CLIENT_ID,
    (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env ?? {},
    typeof window === 'undefined' ? '' : window.location.hostname,
  );

  const googleCallbackRef = useRef<(cred: { credential: string }) => void>(
    () => undefined,
  );

  // Keep callback ref fresh without re-triggering the GSI load effect.
  useEffect(() => {
    googleCallbackRef.current = async (response: { credential: string }) => {
      const idToken = response.credential;
      setGoogleError('');
      try {
        const result = await candidateAuthService.loginWithGoogle(idToken);
        if (result.status === 'authenticated') {
          navigate('/minha-area');
        } else {
          // needs_completion: session created but profile data is missing.
          navigate('/completar-cadastro');
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
  }, [navigate, setGoogleError]);

  // Load Google Identity Services script and render the official button.
  useEffect(() => {
    if (!googleLoginEnabled || !googleButtonRef.current) return;
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
  }, [googleLoginEnabled]);

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
      if (err instanceof HttpError) {
        setError(
          'E-mail ou senha inválidos. Se você já enviou uma candidatura e ainda não criou senha, use Recuperar ou criar senha de acesso.',
        );
      } else {
        setError(err instanceof Error ? err.message : 'Não foi possível conectar. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDevLogin(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = devEmail.trim().toLowerCase();
    const cleanName = devName.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setDevError('Informe um e-mail válido para o acesso de desenvolvimento.');
      return;
    }
    setDevLoading(true);
    setDevError('');
    try {
      await candidateAuthService.devLoginCandidate({
        email: cleanEmail,
        ...(cleanName ? { name: cleanName } : {}),
      });
      navigate('/minha-area');
    } catch (err) {
      if (err instanceof HttpError) {
        setDevError(`Dev-login indisponível (${err.status}). Verifique APP_ENV e ENABLE_DEV_CANDIDATE_LOGIN.`);
      } else {
        setDevError(err instanceof Error ? err.message : 'Não foi possível concluir o dev-login.');
      }
    } finally {
      setDevLoading(false);
    }
  }

  return (
    <AuthAccessLayout>
            <div className="mb-7">
              <h1 className="text-2xl font-extrabold text-gray-900">Acesse sua área</h1>
              <p className="mt-1.5 text-sm text-gray-500">
                Entre com seu e-mail e senha para acompanhar suas candidaturas.
              </p>
            </div>

            <form onSubmit={(e) => void handleLogin(e)} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input
                    id="login-email"
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

              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Sua senha"
                    required
                    autoComplete="current-password"
                    disabled={loading}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <div className="mt-2 flex flex-col items-end gap-1">
                  <Link
                    to="/recuperar-acesso"
                    className="inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-primary-700 transition-colors hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2"
                  >
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    Recuperar ou criar senha de acesso
                  </Link>
                  <span className="text-right text-[11px] leading-snug text-gray-400">
                    Para quem já enviou uma candidatura ou possui cadastro.
                  </span>
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
                  Entrar
                </Button>
              </div>
            </form>

            {/* Google login — only rendered when client ID is configured (real integration) */}
            {googleLoginEnabled && (
              <div className="mt-5">
                <div className="relative flex items-center gap-3">
                  <div className="flex-1 border-t border-gray-200" />
                  <span className="text-xs text-gray-400 font-medium">ou continue com</span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>
                <div className="mt-4 flex flex-col items-center gap-2">
                  <div ref={googleButtonRef} />
                  {googleError && (
                    <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 w-full">
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <p className="text-sm text-red-700">{googleError}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {SHOW_DEV_CANDIDATE_LOGIN && (
              <form
                onSubmit={(e) => void handleDevLogin(e)}
                className="mt-5 rounded-lg border border-amber-200 bg-amber-50/70 p-4"
              >
                <div className="mb-3">
                  <h2 className="text-sm font-bold text-amber-950">
                    Acesso rápido de desenvolvimento
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-amber-800">
                    Use apenas em ambiente local para testar a área do candidato.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label htmlFor="dev-login-email" className="block text-xs font-semibold text-amber-950 mb-1.5">
                      E-mail do candidato de teste
                    </label>
                    <input
                      id="dev-login-email"
                      type="email"
                      value={devEmail}
                      onChange={(e) => setDevEmail(e.target.value)}
                      disabled={devLoading}
                      className="w-full rounded-lg border border-amber-200 bg-white py-2 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20 disabled:bg-amber-50 disabled:text-gray-400"
                    />
                  </div>

                  <div>
                    <label htmlFor="dev-login-name" className="block text-xs font-semibold text-amber-950 mb-1.5">
                      Nome, opcional
                    </label>
                    <input
                      id="dev-login-name"
                      type="text"
                      value={devName}
                      onChange={(e) => setDevName(e.target.value)}
                      disabled={devLoading}
                      className="w-full rounded-lg border border-amber-200 bg-white py-2 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20 disabled:bg-amber-50 disabled:text-gray-400"
                    />
                  </div>

                  {devError && (
                    <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5">
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <p className="text-sm text-red-700">{devError}</p>
                    </div>
                  )}

                  <Button type="submit" fullWidth loading={devLoading}>
                    Entrar como candidato de teste
                  </Button>
                </div>
              </form>
            )}

            {/* ── Recovery and new candidate CTAs ──────────────────────── */}
            <div className="mt-6 pt-5 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Novo candidato?{' '}
                <Link
                  to="/"
                  className="rounded-sm font-medium text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2"
                >
                  Veja as vagas abertas
                </Link>
                {' '}para se candidatar.
              </p>
            </div>
    </AuthAccessLayout>
  );
}
