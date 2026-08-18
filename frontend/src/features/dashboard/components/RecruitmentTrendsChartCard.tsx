import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Users, Calendar, CheckCircle2, RefreshCw } from "lucide-react";
import { EmptyState } from "../../../components/common/EmptyState";
import { cn } from "../../../lib/utils";
import type { RhDashboardTrendsResponse } from "../../../services/rhDashboardService";

type Props = {
  data: RhDashboardTrendsResponse | null;
  days: 7 | 14 | 30;
  loading: boolean;
  error: boolean;
  onSelectDays: (days: 7 | 14 | 30) => void;
  onRetry: () => void;
};

const COLOR_CANDIDATES = "#5B50E5";
const COLOR_INTERVIEWS = "#06B6D4";
const COLOR_HIRES = "#10B981";

function formatAxisDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

function formatFullDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  }
  return dateStr;
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-border/80 bg-surface/95 p-3 shadow-md backdrop-blur-md text-xs space-y-1.5">
        <p className="font-bold text-text border-b border-border/60 pb-1">{formatFullDate(label)}</p>
        <div className="space-y-1">
          {payload.map((entry: any) => (
            <div key={entry.name} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                <span className="font-medium text-text-muted">{entry.name}:</span>
              </div>
              <span className="font-bold text-text">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

export function RecruitmentTrendsChartCard({
  data,
  days,
  loading,
  error,
  onSelectDays,
  onRetry,
}: Props) {
  const points = data?.points ?? [];

  const totals = useMemo(() => {
    return points.reduce(
      (acc, pt) => ({
        candidates: acc.candidates + pt.candidates,
        interviews: acc.interviews + pt.interviews,
        hires: acc.hires + pt.hires,
      }),
      { candidates: 0, interviews: 0, hires: 0 }
    );
  }, [points]);

  const totalActivity = totals.candidates + totals.interviews + totals.hires;

  return (
    <section className="rounded-xl border border-border/80 bg-surface p-5 shadow-xs" data-testid="rh-trends-chart-card">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold tracking-tight text-text">Tendências de Recrutamento</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Evolução diária de novos candidatos, entrevistas e contratações.
          </p>
        </div>

        {/* Period Selector Toggle */}
        <div className="inline-flex rounded-lg border border-border/80 bg-surface-muted/40 p-0.5" data-testid="rh-trends-period-toggle">
          {([7, 14, 30] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => onSelectDays(period)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-bold transition-all",
                days === period
                  ? "bg-surface text-indigo-600 dark:text-indigo-400 shadow-2xs"
                  : "text-text-muted hover:text-text"
              )}
            >
              {period} dias
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mt-6">
        {loading ? (
          <div className="h-72 w-full animate-pulse rounded-xl bg-surface-muted/40 flex items-center justify-center">
            <span className="text-xs font-medium text-text-muted">Carregando tendências...</span>
          </div>
        ) : error ? (
          <div className="py-8">
            <EmptyState
              icon="!"
              title="Não foi possível carregar as tendências."
              description="Ocorreu uma falha ao obter os dados do período."
              action={{ label: "Tentar novamente", onClick: onRetry }}
            />
          </div>
        ) : totalActivity === 0 ? (
          <div className="py-8">
            <EmptyState
              icon="0"
              title="Sem dados no período"
              description="Nenhuma atividade registrada no intervalo selecionado."
            />
          </div>
        ) : (
          <div className="w-full">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="candGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLOR_CANDIDATES} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={COLOR_CANDIDATES} stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="intrvGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLOR_INTERVIEWS} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={COLOR_INTERVIEWS} stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="hireGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLOR_HIRES} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={COLOR_HIRES} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatAxisDate}
                    stroke="hsl(var(--text-muted))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--text-muted))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ paddingTop: "12px", fontSize: "12px", fontWeight: "600" }}
                  />

                  <Area
                    type="monotone"
                    dataKey="candidates"
                    name="Candidatos"
                    stroke={COLOR_CANDIDATES}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#candGradient)"
                  />
                  <Area
                    type="monotone"
                    dataKey="interviews"
                    name="Entrevistas"
                    stroke={COLOR_INTERVIEWS}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#intrvGradient)"
                  />
                  <Area
                    type="monotone"
                    dataKey="hires"
                    name="Contratações"
                    stroke={COLOR_HIRES}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#hireGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Period Totals Strip */}
            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border/70 pt-4" data-testid="rh-trends-totals-strip">
              <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 dark:border-indigo-900/30 dark:bg-indigo-950/20">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs shrink-0">
                  <Users className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-text-muted truncate">Candidatos no período</p>
                  <p className="text-xl font-extrabold text-text mt-0.5">{totals.candidates}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-cyan-100 bg-cyan-50/40 p-3 dark:border-cyan-900/30 dark:bg-cyan-950/20">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-600 text-white shadow-xs shrink-0">
                  <Calendar className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-text-muted truncate">Entrevistas no período</p>
                  <p className="text-xl font-extrabold text-text mt-0.5">{totals.interviews}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 dark:border-emerald-950/40 dark:bg-emerald-950/20">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs shrink-0">
                  <CheckCircle2 className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-text-muted truncate">Contratações no período</p>
                  <p className="text-xl font-extrabold text-text mt-0.5">{totals.hires}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
