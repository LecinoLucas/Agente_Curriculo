import { Loader2, LogIn, ShieldCheck } from "lucide-react";
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
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-none bg-gradient-to-br from-primary to-sky-700 text-primary-foreground shadow-sm">
          <CardHeader>
            <CardTitle className="text-3xl font-semibold tracking-tight">
              Acompanhe sua candidatura
            </CardTitle>
            <CardDescription className="text-primary-foreground/80">
              Entre com e-mail e senha para acessar sua área do candidato.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5" />
                <div>
                  <p className="text-sm font-semibold">Acesso separado do painel admin</p>
                  <p className="mt-1 text-sm text-primary-foreground/75">
                    Seu login de candidato não dá acesso às rotas administrativas.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Login do candidato</CardTitle>
            <CardDescription>Use seu e-mail e senha cadastrados.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit} noValidate>
              <div className="space-y-2">
                <label htmlFor="candidate-login-email" className="text-sm font-medium text-foreground">
                  E-mail
                </label>
                <Input
                  id="candidate-login-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="candidate-login-password" className="text-sm font-medium text-foreground">
                  Senha
                </label>
                <Input
                  id="candidate-login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              {errorMessage ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                  Entrar
                </Button>
              </div>

              <div className="text-sm text-muted-foreground">
                Ainda não tem cadastro?{" "}
                <Link to="/candidato/cadastro" className="font-medium text-primary hover:underline">
                  Quero me candidatar
                </Link>
                .
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
