import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Clock3,
  DatabaseZap,
  GitBranch,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HealthOverview } from "../../../services/systemHealthService";

type RuntimeStatus = "ok" | "attention" | "critical" | "not_measured";

type PerformanceHealthPanelProps = {
  overviewStatus?: HealthOverview["status"] | null;
  onOpenAiTab: () => void;
};

type ModuleBudget = {
  id: string;
  title: string;
  summary: string;
  statusLabel: string;
  statusVariant: "success" | "warning" | "danger" | "outline";
  icon: typeof Workflow;
  expected: string[];
  forbidden?: string[];
  fallback?: string[];
  notes: string[];
};

const MODULE_BUDGETS: ModuleBudget[] = [
  {
    id: "pipeline",
    title: "Pipeline",
    summary: "Board com carga única por contexto e sem reload completo após movimento simples.",
    statusLabel: "Protegido por teste",
    statusVariant: "success",
    icon: Workflow,
    expected: [
      "Abertura do board: 1 chamada principal de board por vaga/contexto.",
      "Movimento simples: 1 PATCH.",
    ],
    forbidden: ["Reload completo do board em todo movimento simples."],
    fallback: ["Erro, conflito 409 ou board.truncated=true permitem reload de segurança."],
    notes: [
      "Movimento simples do Pipeline não deve recarregar board completo.",
      "Reload de segurança permanece permitido quando o board vem truncado.",
    ],
  },
  {
    id: "jobs",
    title: "Vagas",
    summary: "Listagem inicial sem fan-out de ranking ou candidatos por vaga.",
    statusLabel: "Protegido por teste",
    statusVariant: "success",
    icon: GitBranch,
    expected: [
      "Carregamento inicial: listagem de vagas e agregados realmente necessários.",
      "Ranking e candidatos continuam sob demanda.",
    ],
    forbidden: ["Ranking de vagas não deve carregar no load inicial."],
    notes: [
      "Fan-out de ranking protegido por teste.",
      "A ação sob demanda deve chamar ranking uma vez por interação.",
    ],
  },
  {
    id: "pre-admission",
    title: "Pré-admissão",
    summary: "Workspace com reload segmentado após ação de documento.",
    statusLabel: "Reload amplo reduzido",
    statusVariant: "success",
    icon: ShieldCheck,
    expected: [
      "Abertura: overview + documents + events, uma vez cada.",
      "Ação de documento: PATCH + overview.",
    ],
    forbidden: [
      "Events não devem recarregar quando a aba não estiver visível.",
      "Painel Protheus não deve recarregar em ação de documento.",
    ],
    fallback: ["Documents pode recarregar apenas quando a atualização local não for segura."],
    notes: ["Cobertura protege approve, reject e request-correction sem reload amplo."],
  },
  {
    id: "rag",
    title: "RAG / Base de Conhecimento",
    summary: "Busca vetorial com preferência por pgvector e fallback JSON limitado.",
    statusLabel: "Budget definido",
    statusVariant: "outline",
    icon: DatabaseZap,
    expected: [
      "pgvector quando disponível, com top-k limitado no banco.",
      "json_fallback limitado quando pgvector estiver indisponível.",
    ],
    forbidden: ["Busca não deve carregar vetores ativos indefinidamente sem teto defensivo."],
    fallback: ["Warning controlado: rag_vector_search_json_fallback_limited."],
    notes: [
      "Medição em tempo real do storage mode não está disponível nesta tela.",
      "Knowledge search continua sem expor campos internos sensíveis.",
    ],
  },
];

function getRuntimeStatus(overviewStatus?: HealthOverview["status"] | null): RuntimeStatus {
  if (overviewStatus === "down") return "critical";
  if (overviewStatus === "degraded") return "attention";
  return "not_measured";
}

function getRuntimeStatusMeta(status: RuntimeStatus) {
  switch (status) {
    case "critical":
      return {
        label: "Crítico",
        variant: "danger" as const,
        description: "Health geral degradado. Os budgets continuam válidos, mas a performance precisa de investigação operacional.",
      };
    case "attention":
      return {
        label: "Atenção",
        variant: "warning" as const,
        description: "Health geral com degradação. Os testes protegem regressões, mas a medição detalhada ainda não é em tempo real.",
      };
    case "ok":
      return {
        label: "OK",
        variant: "success" as const,
        description: "Sem sinais ativos nesta tela.",
      };
    default:
      return {
        label: "Não medido",
        variant: "outline" as const,
        description: "A aba mostra budgets documentados e regressões cobertas por teste. Métricas em tempo real ainda não são agregadas aqui.",
      };
  }
}

