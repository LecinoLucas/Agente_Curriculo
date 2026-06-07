import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, FlaskConical, HeartPulse, KeyRound, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { aiSettingsService, type AiStatusResponse, type AiUsageSummaryResponse } from "../services/aiSettingsService";
import { AiUsagePanel } from "./AiUsagePanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(parsed);
}

function flagBadge(enabled: boolean, enabledLabel = "Ligado", disabledLabel = "Desligado") {
  return <Badge variant={enabled ? "success" : "secondary"}>{enabled ? enabledLabel : disabledLabel}</Badge>;
}

function GovernanceStatusCard({
  title,
  description,
  enabled,
  danger = false,
}: {
  title: string;
  description: string;
  enabled: boolean;
  danger?: boolean;
}) {
  const variant = danger ? (enabled ? "danger" : "success") : enabled ? "success" : "secondary";
  const icon = enabled ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />;

  return (
    <Card className="border-border">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-text">{title}</p>
          <p className="text-sm text-text-muted">{description}</p>
        </div>
        <Badge variant={variant} className="shrink-0">
          <span className="mr-1">{icon}</span>
          {enabled ? "Ligado" : "Desligado"}
        </Badge>
      </CardContent>
    </Card>
  );
}

export function AiGovernancePanel() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AiStatusResponse | null>(null);
  const [usageSummary, setUsageSummary] = useState<AiUsageSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadGovernance() {
      setLoading(true);
      setError(null);
      try {
        const [nextStatus, nextUsageSummary] = await Promise.all([
          aiSettingsService.getStatus(),
          aiSettingsService.getUsageSummary("today"),
        ]);

        if (!mounted) return;
        setStatus(nextStatus);
        setUsageSummary(nextUsageSummary);
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a governança de IA.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadGovernance();
    return () => {
      mounted = false;
    };
  }, []);

  const warnings = useMemo(() => {
    if (!status && !usageSummary) return [];

    const items: string[] = [];
    if (status && !status.providers.gemini_api_key_configured) {
      items.push("Gemini não configurado. Configure uma chave antes de habilitar rotas dependentes.");
    }
    if (status && !status.rag.synthesis_enabled) {
      items.push("Synthesis RAG desligado. As respostas com síntese permanecerão limitadas a busca controlada.");
    }
    if (status?.assistant.free_text_enabled) {
      items.push("Provider real ligado via free text. Revise se esse modo deve permanecer ativo no ambiente atual.");
    }
    if (status && (status.protheus.real_send_enabled || status.protheus.erp_allow_real_send)) {
      items.push("Protheus real ligado. Use somente com validação operacional explícita.");
    }
    for (const warning of status?.warnings ?? []) items.push(String(warning));
    for (const warning of usageSummary?.warnings ?? []) items.push(String(warning));
    return Array.from(new Set(items));
  }, [status, usageSummary]);

  const executiveSummary = useMemo(() => {
    if (!status || !usageSummary) return null;
    return [
      {
        label: "Provider padrão",
        value: `${status.providers.provider}/${status.providers.model}`,
      },
      {
        label: "Chamadas hoje",
        value: formatNumber(usageSummary.totals.requests),
      },
      {
        label: "Tokens hoje",
        value: formatNumber(usageSummary.totals.total_tokens),
      },
      {
        label: "Falhas hoje",
        value: formatNumber(usageSummary.totals.errors),
      },
    ];
  }, [status, usageSummary]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-text">Governança de IA</h2>
        <p className="text-sm text-text-muted">
          Monitore uso, status, custos estimados e testes controlados.
        </p>
      </section>

      {loading ? (
        <Card>
          <CardContent className="p-6 text-sm text-text-muted">Carregando governança de IA...</CardContent>
        </Card>
      ) : null}

      {error ? (
        <Alert variant="warning">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Erro ao carregar IA</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {status && usageSummary ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle>Resumo executivo</CardTitle>
                <CardDescription>Visão consolidada do ambiente atual sem expor segredos ou payloads sensíveis.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {executiveSummary?.map((item) => (
                  <div key={item.label} className="rounded-xl border border-border bg-surface-muted p-4">
                    <p className="text-xs uppercase tracking-wide text-text-muted">{item.label}</p>
                    <p className="mt-2 text-lg font-semibold text-text">{item.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Atalhos administrativos</CardTitle>
                <CardDescription>Rotas especializadas continuam disponíveis para operação e auditoria.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full justify-start" variant="outline" onClick={() => navigate("/admin/ia")}>
                  <FlaskConical className="mr-2 h-4 w-4" /> Laboratório IA
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={() => navigate("/admin/ai-provider-credentials")}>
                  <KeyRound className="mr-2 h-4 w-4" /> Credenciais IA
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={() => navigate("/admin/health")}>
                  <HeartPulse className="mr-2 h-4 w-4" /> Health do Sistema
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={() => navigate("/admin/auditoria")}>
                  <ShieldCheck className="mr-2 h-4 w-4" /> Auditoria
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <GovernanceStatusCard
              title="Gemini configurado"
              description="Disponibilidade de chave para o provider principal."
              enabled={status.providers.gemini_api_key_configured}
            />
            <GovernanceStatusCard
              title="RAG synthesis"
              description="Síntese com fontes controladas."
              enabled={status.rag.synthesis_enabled}
            />
            <GovernanceStatusCard
              title="Embeddings"
              description="Pipeline de embeddings Gemini."
              enabled={status.rag.gemini_embedding_enabled}
            />
            <GovernanceStatusCard
              title="Assistant read-only"
              description="Operação segura sem escrita externa."
              enabled={status.assistant.enabled && status.assistant.read_only}
            />
            <GovernanceStatusCard
              title="Protheus real"
              description="Integração real com ERP."
              enabled={status.protheus.real_send_enabled || status.protheus.erp_allow_real_send}
              danger
            />
          </div>

          {warnings.length > 0 ? (
            <Alert variant={status.protheus.real_send_enabled || status.protheus.erp_allow_real_send ? "destructive" : "warning"}>
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Warnings</AlertTitle>
              <AlertDescription className="space-y-2">
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </AlertDescription>
            </Alert>
          ) : null}

          <AiUsagePanel />

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Consumo por feature</CardTitle>
                <CardDescription>Agrupamento por operação registrada no backend.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature</TableHead>
                      <TableHead>Requests</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Erros</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageSummary.by_feature.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-text-muted">Nenhum uso registrado no período.</TableCell>
                      </TableRow>
                    ) : (
                      usageSummary.by_feature.map((item) => (
                        <TableRow key={item.feature}>
                          <TableCell className="font-medium">{item.feature}</TableCell>
                          <TableCell>{formatNumber(item.requests)}</TableCell>
                          <TableCell>{formatNumber(item.total_tokens)}</TableCell>
                          <TableCell>{formatNumber(item.errors)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Últimas chamadas</CardTitle>
                <CardDescription>Eventos recentes sem prompts, respostas ou metadados internos.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/hora</TableHead>
                      <TableHead>Feature</TableHead>
                      <TableHead>Provider/model</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageSummary.recent.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-text-muted">Nenhuma chamada recente.</TableCell>
                      </TableRow>
                    ) : (
                      usageSummary.recent.map((item, index) => (
                        <TableRow key={`${item.created_at ?? "sem-data"}-${item.feature}-${index}`}>
                          <TableCell>{formatDateTime(item.created_at)}</TableCell>
                          <TableCell className="font-medium">{item.feature}</TableCell>
                          <TableCell>{item.provider}/{item.model}</TableCell>
                          <TableCell>{formatNumber(item.total_tokens)}</TableCell>
                          <TableCell>{flagBadge(item.status === "success", "success", item.status || "warning")}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
