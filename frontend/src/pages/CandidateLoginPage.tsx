import { Loader2, LogIn, ShieldCheck, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { candidatePortalService } from "../services/candidatePortalService";

export function CandidateLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--bg))] px-4 py-10 sm:px-6 lg:px-8">
      {/* Background Orbs for Premium Look */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-[hsl(var(--primary)/0.15)] blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-[hsl(var(--brand-glow)/0.1)] blur-[120px]" />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center justify-center gap-8 lg:min-h-[80vh] lg:flex-row lg:gap-12">
        {/* Left Side: Brand & Info */}
        <div className="flex w-full flex-col gap-6 lg:w-1/2">
          <div className="space-y-4 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--primary)/0.1)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--primary))]">
              <ShieldCheck className="h-4 w-4" />
              Ambiente Seguro
            </div>
            <h1 className="font-heading text-4xl font-extrabold tracking-tight text-[hsl(var(--text))] sm:text-5xl lg:text-6xl">
              Acompanhe sua <span className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--brand-glow))] bg-clip-text text-transparent">candidatura</span>
            </h1>
            <p className="text-lg text-[hsl(var(--text-muted))] sm:text-xl">
              Entre para gerenciar seu currículo, acompanhar o status dos processos e realizar testes comportamentais.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { title: "Status em tempo real", desc: "Veja onde você está no processo." },
              { title: "Gestão de Currículo", desc: "Mantenha seus dados sempre atualizados." },
            ].map((item, i) => (
              <div key={i} className="rounded-2xl border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface)/0.5)] p-5 backdrop-blur-sm transition-all hover:border-[hsl(var(--primary)/0.3)]">
                <p className="font-bold text-[hsl(var(--text))]">{item.title}</p>
                <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="w-full max-w-md lg:w-1/2">
          <Card className="relative overflow-hidden border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface)/0.8)] shadow-2xl backdrop-blur-md">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--brand-glow))]" />
            
            <CardHeader className="space-y-1 pt-8">
              <CardTitle className="text-2xl font-bold tracking-tight">Entrar no Portal</CardTitle>
              <CardDescription>Use seu e-mail e senha cadastrados.</CardDescription>
            </CardHeader>
            
            <CardContent className="pb-8">
              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                <div className="space-y-2">
                  <label htmlFor="candidate-login-email" className="text-sm font-semibold text-[hsl(var(--text))]">
                    E-mail
                  </label>
                  <Input
                    id="candidate-login-email"
                    type="email"
                    placeholder="exemplo@email.com"
                    className="h-12 border-[hsl(var(--border)/0.8)] bg-[hsl(var(--bg)/0.5)] focus-visible:ring-[hsl(var(--primary))]"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="candidate-login-password" className="text-sm font-semibold text-[hsl(var(--text))]">
                      Senha
                    </label>
                    <Link to="#" className="text-xs font-medium text-[hsl(var(--primary))] hover:underline">
                      Esqueceu a senha?
                    </Link>
                  </div>
                  <Input
                    id="candidate-login-password"
                    type="password"
                    placeholder="••••••••"
                    className="h-12 border-[hsl(var(--border)/0.8)] bg-[hsl(var(--bg)/0.5)] focus-visible:ring-[hsl(var(--primary))]"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                {errorMessage ? (
                  <div className="animate-in fade-in slide-in-from-top-1 rounded-xl border border-[hsl(var(--danger)/0.2)] bg-[hsl(var(--danger-soft))] px-4 py-3 text-sm font-medium text-[hsl(var(--danger))]">
                    {errorMessage}
                  </div>
                ) : null}

                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="h-12 w-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--brand-glow))] text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <LogIn className="mr-2 h-5 w-5" />
                  )}
                  Acessar minha conta
                </Button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[hsl(var(--border)/0.5)]"></span>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[hsl(var(--surface))] px-2 text-[hsl(var(--text-muted))]">Novo por aqui?</span>
                  </div>
                </div>

                <Button 
                  variant="outline" 
                  asChild
                  className="h-12 w-full border-[hsl(var(--border))] hover:bg-[hsl(var(--accent-soft))] hover:text-[hsl(var(--primary))]"
                >
                  <Link to="/candidato/cadastro">
                    Criar meu cadastro
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </form>
            </CardContent>
          </Card>
          
          <p className="mt-8 text-center text-xs text-[hsl(var(--text-muted))]">
            Protegido por criptografia de ponta a ponta. 
            <br />
            © 2026 Marajó RH. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
