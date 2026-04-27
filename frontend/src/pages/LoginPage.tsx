import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "../features/auth/useAuth";

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isDev = import.meta.env.DEV;

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/pipeline";

  const [email, setEmail] = useState("admin@resume.ai");
  const [password, setPassword] = useState("Admin123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate(from, { replace: true });
  }, [from, isAuthenticated, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao autenticar");
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
              Resume AI System
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

          <p className="text-xs text-slate-300">© {new Date().getFullYear()} Resume AI · Todos os direitos reservados</p>
        </section>

        <section className="flex flex-col justify-center px-6 py-12 sm:px-8 lg:px-12">
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
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20"
                />
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

            <p className="text-center text-xs text-gray-500">
              Seu acesso define quais áreas da plataforma estarão disponíveis.
            </p>

            {isDev ? (
              <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 px-4 py-3">
                <p className="mb-1 text-xs font-semibold text-amber-800">Acesso de desenvolvimento</p>
                <p className="text-xs text-amber-700">E-mail: admin@resume.ai</p>
                <p className="text-xs text-amber-700">Senha: Admin123!</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
