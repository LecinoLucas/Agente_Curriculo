import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  AlertCircle,
  Eye,
  EyeOff,
  User,
  Mail,
  ArrowRight,
  Shield,
  Sparkles,
  Layers,
  Users,
  Calendar,
  Target,
} from "lucide-react";
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
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col justify-between selection:bg-primary/10 selection:text-primary relative">
      {/* Decorative background glow */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-secondary/30 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-3 lg:py-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-black text-white shadow-sm">
            RA
          </span>
          <div className="flex flex-col text-left">
            <span className="font-heading text-lg font-black leading-none tracking-tight text-foreground">
              Marajó RH
            </span>
            <span className="text-[11px] text-muted-foreground uppercase tracking-widest mt-1 font-bold">
              ATS & Recrutamento IA
            </span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          asChild
          className="gap-2 text-[12px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-primary/5 hover:text-primary rounded-lg transition-colors duration-200"
        >
          <Link to="/candidato">
            <User className="h-4 w-4 text-primary" />
            Portal do candidato
          </Link>
        </Button>
      </header>

      {/* Main Grid */}
      <main className="w-full max-w-7xl mx-auto px-6 py-4 lg:py-6 lg:px-12 grid lg:grid-cols-[1.15fr_0.85fr] gap-8 lg:gap-12 items-start flex-1">
        {/* Left Column - Editorial Showcase (Hidden on Mobile/Tablet) */}
        <section className="hidden lg:flex flex-col justify-start gap-4 lg:gap-5 py-1">
          <div className="flex flex-col gap-3 lg:gap-4">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/5 border border-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3" />
              Marajo RH AI System
            </span>
            <h1 className="font-serif-display text-3xl lg:text-4xl xl:text-[44px] font-normal leading-[1.1] tracking-tight text-foreground">
              Recrutamento com <br />
              <span className="not-italic font-bold text-primary">mais contexto</span>,<br />
              menos retrabalho.
            </h1>
            <p className="max-w-md text-sm lg:text-base leading-relaxed text-muted-foreground mt-2">
              Centralize vagas, candidatos, pipeline e decisões em uma operação mais clara para o RH.
            </p>
          </div>

          {/* Pipeline Mockup Card */}
          <div className="w-full max-w-lg bg-card border border-border rounded-[1.5rem] p-4 shadow-sm relative overflow-hidden mt-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Pipeline de Recrutamento</p>
            
            <div className="grid grid-cols-4 gap-3 relative min-h-[110px]">
              {/* Column 1 */}
              <div className="space-y-2">
                <p className="text-xs font-extrabold text-foreground leading-none">Triagem</p>
                <p className="text-[10px] text-muted-foreground font-semibold">12 cand.</p>
                <div className="space-y-1.5 pt-1">
                  <div className="h-8 bg-muted/50 border border-border rounded-lg p-1 px-1.5 flex items-center gap-1.5">
                    <div className="h-4 w-4 rounded-full bg-border" />
                    <div className="h-1.5 w-8 bg-border rounded-full" />
                  </div>
                  <div className="h-8 bg-muted/50 border border-border rounded-lg p-1 px-1.5 flex items-center gap-1.5">
                    <div className="h-4 w-4 rounded-full bg-border" />
                    <div className="h-1.5 w-6 bg-border rounded-full" />
                  </div>
                  <div className="h-8 bg-muted/50 border border-border rounded-lg p-1 px-1.5 flex items-center gap-1.5 opacity-50">
                    <div className="h-4 w-4 rounded-full bg-border" />
                    <div className="h-1.5 w-5 bg-border rounded-full" />
                  </div>
                </div>
              </div>

              {/* Column 2 */}
              <div className="space-y-2">
                <p className="text-xs font-extrabold text-foreground leading-none">Entrevista</p>
                <p className="text-[10px] text-muted-foreground font-semibold">8 cand.</p>
                <div className="space-y-1.5 pt-1">
                  <div className="h-8 bg-muted/50 border border-border rounded-lg p-1 px-1.5 flex items-center gap-1.5">
                    <div className="h-4 w-4 rounded-full bg-border" />
                    <div className="h-1.5 w-6 bg-border rounded-full" />
                  </div>
                </div>
              </div>

              {/* Column 3 */}
              <div className="space-y-2">
                <p className="text-xs font-extrabold text-foreground leading-none">Avaliação</p>
                <p className="text-[10px] text-muted-foreground font-semibold">5 cand.</p>
                <div className="space-y-1.5 pt-1">
                  <div className="h-8 bg-muted/50 border border-border rounded-lg p-1 px-1.5 flex items-center gap-1.5">
                    <div className="h-4 w-4 rounded-full bg-border" />
                    <div className="h-1.5 w-8 bg-border rounded-full" />
                  </div>
                </div>
              </div>

              {/* Column 4 */}
              <div className="space-y-2">
                <p className="text-xs font-extrabold text-foreground leading-none">Proposta</p>
                <p className="text-[10px] text-muted-foreground font-semibold">3 cand.</p>
                <div className="space-y-1.5 pt-1">
                  <div className="h-8 bg-muted/50 border border-border rounded-lg p-1 px-1.5 flex items-center gap-1.5">
                    <div className="h-4 w-4 rounded-full bg-border" />
                    <div className="h-1.5 w-6 bg-border rounded-full" />
                  </div>
                </div>
              </div>

              {/* Dotted paths */}
              <svg className="absolute inset-0 pointer-events-none w-full h-full" viewBox="0 0 400 140" fill="none" preserveAspectRatio="none">
                <path d="M 45,75 C 100,75 110,105 200,80" className="stroke-primary" strokeWidth="2" strokeDasharray="4 4" />
                <circle cx="45" cy="75" r="4" className="fill-primary" />
                <circle cx="200" cy="80" r="4" className="fill-primary" />
              </svg>

              {/* Floating Match Card */}
              <div className="absolute top-[55px] left-[130px] bg-card border border-border/80 shadow-xl shadow-primary/5 rounded-xl p-2 flex items-center gap-2.5 max-w-[160px] w-full z-10 transition-transform hover:-translate-y-0.5">
                <div className="h-7 w-7 rounded-full bg-border flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black text-foreground truncate leading-none">João Vieira</p>
                  <p className="text-[8px] text-muted-foreground truncate mt-1 font-semibold">Analista de Dados</p>
                </div>
                <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-black px-2 py-0.5 rounded-full">
                  85%
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column - Login Panel */}
        <section className="flex items-start justify-center w-full z-10 lg:pt-1">
          <div className="w-full max-w-[420px] bg-card border border-primary/20 rounded-[1.5rem] p-5 lg:p-7 shadow-2xl shadow-primary/8 ring-1 ring-primary/5 relative overflow-hidden backdrop-blur-xl">
            {/* Top tiny red gradient bar */}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />

            <div className="flex flex-col gap-1 pb-4 border-b border-border/50">
              <h2 className="text-[26px] sm:text-[28px] font-normal font-serif-display tracking-tight text-foreground">Acessar plataforma</h2>
              <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                Entre com sua conta corporativa para continuar no painel de recrutamento.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  E-mail
                </label>
                <div className="relative flex items-center">
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contato@empresa.com"
                    className="h-11 w-full bg-background border border-border rounded-xl px-4 pr-10 text-[13px] font-semibold text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 shadow-sm"
                  />
                  <Mail className="absolute right-4 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Senha
                </label>
                <div className="relative flex items-center">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="h-11 w-full bg-background border border-border rounded-xl px-4 pr-10 text-[13px] font-semibold text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-4 text-muted-foreground hover:text-foreground transition-colors outline-none"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error ? (
                <Alert variant="destructive" className="border-destructive/20 bg-destructive/5 text-destructive rounded-xl p-3 mt-1">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs font-semibold">{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button 
                type="submit" 
                disabled={loading} 
                className="h-11 mt-1 text-[13px] font-bold tracking-wide bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 group transition-all duration-300"
              >
                {loading ? "Entrando…" : "Entrar no painel"}
                {!loading && <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />}
              </Button>
            </form>

            <div className="flex items-center gap-3 my-4">
              <span className="h-px flex-1 bg-border/50" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">ou entrar com</span>
              <span className="h-px flex-1 bg-border/50" />
            </div>

            <div className="flex justify-center w-full">
              <GoogleSignInButton
                disabled={loading}
                onCredential={handleGoogleCredential}
                onError={(message) => setError(message)}
              />
            </div>

            <div className="flex items-start gap-2.5 text-[10.5px] leading-relaxed text-muted-foreground font-medium mt-4 bg-secondary/50 border border-border/50 p-3 rounded-xl">
              <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p>
                Apenas contas corporativas com final <strong className="text-foreground font-bold">@redemarajo.com.br</strong> possuem acesso via Google.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Checklist Section - Full width, below the fold */}
      <section className="w-full border-t border-border/30 bg-card/20 py-8 lg:py-10 z-10">
        <div className="w-full max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 max-w-4xl mx-auto">
            {[
              { id: "01. Pipeline", label: "Triagem unificada de perfis", icon: <Layers className="h-4 w-4 text-primary" /> },
              { id: "02. Candidatos", label: "Histórico e currículos centralizados", icon: <Users className="h-4 w-4 text-primary" /> },
              { id: "03. Agenda", label: "Entrevistas e feedbacks unificados", icon: <Calendar className="h-4 w-4 text-primary" /> },
              { id: "04. Decisão", label: "Fórmula de matching com IA", icon: <Target className="h-4 w-4 text-primary" /> },
            ].map((item) => (
              <div key={item.id} className="flex gap-3 items-start bg-card/50 border border-border/50 p-4 rounded-2xl backdrop-blur-sm shadow-sm transition-all duration-300 hover:border-primary/20 hover:shadow-md">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/5 border border-primary/10">
                  {item.icon}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-black text-foreground leading-none">{item.id}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground font-semibold mt-1">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full text-center py-3 border-t border-border/40 shrink-0 bg-card/30 backdrop-blur-sm z-10">
        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
          © {new Date().getFullYear()} Marajó RH IA · Sistema Operacional Corporativo · V1.0
        </p>
      </footer>
    </div>
  );
}
