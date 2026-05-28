import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { aiLimitsService, type LimitScope } from "../../services/aiLimitsService";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  defaults: { per_user: number; per_job: number; global: number; override_max_days: number };
  /** Pre-fill scope/scope_id when opened from a contextual action. */
  initialScope?: LimitScope;
  initialScopeId?: string | null;
};

function defaultExpiresAt(hoursAhead = 24): string {
  const d = new Date(Date.now() + hoursAhead * 3600_000);
  // Format as YYYY-MM-DDTHH:MM for datetime-local input
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AILimitIncreaseModal({
  open,
  onClose,
  onCreated,
  defaults,
  initialScope = "global",
  initialScopeId = null,
}: Props) {
  const [scope, setScope] = useState<LimitScope>(initialScope);
  const [scopeId, setScopeId] = useState<string>(initialScopeId ?? "");
  const [newLimit, setNewLimit] = useState<number>(defaults.global + 100);
  const [expiresAt, setExpiresAt] = useState<string>(defaultExpiresAt());
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    if (!reason.trim()) {
      setErrorMessage("Motivo é obrigatório.");
      return;
    }
    if (scope !== "global" && !scopeId.trim()) {
      setErrorMessage("scope_id é obrigatório para escopo user/job.");
      return;
    }
    setSubmitting(true);
    try {
      await aiLimitsService.createOverride({
        scope,
        scope_id: scope === "global" ? null : scopeId.trim(),
        new_limit: Number(newLimit),
        expires_at: new Date(expiresAt).toISOString(),
        reason: reason.trim(),
      });
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Falha ao criar override.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <header className="mb-4">
          <h2 className="text-lg font-bold text-text">Aumentar limite</h2>
          <p className="mt-1 text-sm text-text-muted">
            Aumento temporário do limite diário de análises IA. Expira em até {defaults.override_max_days} dias e fica registrado no log de auditoria.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-text-muted">Escopo</span>
            <Select
              className="h-11"
              value={scope}
              onChange={(e) => setScope(e.target.value as LimitScope)}
            >
              <option value="global">Global</option>
              <option value="user">Usuário</option>
              <option value="job">Vaga</option>
            </Select>
          </label>

          {scope !== "global" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-text-muted">
                ID do {scope === "user" ? "usuário" : "vaga"}
              </span>
              <Input
                className="h-11"
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                placeholder="UUID"
                required
              />
            </label>
          ) : null}

          <label className="block text-sm">
            <span className="mb-1 block text-text-muted">Novo limite (precisa ser maior que o atual)</span>
            <Input
              type="number"
              min={1}
              className="h-11"
              value={newLimit}
              onChange={(e) => setNewLimit(Number(e.target.value))}
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-text-muted">Validade até</span>
            <Input
              type="datetime-local"
              className="h-11"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-text-muted">Motivo</span>
            <Textarea
              className="min-h-[88px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explique por que este aumento é necessário"
              required
              maxLength={500}
            />
          </label>

          {errorMessage ? (
            <p className="text-sm text-danger">{errorMessage}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Criando..." : "Confirmar aumento"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
