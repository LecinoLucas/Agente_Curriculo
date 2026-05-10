import { useEffect, useState } from "react";
import { 
  Users, 
  Briefcase, 
  Clock, 
  CheckCircle2, 
  TrendingUp, 
  FileSearch,
  ArrowRight,
  ExternalLink,
  PlusCircle,
  FileUp
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "../components/common/PageHeader";
import { dashboardService, type DashboardStats } from "../services/dashboardService";
import { formatContextError } from "../services/errorMessages";
import { SkeletonRows } from "../components/common/Skeleton";
import { EmptyState } from "../components/common/EmptyState";
import { StatusPill } from "../components/common/StatusPill";

export function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    
    dashboardService.getStats()
      .then(data => {
        if (!cancelled) setStats(data);
      })
      .catch(err => {
        if (!cancelled) {
          setError(formatContextError(err, "Não foi possível carregar as métricas do dashboard."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 px-6 py-6">
        <PageHeader title="Dashboard" subtitle="Carregando visão geral..." />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="ui-card h-32 animate-pulse rounded-3xl" />
          ))}
        </div>
        <SkeletonRows rows={10} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 px-6 py-6">
        <PageHeader title="Dashboard" subtitle="Ocorreu um erro ao carregar os dados." />
        <EmptyState 
          icon="⚠️" 
          title="Falha na conexão" 
          description={error} 
          action={{ label: "Tentar novamente", onClick: () => window.location.reload() }}
        />
      </div>
    );
  }

  const statCards = [
    { 
      label: "Total de Candidatos", 
      value: stats?.total_candidates ?? 0, 
      icon: Users, 
      color: "text-blue-500", 
      bg: "bg-blue-500/10",
      link: "/candidatos"
    },
    { 
      label: "Aguardando Vaga", 
      value: stats?.candidates_waiting_job ?? 0, 
      icon: Clock, 
      color: "text-amber-500", 
      bg: "bg-amber-500/10",
      link: "/candidatos?status=waiting"
    },
    { 
      label: "Vagas Abertas", 
      value: stats?.open_jobs ?? 0, 
      icon: Briefcase, 
      color: "text-emerald-500", 
      bg: "bg-emerald-500/10",
      link: "/vagas"
    },
    { 
      label: "No Pipeline", 
      value: stats?.candidates_in_pipeline ?? 0, 
      icon: TrendingUp, 
      color: "text-indigo-500", 
      bg: "bg-indigo-500/10",
      link: "/pipeline"
    }
  ];

  return (
    <div className="space-y-8 px-6 py-6 pb-12">
      <PageHeader 
        title="Dashboard" 
        subtitle="Bem-vindo ao sistema de admissão Marajo RH AI." 
        actions={
          <div className="flex gap-2">
            <button 
              onClick={() => navigate("/import")}
              className="ui-btn-secondary flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
            >
              <FileUp className="h-4 w-4" />
              Importar CVs
            </button>
            <button 
              onClick={() => navigate("/vagas/nova")}
              className="flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-[hsl(var(--primary))]/90"
            >
              <PlusCircle className="h-4 w-4" />
              Criar Vaga
            </button>
          </div>
        }
      />

      {/* Stats Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <button
            key={card.label}
            onClick={() => navigate(card.link)}
            className="ui-card group flex flex-col items-start gap-4 rounded-3xl p-6 text-left transition-all hover:border-[hsl(var(--primary))]/30 hover:shadow-xl"
          >
            <div className={`rounded-2xl p-3 ${card.bg} ${card.color}`}>
              <card.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-[hsl(var(--text-muted))]">{card.label}</p>
              <h3 className="mt-1 text-3xl font-extrabold tracking-tight text-[hsl(var(--text))]">
                {card.value}
              </h3>
            </div>
            <div className="mt-auto flex items-center gap-1 text-xs font-semibold text-[hsl(var(--primary))] opacity-0 transition group-hover:opacity-100">
              Ver mais <ArrowRight className="h-3 w-3" />
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Stages Chart/List */}
        <div className="ui-card flex flex-col rounded-3xl p-6">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-bold tracking-tight">Candidatos por Etapa</h3>
            <button onClick={() => navigate("/pipeline")} className="text-xs font-semibold text-[hsl(var(--primary))] hover:underline">
              Ver pipeline completo
            </button>
          </div>
          <div className="space-y-4">
            {stats && Object.entries(stats.candidates_by_stage).length > 0 ? (
              Object.entries(stats.candidates_by_stage).map(([stage, count]) => (
                <div key={stage} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">{stage.replace("_", " ")}</span>
                    <span className="font-bold">{count}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--surface-muted))]">
                    <div 
                      className="h-full bg-[hsl(var(--primary))] transition-all duration-500" 
                      style={{ width: `${(count / (stats.candidates_in_pipeline || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 rounded-full bg-[hsl(var(--surface-muted))] p-4">
                  <TrendingUp className="h-8 w-8 text-[hsl(var(--text-muted))]" />
                </div>
                <p className="text-sm text-[hsl(var(--text-muted))]">Nenhum candidato em pipeline ativo.</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Analyses */}
        <div className="ui-card flex flex-col rounded-3xl p-6">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-bold tracking-tight text-[hsl(var(--text))]">Análises Recentes</h3>
            <button onClick={() => navigate("/analises-ia")} className="text-xs font-semibold text-[hsl(var(--primary))] hover:underline">
              Ver todas
            </button>
          </div>
          <div className="space-y-4">
            {stats && stats.recent_analyses.length > 0 ? (
              stats.recent_analyses.map((analysis) => (
                <div 
                  key={analysis.id} 
                  className="group flex items-center gap-4 rounded-2xl border border-transparent p-3 transition hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--surface-muted))]/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--accent-soft))] text-[hsl(var(--primary))]">
                    <FileSearch className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[hsl(var(--text))]">{analysis.candidate_name}</p>
                    <p className="truncate text-xs text-[hsl(var(--text-muted))]">{analysis.job_title}</p>
                  </div>
                  <div className="text-right">
                    <StatusPill 
                      label={analysis.status === "completed" ? "Concluída" : "Processando"} 
                      tone={analysis.status === "completed" ? "success" : "warning"}
                    />
                    <p className="mt-1 text-[10px] text-[hsl(var(--text-muted))]">
                      {new Date(analysis.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 rounded-full bg-[hsl(var(--surface-muted))] p-4">
                  <FileSearch className="h-8 w-8 text-[hsl(var(--text-muted))]" />
                </div>
                <p className="text-sm text-[hsl(var(--text-muted))]">Nenhuma análise recente encontrada.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
