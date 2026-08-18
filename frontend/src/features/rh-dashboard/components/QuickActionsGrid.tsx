import { Plus, Users, Calendar, FileCheck, Send, BarChart2, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

const ACTIONS = [
  {
    title: "Abrir Candidaturas",
    subtitle: "Ver candidaturas",
    icon: Users,
    iconBg: "bg-purple-100 dark:bg-purple-950/50",
    iconColor: "text-purple-600 dark:text-purple-400",
    href: "/candidaturas",
  },
  {
    title: "Abrir Agenda",
    subtitle: "Ver agendamentos",
    icon: Calendar,
    iconBg: "bg-amber-100 dark:bg-amber-950/50",
    iconColor: "text-amber-600 dark:text-amber-400",
    href: "/agenda",
  },
  {
    title: "Abrir Pipeline",
    subtitle: "Processo seletivo",
    icon: Send,
    iconBg: "bg-blue-100 dark:bg-blue-950/50",
    iconColor: "text-blue-600 dark:text-blue-400",
    href: "/pipeline",
  },
  {
    title: "Abrir Pré-admissão",
    subtitle: "Documentação pendente",
    icon: FileCheck,
    iconBg: "bg-emerald-100 dark:bg-emerald-950/50",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    href: "/admitidos",
  },
  {
    title: "Nova vaga",
    subtitle: "Criar e publicar",
    icon: Plus,
    iconBg: "bg-cyan-100 dark:bg-cyan-950/50",
    iconColor: "text-cyan-600 dark:text-cyan-400",
    href: "/vagas",
  },
  {
    title: "Relatórios BI",
    subtitle: "Ver indicadores",
    icon: BarChart2,
    iconBg: "bg-indigo-100 dark:bg-indigo-950/50",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    href: "/admin/bi",
  },
];

export function QuickActionsGrid() {
  return (
    <section className="mt-6">
      <h2 className="text-base font-bold tracking-tight text-text mb-3">Ações rápidas</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {ACTIONS.map((act) => {
          const Icon = act.icon;
          return (
            <Link
              key={act.title}
              to={act.href}
              aria-label={act.title}
              className="group flex items-center justify-between gap-2.5 rounded-xl border border-border bg-surface p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs hover:border-indigo-300 dark:hover:border-indigo-800"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${act.iconBg} ${act.iconColor} transition-transform group-hover:scale-105`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-text truncate">{act.title}</p>
                  <p className="text-[10px] text-text-muted truncate">{act.subtitle}</p>
                </div>
              </div>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
