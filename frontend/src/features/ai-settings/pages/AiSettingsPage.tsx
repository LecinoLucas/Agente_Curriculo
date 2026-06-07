import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Database,
  FlaskConical,
  KeyRound,
  LoaderCircle,
  Lock,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "../../../components/common/PageHeader";
import type { AiAssistantResponse } from "../../ai-assistant/types";
import { aiSettingsService, type AiStatusResponse } from "../services/aiSettingsService";

const SENSITIVE_KEYS = new Set([
  "vector_json",
  "content_hash",
  "embedding",
  "embeddings",
  "payload_json",
  "review_notes",
  "internal_notes",
  "stack",
  "stack_trace",
  "api_key",
]);

const QUICK_TESTS = [
  {
    id: "search-protheus",
    label: "Buscar fontes sobre Protheus",
    intent: "knowledge.search",
    query: "Quando posso exportar admissão para o Protheus?",
    icon: Search,
  },
  {
    id: "answer-protheus",
    label: "Responder com fontes",
    intent: "knowledge.answer",
    query: "Quando posso exportar admissão para o Protheus?",
    icon: MessageSquare,
  },
  {
    id: "answer-policy",
    label: "Testar política antidiscriminatória",
    intent: "knowledge.answer",
    query: "Quais critérios não podem ser usados em uma vaga?",
    icon: ShieldCheck,
  },
] as const;

function filterSensitive(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(filterSensitive);

  const filtered: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!SENSITIVE_KEYS.has(key)) filtered[key] = filterSensitive(item);
  }
  return filtered;
}

function formatBool(value: boolean): string {
  return value ? "Ligado" : "Desligado";
}

function statusVariant(value: boolean): "success" | "warning" {
  return value ? "success" : "warning";
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Não foi possível executar o teste IA.";
}

