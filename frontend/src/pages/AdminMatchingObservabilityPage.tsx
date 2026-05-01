import { useEffect, useState } from "react";
import { ArrowLeft, AlertTriangle, Gauge, GitBranch, ListChecks, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ErrorAlert } from "../components/common/ErrorAlert";
import { PageHeader } from "../components/common/PageHeader";
import { EmptyState } from "../components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  matchingObservabilityService,
  type MatchingObservabilityCountItem,
  type MatchingObservabilityJobItem,
  type MatchingObservabilitySummary,
} from "../services/matchingObservabilityService";
import { handleApiError, type UserFriendlyError } from "../services/errorHandler";

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {label}
        </CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function CountTable({
  title,
  description,
  items,
  empty,
}: {
  title: string;
  description: string;
  items: MatchingObservabilityCountItem[];
  empty: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Item</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Ocorrências</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.name} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 text-foreground">{item.name}</td>
                    <td className="px-3 py-2 text-right text-foreground">{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JobsTable({ items }: { items: MatchingObservabilityJobItem[] }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Vagas com mais feedback negativo</CardTitle>
        <CardDescription>Ajuda a localizar vagas em que o matching está errando mais.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma vaga com feedback negativo registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Vaga</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Negativos</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.job_id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-medium text-foreground">{item.job_title}</p>
                      <p className="text-xs text-muted-foreground">{item.job_id}</p>
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">{item.negative_feedback_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminMatchingObservabilityPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<MatchingObservabilitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UserFriendlyError | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void matchingObservabilityService
      .summary()
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(handleApiError(caught));
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Qualidade do Matching"
        subtitle="Painel admin de observabilidade para verificar acertos, ruídos e sinais de desalinhamento do matching."
        actions={
          <Button variant="outline" onClick={() => navigate("/admin")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao admin
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="shadow-sm">
              <CardHeader>
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                <div className="h-3 w-40 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <ErrorAlert error={error} onDismiss={() => setError(null)} />
      ) : null}

      {!loading && !error && data && data.total_observations === 0 ? (
        <EmptyState
          icon="◎"
          title="Sem observações de matching"
          description="Ainda não há snapshots suficientes para calcular o resumo da qualidade do matching."
          note="O painel será preenchido automaticamente conforme novas execuções e visualizações forem registradas."
        />
      ) : null}

      {!loading && !error && data && data.total_observations > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total de observações"
              value={data.total_observations}
              hint="Todos os snapshots registrados"
              icon={<ListChecks className="h-4 w-4 text-blue-600" />}
            />
            <KpiCard
              label="Motor adaptativo"
              value={data.adaptive_count}
              hint="Execuções/leituras com adaptive"
              icon={<GitBranch className="h-4 w-4 text-emerald-600" />}
            />
            <KpiCard
              label="Motor legado"
              value={data.legacy_count}
              hint="Execuções/leituras com legacy"
              icon={<GitBranch className="h-4 w-4 text-amber-600" />}
            />
            <KpiCard
              label="Score médio"
              value={formatPercent(data.average_score)}
              hint="Média de score observado"
              icon={<Gauge className="h-4 w-4 text-indigo-600" />}
            />
            <KpiCard
              label="Confiança média"
              value={formatPercent(data.average_confidence)}
              hint="Média de confiança observada"
              icon={<Target className="h-4 w-4 text-sky-600" />}
            />
            <KpiCard
              label="Score alto com feedback negativo"
              value={data.high_score_negative_feedback}
              hint="Possíveis falsos positivos"
              icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
            />
            <KpiCard
              label="Score baixo com feedback positivo"
              value={data.low_score_positive_feedback}
              hint="Possíveis falsos negativos"
              icon={<AlertTriangle className="h-4 w-4 text-orange-600" />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CountTable
              title="Skills mais faltantes"
              description="Requisitos que mais aparecem como ausentes nas observações."
              items={data.top_missing_skills}
              empty="Nenhuma skill faltante registrada."
            />
            <CountTable
              title="Equivalências mais usadas"
              description="Termos/equivalências que mais puxam match por equivalência."
              items={data.top_equivalences_used}
              empty="Nenhuma equivalência registrada."
            />
          </div>

          <JobsTable items={data.jobs_with_most_negative_feedback} />
        </>
      ) : null}
    </div>
  );
}
