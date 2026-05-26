import { CandidatePublicShell } from "../components/auth/CandidatePublicShell";
import { CandidateLoginAccessCard } from "../components/auth/CandidateLoginAccessCard";
import { Activity, Bell, MessageSquare, Sparkles } from "lucide-react";

export function CandidateEntryPage() {
  return (
    <CandidatePublicShell
      hideHeader
      maxWidth="4xl"
      title="Portal do Candidato"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        {/* Coluna Esquerda - Institucional */}
        <div className="flex flex-col text-center lg:text-left order-2 lg:order-1 mt-8 lg:mt-0">
          <div className="hidden lg:flex items-center gap-2.5 mb-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-xl font-black text-white shadow-md">
              RA
            </span>
            <div className="flex flex-col text-left">
              <span className="font-heading text-lg font-black leading-none tracking-tight text-foreground">
                Marajó RH
              </span>
              <span className="text-[11px] text-muted-foreground uppercase tracking-widest mt-1 font-bold">
                ATS & Recrutamento IA
              </span>
            </div>
          </div>

          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary shadow-xs mx-auto lg:mx-0 w-fit">
            <Sparkles className="h-3.5 w-3.5" />
            Portal do candidato
          </div>

          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground leading-[1.1] mb-4">
            Acompanhe sua candidatura com clareza.
          </h1>
          
          <p className="text-sm sm:text-base font-semibold text-muted-foreground leading-relaxed mb-8 max-w-md mx-auto lg:mx-0">
            Receba atualizações do RH e saiba quando houver novidades no seu processo seletivo.
          </p>

          <div className="flex flex-col gap-4 text-left max-w-sm mx-auto lg:mx-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Status da candidatura</h4>
                <p className="text-xs text-muted-foreground font-semibold">Saiba exatamente em qual etapa você está.</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Mensagens do RH</h4>
                <p className="text-xs text-muted-foreground font-semibold">Receba feedbacks e instruções diretas.</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Atualizações em tempo real</h4>
                <p className="text-xs text-muted-foreground font-semibold">Não perca nenhum agendamento de entrevista.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna Direita - Formulário */}
        <div className="order-1 lg:order-2 w-full max-w-md mx-auto relative z-10">
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-black text-white shadow-xs">
              RA
            </span>
            <div className="flex flex-col text-left">
              <span className="font-heading text-sm font-black leading-none tracking-tight text-foreground">
                Marajó RH
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 font-bold">
                ATS & Recrutamento IA
              </span>
            </div>
          </div>
          <CandidateLoginAccessCard />
        </div>
      </div>
    </CandidatePublicShell>
  );
}
