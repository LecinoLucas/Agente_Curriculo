import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";
import type { SmartRefreshPreview } from "../../../services/jobsService";

type SmartRefreshModalProps = {
  open: boolean;
  preview: SmartRefreshPreview | null;
  previewLoading: boolean;
  executing: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
};

const SKIP_REASON_LABELS: Record<string, string> = {
  already_processing: "já em processamento",
  no_resume: "sem currículo",
};

export function SmartRefreshModal({
  open,
  preview,
  previewLoading,
  executing,
  onClose,
  onConfirm,
}: SmartRefreshModalProps) {
  if (!open) return null;

  const loading = previewLoading || executing;

  return (
    <Modal title="Atualizar candidatos?" onClose={onClose}>
      <div className="space-y-4 px-6 py-5">
        <p className="text-sm text-text-muted">
          Candidatos com análise completa e dados válidos terão o ranking recalculado sem custo de
          IA. Os demais serão enviados para (re)análise IA.
        </p>

        {previewLoading && (
          <p className="text-sm text-text-muted">Carregando prévia...</p>
        )}

        {preview && !previewLoading && (
          <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Total de candidatos</span>
              <span className="font-medium text-text">{preview.total_candidates}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-muted">Recálculo de ranking (sem IA)</span>
              <span className="font-medium text-text">{preview.ranking_recalculation.count}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-muted">
                Análise IA
                {preview.ai_analysis.may_use_provider && preview.ai_analysis.count > 0
                  ? " (usa créditos IA)"
                  : ""}
              </span>
              <span
                className={`font-medium ${
                  preview.ai_analysis.count > 0 ? "text-[hsl(var(--warning))]" : "text-text"
                }`}
              >
                {preview.ai_analysis.count}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-muted">Ignorados</span>
              <span className="font-medium text-text">{preview.skipped.count}</span>
            </div>

            {preview.skipped.count > 0 && preview.skipped.reasons.length > 0 && (
              <ul className="ml-4 space-y-0.5 border-l border-border pl-3">
                {preview.skipped.reasons.map((r) => (
                  <li key={r.reason} className="text-xs text-text-muted">
                    <span className="font-medium">{r.count}×</span>{" "}
                    {SKIP_REASON_LABELS[r.reason] ?? r.reason}
                    {r.description ? (
                      <span className="ml-1 text-text-muted/70">— {r.description}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {preview.warnings.length > 0 && (
              <ul className="mt-1 space-y-1 border-t border-border pt-3">
                {preview.warnings.map((w) => (
                  <li key={w} className="text-xs text-[hsl(var(--warning))]">
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => void onConfirm()}
          disabled={loading || previewLoading}
        >
          {executing ? "Atualizando..." : "Iniciar atualização"}
        </Button>
      </div>
    </Modal>
  );
}
