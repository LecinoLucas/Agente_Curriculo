import { ArrowRight, Sparkles, CheckCircle2, UserPlus, LogIn, ChevronRight, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "../components/ui/button";

export function CandidateEntryPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--bg))] font-sans selection:bg-[hsl(var(--primary)/0.2)] selection:text-[hsl(var(--primary))] flex flex-col justify-start">
      {/* Premium Ambient Background Grid & Glows */}
      <div 
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.12]" 
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--text-muted)/0.15) 1px, transparent 0)`,
          backgroundSize: "24px 24px"
        }}
      />
      <div className="pointer-events-none absolute left-[-15%] top-[-15%] h-[35rem] w-[35rem] rounded-full bg-[hsl(var(--primary)/0.06)] blur-[100px] animate-pulse" />
      <div className="pointer-events-none absolute right-[-10%] bottom-[-15%] h-[30rem] w-[30rem] rounded-full bg-[hsl(var(--brand-glow)/0.09)] blur-[95px]" />

      {/* Floating Glassmorphic Top Header - Compact */}
      <header className="sticky top-0 z-50 w-full border-b border-[hsl(var(--border)/0.15)] bg-[hsl(var(--bg))/0.7] py-2.5 backdrop-blur-md transition-all duration-300">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-[hsl(var(--primary))] to-[hsl(var(--brand-glow))] shadow-md shadow-[hsl(var(--primary)/0.25)]">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-black tracking-wider text-[hsl(var(--text))] uppercase leading-none mb-0.5">
                Marajó RH
              </span>
              <span className="text-[8px] font-bold text-[hsl(var(--text-muted))] uppercase tracking-widest leading-none">
                Recrutamento IA
              </span>
            </div>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border)/0.25)] bg-[hsl(var(--surface-muted)/0.45)] px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-[hsl(var(--text))]">
            <span className="h-1 w-1 rounded-full bg-emerald-500 animate-ping" />
            Portal de Carreiras
          </div>
        </div>
      </header>

      {/* Main Content Area - Fully Proportional & Compact */}
      <main className="relative flex flex-1 flex-col items-center justify-start px-4 pt-4 sm:pt-6 pb-10 max-w-5xl mx-auto w-full">
        
        {/* Animated Badge & Bold Title - Perfectly Proportioned */}
        <div className="mb-6 flex flex-col items-center text-center animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.04)] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-[hsl(var(--primary))] shadow-sm">
            <Sparkles className="h-3 w-3" />
            OPORTUNIDADES EM DESTAQUE
          </div>
          <h1 className="max-w-xl font-display text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-[hsl(var(--text))] leading-[1.2]">
            Sua próxima <span className="bg-gradient-to-r from-[hsl(var(--primary))] via-[hsl(var(--brand))] to-[hsl(var(--brand-glow))] bg-clip-text text-transparent">conquista profissional</span> começa aqui.
          </h1>
          <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-[hsl(var(--text-muted))] font-semibold">
            Bem-vindo ao ecossistema de contratação do Marajó RH. Selecione o canal ideal para sua jornada profissional.
          </p>
        </div>

        {/* Dual Actions Premium Board - Compacted Sizing */}
        <div className="grid w-full gap-5 md:grid-cols-2 max-w-4xl">
          
          {/* Channel A: New Sourcing & Application */}
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] border border-[hsl(var(--border)/0.25)] bg-[hsl(var(--surface)/0.65)] p-5 md:p-6 shadow-xl backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:border-[hsl(var(--primary)/0.3)] hover:shadow-[0_12px_30px_-8px_hsl(var(--primary)/0.08)] animate-in fade-in slide-in-from-left-8 duration-700 delay-200">
            <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary)/0.03)] via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            
            <div className="relative">
              {/* Floating Accent Tag */}
              <div className="mb-3.5 flex items-center justify-between">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-[hsl(var(--primary))] to-[hsl(var(--brand))] text-white shadow-md shadow-[hsl(var(--primary)/0.25)] transition-transform duration-500 group-hover:scale-105 group-hover:rotate-3">
                  <UserPlus className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-[hsl(var(--primary)/0.06)] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.1)]">
                  Novos Talentos
                </span>
              </div>
              
              <h2 className="text-lg md:text-xl font-black tracking-tight text-[hsl(var(--text))]">
                Quero me candidatar
              </h2>
              <p className="mt-1 text-xs text-[hsl(var(--text-muted))] leading-relaxed font-semibold">
                Ainda não possui cadastro ativo? Envie seu currículo para triagem inteligente e automatizada por inteligência artificial.
              </p>
              
              {/* Feature Checklist */}
              <ul className="mt-4 space-y-2 border-t border-[hsl(var(--border)/0.15)] pt-3.5">
                {[
                  { title: "Processo simplificado", desc: "Aplicação intuitiva em poucos minutos" },
                  { title: "Análise inteligente de currículo", desc: "Seu perfil avaliado por IA" },
                  { title: "Transparência total", desc: "Atualizações constantes em cada etapa" },
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[hsl(var(--text))] leading-none">
                        {item.title}
                      </p>
                      <p className="text-[10px] font-medium text-[hsl(var(--text-muted))] leading-normal mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative mt-5">
              <Button asChild className="h-11 w-full rounded-xl bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--brand-glow))] text-xs font-black uppercase tracking-wider text-white shadow-md transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] hover:shadow-[0_8px_16px_-6px_hsl(var(--primary)/0.35)]">
                <Link to="/candidato/cadastro">
                  Iniciar Candidatura
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Channel B: Active Candidate Portal Area */}
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] border border-[hsl(var(--border)/0.25)] bg-[hsl(var(--surface)/0.65)] p-5 md:p-6 shadow-xl backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:border-[hsl(var(--primary)/0.3)] hover:shadow-[0_12px_30px_-8px_hsl(var(--primary)/0.08)] animate-in fade-in slide-in-from-right-8 duration-700 delay-200">
            <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary)/0.03)] via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

            <div className="relative">
              {/* Floating Accent Tag */}
              <div className="mb-3.5 flex items-center justify-between">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-slate-900 text-[hsl(var(--primary))] shadow-md ring-1 ring-[hsl(var(--border)/0.25)] transition-transform duration-500 group-hover:scale-105 group-hover:-rotate-3">
                  <LogIn className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-indigo-500/10 dark:bg-indigo-400/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 border border-indigo-500/15">
                  Candidato Cadastrado
                </span>
              </div>

              <h2 className="text-lg md:text-xl font-black tracking-tight text-[hsl(var(--text))]">
                Acompanhar status
              </h2>
              <p className="mt-1 text-xs text-[hsl(var(--text-muted))] leading-relaxed font-semibold">
                Entre no seu painel privado para acompanhar o status, receber convites e responder às avaliações de competências.
              </p>

              {/* Status Tracking Alert Box */}
              <div className="mt-4 rounded-xl border border-[hsl(var(--border)/0.15)] bg-[hsl(var(--surface-muted)/0.4)] p-3.5">
                <div className="flex items-center gap-2">
                  <div className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-[hsl(var(--text-muted))]">
                    Painel Operacional Ativo
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-[hsl(var(--text))]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                  <span className="text-[11px]">Acesso seguro e autenticado</span>
                </div>
              </div>
            </div>

            <div className="relative mt-5">
              <Button asChild variant="outline" className="h-11 w-full rounded-xl border-2 border-[hsl(var(--primary))] bg-transparent text-xs font-black uppercase tracking-wider text-[hsl(var(--primary))] transition-all duration-300 hover:bg-[hsl(var(--primary))] hover:text-white active:scale-[0.99] hover:shadow-[0_8px_16px_-6px_hsl(var(--primary)/0.25)]">
                <Link to="/candidato/login">
                  Entrar no Portal
                  <ChevronRight className="ml-0.5 h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <footer className="mt-8 text-center text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted)/0.6)] animate-in fade-in duration-1000 delay-500">
          © {new Date().getFullYear()} Marajó RH IA System. Todos os direitos reservados.
        </footer>
      </main>
    </div>
  );
}
