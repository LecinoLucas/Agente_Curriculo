import {
  Calendar,
  CheckCircle2,
  Clock,
  Star,
  Users,
  Video,
} from "lucide-react";
import { useState } from "react";

import { PageHeader } from "../components/common/PageHeader";
import { cn } from "../lib/utils";

// ── Types & Mocks ─────────────────────────────────────────────────────────────
type InterviewStatus = "scheduled" | "done" | "cancelled" | "pending_confirm";
type Platform = "Meet" | "Zoom" | "Teams" | "Presencial";

interface Interview {
  id: string;
  candidate: string;
  avatar: string;
  role: string;
  stage: string;
  date: string;
  time: string;
  duration: number;
  platform: Platform;
  status: InterviewStatus;
  interviewers: string[];
  score: number | null;
}

const TODAY = new Date();

function iso(dayOffset: number, h: number, m: number) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const MOCK: Interview[] = [
  { id:"i1",  candidate:"Ana Lima",        avatar:"AL", role:"Full Stack Sênior",    stage:"Entrevista Técnica", date:iso(0,10, 0), time:"10:00", duration:60, platform:"Meet",       status:"scheduled",       interviewers:["Rafael S.","Lucas B."], score:87   },
  { id:"i2",  candidate:"Bruno Tavares",   avatar:"BT", role:"Tech Lead Backend",    stage:"Entrevista RH",     date:iso(0,11,30), time:"11:30", duration:45, platform:"Zoom",       status:"scheduled",       interviewers:["Carla M."],             score:79   },
  { id:"i3",  candidate:"Carla Mendes",    avatar:"CM", role:"Analista de RH",       stage:"Entrevista Final",  date:iso(0,14, 0), time:"14:00", duration:90, platform:"Teams",      status:"done",            interviewers:["Marina T.","Pedro A."], score:91   },
  { id:"i4",  candidate:"Diego Carvalho",  avatar:"DC", role:"DevOps Engineer",      stage:"Entrevista Técnica",date:iso(0,15,30), time:"15:30", duration:60, platform:"Meet",       status:"scheduled",       interviewers:["Rafael S."],            score:83   },
  { id:"i5",  candidate:"Eva Santos",      avatar:"ES", role:"Product Designer",     stage:"Entrevista RH",     date:iso(1, 9, 0), time:"09:00", duration:45, platform:"Zoom",       status:"pending_confirm", interviewers:["Carla M."],             score:null },
  { id:"i6",  candidate:"Felipe Ramos",    avatar:"FR", role:"Engenheiro de Dados",  stage:"Entrevista Técnica",date:iso(1,10,30), time:"10:30", duration:60, platform:"Meet",       status:"scheduled",       interviewers:["Lucas B.","Pedro A."],  score:76   },
  { id:"i7",  candidate:"Gabriela Costa",  avatar:"GC", role:"iOS Developer",        stage:"Entrevista Final",  date:iso(1,14, 0), time:"14:00", duration:90, platform:"Presencial", status:"scheduled",       interviewers:["Marina T."],            score:88   },
  { id:"i8",  candidate:"Henrique Lopes",  avatar:"HL", role:"Scrum Master",         stage:"Entrevista RH",     date:iso(2,10, 0), time:"10:00", duration:45, platform:"Zoom",       status:"scheduled",       interviewers:["Carla M."],             score:82   },
  { id:"i9",  candidate:"Isabel Freitas",  avatar:"IF", role:"Analista Financeiro",  stage:"Entrevista Final",  date:iso(-1,14,0), time:"14:00", duration:60, platform:"Meet",       status:"done",            interviewers:["Pedro A."],             score:94   },
  { id:"i10", candidate:"Jonas Martins",   avatar:"JM", role:"QA Engineer",          stage:"Entrevista Técnica",date:iso(-1,10,0), time:"10:00", duration:60, platform:"Teams",      status:"cancelled",       interviewers:["Lucas B."],             score:null },
];

const STATUS: Record<InterviewStatus, { label: string; color: string }> = {
  scheduled:       { label: "Agendada",    color: "text-blue-600"    },
  done:            { label: "Concluída",   color: "text-emerald-600" },
  cancelled:       { label: "Cancelada",   color: "text-rose-400"    },
  pending_confirm: { label: "Aguardando",  color: "text-amber-600"   },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function dayStart(d: Date) {
  const c = new Date(d); c.setHours(0, 0, 0, 0); return c;
}

function weekDays(base: Date): Date[] {
  const mon = new Date(base);
  mon.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
  });
}

function byDay(day: Date) {
  const t = dayStart(day).getTime();
  return MOCK.filter((iv) => dayStart(new Date(iv.date)).getTime() === t);
}

