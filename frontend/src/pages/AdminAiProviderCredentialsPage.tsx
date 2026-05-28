import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  Plus,
  RefreshCcw,
  RotateCw,
  Search,
  ShieldOff,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "../components/common/PageHeader";
import {
  adminAiProviderCredentialsService,
  type AIProviderCredential,
  type AIProviderCredentialStatus,
} from "../services/adminAiProviderCredentialsService";
import { toast } from "../shared/utils/toast";

const PROVIDER_OPTIONS = [
  { value: "", label: "Todos os providers" },
  { value: "google", label: "Gemini / Google" },
  { value: "anthropic", label: "Claude / Anthropic" },
] as const;

const CREATE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter((option) => option.value);

const STATUS_META: Record<
  AIProviderCredentialStatus,
  { label: string; badgeClass: string; icon: typeof CheckCircle2 }
> = {
  active: {
    label: "Ativa",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
  rate_limited: {
    label: "Em cooldown",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    icon: AlertTriangle,
  },
  invalid: {
    label: "Inválida",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
    icon: XCircle,
  },
  disabled: {
    label: "Desativada",
    badgeClass: "border-slate-200 bg-slate-50 text-slate-600",
    icon: ShieldOff,
  },
};

const emptyCreateForm = {
  provider: "google",
  modelId: "",
  label: "",
  apiKey: "",
};

function providerLabel(provider: string) {
  if (provider === "google" || provider === "gemini") return "Gemini / Google";
  if (provider === "anthropic" || provider === "claude") return "Claude / Anthropic";
  return provider || "—";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function safeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function secretOperationError(fallback: string) {
  return fallback;
}

function StatusBadge({ status }: { status: AIProviderCredentialStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.disabled;
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={meta.badgeClass}>
      <Icon className="mr-1 h-3.5 w-3.5" />
      {meta.label}
    </Badge>
  );
}

type CredentialSecretDialogProps = {
  mode: "create" | "rotate";
  credential?: AIProviderCredential | null;
  open: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: typeof emptyCreateForm) => Promise<void>;
  onRotate: (apiKey: string) => Promise<void>;
};

function CredentialSecretDialog({
  mode,
  credential,
  open,
  loading,
  onOpenChange,
  onCreate,
  onRotate,
}: CredentialSecretDialogProps) {
  const [form, setForm] = useState(emptyCreateForm);
  const [rotateApiKey, setRotateApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(emptyCreateForm);
      setRotateApiKey("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (mode === "create") {
      if (!form.provider || !form.label.trim() || !form.apiKey.trim()) {
        setError("Provider, label e chave são obrigatórios.");
        return;
      }
      const payload = { ...form };
      setForm((current) => ({ ...current, apiKey: "" }));
      try {
        await onCreate(payload);
        setForm(emptyCreateForm);
      } catch {
        setError(secretOperationError("Não foi possível cadastrar a credencial."));
      }
      return;
    }

    if (!rotateApiKey.trim()) {
      setError("Informe a nova chave.");
      return;
    }
    const nextApiKey = rotateApiKey;
    setRotateApiKey("");
    try {
      await onRotate(nextApiKey);
      setRotateApiKey("");
    } catch {
      setError(secretOperationError("Não foi possível rotacionar a credencial."));
    }
  }

  const title = mode === "create" ? "Adicionar credencial IA" : "Rotacionar credencial";
  const description =
    mode === "create"
      ? "A chave será criptografada e não poderá ser visualizada novamente."
      : `A credencial ${credential?.label ?? ""} receberá uma nova chave criptografada.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-[hsl(var(--primary))]" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === "create" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ai-provider">Provider</Label>
                  <select
                    id="ai-provider"
                    value={form.provider}
                    onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                    className="h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                  >
                    {CREATE_PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-model-id">Modelo</Label>
                  <Input
                    id="ai-model-id"
                    value={form.modelId}
                    onChange={(event) => setForm((current) => ({ ...current, modelId: event.target.value }))}
                    placeholder="Opcional"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-label">Label</Label>
                <Input
                  id="ai-label"
                  value={form.label}
                  onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                  placeholder="Ex: Gemini principal"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-api-key">API key</Label>
                <Input
                  id="ai-api-key"
                  type="password"
                  value={form.apiKey}
                  onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                  placeholder="Cole a chave uma única vez"
                  autoComplete="new-password"
                />
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-border bg-surface-muted p-3 text-sm">
                <p className="font-medium text-text">{credential?.label ?? "Credencial"}</p>
                <p className="mt-1 text-text-muted">
                  {providerLabel(credential?.provider ?? "")} · {credential?.model_id || "modelo geral"} ·{" "}
                  {credential?.masked_key ?? "****"}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-rotate-api-key">Nova API key</Label>
                <Input
                  id="ai-rotate-api-key"
                  type="password"
                  value={rotateApiKey}
                  onChange={(event) => setRotateApiKey(event.target.value)}
                  placeholder="Cole a nova chave"
                  autoComplete="new-password"
                />
              </div>
            </>
          )}

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Falha na operação</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : mode === "create" ? "Salvar credencial" : "Rotacionar chave"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdminAiProviderCredentialsPage() {
  const [credentials, setCredentials] = useState<AIProviderCredential[]>([]);
  const [providerFilter, setProviderFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [rotatingCredential, setRotatingCredential] = useState<AIProviderCredential | null>(null);

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminAiProviderCredentialsService.list({
        provider: providerFilter || undefined,
        model_id: modelFilter.trim() || undefined,
      });
      setCredentials(response);
    } catch (loadError) {
      setError(safeErrorMessage(loadError, "Não foi possível carregar as credenciais."));
    } finally {
      setLoading(false);
    }
  }, [modelFilter, providerFilter]);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  const summary = useMemo(() => {
    return credentials.reduce(
      (acc, credential) => {
        acc.total += 1;
        acc[credential.status] += 1;
        return acc;
      },
      { total: 0, active: 0, disabled: 0, rate_limited: 0, invalid: 0 },
    );
  }, [credentials]);

  async function handleCreate(form: typeof emptyCreateForm) {
    setActionLoading(true);
    try {
      await adminAiProviderCredentialsService.create({
        provider: form.provider,
        model_id: form.modelId.trim() || null,
        label: form.label.trim(),
        api_key: form.apiKey,
      });
      setCreateOpen(false);
      toast.success("Credencial IA cadastrada com segurança.");
      await loadCredentials();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRotate(apiKey: string) {
    if (!rotatingCredential) return;
    setActionLoading(true);
    try {
      await adminAiProviderCredentialsService.rotate(rotatingCredential.id, apiKey);
      setRotatingCredential(null);
      toast.success("Chave rotacionada. A nova chave não será exibida.");
      await loadCredentials();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleStatus(credential: AIProviderCredential) {
    if (
      credential.status !== "disabled" &&
      !window.confirm(`Desativar a credencial "${credential.label}"? O provider deixará de usar esta chave.`)
    ) {
      return;
    }
    setActionLoading(true);
    try {
      if (credential.status === "disabled") {
        await adminAiProviderCredentialsService.enable(credential.id);
        toast.success("Credencial ativada.");
      } else {
        await adminAiProviderCredentialsService.disable(credential.id);
        toast.success("Credencial desativada.");
      }
      await loadCredentials();
    } catch (toggleError) {
      toast.error(safeErrorMessage(toggleError, "Não foi possível alterar o status da credencial."));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Credenciais de IA"
        subtitle="Gerencie chaves criptografadas para Gemini e Claude sem expor segredos."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar chave
          </Button>
        }
      />

      <Alert className="border-blue-200 bg-blue-50 text-blue-900">
        <LockKeyhole className="h-4 w-4" />
        <AlertTitle>Chaves nunca são exibidas depois de salvas</AlertTitle>
        <AlertDescription>
          A API retorna apenas chave mascarada e últimos 4 caracteres. Use rotação para substituir uma chave existente.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl">{summary.total}</CardTitle>
          </CardHeader>
        </Card>
        {(["active", "rate_limited", "invalid", "disabled"] as AIProviderCredentialStatus[]).map((status) => (
          <Card key={status}>
            <CardHeader className="pb-2">
              <CardDescription>{STATUS_META[status].label}</CardDescription>
              <CardTitle className="text-2xl">{summary[status]}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-[hsl(var(--primary))]" />
              Chaves cadastradas
            </CardTitle>
            <CardDescription>Filtros por provider e modelo usam o endpoint admin protegido.</CardDescription>
          </div>
          <div className="grid gap-2 sm:grid-cols-[180px_minmax(180px,260px)_auto]">
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
              className="h-10 rounded-md border border-input bg-card px-3 py-2 text-sm"
              aria-label="Filtrar provider"
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-text-muted" />
              <Input
                value={modelFilter}
                onChange={(event) => setModelFilter(event.target.value)}
                placeholder="Filtrar modelo"
                className="pl-9"
                autoComplete="off"
              />
            </div>
            <Button variant="outline" onClick={() => void loadCredentials()} disabled={loading} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Erro ao carregar credenciais</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-muted">
              Carregando credenciais...
            </div>
          ) : credentials.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <KeyRound className="mx-auto h-8 w-8 text-text-muted" />
              <p className="mt-3 text-sm font-medium text-text">Nenhuma credencial encontrada.</p>
              <p className="mt-1 text-sm text-text-muted">
                Cadastre uma chave para o worker usar credenciais persistentes.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Credencial</TableHead>
                  <TableHead>Provider / modelo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead>Cooldown</TableHead>
                  <TableHead>Último erro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {credentials.map((credential) => (
                  <TableRow key={credential.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-text">{credential.label}</p>
                        <p className="font-mono text-xs text-text-muted">
                          {credential.masked_key}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm">{providerLabel(credential.provider)}</p>
                        <p className="text-xs text-text-muted">{credential.model_id || "modelo geral"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={credential.status} />
                    </TableCell>
                    <TableCell>{credential.priority}</TableCell>
                    <TableCell>{formatDateTime(credential.last_used_at)}</TableCell>
                    <TableCell>{formatDateTime(credential.cooldown_until)}</TableCell>
                    <TableCell>
                      <div className="max-w-[180px] truncate" title={credential.last_error_type ?? undefined}>
                        {credential.last_error_type || "—"}
                      </div>
                      {credential.last_error_at ? (
                        <p className="text-xs text-text-muted">
                          {formatDateTime(credential.last_error_at)}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setRotatingCredential(credential)}
                          disabled={actionLoading}
                          className="gap-2"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                          Rotacionar
                        </Button>
                        <Button
                          type="button"
                          variant={credential.status === "disabled" ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => void handleToggleStatus(credential)}
                          disabled={actionLoading}
                        >
                          {credential.status === "disabled" ? "Ativar" : "Desativar"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CredentialSecretDialog
        mode="create"
        open={createOpen}
        loading={actionLoading}
        onOpenChange={setCreateOpen}
        onCreate={handleCreate}
        onRotate={async () => undefined}
      />

      <CredentialSecretDialog
        mode="rotate"
        credential={rotatingCredential}
        open={Boolean(rotatingCredential)}
        loading={actionLoading}
        onOpenChange={(open) => {
          if (!open) setRotatingCredential(null);
        }}
        onCreate={async () => undefined}
        onRotate={handleRotate}
      />
    </div>
  );
}
