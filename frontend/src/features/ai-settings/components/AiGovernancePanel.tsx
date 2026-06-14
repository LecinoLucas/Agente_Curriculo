import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BrainCircuit, CheckCircle2, FlaskConical, HeartPulse, KeyRound, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { aiSettingsService, type AiStatusResponse } from "../services/aiSettingsService";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadGovernance() {
      setLoading(true);
      setError(null);
      try {
        const nextStatus = await aiSettingsService.getStatus();

        if (!mounted) return;
        setStatus(nextStatus);
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
    if (!status) return [];

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
    return Array.from(new Set(items));
  }, [status]);

  const executiveSummary = useMemo(() => {
    if (!status) return null;
    return [
      {
        label: "Provider padrão",
        value: `${status.providers.provider}/${status.providers.model}`,
      },
      {
        label: "Assistente",
        value: status.assistant.enabled ? "Habilitado" : "Desligado",
      },
      {
        label: "RAG synthesis",
        value: status.rag.synthesis_enabled ? "Habilitado" : "Desligado",
      },
      {
        label: "Envio real Protheus",
        value: status.protheus.real_send_enabled || status.protheus.erp_allow_real_send ? "Ligado" : "Desligado",
      },
    ];
  }, [status]);

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

      {status ? (
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
                <CardDescription>Separação explícita entre governança, observabilidade operacional e auditoria.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full justify-start" onClick={() => navigate("/admin/ia/uso")}>
                  <ArrowRight className="mr-2 h-4 w-4" /> Abrir central de uso de IA
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={() => navigate("/admin/ia")}>
                  <FlaskConical className="mr-2 h-4 w-4" /> Laboratório IA
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={() => navigate("/admin/ai-provider-credentials")}>
                  <KeyRound className="mr-2 h-4 w-4" /> Credenciais IA
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={() => navigate("/admin/conhecimento")}>
                  <BrainCircuit className="mr-2 h-4 w-4" /> Base de conhecimento
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

          <Card>
            <CardHeader>
              <CardTitle>Uso operacional e custos</CardTitle>
              <CardDescription>
                Tokens, custos, modelos, eventos recentes e falhas foram centralizados na nova visão única.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1 text-sm text-text-muted">
                <p>A governança continua aqui. A operação diária de consumo foi movida para a central.</p>
                <p>Esta página não replica mais tabelas de tokens, custo, chamadas recentes nem breakdown por feature.</p>
              </div>
              <Button type="button" onClick={() => navigate("/admin/ia/uso")}>
                Ver central de uso
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Configuração ativa</CardTitle>
                <CardDescription>Estados atuais de provider, assistente, RAG e governança de envio real.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Área</TableHead>
                      <TableHead>Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Provider padrão</TableCell>
                      <TableCell>{status.providers.provider}/{status.providers.model}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Assistant read-only</TableCell>
                      <TableCell>{flagBadge(status.assistant.enabled && status.assistant.read_only, "Ligado", "Desligado")}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">RAG synthesis</TableCell>
                      <TableCell>{flagBadge(status.rag.synthesis_enabled, "Ligado", "Desligado")}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Embeddings Gemini</TableCell>
                      <TableCell>{flagBadge(status.rag.gemini_embedding_enabled, "Ligado", "Desligado")}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Últimas referências de configuração</CardTitle>
                <CardDescription>Metadados de governança e ambiente, sem eventos operacionais duplicados.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Ambiente</TableCell>
                      <TableCell>{status.environment}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Modelo embedding</TableCell>
                      <TableCell>{status.rag.embedding_model}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Modelo síntese</TableCell>
                      <TableCell>{status.rag.synthesis_model}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Storage vetorial</TableCell>
                      <TableCell>{status.rag.vector_storage_mode}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Observabilidade operacional</TableCell>
                      <TableCell>Centralizada em /admin/ia/uso</TableCell>
                    </TableRow>
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