function findSources(data: unknown): Array<Record<string, unknown>> {
  const safeData = filterSensitive(data);
  if (Array.isArray(safeData)) return safeData.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
  if (!safeData || typeof safeData !== "object") return [];

  const record = safeData as Record<string, unknown>;
  for (const key of ["sources", "chunks", "results"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function answerText(data: unknown, fallback: string | null): string | null {
  const safeData = filterSensitive(data);
  if (safeData && typeof safeData === "object" && !Array.isArray(safeData)) {
    const answer = (safeData as Record<string, unknown>).answer;
    if (typeof answer === "string" && answer.trim()) return answer;
    const message = (safeData as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function StatusBadge({ value }: { value: boolean }) {
  return (
    <Badge variant={statusVariant(value)}>
      {value ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <XCircle className="mr-1 h-3.5 w-3.5" />}
      {formatBool(value)}
    </Badge>
  );
}

function StatusCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="rounded-lg border border-border bg-surface-muted p-2 text-text-muted">
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function StatusRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border/70 pt-3 first:border-t-0 first:pt-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-right text-sm font-medium text-text">{value}</span>
    </div>
  );
}

function TestResult({ result }: { result: AiAssistantResponse }) {
  const safeData = filterSensitive(result.data);
  const sources = findSources(result.data);
  const answer = answerText(result.data, result.message);

  return (
    <div className="space-y-4" data-testid="ai-lab-result">
      <div className="rounded-lg border border-border bg-surface-muted p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={result.ok ? "success" : "danger"}>{result.ok ? "Sucesso" : "Erro"}</Badge>
          <Badge variant="outline">{result.intent}</Badge>
          {result.tool_name ? <Badge variant="outline">{result.tool_name}</Badge> : null}
        </div>

        {!result.ok ? (
          <p className="text-sm text-danger">{result.message ?? result.error_code ?? "Erro controlado."}</p>
        ) : answer ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-text">{answer}</p>
        ) : (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs text-text">
            {JSON.stringify(safeData, null, 2)}
          </pre>
        )}
      </div>

      {sources.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-text">Fontes</h3>
          {sources.slice(0, 5).map((source, index) => (
            <div key={index} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-text">
                {String(source.source_title ?? source.title ?? `Fonte ${index + 1}`)}
              </p>
              {source.excerpt ? (
                <p className="mt-1 text-sm text-text-muted">{String(source.excerpt)}</p>
              ) : null}
              {typeof source.score === "number" ? (
                <p className="mt-2 text-xs text-text-muted">
                  Relevância: {source.score.toFixed(3)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {result.warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3" data-testid="ai-lab-warnings">
          {result.warnings.map((warning) => (
            <p key={warning} className="text-sm text-amber-800">
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AiSettingsPage() {
  const [status, setStatus] = useState<AiStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<AiAssistantResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  async function loadStatus() {
    setStatusLoading(true);
    setStatusError(null);
    try {
      setStatus(await aiSettingsService.getStatus());
    } catch (error) {
      setStatusError(safeErrorMessage(error));
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  const statusWarnings = useMemo(() => status?.warnings ?? [], [status?.warnings]);

  async function runQuickTest(test: (typeof QUICK_TESTS)[number]) {
    setRunningTestId(test.id);
    setTestResult(null);
    setTestError(null);
    try {
      const response = await aiSettingsService.runAssistantTest({
        intent: test.intent,
        arguments: { query: test.query, limit: 5 },
      });
      setTestResult({
        ...response,
        data: filterSensitive(response.data),
        warnings: response.warnings.map(String),
      });
    } catch (error) {
      setTestError(safeErrorMessage(error));
    } finally {
      setRunningTestId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laboratório IA"
        subtitle="Status interno e testes controlados das features de IA."
      />

      {statusError ? (
        <Card className="border-danger/30 bg-danger/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-danger" />
              <p className="text-sm text-danger">{statusError}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => void loadStatus()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Recarregar
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {statusLoading ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Carregando status IA...
          </CardContent>
        </Card>
      ) : status ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <StatusCard
              title="Status geral"
              description={`Ambiente ${status.environment}`}
              icon={<FlaskConical className="h-5 w-5" />}
            >
              <StatusRow label="Provider" value={status.providers.provider} />
              <StatusRow label="Modelo padrão" value={status.providers.model} />
              <StatusRow label="Status" value={<Badge variant={status.ok ? "success" : "danger"}>{status.ok ? "Operacional" : "Indisponível"}</Badge>} />
            </StatusCard>

            <StatusCard
              title="Gemini"
              description="Configuração local do provider."
              icon={<KeyRound className="h-5 w-5" />}
            >
              <StatusRow label="Chave configurada" value={<StatusBadge value={status.providers.gemini_api_key_configured} />} />
              <StatusRow label="Embedding Gemini" value={<StatusBadge value={status.rag.gemini_embedding_enabled} />} />
              <StatusRow label="Modelo embedding" value={status.rag.embedding_model} />
            </StatusCard>

            <StatusCard
              title="RAG"
              description="Busca e síntese com fontes."
              icon={<Database className="h-5 w-5" />}
            >
              <StatusRow label="Provider embedding" value={status.rag.embedding_provider} />
              <StatusRow label="Síntese RAG" value={<StatusBadge value={status.rag.synthesis_enabled} />} />
              <StatusRow label="Modelo síntese" value={status.rag.synthesis_model} />
              <StatusRow label="Storage vetorial" value={status.rag.vector_storage_mode} />
            </StatusCard>

            <StatusCard
              title="Assistente"
              description="Execução interna estruturada."
              icon={<Bot className="h-5 w-5" />}
            >
              <StatusRow label="Habilitado" value={<StatusBadge value={status.assistant.enabled} />} />
              <StatusRow label="Read-only" value={<StatusBadge value={status.assistant.read_only} />} />
              <StatusRow label="Texto livre" value={<StatusBadge value={status.assistant.free_text_enabled} />} />
            </StatusCard>

            <StatusCard
              title="Protheus"
              description="Envio real permanece bloqueado."
              icon={<Lock className="h-5 w-5" />}
            >
              <StatusRow label="Envio real" value={<StatusBadge value={status.protheus.real_send_enabled} />} />
              <StatusRow label="ERP allow real send" value={<StatusBadge value={status.protheus.erp_allow_real_send} />} />
            </StatusCard>

            <StatusCard
              title="Warnings"
              description="Alertas de configuração."
              icon={<AlertTriangle className="h-5 w-5" />}
            >
              {statusWarnings.length > 0 ? (
                statusWarnings.map((warning) => (
                  <p key={warning} className="text-sm text-amber-700">
                    {warning}
                  </p>
                ))
              ) : (
                <p className="text-sm text-text-muted">Nenhum warning ativo.</p>
              )}
            </StatusCard>
          </div>

          {!status.providers.gemini_api_key_configured ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                <p className="text-sm text-amber-800">
                  Gemini não está configurado neste ambiente. Testes que dependem de síntese real
                  podem degradar para fallback controlado.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-[hsl(var(--primary))]" />
            Testes rápidos
          </CardTitle>
          <CardDescription>
            Consultas estruturadas e seguras contra a base de conhecimento. Nenhuma ação de escrita é executada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {QUICK_TESTS.map((test) => {
              const Icon = test.icon;
              const loading = runningTestId === test.id;
              return (
                <Button
                  key={test.id}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start gap-3 whitespace-normal p-4 text-left"
                  disabled={runningTestId !== null}
                  onClick={() => void runQuickTest(test)}
                  data-testid={`ai-lab-test-${test.id}`}
                >
                  {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                  <span>
                    <span className="block text-sm font-semibold">{test.label}</span>
                    <span className="block text-xs text-text-muted">{test.query}</span>
                  </span>
                </Button>
              );
            })}
          </div>

          {testError ? (
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
              {testError}
            </div>
          ) : null}

          {testResult ? <TestResult result={testResult} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
