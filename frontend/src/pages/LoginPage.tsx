import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { AlertCircle, Eye, EyeOff, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GoogleSignInButton } from "../components/auth/GoogleSignInButton";
import { useAuth } from "../features/auth/useAuth";
import { HttpError } from "../services/http";
import { formatErrorDetails, handleApiError } from "../shared/utils/errorHandler";
import { cn } from "@/lib/utils";

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
    <div className="min-h-screen bg-[hsl(var(--bg))] text-[hsl(var(--text))] login-page-grid-lines login-page-glow flex flex-col justify-between selection:bg-[hsl(var(--primary)/0.15)] selection:text-[hsl(var(--text))]">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl border-x border-[hsl(var(--border))]/40 lg:grid-cols-[42%_58%] bg-[hsl(var(--bg))]/30 backdrop-blur-[1px]">
        
        {/* Left Column - Editorial Showcase (Desktop only) */}
        <section className="hidden flex-col justify-between p-8 lg:p-10 lg:flex relative">
          <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--primary))]/[0.02] to-transparent pointer-events-none" />
          <div className="flex items-center gap-2 relative">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[hsl(var(--primary))] text-[10px] font-extrabold text-white">
              RA
            </span>
            <div className="flex flex-col">
              <span className="font-heading text-[13px] font-extrabold leading-none tracking-tight text-[hsl(var(--text))]">
                Marajo RH
              </span>
              <span className="text-[9px] leading-none text-[hsl(var(--text-muted))] uppercase tracking-wider mt-0.5">
                ATS & Recrutamento IA
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-8 my-auto">
            <div className="flex flex-col gap-3">
              <span className="inline-flex w-fit items-center rounded-full border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary-soft))]/40 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
                Marajo RH AI System
              </span>
              <h1 className="font-serif-display text-3xl lg:text-4xl xl:text-5xl font-normal leading-[1.1] tracking-tight text-[hsl(var(--text))] italic">
                Recrutamento com <span className="not-italic font-medium text-[hsl(var(--primary))]">mais contexto</span>,<br />
                menos retrabalho.
              </h1>
              <p className="max-w-md text-sm leading-relaxed text-[hsl(var(--text-muted))]">
                Centralize vagas, candidatos, pipeline e decisões em uma operação mais clara para o RH.
              </p>
            </div>

            {/* Custom SVG Modernist Visual Element representing flow, candidate matching, pipeline */}
            <div className="relative w-full max-w-md py-2 opacity-15 hidden xl:block">
              <svg className="w-full h-24 text-[hsl(var(--border))]/60" viewBox="0 0 400 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Flow lines */}
                <path d="M10 20 C 150 20, 200 100, 390 100" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
                <path d="M10 40 C 120 40, 180 80, 390 80" stroke="currentColor" strokeWidth="1" />
                <path d="M10 60 C 180 60, 220 40, 390 40" stroke="currentColor" strokeWidth="1" />
                <path d="M10 80 C 150 80, 250 20, 390 20" stroke="currentColor" strokeWidth="0.75" strokeDasharray="4 4" />
                
                {/* Dots along paths representing candidates/data */}
                <circle cx="90" cy="23" r="2.5" fill="hsl(var(--primary))" />
                <circle cx="180" cy="55" r="2" fill="hsl(var(--text))" />
                <circle cx="280" cy="38" r="3" fill="hsl(var(--primary))" />
                
                {/* Modernist geometric intersections */}
                <line x1="120" y1="10" x2="120" y2="110" stroke="currentColor" strokeWidth="0.5" />
                <line x1="260" y1="10" x2="260" y2="110" stroke="currentColor" strokeWidth="0.5" />
                
                {/* Label overlays */}
                <rect x="100" y="8" width="40" height="14" rx="3" fill="hsl(var(--bg))" stroke="currentColor" strokeWidth="0.5" />
                <text x="120" y="18" className="text-[7px] font-bold uppercase tracking-wider" fill="hsl(var(--text-muted))" textAnchor="middle">Filtro</text>
                
                <rect x="240" y="98" width="40" height="14" rx="3" fill="hsl(var(--bg))" stroke="currentColor" strokeWidth="0.5" />
                <text x="260" y="108" className="text-[7px] font-bold uppercase tracking-wider" fill="hsl(var(--text-muted))" textAnchor="middle">Match</text>
              </svg>
            </div>

            {/* Minimal metadata checklist */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-4 border-t border-[hsl(var(--border))]/40 max-w-lg">
              {[
                { label: "01. Pipeline", desc: "Triagem unificada de perfis" },
                { label: "02. Candidatos", desc: "Histórico e currículos centralizados" },
                { label: "03. Agenda", desc: "Entrevistas e feedbacks unificados" },
                { label: "04. Decisão", desc: "Fórmula de matching com IA" },
              ].map((item) => (
                <div key={item.label} className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold text-[hsl(var(--text))] tracking-tight">{item.label}</span>
                  <span className="text-[11px] leading-tight text-[hsl(var(--text-muted))]">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] text-[hsl(var(--text-muted))]">
              © {new Date().getFullYear()} Marajo RH IA · Sistema Operacional Corporativo · V 1.0
            </p>
          </div>
        </section>

        {/* Right Column - Login Form */}
        <section className="relative flex flex-col justify-between p-6 lg:p-10 min-h-screen lg:min-h-0 bg-[hsl(var(--surface))] lg:shadow-[-25px_0_50px_-15px_rgba(0,0,0,0.05)] z-10 border-l border-[hsl(var(--border))]/30">
          <div className="flex justify-between items-center w-full mb-6 lg:mb-8">
            {/* On mobile, show logo here since left column is hidden */}
            <div className="flex items-center gap-2 lg:hidden">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[hsl(var(--primary))] text-[10px] font-extrabold text-white">
                RA
              </span>
              <span className="font-heading text-[13px] font-extrabold tracking-tight text-[hsl(var(--text))]">
                Marajo RH
              </span>
            </div>
            
            <div className="ml-auto">
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="gap-2 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--accent-soft))] hover:text-[hsl(var(--primary))] rounded-lg transition-colors duration-200"
              >
                <Link to="/candidato">
                  <User className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                  Portal do Candidato
                </Link>
              </Button>
            </div>
          </div>

          <div className="w-full max-w-[420px] mx-auto my-auto flex flex-col gap-5 bg-[hsl(var(--bg))]/50 border border-[hsl(var(--border))]/50 p-6 sm:p-8 rounded-[1.25rem] shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[hsl(var(--primary))]/30 to-transparent" />

            <div className="flex flex-col gap-1.5 pb-4 border-b border-[hsl(var(--border))]/30">
              <h2 className="text-xl sm:text-2xl font-extrabold font-heading tracking-tight text-[hsl(var(--text))]">Acessar plataforma</h2>
              <p className="text-[13px] text-[hsl(var(--text-muted))] leading-relaxed">
                Entre com sua conta corporativa para continuar no painel de recrutamento.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--text))]">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="h-10 w-full login-input px-3 py-2 text-sm placeholder:text-[hsl(var(--text-muted))]/60"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--text))]">
                  Senha
                </label>
                <div className="flex items-center gap-2 login-input px-3">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10 flex-1 bg-transparent py-2 text-sm placeholder:text-[hsl(var(--text-muted))]/60 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="text-[hsl(var(--text-muted))] transition hover:text-[hsl(var(--text))]"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error ? (
                <Alert variant="destructive" className="border-[hsl(var(--danger))/30] bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))]">
                  <AlertCircle className="h-4 w-4 text-[hsl(var(--danger))]" />
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button 
                type="submit" 
                disabled={loading} 
                className="h-11 mt-2 text-sm font-bold login-btn-primary rounded-lg"
              >
                {loading ? "Entrando…" : "Entrar no painel"}
              </Button>
            </form>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-[hsl(var(--border))]/50" />
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[hsl(var(--text-muted))]/80">ou entrar com</span>
              <span className="h-px flex-1 bg-[hsl(var(--border))]/50" />
            </div>

            <div className="flex justify-center w-full relative">
              <div className="absolute inset-0 bg-[hsl(var(--surface))]/50 rounded border border-[hsl(var(--border))]/30 backdrop-blur-sm transform scale-[1.02] -z-10" />
              <GoogleSignInButton
                disabled={loading}
                onCredential={handleGoogleCredential}
                onError={(message) => setError(message)}
              />
            </div>

            <p className="text-center text-[10px] leading-relaxed text-[hsl(var(--text-muted))]/80 mt-2">
              Apenas contas corporativas com final <strong className="text-[hsl(var(--text))]">@redemarajo.com.br</strong> possuem acesso via Google.
            </p>
          </div>

          {/* On mobile, show minor footer copyright */}
          <div className="w-full text-center mt-12 lg:hidden">
            <p className="text-[9px] text-[hsl(var(--text-muted))]">
              © {new Date().getFullYear()} Marajo RH IA · Todos os direitos reservados
            </p>
          </div>
        </section>
        
      </div>
    </div>
  );
}
