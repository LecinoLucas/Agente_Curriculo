import {
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Star,
  User,
} from "lucide-react";
import { useAuth } from "../features/auth/useAuth";
import { cn } from "../lib/utils";

// ── Tipos mockados ──────────────────────────────────────────────────────────
interface StepStatus {
  key: string;
  label: string;
  status: "done" | "active" | "upcoming";
  date?: string;
}

const MOCK_STEPS: StepStatus[] = [
  { key: "applied",     label: "Candidatura enviada",   status: "done",     date: "02 mai 2026" },
  { key: "screening",   label: "Triagem de perfil",     status: "done",     date: "05 mai 2026" },
  { key: "interview",   label: "Entrevista inicial",    status: "active",   date: "12 mai 2026" },
  { key: "technical",   label: "Avaliação técnica",     status: "upcoming" },
  { key: "final",       label: "Entrevista final",      status: "upcoming" },
  { key: "offer",       label: "Proposta",              status: "upcoming" },
];

// ── Componente de Step da Timeline ─────────────────────────────────────────
function TimelineStep({ step, isLast }: { step: StepStatus; isLast: boolean }) {
  return (
    <div className="flex gap-4">
      {/* Ícone + linha */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all",
            step.status === "done"
              ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white"
              : step.status === "active"
              ? "border-[hsl(var(--primary))] bg-[hsl(var(--surface))] text-[hsl(var(--primary))]"
              : "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/40 text-[hsl(var(--text-muted))]",
          )}
        >
          {step.status === "done" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : step.status === "active" ? (
            <Clock className="h-4 w-4" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-current opacity-40" />
          )}
        </div>
        {!isLast && (
          <div
            className={cn(
              "mt-1 w-0.5 flex-1 min-h-[24px]",
              step.status === "done" ? "bg-[hsl(var(--primary))]/40" : "bg-[hsl(var(--border))]/50",
            )}
          />
        )}
      </div>

      {/* Conteúdo */}
      <div className={cn("pb-6 min-w-0", isLast && "pb-0")}>
        <p
          className={cn(
            "text-sm font-semibold leading-tight",
            step.status === "upcoming" ? "text-[hsl(var(--text-muted))]" : "text-[hsl(var(--text))]",
          )}
        >
          {step.label}
        </p>
        {step.date && (
          <p className="mt-0.5 text-xs text-[hsl(var(--text-muted))]">{step.date}</p>
        )}
        {step.status === "active" && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--primary))]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--primary))]" />
            Em andamento
          </span>
        )}
      </div>
    </div>
  );
}

// ── InfoItem ────────────────────────────────────────────────────────────────
function InfoItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary))]/10">
        <Icon className="h-4 w-4 text-[hsl(var(--primary))]" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[hsl(var(--text-muted))]">{label}</p>
        <p className="text-sm font-semibold text-[hsl(var(--text))]">{value}</p>
      </div>
    </div>
  );
}

