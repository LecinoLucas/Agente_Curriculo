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
          Recalcula ranking para candidatos com análise válida (sem IA) e processa análises
          pendentes para os demais quando necessário.
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
                Análise IA{preview.ai_analysis.may_use_provider ? " (pode usar créditos)" : ""}
              </span>
              <span className="font-medium text-text">{preview.ai_analysis.count}</span>
            </div>
            {preview.skipped.count > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Ignorados</span>
                <span className="font-medium text-text">{preview.skipped.count}</span>
              </div>
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
          {executing ? "Atualizando..." : "Confirmar"}
        </Button>
      </div>
    </Modal>
  );
}