function SummaryCard({
  title,
  value,
  note,
  icon,
  badge,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <Card className="border-border">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-semibold text-text">{value}</p>
            {badge}
          </div>
          <p className="text-xs text-text-muted">{note}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface-muted p-3 text-[hsl(var(--text-secondary))]">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

export function PerformanceHealthPanel({
  overviewStatus,
  onOpenAiTab,
}: PerformanceHealthPanelProps) {
  const runtimeStatus = getRuntimeStatus(overviewStatus);
  const runtimeMeta = getRuntimeStatusMeta(runtimeStatus);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Status geral"
          value={runtimeMeta.label}
          note={runtimeMeta.description}
          icon={<Activity className="h-5 w-5" />}
          badge={<Badge variant={runtimeMeta.variant}>{runtimeMeta.label}</Badge>}
        />
        <SummaryCard
          title="Última validação"
          value="Por release"
          note="Budgets e regressões foram validados na última fase de observabilidade."
          icon={<Clock3 className="h-5 w-5" />}
        />
        <SummaryCard
          title="Módulos monitorados"
          value="4 críticos"
          note="Pipeline, Vagas, Pré-admissão e RAG/Base de Conhecimento."
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <SummaryCard
          title="Riscos ativos"
          value="Tempo real indisponível"
          note="A tela não lê logs brutos nem infere severidade sem fonte agregada."
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Performance geral</CardTitle>
          <CardDescription>
            Esta aba consolida budgets operacionais e regressões cobertas por teste. Onde não há métrica agregada, o status aparece como budget documentado.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1 text-sm text-text-muted">
            <p>Budgets definidos para Pipeline, Vagas, Pré-admissão e RAG.</p>
            <p>Esta visão não expõe dados internos sensíveis nem payloads técnicos brutos.</p>
          </div>
          <Button type="button" variant="outline" onClick={onOpenAiTab} className="gap-2 self-start lg:self-auto">
            Ver limites e pricing de IA
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {MODULE_BUDGETS.map((module) => {
          const Icon = module.icon;
          return (
            <Card key={module.id} className="border-border">
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle>{module.title}</CardTitle>
                    <CardDescription>{module.summary}</CardDescription>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface-muted p-3 text-[hsl(var(--text-secondary))]">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={module.statusVariant}>{module.statusLabel}</Badge>
                  <Badge variant="outline">Budget definido</Badge>
                  {module.id === "rag" ? <Badge variant="warning">Medição em tempo real indisponível</Badge> : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-2">
                  <p className="font-medium text-text">Esperado</p>
                  <ul className="space-y-2 text-text-muted">
                    {module.expected.map((item) => (
                      <li key={item} className="rounded-xl border border-border bg-surface-muted/35 px-3 py-2">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {module.forbidden?.length ? (
                  <div className="space-y-2">
                    <p className="font-medium text-text">Proibido</p>
                    <ul className="space-y-2 text-text-muted">
                      {module.forbidden.map((item) => (
                        <li key={item} className="rounded-xl border border-border bg-surface-muted/35 px-3 py-2">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {module.fallback?.length ? (
                  <div className="space-y-2">
                    <p className="font-medium text-text">Fallback permitido</p>
                    <ul className="space-y-2 text-text-muted">
                      {module.fallback.map((item) => (
                        <li key={item} className="rounded-xl border border-border bg-surface-muted/35 px-3 py-2">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="font-medium text-text">Cobertura e notas</p>
                  <ul className="space-y-2 text-text-muted">
                    {module.notes.map((item) => (
                      <li key={item} className="rounded-xl border border-border bg-surface-muted/35 px-3 py-2">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Uso de IA</CardTitle>
          <CardDescription>
            O detalhamento operacional de tokens, custo e eventos recentes fica na central única de uso de IA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-text-muted">
          <p>Use a aba de Health para limites e pricing, e a central `/admin/ia/uso` para observabilidade operacional completa.</p>
          <p>Esta visão de performance não replica tabelas de consumo nem breakdown por modelo ou fluxo.</p>
        </CardContent>
      </Card>
    </div>
  );
}
