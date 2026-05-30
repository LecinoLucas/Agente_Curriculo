import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  AlertCircle,
  Eye,
  EyeOff,
  User,
  Mail,
  Shield,
  Sparkles,
  BarChart,
  Users,
  ShieldCheck,
  Lock,
  ArrowRightToLine,
  TrendingUp,
  CheckCircle2
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
    <div className="min-h-screen w-full relative overflow-x-hidden font-sans text-foreground selection:bg-[#8a1c31]/10 selection:text-[#8a1c31] flex flex-col bg-[#FDFBF7]">
      
      {/* Institutional wave corner */}
      <div className="absolute left-0 top-0 z-0 hidden h-[92px] w-[170px] overflow-hidden pointer-events-none lg:block">
        <svg viewBox="0 0 170 92" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M0 0H170C158 21 150 34 132 43C110 54 88 48 67 62C45 77 24 84 0 88V0Z"
            fill="#4A0E1A"
          />
          <path
            d="M0 0H148C135 22 126 34 108 43C86 54 65 51 45 65C29 76 14 80 0 83V0Z"
            fill="#751227"
            opacity="0.58"
          />
          <path
            d="M0 0H122C111 20 101 31 84 38C66 46 49 46 31 57C18 65 8 69 0 70V0Z"
            fill="#8a1c31"
            opacity="0.34"
          />
        </svg>
      </div>

      {/* Main Container - Locked height on desktop to prevent scrollbars */}
      <main className="w-full max-w-[1440px] mx-auto flex-1 flex flex-col lg:flex-row relative z-10">
        
        {/* Left Column - Hero */}
        <div className="hidden lg:flex w-full lg:w-[50%] flex-col justify-between py-8 px-10 xl:pl-16 xl:pr-8 relative h-full shrink-0 z-10 overflow-hidden">
          
          {/* Header Logo - Nested elegantly inside the SVG wave */}
          <div className="relative pl-0 pt-2">
            <div className="flex items-center gap-3.5 text-[#1a0509]">
              <div className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-xl bg-[#751227] text-xl font-bold shadow-md border border-white/10">
                RA
              </div>
              <div className="flex flex-col text-left">
                <span className="font-sans text-[22px] font-bold leading-none tracking-tight">
                  Maraj<span className="relative inline-block after:content-['´'] after:absolute after:-top-[5px] after:left-[2px] after:text-[12px] after:font-bold after:text-[#1a0509] after:select-none after:pointer-events-none">o</span> RH
                </span>
                <span className="text-[10px] text-[#751227]/70 uppercase tracking-[0.18em] mt-1.5 font-bold">
                  ATS & RECRUTAMENTO IA
                </span>
              </div>
            </div>
          </div>
          
          {/* Institutional Content */}
          <div className="max-w-[460px] my-auto py-4">
             {/* Badge */}
             <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#FDF0EE]/85 border border-[#e8dcdc]/60 px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-widest text-[#751227] shadow-sm">
               <Sparkles className="h-3 w-3" />
               MARAJÓ RH AI SYSTEM
             </div>

             {/* Headline */}
             <h1 className="font-serif-display text-[38px] xl:text-[48px] font-bold tracking-tight text-[#1a0509] leading-[1.1] mb-5">
               Recrutamento com mais contexto, menos retrabalho.
             </h1>

             {/* Subtitle */}
             <p className="text-[14px] font-medium text-[#5c4a4d] leading-relaxed mb-6">
               Centralize vagas, candidatos, pipeline e decisões em uma plataforma inteligente que transforma dados em contratações de qualidade.
             </p>

             {/* Benefit Stacked Container */}
             <div className="bg-white/80 border border-[#e8dcdc] backdrop-blur-sm rounded-2xl p-5 shadow-sm space-y-4">
               {/* Benefit 1 */}
               <div className="flex items-start gap-3.5">
                 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#5c091d] text-white shadow-sm">
                   <Users className="h-4.5 w-4.5" />
                 </div>
                 <div className="flex flex-col justify-center">
                   <h4 className="text-[12px] font-bold text-[#3d0815] leading-tight">Pipeline organizado</h4>
                   <p className="text-[10px] text-[#5c4a4d] font-medium mt-0.5 leading-snug">
                     Acompanhe cada etapa do processo seletivo com total visibilidade.
                   </p>
                 </div>
               </div>
               {/* Benefit 2 */}
               <div className="flex items-start gap-3.5">
                 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#5c091d] text-white shadow-sm">
                   <BarChart className="h-4.5 w-4.5" />
                 </div>
                 <div className="flex flex-col justify-center">
                   <h4 className="text-[12px] font-bold text-[#3d0815] leading-tight">Decisões orientadas por IA</h4>
                   <p className="text-[10px] text-[#5c4a4d] font-medium mt-0.5 leading-snug">
                     Insights inteligentes para avaliar candidatos com mais precisão.
                   </p>
                 </div>
               </div>
               {/* Benefit 3 */}
               <div className="flex items-start gap-3.5">
                 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#5c091d] text-white shadow-sm">
                   <ShieldCheck className="h-4.5 w-4.5" />
                 </div>
                 <div className="flex flex-col justify-center">
                   <h4 className="text-[12px] font-bold text-[#3d0815] leading-tight">Segurança e conformidade</h4>
                   <p className="text-[10px] text-[#5c4a4d] font-medium mt-0.5 leading-snug">
                     Proteção de dados e aderência à LGPD em todas as etapas.
                   </p>
                 </div>
               </div>
             </div>
          </div>
          
          <div className="h-4" />
        </div>

        {/* Dashboard Graphic Mock - Center/Left position, rotated and translucent */}
        <div className="hidden xl:block absolute left-[44%] top-[50%] -translate-y-1/2 w-[440px] pointer-events-none transform -rotate-[3deg] z-0 opacity-30 select-none transition-all duration-300">
           <div className="w-[440px] flex flex-col gap-4">
              {/* Decoration dots */}
              <div className="flex gap-1.5 mb-1 pl-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#8a1c31]/30"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-[#8a1c31]/30"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-[#8a1c31]/30"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-[#8a1c31]/30"></div>
              </div>

              {/* Visão Geral Card */}
              <div className="w-full bg-white/50 backdrop-blur-[2.5px] rounded-3xl p-5 border border-white/40 shadow-sm">
                <p className="text-[10px] font-bold text-gray-400 mb-3">Visão geral</p>
                
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-white/80 rounded-2xl p-3 border border-gray-100/50 shadow-sm">
                    <p className="text-[9px] font-bold text-gray-400 mb-1">Vagas abertas</p>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-serif text-[#1a0509]">28</span>
                      <div className="flex items-center gap-0.5 bg-[#FDF0EE] text-[#751227] px-1.5 py-0.5 rounded-full text-[8px] font-bold mb-1">
                        <TrendingUp className="h-2 w-2" /> 12%
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#FCF5F5]/80 rounded-2xl p-3 border border-gray-100/50 shadow-sm">
                    <p className="text-[9px] font-bold text-gray-400 mb-1">Candidatos no pipeline</p>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-serif text-[#1a0509]">128</span>
                      <div className="flex items-center gap-0.5 bg-white/80 text-emerald-600 px-1.5 py-0.5 rounded-full text-[8px] font-bold mb-1 shadow-sm">
                        <TrendingUp className="h-2 w-2" /> 8%
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] font-bold text-gray-400 mb-2.5">Pipeline</p>
                <div className="bg-white/80 rounded-2xl p-3.5 border border-gray-100/50 shadow-sm space-y-2">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-[#5c4a4d]">
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#8a1c31]"></div> Triagem</div>
                    <span className="text-gray-400">42</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-semibold text-[#5c4a4d]">
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> Entrevista</div>
                    <span className="text-gray-400">36</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-semibold text-[#5c4a4d]">
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> Avaliação</div>
                    <span className="text-gray-400">28</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-semibold text-[#5c4a4d]">
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> Proposta</div>
                    <span className="text-gray-400">12</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-semibold text-[#5c4a4d]">
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Contratados</div>
                    <span className="text-gray-400">10</span>
                  </div>
                </div>
              </div>

              {/* Atividades Recentes Card */}
              <div className="w-full bg-white/40 backdrop-blur-[2px] rounded-3xl p-5 border border-white/20 shadow-sm mt-1">
                <p className="text-[10px] font-bold text-gray-400 mb-3">Atividades recentes</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-[#FDF0EE]/80 flex items-center justify-center text-[#751227] shrink-0"><Users className="h-3 w-3" /></div>
                    <div>
                      <p className="text-[9px] font-bold text-[#1a0509]">Entrevista agendada</p>
                      <p className="text-[8px] text-gray-400 font-medium">para Analista de RH Sênior</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-white/80 flex items-center justify-center text-gray-500 shrink-0"><User className="h-3 w-3" /></div>
                    <div>
                      <p className="text-[9px] font-bold text-[#1a0509]">Novo candidato adicionado</p>
                      <p className="text-[8px] text-gray-400 font-medium">para Desenv. Full Stack</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-emerald-50/80 flex items-center justify-center text-emerald-600 shrink-0"><CheckCircle2 className="h-3 w-3" /></div>
                    <div>
                      <p className="text-[9px] font-bold text-[#1a0509]">Avaliação concluída</p>
                      <p className="text-[8px] text-gray-400 font-medium">para Product Designer</p>
                    </div>
                  </div>
                </div>
              </div>
           </div>
        </div>

        {/* Right Column - Login Panel */}
        <div className="w-full lg:w-[50%] flex flex-col items-center justify-center px-5 py-10 lg:px-10 lg:py-8 xl:pr-20 relative z-10 lg:min-h-full lg:overflow-y-auto">
          
          {/* Portal do Candidato — fixed discreetly at top-right corner */}
          <div className="absolute top-5 right-5 xl:right-8 z-20 hidden lg:flex">
            <Link
              to="/candidato"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-[#5c091d]/12 bg-white/60 px-3 text-[10px] font-semibold text-[#74676a] shadow-sm backdrop-blur-sm transition-all hover:border-[#8a1c31]/25 hover:bg-white hover:text-[#751227]"
            >
              <User className="h-3 w-3" />
              <span>Portal do Candidato</span>
            </Link>
          </div>

          {/* Mobile: Portal button visible inline */}
          <div className="mb-5 flex w-full max-w-[380px] justify-end lg:hidden">
            <Link
              to="/candidato"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#5c091d]/16 bg-white/72 px-3.5 text-[11px] font-bold text-[#4A0E1A] shadow-[0_10px_24px_-20px_rgba(74,14,26,0.9)] backdrop-blur transition-all hover:border-[#8a1c31]/35 hover:bg-white hover:text-[#751227] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8a1c31]/15"
            >
              <User className="h-3.5 w-3.5" />
              <span>Portal do Candidato</span>
            </Link>
          </div>

          {/* Login Card */}
          <div className="w-full max-w-[380px] overflow-hidden rounded-[1.75rem] border border-[#7A1830]/25 bg-[#fffaf8] shadow-[0_24px_70px_-24px_rgba(74,14,26,0.55)] flex flex-col relative transition-all duration-300 ease-out hover:border-[#8a1c31]/45 hover:shadow-[0_28px_80px_-24px_rgba(74,14,26,0.68)]">
            <div className="h-1.5 w-full bg-gradient-to-r from-[#4A0E1A] via-[#8a1c31] to-[#C1121F]" />
            <div className="p-6 xl:p-7">
            
            {/* Mobile Branding (Visible only on mobile, required by E2E tests) */}
            <div className="lg:hidden flex items-center justify-center gap-2 mb-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#751227] text-xs font-bold text-white shadow-md">
                RA
              </div>
              <span className="font-sans text-base font-bold text-[#1a0509]">
                Maraj<span className="relative inline-block after:content-['´'] after:absolute after:-top-[4px] after:left-[1.5px] after:text-[10px] after:font-bold after:text-[#1a0509] after:select-none after:pointer-events-none">o</span> RH
              </span>
            </div>

            {/* Circular Logo at Top Center */}
            <div className="flex flex-col items-center text-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4A0E1A] to-[#8a1c31] text-lg font-serif-display font-bold text-white shadow-[0_14px_30px_-16px_rgba(74,14,26,0.9)] mb-3">
                RA
              </div>
              <h2 className="text-[24px] xl:text-[26px] font-serif-display font-bold tracking-tight text-[#1a0509]">Acessar plataforma</h2>
              <p className="text-[12px] font-medium text-[#74676a] mt-1.5 leading-relaxed px-2">
                Entre com sua conta corporativa para continuar no painel de recrutamento.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-[11px] font-bold text-[#1a0509]">
                  E-mail
                </label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-4 h-4 w-4 text-[#8a8183] pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="h-11 w-full bg-white border border-[#d9c6c8] rounded-xl pl-11 pr-4 text-[13px] font-semibold text-[#1a0509] placeholder:text-[#a8a1a3] outline-none focus:border-[#8a1c31] focus:ring-4 focus:ring-[#8a1c31]/10 transition-all duration-200"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-[11px] font-bold text-[#1a0509]">
                    Senha
                  </label>
                  <Link to="#" className="text-[11px] font-bold text-[#8a1c31] hover:text-[#5c091d] transition-colors">
                    Esqueceu a senha?
                  </Link>
                </div>
                <div className="relative flex items-center">
                  <Lock className="absolute left-4 h-4 w-4 text-[#8a8183] pointer-events-none" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="h-11 w-full bg-white border border-[#d9c6c8] rounded-xl pl-11 pr-12 text-[13px] font-semibold text-[#1a0509] placeholder:text-[#a8a1a3] outline-none focus:border-[#8a1c31] focus:ring-4 focus:ring-[#8a1c31]/10 transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((c) => !c)}
                    className="absolute right-4 text-[#a8a1a3] hover:text-[#1a0509] transition-colors outline-none h-8 w-8 flex items-center justify-center"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>

              {error ? (
                <Alert variant="destructive" className="border-red-500/20 bg-red-50 text-red-700 rounded-xl p-2.5">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs font-bold ml-1">{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button 
                type="submit" 
                disabled={loading} 
                className="h-11 w-full mt-2 text-[13px] font-extrabold tracking-wide bg-gradient-to-r from-[#4A0E1A] via-[#7A1830] to-[#C1121F] hover:brightness-105 text-white rounded-xl flex items-center justify-center gap-2 shadow-[0_16px_34px_-18px_rgba(74,14,26,0.95)] hover:shadow-[0_18px_40px_-18px_rgba(74,14,26,1)] transition-all duration-300"
              >
                {!loading && <ArrowRightToLine className="h-4 w-4" />}
                {loading ? "Entrando no painel…" : "Entrar no painel"}
              </Button>
            </form>

            <div className="flex items-center gap-4 my-4">
              <span className="h-[1px] flex-1 bg-[#e8dcdc]" />
              <span className="text-[11px] text-[#a8a1a3] font-medium">ou entrar com</span>
              <span className="h-[1px] flex-1 bg-[#e8dcdc]" />
            </div>

            <div className="w-full flex justify-center">
              <GoogleSignInButton
                disabled={loading}
                onCredential={handleGoogleCredential}
                onError={(message) => setError(message)}
              />
            </div>

            <div className="flex items-start gap-2.5 text-[10px] leading-snug text-[#74676a] font-medium mt-4 bg-[#F7E9E8] border border-[#e4caca] p-3 rounded-xl">
              <Shield className="h-4.5 w-4.5 text-[#8a1c31] shrink-0" />
              <p>
                <strong className="text-[#3d0815] font-bold block mb-0.5">Acesso restrito a colaboradores autorizados.</strong>
                Ao continuar, você concorda com as políticas da empresa.
              </p>
            </div>
            </div>
          </div>

        </div>
      </main>

      {/* Global Footer */}
      <footer className="w-full text-center py-6 relative z-10 shrink-0 border-t border-[#e8dcdc]/30 bg-[#FDFBF7]/80 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-[11px] font-medium text-[#8a8183]">
          <div className="flex items-center gap-1.5 text-emerald-700">
            <Shield className="h-3.5 w-3.5" />
            <span>Proteção de dados em conformidade com a LGPD</span>
          </div>
          <span className="hidden sm:inline text-[#e8dcdc]">|</span>
          <span>© 2026 Marajó RH AI System. Todos os direitos reservados.</span>
        </div>
      </footer>
    </div>
  );
}
