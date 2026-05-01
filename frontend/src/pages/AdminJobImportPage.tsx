import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Copy, FileJson, Play, RefreshCcw, SearchCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "../components/common/PageHeader";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  jobImportSmartService,
  DEFAULT_JOB_IMPORT_AI_PROMPT,
  type SmartImportExecutionResult,
  type SmartImportExecutionSummary,
  type SmartImportPayload,
  type SmartImportPreview,
} from "../services/jobImportSmartService";
import {
  formatErrorForToast,
  handleApiError,
  safeRequest,
  type UserFriendlyError,
} from "../services/errorHandler";
import { toast } from "../services/toast";

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

function renderChips(items: string[], emptyText: string, tone: "neutral" | "danger" = "neutral") {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className={[
            "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
            tone === "danger"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
              : "border-border bg-muted/60 text-foreground",
          ].join(" ")}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function PreviewTable({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: SmartImportPreview["items"];
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma vaga nesta categoria.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Título</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Área</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Localização</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Observações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.index}-${item.title}`} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 text-foreground">{item.title}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.job_area ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.location ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {item.errors.length > 0
                        ? `Erros: ${item.errors.join(" • ")}`
                        : item.missing_skills.length > 0
                          ? `Skills ausentes: ${item.missing_skills.join(", ")}`
                          : item.warnings.join(" • ") || "Pronta"}
                    </td>
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

function toCanonicalPayloadJson(preview: SmartImportPreview): string {
  const payload: SmartImportPayload = {
    jobs: preview.jobs,
    options: preview.options,
  };
  return JSON.stringify(payload, null, 2);
}

function ResultTable({ results }: { results: SmartImportExecutionResult[] }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Resultado final</CardTitle>
        <CardDescription>Resumo por vaga após dry run ou execução final.</CardDescription>
      </CardHeader>
      <CardContent>
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum resultado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Título</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ação</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Qualidade</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Erros</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={`${result.action}-${result.title}-${result.job_id ?? "none"}`} className="border-b border-border/60 last:border-0 align-top">
                    <td className="px-3 py-2 text-foreground">{result.title}</td>
                    <td className="px-3 py-2 text-muted-foreground">{result.action === "create" ? "Criar" : "Atualizar"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={[
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                          result.status === "failed"
                            ? "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300"
                            : result.status === "preview_only"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300"
                              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300",
                        ].join(" ")}
                      >
                        {result.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {result.quality_score != null ? `${result.quality_score}/100${result.quality_status ? ` • ${result.quality_status}` : ""}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-red-700 dark:text-red-300">
                      {result.errors.length > 0 ? result.errors.join(" • ") : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-muted-foreground">
                      {result.warnings.length > 0 ? result.warnings.join(" • ") : "—"}
                    </td>
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

function SummaryCards({ preview }: { preview: SmartImportPreview }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <KpiCard label="Total no JSON" value={preview.total} hint="Quantidade total de vagas no payload" icon={<FileJson className="h-4 w-4 text-blue-600" />} />
      <KpiCard label="Vagas novas" value={preview.new_jobs} hint="Serão enviadas ao bulk-import" icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
      <KpiCard label="Vagas existentes" value={preview.existing_jobs} hint="Serão enviadas ao bulk-update" icon={<RefreshCcw className="h-4 w-4 text-amber-600" />} />
      <KpiCard label="Skills encontradas" value={preview.skills_found.length} hint="Skills já existentes no catálogo" icon={<SearchCheck className="h-4 w-4 text-indigo-600" />} />
      <KpiCard label="Skills ausentes" value={preview.skills_missing.length} hint="Precisam existir antes da execução" icon={<Play className="h-4 w-4 text-red-600" />} />
    </div>
  );
}

export function AdminJobImportPage() {
  const navigate = useNavigate();
  const [rawJson, setRawJson] = useState("");
  const [preview, setPreview] = useState<SmartImportPreview | null>(null);
  const [results, setResults] = useState<SmartImportExecutionSummary | null>(null);
  const [friendlyError, setFriendlyError] = useState<UserFriendlyError | null>(null);
  const [loading, setLoading] = useState<"validate" | "dry-run" | "execute" | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // PROTEÇÃO CONTRA DUPLO ENVIO: Flag para bloquear múltiplos cliques
  const isSubmitting = loading !== null;

  // REQUEST ID ÚNICO para rastreamento de cada operação
  const createRequestId = () => `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const createItems = useMemo(
    () => preview?.items.filter((item) => item.action === "create") ?? [],
    [preview],
  );
  const updateItems = useMemo(
    () => preview?.items.filter((item) => item.action === "update") ?? [],
    [preview],
  );
  const normalizationWarnings = useMemo(
    () => preview?.items.flatMap((item) => item.warnings) ?? [],
    [preview],
  );

  // SEMPRE usar textarea como source of truth - Limpar estados antigos quando textarea muda
  function handleTextareaChange(value: string) {
    setRawJson(value);
    setIsDirty(true);
    // Limpar preview antigo quando usuário edita textarea
    setPreview(null);
    setResults(null);
    setFriendlyError(null);
    console.log("[handleTextareaChange] Textarea editado - limpando preview/results/errors");
  }

  // Função CENTRAL: constrói payload SEMPRE do textarea atual
  function buildFinalPayloadFromCurrentTextarea(): string {
    if (!rawJson || !rawJson.trim()) {
      throw new Error("JSON vazio. Cole um payload JSON válido com pelo menos uma vaga.");
    }

    console.log(`[buildFinalPayloadFromCurrentTextarea] Textarea length: ${rawJson.length}`);

    // 1. Corrigir deal-breakers
    let currentJson = rawJson;
    try {
      const fixResult = jobImportSmartService.fixDealBreakers(currentJson);
      if (fixResult.fixed) {
        currentJson = fixResult.json;
        console.log("[buildFinalPayloadFromCurrentTextarea] Deal-breakers corrigidos");
      }
    } catch (error) {
      console.warn("[buildFinalPayloadFromCurrentTextarea] Erro ao corrigir deal-breakers:", error);
    }

    // 2. Normalizar payload
    try {
      const normalizeResult = jobImportSmartService.normalizePayload(currentJson);
      currentJson = normalizeResult.json;
      console.log("[buildFinalPayloadFromCurrentTextarea] Payload normalizado");
      console.log("[buildFinalPayloadFromCurrentTextarea] Normalization corrections:", normalizeResult.corrections);
    } catch (error) {
      console.warn("[buildFinalPayloadFromCurrentTextarea] Erro ao normalizar:", error);
    }

    // 3. Log FINAL do payload que será enviado
    try {
      const finalPayload = JSON.parse(currentJson);
      console.log(`[buildFinalPayloadFromCurrentTextarea] FINAL PAYLOAD STRUCTURE:`, {
        jobsCount: Array.isArray(finalPayload.jobs) ? finalPayload.jobs.length : 0,
        firstJobArea: finalPayload.jobs?.[0]?.job_area,
        firstJobStatus: finalPayload.jobs?.[0]?.status,
        fullPayload: JSON.stringify(finalPayload, null, 2),
      });
    } catch (parseError) {
      console.error("[buildFinalPayloadFromCurrentTextarea] Erro ao parsear final payload:", parseError);
    }

    return currentJson;
  }

  function clearFriendlyError() {
    setFriendlyError(null);
  }

  function presentFriendlyError(error: UserFriendlyError) {
    setFriendlyError(error);
    toast.error(formatErrorForToast(error));
  }


  async function handleValidate() {
    const requestId = createRequestId();
    console.log(`[handleValidate] Starting validation - requestId: ${requestId}`);

    setLoading("validate");
    setFriendlyError(null);
    setIsDirty(false);

    try {
      // SEMPRE usar textarea atual como source of truth
      const currentJson = buildFinalPayloadFromCurrentTextarea();

      console.log(`[handleValidate] ${requestId} - About to call detectExistingJobs with payload:`, {
        length: currentJson.length,
        preview: currentJson.substring(0, 200),
      });

      const data = await safeRequest(() => jobImportSmartService.detectExistingJobs(currentJson), {
        onError: (error) => {
          setPreview(null);
          setResults(null);
          presentFriendlyError(error);
        },
      });
      if (!data) return;

      const canonicalJson = toCanonicalPayloadJson(data);
      if (canonicalJson !== rawJson) {
        console.log(`[handleValidate] ${requestId} - Updating textarea with canonical JSON`);
        setRawJson(canonicalJson);
      }

      setPreview(data);
      setResults(null);
      toast.success("JSON validado e padronizado com sucesso.");
      console.log(`[handleValidate] ${requestId} - Validation SUCCESS`);
    } catch (error) {
      console.error(`[handleValidate] ${requestId} - Validation ERROR:`, error);
      const friendly = handleApiError(error);
      setPreview(null);
      setResults(null);
      presentFriendlyError(friendly);
    } finally {
      setLoading(null);
    }
  }

  async function handleDryRun() {
    const requestId = createRequestId();
    console.log(`[handleDryRun] Starting - requestId: ${requestId}`);

    // PROTEÇÃO CONTRA DUPLO ENVIO
    if (isSubmitting) {
      console.warn(`[handleDryRun] ${requestId} - Tentativa de duplo envio bloqueada`);
      toast.warning("Operação já em andamento. Aguarde...");
      return;
    }

    if (!rawJson.trim()) {
      toast.warning("Cole um JSON válido no textarea.");
      return;
    }

    setLoading("dry-run");
    setFriendlyError(null);

    try {
      // SEMPRE usar textarea atual - NUNCA usar preview cacheado
      const executionJson = buildFinalPayloadFromCurrentTextarea();

      console.log(`[handleDryRun] ${requestId} - FINAL PAYLOAD BEFORE DRY RUN:`, {
        timestamp: new Date().toISOString(),
        payloadFull: JSON.stringify(JSON.parse(executionJson), null, 2),
      });

      const summary = await safeRequest(() => jobImportSmartService.dryRun(executionJson), {
        onError: (error) => presentFriendlyError(error),
      });

      if (!summary) {
        console.error(`[handleDryRun] ${requestId} - No summary returned`);
        return;
      }

      setResults(summary);
      console.log(`[handleDryRun] ${requestId} - DRY RUN SUCCESS`);
      toast.success("Dry Run - Teste concluído.");
    } catch (error) {
      console.error(`[handleDryRun] ${requestId} - DRY RUN ERROR:`, error);
      presentFriendlyError(handleApiError(error));
    } finally {
      setLoading(null);
    }
  }

  async function handleExecute() {
    const requestId = createRequestId();
    console.log(`[handleExecute] Starting - requestId: ${requestId}`);

    // PROTEÇÃO CONTRA DUPLO ENVIO
    if (isSubmitting) {
      console.warn(`[handleExecute] ${requestId} - Tentativa de duplo envio bloqueada`);
      toast.warning("Operação já em andamento. Aguarde...");
      return;
    }

    if (!rawJson.trim()) {
      toast.warning("Cole um JSON válido no textarea.");
      return;
    }

    setLoading("execute");
    setFriendlyError(null);

    try {
      // SEMPRE usar textarea atual - NUNCA usar preview cacheado
      const executionJson = buildFinalPayloadFromCurrentTextarea();

      console.log(`[handleExecute] ${requestId} - FINAL PAYLOAD BEFORE EXECUTION:`, {
        timestamp: new Date().toISOString(),
        payloadFull: JSON.stringify(JSON.parse(executionJson), null, 2),
      });

      const summary = await safeRequest(() => jobImportSmartService.execute(executionJson), {
        onError: (error) => presentFriendlyError(error),
      });

      if (!summary) {
        console.error(`[handleExecute] ${requestId} - No summary returned`);
        return;
      }

      setResults(summary);
      console.log(`[handleExecute] ${requestId} - EXECUTION SUCCESS`);
      toast.success("Importação inteligente concluída.");
    } catch (error) {
      console.error(`[handleExecute] ${requestId} - EXECUTION ERROR:`, error);
      presentFriendlyError(handleApiError(error));
    } finally {
      setLoading(null);
    }
  }

  function handleLoadTemplate() {
    setRawJson(jobImportSmartService.DEFAULT_JOB_IMPORT_TEMPLATE);
    clearFriendlyError();
    toast.info("Modelo padrão carregado.");
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(DEFAULT_JOB_IMPORT_AI_PROMPT);
      toast.success("Prompt copiado para a área de transferência.");
    } catch (error) {
      console.error("[AdminJobImportPage][copy-prompt]", error);
      presentFriendlyError(handleApiError(error));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Importar vagas via JSON"
        subtitle="Painel admin para importar ou atualizar vagas usando os endpoints existentes de bulk-import e bulk-update."
        actions={
          <Button variant="outline" onClick={() => navigate("/admin")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao admin
          </Button>
        }
      />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Payload JSON</CardTitle>
          <CardDescription>
            Aceita um array de vagas ou um objeto com a chave <code>jobs</code>. A detecção usa <code>title + job_area + location</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            value={rawJson}
            onChange={(event) => handleTextareaChange(event.target.value)}
            placeholder='[{"title":"Analista de Dados","description":"..."}]'
            className="min-h-[320px] w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-3 font-mono text-sm text-[hsl(var(--text))] outline-none transition focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary))]/15"
          />

          {friendlyError ? (
            <div className="space-y-3">
              <ErrorAlert error={friendlyError} onDismiss={clearFriendlyError} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={clearFriendlyError}>
                  Limpar erro
                </Button>
                <Button type="button" variant="outline" onClick={() => void handleValidate()} disabled={loading !== null || !rawJson.trim()}>
                  Validar JSON novamente
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleLoadTemplate} disabled={loading !== null}>
              Carregar modelo padrão
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleCopyPrompt()} disabled={loading !== null}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar prompt para IA
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleValidate()} disabled={loading !== null || !rawJson.trim()}>
              {loading === "validate" ? "Validando…" : "Validar JSON"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleDryRun()} disabled={loading !== null || !rawJson.trim()}>
              {loading === "dry-run" ? "Executando…" : "Dry Run - Teste"}
            </Button>
            <Button type="button" onClick={() => void handleExecute()} disabled={loading !== null || !rawJson.trim()}>
              {loading === "execute" ? "Importando…" : "Executar importação"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview ? (
        <>
          <SummaryCards preview={preview} />

          <div className="grid gap-4 lg:grid-cols-2">
            <PreviewTable
              title="Vagas novas"
              description="Itens que serão criados via bulk-import."
              items={createItems}
            />
            <PreviewTable
              title="Vagas existentes"
              description="Itens detectados no sistema e que serão enviados ao bulk-update."
              items={updateItems}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Skills encontradas</CardTitle>
                <CardDescription>Competências já presentes no catálogo.</CardDescription>
              </CardHeader>
              <CardContent>{renderChips(preview.skills_found, "Nenhuma skill encontrada.")}</CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Skills inexistentes</CardTitle>
                <CardDescription>Essas skills precisam existir antes da execução final.</CardDescription>
              </CardHeader>
              <CardContent>{renderChips(preview.skills_missing, "Nenhuma skill ausente.", "danger")}</CardContent>
            </Card>
          </div>

          <Card className="border-amber-200 bg-amber-50 shadow-sm dark:border-amber-900/30 dark:bg-amber-950/20">
            <CardContent className="pt-6">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Dry run valida e simula criação apenas para vagas novas. Vagas existentes aparecem como preview de update porque o backend atual não possui dry run para <code>bulk-update</code>.
              </p>
            </CardContent>
          </Card>

          {normalizationWarnings.length > 0 ? (
            <Card className="border-sky-200 bg-sky-50 shadow-sm dark:border-sky-900/30 dark:bg-sky-950/20">
              <CardHeader>
                <CardTitle className="text-base">Algumas correções foram aplicadas automaticamente</CardTitle>
                <CardDescription>
                  Ajustes automáticos feitos para converter o JSON recebido para o formato padrão antes do preview e da execução.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-sky-700 dark:text-sky-300">
                  {normalizationWarnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>• {warning}</li>
                  ))}
                </ul>
                <div className="mt-4">
                  <Button type="button" variant="outline" onClick={() => void handleExecute()} disabled={loading !== null || !preview}>
                    Continuar mesmo assim
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon="⇪"
          title="Sem preview carregado"
          description="Cole um JSON de vagas e use Validar JSON para ver a separação entre criação, atualização e skills faltantes."
        />
      )}

      {results ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <KpiCard label="Total" value={results.total} hint="Vagas processadas" icon={<FileJson className="h-4 w-4 text-blue-600" />} />
            <KpiCard label="Criadas" value={results.created} hint="Criadas via bulk-import" icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
            <KpiCard label="Atualizadas" value={results.updated} hint="Atualizadas via bulk-update" icon={<RefreshCcw className="h-4 w-4 text-indigo-600" />} />
            <KpiCard label="Falhas" value={results.failed} hint="Erros por vaga" icon={<Play className="h-4 w-4 text-red-600" />} />
            <KpiCard label="Puladas" value={results.skipped} hint="Skips retornados pelo backend" icon={<SearchCheck className="h-4 w-4 text-amber-600" />} />
            <KpiCard label="Preview only" value={results.preview_only} hint="Updates não executados no dry run" icon={<RefreshCcw className="h-4 w-4 text-slate-600" />} />
          </div>

          <ResultTable results={results.results} />
        </>
      ) : null}
    </div>
  );
}