// ── Interview row ─────────────────────────────────────────────────────────────
function InterviewRow({ iv }: { iv: Interview }) {
  const cfg = STATUS[iv.status];
  return (
    <div className={cn(
      "flex items-center gap-4 rounded-xl px-3 py-3 transition hover:bg-[hsl(var(--surface-muted))]/30",
      iv.status === "cancelled" && "opacity-50",
    )}>
      {/* Time */}
      <div className="w-12 shrink-0 text-right">
        <p className="text-sm font-bold text-[hsl(var(--text))]">{iv.time}</p>
        <p className="text-[10px] text-[hsl(var(--text-muted))]">{iv.duration}m</p>
      </div>

      {/* Divider dot */}
      <div className="h-full w-px bg-[hsl(var(--border))]/40" />

      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--surface-muted))]/80 text-[11px] font-bold text-[hsl(var(--text-muted))]">
        {iv.avatar}
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[hsl(var(--text))]">{iv.candidate}</p>
        <p className="truncate text-xs text-[hsl(var(--text-muted))]">{iv.role} · {iv.stage}</p>
      </div>

      {/* Platform — subtle */}
      <div className="hidden items-center gap-1 sm:flex">
        <Video className="h-3 w-3 text-[hsl(var(--text-muted))]" />
        <span className="text-xs text-[hsl(var(--text-muted))]">{iv.platform}</span>
      </div>

      {/* Status */}
      <span className={cn("shrink-0 text-xs font-semibold", cfg.color)}>{cfg.label}</span>

      {/* Score — only accent */}
      {iv.score !== null && (
        <div className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold",
          iv.score >= 85 ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600",
        )}>
          {iv.score}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function AgendaPage() {
  const [selected, setSelected] = useState(dayStart(TODAY));
  const days = weekDays(selected);
  const todayTs = dayStart(TODAY).getTime();

  const todayIvs = byDay(selected).sort((a, b) => a.time.localeCompare(b.time));
  const weekIvs  = days.flatMap(byDay);
  const totalDone    = weekIvs.filter((iv) => iv.status === "done").length;
  const totalPending = weekIvs.filter((iv) => iv.status === "pending_confirm").length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 pb-16 pt-6 sm:px-6">

      <PageHeader
        title="Agenda de Entrevistas"
        subtitle="Visão semanal e detalhe diário"
      />

      {/* KPI strip — compacto */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Esta semana",     value: weekIvs.length, icon: Calendar     },
          { label: "Concluídas",      value: totalDone,      icon: CheckCircle2 },
          { label: "Aguardando conf", value: totalPending,   icon: Clock        },
          { label: "Avaliadores",     value: 4,              icon: Users        },
        ].map((k) => (
          <div key={k.label} className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))] px-4 py-3">
            <k.icon className="h-4 w-4 shrink-0 text-[hsl(var(--text-muted))]" />
            <div>
              <p className="text-lg font-extrabold text-[hsl(var(--text))]">{k.value}</p>
              <p className="text-[11px] text-[hsl(var(--text-muted))]">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Week strip */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))] p-2">
        {days.map((day) => {
          const ts         = dayStart(day).getTime();
          const isToday    = ts === todayTs;
          const isSelected = ts === selected.getTime();
          const count      = byDay(day).length;

          return (
            <button
              key={ts}
              onClick={() => setSelected(dayStart(day))}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-center transition min-w-[44px]",
                isSelected
                  ? "bg-[hsl(var(--primary))] text-white"
                  : isToday
                  ? "border border-[hsl(var(--primary))]/30 text-[hsl(var(--primary))]"
                  : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-muted))]/40",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                {day.toLocaleDateString("pt-BR", { weekday: "short" })}
              </span>
              <span className="text-base font-extrabold">{day.getDate()}</span>
              {count > 0 ? (
                <span className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold",
                  isSelected ? "bg-white/25 text-white" : "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]",
                )}>
                  {count}
                </span>
              ) : <span className="h-4" />}
            </button>
          );
        })}
      </div>

      {/* Day detail */}
      <div className="rounded-2xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-bold text-[hsl(var(--text))]">
            {selected.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </h2>
          <p className="text-xs text-[hsl(var(--text-muted))]">
            {todayIvs.length === 0
              ? "Sem entrevistas neste dia"
              : `${todayIvs.length} entrevista${todayIvs.length > 1 ? "s" : ""}`}
          </p>
        </div>

        {todayIvs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="mb-3 h-8 w-8 text-[hsl(var(--text-muted))]/50" />
            <p className="text-sm text-[hsl(var(--text-muted))]">Nenhuma entrevista agendada.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {todayIvs.map((iv) => <InterviewRow key={iv.id} iv={iv} />)}
          </div>
        )}
      </div>

      {/* Week list — compacta */}
      <div className="rounded-2xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))] p-5">
        <h3 className="mb-3 text-sm font-bold text-[hsl(var(--text))]">Semana completa</h3>
        <div className="divide-y divide-[hsl(var(--border))]/30">
          {days.map((day) => {
            const ivs = byDay(day);
            if (ivs.length === 0) return null;
            return (
              <div key={day.toISOString()} className="py-3 first:pt-0 last:pb-0">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--text-muted))]">
                  {day.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric" })}
                </p>
                <div className="space-y-1">
                  {ivs.sort((a, b) => a.time.localeCompare(b.time)).map((iv) => (
                    <InterviewRow key={iv.id} iv={iv} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