// ── Card base ────────────────────────────────────────────────────────────────
function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))]/80 backdrop-blur p-5", className)}>
      <h3 className="mb-4 text-sm font-bold tracking-tight text-[hsl(var(--text))]">{title}</h3>
      {children}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export function CandidatePortalPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 pb-12">

      {/* Aviso de pré-visualização — visível apenas para admin */}
      {isAdmin && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              Modo administrador — pré-visualização da experiência do candidato
            </p>
            <p className="mt-0.5 text-xs text-amber-600/80 dark:text-amber-400/80">
              Você está vendo esta tela como administrador. Os dados exibidos são mockados para fins de validação e desenvolvimento. O candidato real verá seus dados reais aqui.
            </p>
          </div>
        </div>
      )}

      {/* Cabeçalho da candidatura */}
      <div className="rounded-2xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))]/80 backdrop-blur overflow-hidden">
        {/* Faixa de identidade da vaga */}
        <div className="bg-gradient-to-r from-[hsl(var(--primary))]/90 via-[hsl(var(--primary))]/80 to-[hsl(214_44%_34%)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Candidatura ativa</p>
              <h1 className="mt-1 text-xl font-extrabold tracking-tight text-white">
                Desenvolvedor Full Stack Sênior
              </h1>
              <p className="mt-1 text-sm text-white/80">Marajo Tecnologia · Remoto · CLT</p>
            </div>
            <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur">
              Entrevista
            </span>
          </div>
        </div>

        {/* Infos rápidas */}
        <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <InfoItem icon={User}       label="Candidato"         value="Ana Lima" />
          <InfoItem icon={Briefcase}  label="Vaga"              value="Full Stack Sênior" />
          <InfoItem icon={Calendar}   label="Inscrito em"       value="02 mai 2026" />
          <InfoItem icon={ShieldCheck} label="Score IA"         value="87 / 100" />
        </div>
      </div>

      {/* Grade de conteúdo */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Coluna esquerda — Timeline + Entrevistas */}
        <div className="flex flex-col gap-6 lg:col-span-2">

          {/* Timeline do processo */}
          <Card title="Seu processo seletivo">
            {MOCK_STEPS.map((step, i) => (
              <TimelineStep key={step.key} step={step} isLast={i === MOCK_STEPS.length - 1} />
            ))}
          </Card>

          {/* Próxima etapa */}
          <Card title="Próxima etapa">
            <div className="flex items-start gap-4 rounded-xl border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/6 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary))]/15">
                <Sparkles className="h-5 w-5 text-[hsl(var(--primary))]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[hsl(var(--text))]">Entrevista inicial</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--text-muted))]">12 mai 2026 · 14h00 · Google Meet</p>
                <p className="mt-2 text-xs text-[hsl(var(--text-muted))] leading-relaxed">
                  Entrevista com a equipe de Tecnologia. Duração estimada: 45 minutos. Você receberá o link por e-mail.
                </p>
              </div>
            </div>
          </Card>

          {/* Feedbacks */}
          <Card title="Feedback da equipe">
            {[
              { name: "Rafael Souza", role: "Tech Lead", date: "06 mai 2026", text: "Perfil técnico muito alinhado com a vaga. Aguardamos a entrevista para aprofundar nos projetos anteriores." },
              { name: "Carla Mendes", role: "Recrutadora", date: "05 mai 2026", text: "Currículo excelente, experiência sólida em projetos de grande escala. Perfil aprovado para próxima etapa." },
            ].map((fb) => (
              <div key={fb.name} className="mb-4 last:mb-0 rounded-xl border border-[hsl(var(--border))]/40 bg-[hsl(var(--surface-muted))]/30 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">{fb.name}</p>
                    <p className="text-xs text-[hsl(var(--text-muted))]">{fb.role}</p>
                  </div>
                  <p className="shrink-0 text-xs text-[hsl(var(--text-muted))]">{fb.date}</p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--text-muted))]">{fb.text}</p>
              </div>
            ))}
          </Card>
        </div>

        {/* Coluna direita — Docs + Score */}
        <div className="flex flex-col gap-6">

          {/* Currículo enviado */}
          <Card title="Currículo enviado">
            <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))]/40 bg-[hsl(var(--surface-muted))]/30 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[hsl(var(--text))]">Ana_Lima_CV_2026.pdf</p>
                <p className="text-xs text-[hsl(var(--text-muted))]">Enviado em 02 mai · 1.2 MB</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--text-muted))]" />
            </div>
          </Card>

          {/* Score IA */}
          <Card title="Análise de perfil IA">
            <div className="flex flex-col items-center gap-3">
              {/* Gauge circular simples */}
              <div className="relative flex h-28 w-28 items-center justify-center">
                <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke="hsl(var(--primary))" strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${87 * 2.51} ${251}`}
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-2xl font-extrabold text-[hsl(var(--text))]">87</span>
                  <span className="text-[10px] font-semibold text-[hsl(var(--text-muted))]">/ 100</span>
                </div>
              </div>

              <p className="text-center text-xs text-[hsl(var(--text-muted))] leading-relaxed">
                Aderência do perfil à vaga calculada pelo sistema de IA.
              </p>

              {/* Fatores */}
              {[
                { label: "Skills essenciais",  pct: 92, color: "bg-emerald-500" },
                { label: "Experiência",        pct: 85, color: "bg-blue-500"    },
                { label: "Diferenciais",       pct: 70, color: "bg-violet-500"  },
              ].map((f) => (
                <div key={f.label} className="w-full">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-[hsl(var(--text-muted))]">{f.label}</span>
                    <span className="font-semibold text-[hsl(var(--text))]">{f.pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--border))]/40">
                    <div className={cn("h-full rounded-full", f.color)} style={{ width: `${f.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Avaliadores */}
          <Card title="Avaliadores">
            {[
              { name: "Rafael Souza",  role: "Tech Lead",    rated: true  },
              { name: "Carla Mendes",  role: "RH",           rated: true  },
              { name: "Lucas Borges",  role: "Gerente",      rated: false },
            ].map((a) => (
              <div key={a.name} className="mb-3 flex items-center gap-3 last:mb-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]/10 text-xs font-bold text-[hsl(var(--primary))]">
                  {a.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[hsl(var(--text))]">{a.name}</p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">{a.role}</p>
                </div>
                {a.rated ? (
                  <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />
                ) : (
                  <MessageSquare className="h-4 w-4 shrink-0 text-[hsl(var(--text-muted))]" />
                )}
              </div>
            ))}
          </Card>

        </div>
      </div>
    </div>
  );
}
