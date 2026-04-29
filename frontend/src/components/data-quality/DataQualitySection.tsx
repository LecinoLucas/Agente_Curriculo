/**
 * Data quality information section for candidate drawer
 */

import { Button } from "@/components/ui/button";
import { DataQualityBadge } from "./DataQualityBadge";

export interface DataQualitySectionProps {
  status: "valid" | "unknown" | "no_resume" | "empty_resume" | "parsing_failed" | "invalid_manual";
  reason?: string | null;
  markedAt?: string | null;
  onReprocess?: () => void;
  onMarkValid?: () => void;
  isLoading?: boolean;
}

const statusDescriptions: Record<string, string> = {
  valid: "Currículo foi analisado com sucesso e contém dados suficientes para ranking.",
  unknown: "Dados ainda não foram verificados. O sistema vai classificar automaticamente.",
  no_resume: "Candidato não tem currículo anexado. Peça para enviar um documento.",
  empty_resume: "Currículo foi enviado mas não contém texto extractável. Peça para re-enviar.",
  parsing_failed: "Sistema não conseguiu extrair texto do currículo. Pode estar corrompido ou em formato não suportado.",
  invalid_manual: "Este candidato foi marcado manualmente como dados inválidos por um administrador.",
};

export function DataQualitySection({
  status,
  reason,
  markedAt,
  onReprocess,
  onMarkValid,
  isLoading = false,
}: DataQualitySectionProps) {
  const isInvalid = ["no_resume", "empty_resume", "parsing_failed", "invalid_manual"].includes(status);

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-semibold text-[hsl(var(--text))]">📋 Qualidade dos Dados</h4>
      </div>

      {/* Status Badge */}
      <div className="mb-4">
        <div className="text-xs text-[hsl(var(--text-muted))] mb-2">Status</div>
        <DataQualityBadge status={status} />
      </div>

      {/* Description */}
      <div className="mb-4 text-sm text-[hsl(var(--text-muted))]">
        {statusDescriptions[status] || "Status desconhecido"}
      </div>

      {/* Reason (if marked as invalid) */}
      {reason && isInvalid && (
        <div className="mb-4 rounded bg-[hsl(var(--danger))]/10 p-3 text-sm">
          <div className="text-xs font-semibold text-[hsl(var(--danger))] mb-1">Motivo da invalidação</div>
          <div className="text-[hsl(var(--text-muted))]">{reason}</div>
          {markedAt && (
            <div className="text-xs text-[hsl(var(--text-muted))] mt-2">
              Marcado em {new Date(markedAt).toLocaleDateString("pt-BR")}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {isInvalid && (
        <div className="flex gap-2">
          {onReprocess && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReprocess}
              disabled={isLoading}
              className="flex-1 text-xs"
            >
              🔄 Reprocessar
            </Button>
          )}
          {onMarkValid && (
            <Button
              variant="outline"
              size="sm"
              onClick={onMarkValid}
              disabled={isLoading}
              className="flex-1 text-xs"
            >
              ✓ Marcar como válido
            </Button>
          )}
        </div>
      )}

      {/* Unknown status message */}
      {status === "unknown" && (
        <div className="rounded bg-[hsl(var(--warning))]/10 p-3 text-xs text-[hsl(var(--warning))]">
          ⚠️ Classificação automática em andamento. Candidato pode aparecer ou desaparecer do ranking.
        </div>
      )}
    </div>
  );
}
