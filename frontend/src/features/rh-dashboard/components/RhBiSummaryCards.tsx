import type { ElementType } from "react";
import { Link } from "react-router-dom";
import {
  Briefcase,
  Calendar,
  ClipboardList,
} from "lucide-react";
import type { RhDashboardResponse } from "../../../services/rhDashboardService";

type SummaryKey = keyof RhDashboardResponse["summary"];

type BiSummaryCardConfig = {
  key: SummaryKey;
  label: string;
  sublabel: string;
  icon: ElementType;
  iconBg: string;
  iconColor: string;
  href: string;
};

const BI_CARDS_CONFIG: BiSummaryCardConfig[] = [
  {
    key: "interviews_today",
    label: "Entrevistas hoje",
    sublabel: "Agendadas no dia",
    icon: Calendar,
    iconBg: "bg-[hsl(var(--petroleum-soft))]",
    iconColor: "text-[hsl(var(--petroleum))]",
    href: "/agenda",
  },
  {
    key: "active_jobs",
    label: "Vagas em andamento",
    sublabel: "Publicadas no momento",
    icon: Briefcase,
    iconBg: "bg-[hsl(var(--brand-soft))]",
    iconColor: "text-[hsl(var(--brand))]",
    href: "/vagas",
  },
  {
    key: "pending_decisions",
    label: "Decisões pendentes",
    sublabel: "Aguardando decisão",
    icon: ClipboardList,
    iconBg: "bg-amber-100 dark:bg-amber-950/50",
    iconColor: "text-amber-600 dark:text-amber-400",
    href: "/pipeline",
  },
];

export function RhBiSummaryCards({ summary }: { summary: RhDashboardResponse["summary"] }) {
  return (
    <div className="relative">
      <div className="grid gap-4 sm:grid-cols-3" data-testid="rh-summary-cards">
        {BI_CARDS_CONFIG.map((card) => {
          const Icon = card.icon;
          const value = summary[card.key] ?? 0;

          return (
            <Link
              key={card.key}
              to={card.href}
              className="group flex items-center justify-between rounded-xl border border-border/80 bg-surface p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-muted">{card.label}</p>
                <p className="mt-1 text-3xl font-extrabold tracking-tight text-text">{value}</p>
                <p className="mt-1 text-[11px] font-medium text-text-muted">{card.sublabel}</p>
              </div>
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${card.iconBg} ${card.iconColor}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
