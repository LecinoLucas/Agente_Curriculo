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
    <div className="h-[100dvh] overflow-hidden bg-[#faf8f6] text-[#24160e] flex flex-col justify-between selection:bg-[#5c061a]/10 selection:text-[#5c061a]">
      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-2.5 lg:py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#9e1b24] text-xs font-black text-white shadow-sm">
            RA
          </span>
          <div className="flex flex-col text-left">
            <span className="font-heading text-[15px] font-black leading-none tracking-tight text-slate-900">
              Marajo RH
            </span>
            <span className="text-[11px] text-slate-400 uppercase tracking-widest mt-0.5 font-bold">
              ATS & Recrutamento IA
            </span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          asChild
          className="gap-2 text-[12px] font-bold uppercase tracking-wider text-slate-500 hover:bg-[#5c061a]/5 hover:text-[#9e1b24] rounded-lg transition-colors duration-200"
        >
          <Link to="/candidato">
            <User className="h-4 w-4 text-[#9e1b24]" />
            Portal do candidato
          </Link>
        </Button>
      </header>

      {/* Main Grid */}
      <main className="w-full max-w-7xl mx-auto px-6 py-1 lg:py-2 lg:px-12 grid lg:grid-cols-[1.15fr_0.85fr] gap-6 lg:gap-12 items-center flex-1 min-h-0 overflow-hidden">
        {/* Left Column - Editorial Showcase (Hidden on Mobile/Tablet) */}
        <section className="hidden lg:flex flex-col justify-center gap-5 lg:gap-6 h-full py-1 overflow-hidden">
          <div className="flex flex-col gap-2.5">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#9e1b24]/5 border border-[#9e1b24]/10 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-[#9e1b24]">
              <Sparkles className="h-2.5 w-2.5" />
              Marajo RH AI System
            </span>
            <h1 className="font-serif-display text-3.5xl lg:text-4xl xl:text-[42px] font-normal leading-[1.1] tracking-tight text-slate-900">
              Recrutamento com <br />
              <span className="not-italic font-bold text-[#9e1b24]">mais contexto</span>,<br />
              menos retrabalho.
            </h1>
            <p className="max-w-md text-xs lg:text-sm leading-relaxed text-slate-500">
              Centralize vagas, candidatos, pipeline e decisões em uma operação mais clara para o RH.
            </p>
          </div>

          {/* Pipeline Mockup Card */}
          <div className="w-full max-w-md bg-white border border-[#eae6e2] rounded-[1.25rem] p-3.5 shadow-sm relative overflow-hidden">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Pipeline de Recrutamento</p>
            
            <div className="grid grid-cols-4 gap-2 relative min-h-[100px]">
              {/* Column 1 */}
              <div className="space-y-1.5">
                <p className="text-[11.5px] font-extrabold text-slate-800 leading-none">Triagem</p>
                <p className="text-[9px] text-slate-400 font-semibold">12 cand.</p>
                <div className="space-y-1 pt-0.5">
                  <div className="h-6.5 bg-slate-50/50 border border-slate-100 rounded-md p-0.5 px-1 flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-slate-200" />
                    <div className="h-1 w-7 bg-slate-200 rounded-full" />
                  </div>
                  <div className="h-6.5 bg-slate-50/50 border border-slate-100 rounded-md p-0.5 px-1 flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-slate-200" />
                    <div className="h-1 w-5 bg-slate-200 rounded-full" />
                  </div>
                  <div className="h-6.5 bg-slate-50/50 border border-slate-100 rounded-md p-0.5 px-1 flex items-center gap-1 opacity-50">
                    <div className="h-3 w-3 rounded-full bg-slate-200" />
                    <div className="h-1 w-4 bg-slate-200 rounded-full" />
                  </div>
                </div>
              </div>

              {/* Column 2 */}
              <div className="space-y-1.5">
                <p className="text-[11.5px] font-extrabold text-slate-800 leading-none">Entrevista</p>
                <p className="text-[9px] text-slate-400 font-semibold">8 cand.</p>
                <div className="space-y-1 pt-0.5">
                  <div className="h-6.5 bg-slate-50/50 border border-slate-100 rounded-md p-0.5 px-1 flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-slate-200" />
                    <div className="h-1 w-5 bg-slate-200 rounded-full" />
                  </div>
                </div>
              </div>

              {/* Column 3 */}
              <div className="space-y-1.5">
                <p className="text-[11.5px] font-extrabold text-slate-800 leading-none">Avaliação</p>
                <p className="text-[9px] text-slate-400 font-semibold">5 cand.</p>
                <div className="space-y-1 pt-0.5">
                  <div className="h-6.5 bg-slate-50/50 border border-slate-100 rounded-md p-0.5 px-1 flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-slate-200" />
                    <div className="h-1 w-7 bg-slate-200 rounded-full" />
                  </div>
                </div>
              </div>

              {/* Column 4 */}
              <div className="space-y-1.5">
                <p className="text-[11.5px] font-extrabold text-slate-800 leading-none">Proposta</p>
                <p className="text-[9px] text-slate-400 font-semibold">3 cand.</p>
                <div className="space-y-1 pt-0.5">
                  <div className="h-6.5 bg-slate-50/50 border border-slate-100 rounded-md p-0.5 px-1 flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-slate-200" />
                    <div className="h-1 w-5 bg-slate-200 rounded-full" />
                  </div>
                </div>
              </div>

              {/* Dotted paths */}
              <svg className="absolute inset-0 pointer-events-none w-full h-full" viewBox="0 0 380 125" fill="none" preserveAspectRatio="none">
                <path d="M 40,65 C 90,65 95,95 185,70" stroke="#9e1b24" strokeWidth="1.5" strokeDasharray="3 3" />
                <circle cx="40" cy="65" r="3" fill="#9e1b24" />
                <circle cx="185" cy="70" r="3" fill="#9e1b24" />
              </svg>

              {/* Floating Match Card */}
              <div className="absolute top-[50px] left-[110px] bg-white border border-slate-200/80 shadow-lg rounded-xl p-1.5 flex items-center gap-2 max-w-[145px] w-full z-10">
                <div className="h-5 w-5 rounded-full bg-slate-300 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[8.5px] font-black text-slate-800 truncate leading-none">João Vieira</p>
                  <p className="text-[7px] text-slate-400 truncate mt-0.5 font-semibold">Analista de Dados Pleno</p>
                </div>
                <div className="bg-emerald-50 text-emerald-600 text-[8.5px] font-black px-1.5 py-0.5 rounded-full">
                  85%
                </div>
              </div>
            </div>
          </div>

          {/* Checklist Footer items */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-3.5 border-t border-[#eae6e2] max-w-xl">
            {[
              { id: "01. Pipeline", label: "Triagem unificada de perfis", icon: <Layers className="h-3.5 w-3.5 text-[#9e1b24]" /> },
              { id: "02. Candidatos", label: "Histórico e currículos centralizados", icon: <Users className="h-3.5 w-3.5 text-[#9e1b24]" /> },
              { id: "03. Agenda", label: "Entrevistas e feedbacks unificados", icon: <Calendar className="h-3.5 w-3.5 text-[#9e1b24]" /> },
              { id: "04. Decisão", label: "Fórmula de matching com IA", icon: <Target className="h-3.5 w-3.5 text-[#9e1b24]" /> },
            ].map((item) => (
              <div key={item.id} className="flex flex-col gap-1.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#9e1b24]/5 border border-[#9e1b24]/10">
                  {item.icon}
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11.5px] font-black text-slate-900 leading-none">{item.id}</p>
                  <p className="text-[10.5px] leading-tight text-slate-400 font-semibold">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right Column - Login Panel */}
        <section className="flex items-center justify-center w-full">
          <div className="w-full max-w-[410px] bg-white border border-[#eae6e2] rounded-[1.5rem] p-6 lg:p-7 shadow-2xl relative overflow-hidden">
            {/* Top tiny red gradient bar */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#9e1b24]/30 to-transparent" />

            <div className="flex flex-col gap-0.5 pb-3 border-b border-slate-100">
              <h2 className="text-2xl sm:text-[26px] font-normal font-serif-display tracking-tight text-slate-900">Acessar plataforma</h2>
              <p className="text-[11.5px] sm:text-xs text-slate-400 leading-relaxed font-semibold">
                Entre com sua conta corporativa para continuar no painel de recrutamento.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 mt-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
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
                    className="h-10 w-full bg-slate-50/50 border border-[#eae6e2] rounded-xl px-3.5 pr-10 text-[13px] font-semibold text-slate-800 placeholder:text-slate-300 outline-none focus:border-[#9e1b24] focus:bg-white focus:ring-4 focus:ring-[#9e1b24]/5 transition-all duration-200"
                  />
                  <Mail className="absolute right-3.5 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
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
                    className="h-10 w-full bg-slate-50/50 border border-[#eae6e2] rounded-xl px-3.5 pr-10 text-[13px] font-semibold text-slate-800 placeholder:text-slate-300 outline-none focus:border-[#9e1b24] focus:bg-white focus:ring-4 focus:ring-[#9e1b24]/5 transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3.5 text-slate-300 transition hover:text-slate-500 outline-none"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {error ? (
                <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-700 rounded-xl p-3">
                  <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                  <AlertDescription className="text-xs font-semibold">{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button 
                type="submit" 
                disabled={loading} 
                className="h-10 mt-0.5 text-xs font-bold uppercase tracking-wider bg-[#9e1b24] hover:bg-[#82141b] text-white rounded-xl shadow-md flex items-center justify-center gap-2 group transition-all duration-200"
              >
                {loading ? "Entrando…" : "Entrar no painel"}
                {!loading && <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />}
              </Button>
            </form>

            <div className="flex items-center gap-3 my-3">
              <span className="h-px flex-1 bg-slate-100" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">ou entrar com</span>
              <span className="h-px flex-1 bg-slate-100" />
            </div>

            <div className="flex justify-center w-full">
              <GoogleSignInButton
                disabled={loading}
                onCredential={handleGoogleCredential}
                onError={(message) => setError(message)}
              />
            </div>

            <div className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-400 font-semibold mt-3.5 bg-slate-50/50 border border-slate-100 p-2.5 rounded-xl">
              <Shield className="h-3.5 w-3.5 text-[#9e1b24] shrink-0 mt-0.5" />
              <p>
                Apenas contas corporativas com final <strong className="text-slate-800 font-bold">@redemarajo.com.br</strong> possuem acesso via Google.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-2.5 lg:py-3 border-t border-[#eae6e2]/40 shrink-0">
        <p className="text-[9.5px] sm:text-[10.5px] text-slate-400 font-bold uppercase tracking-wider">
          © {new Date().getFullYear()} Marajo RH IA · Sistema Operacional Corporativo · V1.0
        </p>
      </footer>
    </div>
  );
}
