import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../features/auth/useAuth";

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isDev = import.meta.env.DEV;

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/dashboard";

  const [email, setEmail] = useState("admin@resume.ai");
  const [password, setPassword] = useState("Admin123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [from, isAuthenticated, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao autenticar";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-layout">
        <section className="auth-hero">
          <div className="auth-hero-badge">Resume AI System</div>
          <h1>Recrutamento com mais contexto, menos retrabalho.</h1>
          <p>
            Centralize currículos, candidatos, vagas e análises em uma operação mais clara para o time
            de recrutamento.
          </p>

          <div className="auth-hero-points">
            <div className="auth-hero-point">
              <strong>Triagem organizada</strong>
              <span>Visualize documentos, perfis e análises em uma jornada única.</span>
            </div>
            <div className="auth-hero-point">
              <strong>Critérios consistentes</strong>
              <span>Use skills, senioridade e matching com a mesma linguagem operacional.</span>
            </div>
            <div className="auth-hero-point">
              <strong>Mais confiança no processo</strong>
              <span>Saiba quem solicitou análises, o que foi processado e como cada vaga está evoluindo.</span>
            </div>
          </div>
        </section>

        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-card-header">
            <h2>Acessar plataforma</h2>
            <p>Entre com sua conta para continuar no painel de recrutamento.</p>
          </div>

          <label>
            E-mail
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>

          <label>
            Senha
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </label>

          {error ? (
            <div className="alert alert-error">
              <span className="alert-icon">✕</span>
              <span>{error}</span>
            </div>
          ) : null}

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar no painel"}
          </button>

          <p className="auth-helper-text">Seu acesso define quais áreas da plataforma estarão disponíveis.</p>

          {isDev ? (
            <div className="dev-credentials">
              <strong>Acesso de desenvolvimento</strong>
              <p>E-mail: admin@resume.ai</p>
              <p>Senha: Admin123!</p>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
