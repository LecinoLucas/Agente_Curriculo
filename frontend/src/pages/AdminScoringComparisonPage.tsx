import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BadgeCheck, GitCompareArrows, Gauge, ShieldAlert, Sparkles, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ErrorAlert } from "../components/common/ErrorAlert";
import { PageHeader } from "../components/common/PageHeader";
import { EmptyState } from "../components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  scoringComparisonService,
  type InsightEvidence,
  type ScoringComparisonResponse,
} from "../services/scoringComparisonService";
import { handleApiError, type UserFriendlyError } from "../services/errorHandler";

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function listItems(items: string[]): ReactNode[] | null {
  if (items.length === 0) return null;
  return items.map((item) => (
    <li key={item} className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-foreground">
      {item}
    </li>
  ));
}

function listEvidenceItems(items: InsightEvidence[]): ReactNode[] | null {
  if (items.length === 0) return null;
  return items.map((item) => (
    <li key={`${item.requirement}:${item.match_type}`} className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-foreground">
      <p className="font-medium">{item.requirement}</p>
      <p className="text-xs text-muted-foreground">
        {item.match_type} · {item.evidence_strength} · conf. {item.confidence}
      </p>
      {item.evidence_quotes[0] ? <p className="mt-1 text-xs">{item.evidence_quotes[0]}</p> : null}
    </li>
  ));
}

