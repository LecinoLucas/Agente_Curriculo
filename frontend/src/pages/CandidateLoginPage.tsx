import { Loader2, LogIn, ShieldCheck, ArrowRight, Sparkles, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { GoogleSignInButton } from "../components/auth/GoogleSignInButton";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { candidateAuthService } from "../services/candidateAuthService";
import { candidatePortalService } from "../services/candidatePortalService";

const GOOGLE_CANDIDATE_STORAGE_KEY = "candidate-google-auth";

export function CandidateLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    setErrorMessage(null);
    if (!email.trim()) {
      setErrorMessage("E-mail é obrigatório.");
      return;
    }
    if (!password.trim()) {
      setErrorMessage("Senha é obrigatória.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await candidatePortalService.login({
        email: email.trim(),
        password,
      });
      navigate(response.redirect_to, { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "E-mail ou senha inválidos."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleLogin();
  };

  const handleGoogleCredential = async (idToken: string) => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const response = await candidateAuthService.googleLogin({ id_token: idToken });
      if (response.status === "authenticated") {
        sessionStorage.removeItem(GOOGLE_CANDIDATE_STORAGE_KEY);
        navigate(response.redirect_to, { replace: true });
        return;
      }

      sessionStorage.setItem(GOOGLE_CANDIDATE_STORAGE_KEY, JSON.stringify(response));
      navigate("/candidato/cadastro", {
        replace: true,
        state: { googleAuth: response },
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível concluir o login com Google."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--bg))] px-4 py-10 sm:px-6 lg:px-8">
      {/* Background Orbs */}
      <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[40rem] w-[40rem] rounded-full bg-[hsl(var(--primary)/0.08)] blur-[120px] animate-pulse" />
      <div className="pointer-events-none absolute right-[-5%] bottom-[-10%] h-[35rem] w-[35rem] rounded-full bg-[hsl(var(--brand-glow)/0.12)] blur-[100px]" />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center justify-center gap-8 lg:min-h-[85vh] lg:flex-row lg:gap-16">
        {/* Left Side: Brand & Info */}
        <div className="flex w-full flex-col gap-8 lg:w-1/2 animate-in fade-in slide-in-from-left-8 duration-700">
          <div className="space-y-6 text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start gap-2.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-lg font-bold text-white shadow-md">
                RA
              </div>
              <div className="flex flex-col text-left">
                <span className="font-heading text-base font-extrabold leading-tight text-[hsl(var(--text))]">
                  Marajó RH
                </span>
                <span className="text-[10px] text-[hsl(var(--text-muted))] leading-tight">
                  Recrutamento & Seleção
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.05)] px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--primary))]">
              <Sparkles className="h-3.5 w-3.5" />
              Ambiente Restrito
            </div>
            <h1 className="font-heading text-5xl font-extrabold tracking-tight text-[hsl(var(--text))] sm:text-6xl">
              Gerencie sua <span className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--brand-glow))] bg-clip-text text-transparent">carreira</span>
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-[hsl(var(--text-muted))] sm:text-xl">
              Acesse seu portal para acompanhar processos seletivos, realizar testes e manter seu perfil sempre atualizado.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { title: "Status Real-time", desc: "Acompanhe cada etapa da sua jornada." },
              { title: "Testes Online", desc: "Realize avaliações técnicas e comportamentais." },
            ].map((item, i) => (
              <div key={i} className="group rounded-[1.5rem] border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--surface)/0.5)] p-6 backdrop-blur-md transition-all hover:border-[hsl(var(--primary)/0.3)] hover:bg-[hsl(var(--surface)/0.8)]">
                <p className="font-bold tracking-tight text-[hsl(var(--text))] group-hover:text-[hsl(var(--primary))] transition-colors">{item.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--text-muted))]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="w-full max-w-md lg:w-1/2 animate-in fade-in slide-in-from-right-8 duration-700 delay-200">
          <Card className="relative overflow-hidden rounded-[2.5rem] border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface)/0.8)] shadow-2xl backdrop-blur-xl">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--brand-glow))]" />
            
            <CardHeader className="space-y-2 pt-10">
              <CardTitle className="text-3xl font-bold tracking-tight">Entrar no Portal</CardTitle>
              <CardDescription className="text-base">Bem-vindo de volta! Entre com seus dados.</CardDescription>
            </CardHeader>
            
            <CardContent className="pb-10">
              <form className="space-y-6" onSubmit={handleSubmit} noValidate>
                <div className="space-y-2">
                  <label htmlFor="candidate-login-email" className="text-sm font-bold tracking-tight text-[hsl(var(--text))]">
                    E-mail
                  </label>
                  <Input
                    id="candidate-login-email"
                    type="email"
                    placeholder="seu@email.com"
                    autoComplete="email"
                    className="h-12 rounded-xl border-[hsl(var(--border)/0.8)] bg-[hsl(var(--bg)/0.5)] px-4 focus-visible:ring-[hsl(var(--primary))]"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="candidate-login-password" className="text-sm font-bold tracking-tight text-[hsl(var(--text))]">
                      Senha
                    </label>
                    <Link to="#" className="text-xs font-bold text-[hsl(var(--primary))] transition-opacity hover:opacity-80">
                      Esqueceu a senha?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="candidate-login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="h-12 rounded-xl border-[hsl(var(--border)/0.8)] bg-[hsl(var(--bg)/0.5)] pl-4 pr-12 focus-visible:ring-[hsl(var(--primary))]"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-muted))/0.2] hover:text-[hsl(var(--text))] transition-colors"
                      title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {errorMessage ? (
                  <div className="animate-in fade-in slide-in-from-top-1 rounded-xl border border-[hsl(var(--danger)/0.2)] bg-[hsl(var(--danger-soft))] px-4 py-3 text-sm font-bold text-[hsl(var(--danger))]">
                    {errorMessage}
                  </div>
                ) : null}

                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="h-14 w-full rounded-2xl bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--brand-glow))] text-lg font-bold text-white shadow-xl shadow-[hsl(var(--primary)/0.2)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <LogIn className="mr-2 h-5 w-5" />
                  )}
                  Acessar minha conta
                </Button>

                <GoogleSignInButton
                  disabled={isSubmitting}
                  onCredential={handleGoogleCredential}
                  onError={setErrorMessage}
                />

                <div className="relative my-8">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[hsl(var(--border)/0.4)]"></span>
                  </div>
                  <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-widest">
                    <span className="bg-[hsl(var(--surface))] px-4 text-[hsl(var(--text-muted))]">Novo por aqui?</span>
                  </div>
                </div>

                <Button 
                  variant="outline" 
                  asChild
                  className="h-14 w-full rounded-2xl border-2 border-[hsl(var(--primary))] bg-transparent text-lg font-bold text-[hsl(var(--primary))] transition-all hover:bg-[hsl(var(--primary))] hover:text-white active:scale-[0.98]"
                >
                  <Link to="/candidato/cadastro">
                    Criar meu cadastro
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </form>
            </CardContent>
          </Card>
          
          <div className="mt-10 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))]">
              <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
              Proteção de dados LGPD
            </div>
            <p className="text-center text-xs font-medium text-[hsl(var(--text-muted))]">
              © {new Date().getFullYear()} Marajó RH. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
