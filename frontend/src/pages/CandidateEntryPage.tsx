import { ArrowRight, FileText, LogIn, Sparkles, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "../components/ui/button";

export function CandidateEntryPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--bg))] font-sans selection:bg-[hsl(var(--primary)/0.2)] selection:text-[hsl(var(--primary))]">
      {/* Dynamic Background Elements */}
      <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[40rem] w-[40rem] rounded-full bg-[hsl(var(--primary)/0.08)] blur-[120px] animate-pulse" />
      <div className="pointer-events-none absolute right-[-5%] bottom-[-10%] h-[35rem] w-[35rem] rounded-full bg-[hsl(var(--brand-glow)/0.12)] blur-[100px]" />

      <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        {/* Header / Brand */}
        <div className="mb-12 flex flex-col items-center text-center animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.05)] px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[hsl(var(--primary))]">
            <Sparkles className="h-3.5 w-3.5" />
            Portal do Talento
          </div>
          <h1 className="max-w-3xl font-heading text-5xl font-extrabold tracking-tight text-[hsl(var(--text))] sm:text-6xl lg:text-7xl">
            Sua próxima <span className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--brand-glow))] bg-clip-text text-transparent">conquista</span> começa aqui.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[hsl(var(--text-muted))] sm:text-xl">
            Bem-vindo ao Marajó RH. Escolha como deseja prosseguir para gerenciar sua carreira e candidaturas.
          </p>
        </div>

        {/* Main Actions Container */}
        <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-2">
          {/* Action 1: New Application */}
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--surface)/0.6)] p-8 shadow-2xl backdrop-blur-xl transition-all duration-500 hover:-translate-y-2 hover:border-[hsl(var(--primary)/0.3)] hover:shadow-[hsl(var(--primary)/0.1)] animate-in fade-in slide-in-from-left-8 duration-700 delay-200">
            <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary)/0.03)] to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            
            <div className="relative">
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] text-white shadow-lg shadow-[hsl(var(--primary)/0.3)] transition-transform group-hover:scale-110 group-hover:rotate-3">
                <FileText className="h-8 w-8" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--text))]">Quero me candidatar</h2>
              <p className="mt-4 text-[hsl(var(--text-muted))] leading-relaxed">
                Ainda não possui cadastro? Comece sua jornada agora mesmo. Envie seu currículo e concorra às melhores oportunidades do mercado.
              </p>
              
              <ul className="mt-8 space-y-3">
                {[
                  "Processo simplificado em etapas",
                  "Análise instantânea de perfil",
                  "Feedback transparente",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm font-medium text-[hsl(var(--text-muted))]">
                    <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative mt-12">
              <Button asChild className="h-14 w-full rounded-2xl bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--brand-glow))] text-lg font-bold text-white shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]">
                <Link to="/candidato/cadastro">
                  Iniciar Candidatura
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Action 2: Existing Portal */}
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--surface)/0.6)] p-8 shadow-2xl backdrop-blur-xl transition-all duration-500 hover:-translate-y-2 hover:border-[hsl(var(--primary)/0.3)] hover:shadow-[hsl(var(--primary)/0.1)] animate-in fade-in slide-in-from-right-8 duration-700 delay-200">
            <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary)/0.03)] to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

            <div className="relative">
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[hsl(var(--primary))] shadow-xl ring-1 ring-[hsl(var(--border)/0.5)] transition-transform group-hover:scale-110 group-hover:-rotate-3">
                <LogIn className="h-8 w-8" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--text))]">Acompanhar status</h2>
              <p className="mt-4 text-[hsl(var(--text-muted))] leading-relaxed">
                Já é candidato? Acesse seu portal restrito para visualizar o status das suas vagas, responder testes e atualizar suas informações.
              </p>

              <div className="mt-8 rounded-2xl bg-[hsl(var(--surface-muted)/0.4)] p-4 border border-[hsl(var(--border)/0.2)]">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--success))]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">Atualizado em tempo real</span>
                </div>
              </div>
            </div>

            <div className="relative mt-12">
              <Button asChild variant="outline" className="h-14 w-full rounded-2xl border-2 border-[hsl(var(--primary))] bg-transparent text-lg font-bold text-[hsl(var(--primary))] transition-all hover:bg-[hsl(var(--primary))] hover:text-white active:scale-[0.98]">
                <Link to="/candidato/login">
                  Entrar no Portal
                  <LogIn className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-16 text-center text-sm font-medium text-[hsl(var(--text-muted))] animate-in fade-in duration-1000 delay-500">
          © {new Date().getFullYear()} Marajó RH IA System. Todos os direitos reservados.
        </div>
      </div>
    </div>
  );
}