export function AdminScoringComparisonPage() {
  const navigate = useNavigate();
  const [jobId, setJobId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScoringComparisonResponse | null>(null);
  const [error, setError] = useState<UserFriendlyError | null>(null);

  const deltaHighlight = useMemo<"neutral" | "success" | "warning" | "danger">(() => {
    if (!result) return "neutral";
    if (result.delta >= 25) return "danger";
    if (result.delta >= 10) return "warning";
    return "success";
  }, [result]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedJobId = jobId.trim();
    const trimmedCandidateId = candidateId.trim();

    if (!trimmedJobId || !trimmedCandidateId) {
      setError({
        title: "Erro de validação",
        message: "Alguns campos precisam ser corrigidos antes de continuar.",
        details: ["Informe job_id e candidate_id para executar a comparação."],
        severity: "warning",
      });
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await scoringComparisonService.compare(trimmedJobId, trimmedCandidateId);
      setResult(payload);
    } catch (caught) {
      setResult(null);
      setError(handleApiError(caught));
    } finally {
      setLoading(false);
    }
  }

  const reviewTone: "danger" | "success" = result?.should_review_manually ? "danger" : "success";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Comparação de scores"
        subtitle="Painel interno para validar o ranking legado lado a lado com o scorer adaptativo."
        actions={
          <Button variant="outline" onClick={() => navigate("/admin")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao admin
          </Button>
        }
      />

      <Card className="border-slate-200 shadow-sm dark:border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompareArrows className="h-4 w-4 text-blue-600" />
            Consultar comparação
          </CardTitle>
          <CardDescription>
            Informe o <code className="rounded bg-muted px-1 py-0.5 text-xs">job_id</code> e o{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">candidate_id</code> para carregar a
            análise lado a lado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => void handleSubmit(event)}>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Job ID</span>
              <Input
                value={jobId}
                onChange={(event) => setJobId(event.target.value)}
                placeholder="UUID da vaga"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Candidate ID</span>
              <Input
                value={candidateId}
                onChange={(event) => setCandidateId(event.target.value)}
                placeholder="UUID do candidato"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="flex items-end">
              <Button type="submit" className="w-full lg:w-auto" disabled={loading}>
                {loading ? "Comparando..." : "Comparar scores"}
              </Button>
            </div>
          </form>

          {error ? (
            <div className="mt-4">
              <ErrorAlert error={error} onDismiss={() => setError(null)} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!result && !error ? (
        <EmptyState
          icon="⇄"
          title="Nenhuma comparação carregada"
          description="Use a busca acima para abrir o comparativo do ranking legado e adaptativo."
          note="A tela é restrita a administradores."
        />
      ) : null}

      {result ? (
        <>
          <div className="grid gap-4 lg:grid-cols-4">
            <SummaryCard label="Delta" value={formatPercent(result.delta)} tone={deltaHighlight} icon={<Target className="h-4 w-4" />} />
            <SummaryCard label="Confiança" value={formatPercent(result.confidence_score)} tone={result.confidence_score >= 70 ? "success" : "warning"} icon={<Gauge className="h-4 w-4" />} />
            <SummaryCard label="Revisão manual" value={result.should_review_manually ? "Sim" : "Não"} tone={reviewTone} icon={<ShieldAlert className="h-4 w-4" />} />
            <SummaryCard label="Análise" value={result.analysis_id} tone="neutral" icon={<BadgeCheck className="h-4 w-4" />} compact />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ComparisonCard
              title="Legado"
              subtitle="Ranking atual"
              score={result.legacy_match_score}
              recommendation={result.legacy_recommendation}
              tone="neutral"
            />
            <ComparisonCard
              title="Adaptativo"
              subtitle="Scorer determinístico"
              score={result.adaptive_match_score}
              recommendation={result.adaptive_recommendation}
              tone={deltaHighlight}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Principais diferenças</CardTitle>
                <CardDescription>Os pontos que mais alteram a interpretação entre os dois scorers.</CardDescription>
              </CardHeader>
              <CardContent>
                {result.major_differences.length > 0 ? (
                  <ul className="flex flex-col gap-2">{listItems(result.major_differences)}</ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma diferença material detectada.</p>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Explicação auditável</CardTitle>
                <CardDescription>Resumo usado para triagem e calibração interna.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-foreground">{result.explanation}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ListCard title="Forças" icon={<Sparkles className="h-4 w-4 text-emerald-600" />} items={result.strengths} empty="Sem forças mapeadas." />
            <ListCard title="Lacunas" icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} items={result.gaps} empty="Sem lacunas mapeadas." />
            <ListCard title="Riscos" icon={<ShieldAlert className="h-4 w-4 text-red-600" />} items={result.risk_points} empty="Sem riscos mapeados." />
          </div>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Por que este score?</CardTitle>
              <CardDescription>Camada explicativa auditável baseada apenas em evidências estruturadas.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <ListCard
                title="Motivos do score alto"
                icon={<Sparkles className="h-4 w-4 text-emerald-600" />}
                items={result.evaluation_insight.why_score_is_high}
                empty="Sem motivos positivos relevantes."
              />
              <ListCard
                title="Motivos do score baixo"
                icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
                items={result.evaluation_insight.why_score_is_low}
                empty="Sem motivos negativos relevantes."
              />
              <ListCard
                title="Riscos de superestimação"
                icon={<ShieldAlert className="h-4 w-4 text-red-600" />}
                items={result.evaluation_insight.possible_overestimation}
                empty="Sem sinal de superestimação."
              />
              <ListCard
                title="Perguntas recomendadas"
                icon={<Target className="h-4 w-4 text-blue-600" />}
                items={result.evaluation_insight.recommended_interview_questions}
                empty="Sem perguntas sugeridas."
              />
              <Card className="shadow-none lg:col-span-2">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className="text-base">Evidências e equivalências</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 px-0 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-medium">Evidências mais fortes</p>
                    {result.evaluation_insight.top_evidence.length > 0 ? (
                      <ul className="flex flex-col gap-2">{listEvidenceItems(result.evaluation_insight.top_evidence)}</ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sem evidências fortes mapeadas.</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Equivalências encontradas</p>
                    {result.evaluation_insight.equivalent_matches.length > 0 ? (
                      <ul className="flex flex-col gap-2">{listEvidenceItems(result.evaluation_insight.equivalent_matches)}</ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sem equivalências encontradas.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
  compact = false,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone: "neutral" | "success" | "warning" | "danger";
  compact?: boolean;
}) {
  const toneClasses: Record<"neutral" | "success" | "warning" | "danger", string> = {
    neutral: "border-border bg-card text-foreground",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100",
    warning: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100",
    danger: "border-red-200 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100",
  };

  return (
    <Card className={`shadow-sm ${toneClasses[tone]}`}>
      <CardHeader className={compact ? "pb-2" : "pb-3"}>
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className={compact ? "pt-0" : ""}>
        <div className="break-words text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function ComparisonCard({
  title,
  subtitle,
  score,
  recommendation,
  tone,
}: {
  title: string;
  subtitle: string;
  score: number;
  recommendation: string;
  tone: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClasses: Record<"neutral" | "success" | "warning" | "danger", string> = {
    neutral: "border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40",
    success: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20",
    warning: "border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20",
    danger: "border-red-200 bg-red-50/70 dark:border-red-900/40 dark:bg-red-950/20",
  };

  return (
    <Card className={`shadow-sm ${toneClasses[tone]}`}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Match score</p>
            <p className="text-4xl font-bold tracking-tight">{score.toFixed(2)}</p>
          </div>
          <Badge variant={tone === "danger" ? "danger" : tone === "warning" ? "warning" : tone === "success" ? "success" : "outline"}>
            {recommendation}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function ListCard({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: ReactNode;
  items: string[];
  empty: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <ul className="flex flex-col gap-2">{listItems(items)}</ul>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}
