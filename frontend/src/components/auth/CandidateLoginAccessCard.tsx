import { Loader2, LogIn, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { GoogleSignInButton } from "./GoogleSignInButton";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { candidateAuthService } from "../../services/candidateAuthService";
import { candidatePortalService } from "../../services/candidatePortalService";

const GOOGLE_CANDIDATE_STORAGE_KEY = "candidate-google-auth";

export function CandidateLoginAccessCard() {
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
    <Card className="relative overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-xl shadow-primary/5 border-t-2 border-t-primary">
      <CardHeader className="space-y-1 pt-6 pb-4 text-center">
        <CardTitle className="text-xl font-bold tracking-tight text-foreground">Entrar no Portal</CardTitle>
        <CardDescription className="text-xs font-semibold text-muted-foreground">
          Use seus dados para continuar.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="px-6 pb-6 space-y-6">
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-1.5">
            <label htmlFor="candidate-login-email" className="text-xs font-bold tracking-tight text-foreground">
              E-mail
            </label>
            <Input
              id="candidate-login-email"
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
              className="h-12 rounded-xl border-border bg-muted/20 px-4 text-xs font-semibold focus-visible:ring-primary transition-all"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="candidate-login-password" className="text-xs font-bold tracking-tight text-foreground">
                Senha
              </label>
              <Link to="#" className="text-[11px] font-bold text-primary transition-opacity hover:opacity-80">
                Esqueceu a senha?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="candidate-login-password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
                className="h-12 rounded-xl border-border bg-muted/20 pl-4 pr-12 text-xs font-semibold focus-visible:ring-primary transition-all"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
            <div className="animate-in fade-in slide-in-from-top-1 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-bold text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <Button 
            type="submit" 
            disabled={isSubmitting}
            className="h-14 w-full rounded-xl bg-gradient-to-r from-primary to-primary/80 text-sm font-bold text-white shadow-md shadow-primary/10 transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <LogIn className="mr-2 h-4 w-4" />
            )}
            Entrar no portal
          </Button>
        </form>

        <div className="space-y-4 pt-2 border-t border-border/40">
          <GoogleSignInButton
            disabled={isSubmitting}
            onCredential={handleGoogleCredential}
            onError={setErrorMessage}
          />
        </div>
      </CardContent>
      
      <div className="bg-muted/30 border-t border-border/50 p-6">
        <div className="flex flex-col items-center justify-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Ainda não tem cadastro?</span>
          <Link 
            to="/candidato/cadastro" 
            className="text-sm font-bold text-primary hover:text-primary/80 transition-colors"
          >
            Criar cadastro
          </Link>
        </div>
      </div>

      <div className="p-3 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 bg-muted/10 border-t border-border/20">
        <ShieldCheck className="h-3 w-3 text-emerald-500/70 shrink-0" />
        <span>Proteção LGPD</span>
      </div>
    </Card>
  );
}
