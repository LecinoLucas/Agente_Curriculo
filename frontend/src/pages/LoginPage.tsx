import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { AlertCircle, CheckCircle, Eye, EyeOff, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GoogleSignInButton } from "../components/auth/GoogleSignInButton";
import { useAuth } from "../features/auth/useAuth";
import { HttpError } from "../services/http";
import { formatErrorDetails, handleApiError } from "../shared/utils/errorHandler";

export function LoginPage() {
  const { login, loginWithGoogle, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/pipeline";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate(from, { replace: true });
  }, [from, isAuthenticated, navigate]);

  function toFriendlyText(caught: unknown): string {
    return formatErrorDetails(handleApiError(caught)).join(" ");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(toFriendlyText(err) || "Falha ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleCredential(idToken: string) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[google] LoginPage.handleGoogleCredential invoked", {
        tokenLength: idToken?.length ?? 0,
      });
    }
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle(idToken);
      navigate(from, { replace: true });
    } catch (err) {
      // The backend returns structured 4xx codes; map the ones the UI cares about.
      if (err instanceof HttpError) {
        const code = err.code;
        if (code === "google_domain_not_allowed") {
          setError("Apenas contas @redemarajo.com.br podem acessar o sistema.");
          return;
        }
        if (code === "google_email_not_verified") {
          setError("Não foi possível validar sua conta Google.");
          return;
        }
        if (code === "user_inactive") {
          setError("Conta inativa. Solicite reativação a um administrador.");
          return;
        }
        if (code === "google_login_disabled" || code === "google_login_not_configured") {
          setError("Login com Google indisponível neste ambiente.");
          return;
        }
      }
      setError(toFriendlyText(err) || "Falha ao autenticar com Google");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl lg:grid-cols-[1.15fr_0.85fr]">
        <section className="hidden flex-col justify-between bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 px-12 py-16 text-white lg:flex">
          <div>
            <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium tracking-wide text-white/90">
              Marajo RH AI System
            </span>
          </div>

          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
                Recrutamento com mais contexto,
                <br />
                menos retrabalho.
              </h1>
              <p className="max-w-md text-lg leading-relaxed text-slate-200">
                Centralize currículos, candidatos, vagas e análises em uma operação mais clara para o time de recrutamento.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {[
                { title: "Triagem organizada", desc: "Visualize documentos, perfis e análises em uma jornada única." },
                { title: "Critérios consistentes", desc: "Use skills, senioridade e matching com a mesma linguagem operacional." },
                { title: "Mais confiança no processo", desc: "Saiba quem solicitou análises, o que foi processado e como cada vaga está evoluindo." },
              ].map((point) => (
                <div key={point.title} className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
                  <div>
                    <p className="text-sm font-semibold text-white">{point.title}</p>
                    <p className="text-sm leading-snug text-slate-200">{point.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-300">© {new Date().getFullYear()} Marajo RH IA · Todos os direitos reservados</p>
        </section>

        <section className="relative flex flex-col justify-center px-6 py-12 sm:px-8 lg:px-12">
          <div className="absolute right-6 top-6 sm:right-8 sm:top-8 lg:right-12 lg:top-8">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:bg-blue-50 hover:text-blue-600"
            >
              <Link to="/candidato">
                <User className="h-3.5 w-3.5" />
                Portal do Candidato
              </Link>
            </Button>
          </div>

          <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-2xl border border-gray-200 bg-white p-8 shadow-lg shadow-blue-950/5">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-extrabold font-display tracking-tight text-gray-900">Acessar plataforma</h2>
              <p className="text-sm text-gray-500">
                Entre com sua conta para continuar no painel de recrutamento.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-900">E-mail</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-900">Senha</span>
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 focus-within:ring-2 focus-within:ring-blue-500/20">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10 flex-1 bg-transparent py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="text-gray-500 transition hover:text-gray-800"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" disabled={loading} className="h-11 text-base font-semibold shadow-sm shadow-blue-500/20">
                {loading ? "Entrando…" : "Entrar no painel"}
              </Button>
            </form>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-gray-200" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">ou</span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>

            <GoogleSignInButton
              disabled={loading}
              onCredential={handleGoogleCredential}
              onError={(message) => setError(message)}
            />

            <p className="text-center text-xs text-gray-500">
              Seu acesso define quais áreas da plataforma estarão disponíveis. Apenas contas @redemarajo.com.br podem entrar via Google.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
