import { Send } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  HiringDecisionOutcome,
  HiringDecisionPayload,
  HiringDecisionPipelineStage,
  HiringDecisionReasonCode,
} from "../../../../types/domain";

const OUTCOMES: Array<{ value: HiringDecisionOutcome; label: string }> = [
  { value: "advance", label: "Avançar" },
  { value: "hold", label: "Manter em espera" },
  { value: "reject", label: "Rejeitar" },
  { value: "hire", label: "Contratar" },
  { value: "request_another_interview", label: "Solicitar outra entrevista" },
  { value: "keep_under_review", label: "Manter em revisão" },
];

const REASONS: Array<{ value: HiringDecisionReasonCode; label: string }> = [
  { value: "strong_fit", label: "Forte aderência" },
  { value: "partial_fit", label: "Aderência parcial" },
  { value: "missing_required_skill", label: "Competência obrigatória ausente" },
  { value: "salary_mismatch", label: "Desalinhamento salarial" },
  { value: "availability_mismatch", label: "Desalinhamento de disponibilidade" },
  { value: "behavioral_concern", label: "Ponto comportamental" },
  { value: "interview_concern", label: "Ponto de entrevista" },
  { value: "better_candidates", label: "Outros candidatos mais aderentes" },
  { value: "candidate_withdrew", label: "Candidato desistiu" },
  { value: "other", label: "Outro" },
];

const PIPELINE_STAGES: Array<{ value: HiringDecisionPipelineStage; label: string }> = [
  { value: "entry", label: "Entrada" },
  { value: "screening", label: "Triagem" },
  { value: "hr_interview", label: "Entrevista RH" },
  { value: "technical_interview", label: "Entrevista técnica" },
  { value: "final", label: "Final" },
  { value: "offer", label: "Oferta" },
  { value: "hired", label: "Contratado" },
  { value: "rejected", label: "Rejeitado" },
];

interface HiringDecisionFormProps {
  saving: boolean;
  onSubmit: (payload: HiringDecisionPayload) => Promise<void>;
  onCancel: () => void;
}

export function HiringDecisionForm({ saving, onSubmit, onCancel }: HiringDecisionFormProps) {
  const [outcome, setOutcome] = useState<HiringDecisionOutcome | "">("");
  const [reasonCode, setReasonCode] = useState<HiringDecisionReasonCode | "">("");
  const [notes, setNotes] = useState("");
  const [movePipeline, setMovePipeline] = useState(false);
  const [targetStage, setTargetStage] = useState<HiringDecisionPipelineStage | "">("");
  const [confirmed, setConfirmed] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const notesRequired = useMemo(() => outcome === "hire" || outcome === "reject", [outcome]);

  const handleSubmit = async () => {
    setValidationMessage(null);

    if (!outcome) {
      setValidationMessage("Selecione a decisão.");
      return;
    }

    if (!reasonCode) {
      setValidationMessage("Selecione o motivo.");
      return;
    }

    if (notesRequired && !notes.trim()) {
      setValidationMessage("Informe uma observação para contratar ou rejeitar.");
      return;
    }

    if (movePipeline && !targetStage) {
      setValidationMessage("Selecione a etapa de destino da pipeline.");
      return;
    }

    if (!confirmed) {
      setValidationMessage("Confirme que a decisão é humana antes de registrar.");
      return;
    }

    await onSubmit({
      decision_outcome: outcome,
      reason_code: reasonCode,
      notes: notes.trim() || null,
      submit: true,
      pipeline_action: {
        enabled: movePipeline,
        target_stage: movePipeline ? (targetStage as HiringDecisionPipelineStage) : null,
        reason: movePipeline ? "Decisão final humana registrada." : null,
      },
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-[hsl(var(--border))] bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Decisão
          </span>
          <select
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as HiringDecisionOutcome | "")}
            className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm"
          >
            <option value="">Selecione</option>
            {OUTCOMES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Motivo
          </span>
          <select
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value as HiringDecisionReasonCode | "")}
            className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm"
          >
            <option value="">Selecione</option>
            {REASONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
          Observação
        </span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          className="w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm"
        />
      </label>

      <div className="space-y-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/30 p-3">
        <label className="flex items-center gap-2 text-sm text-[hsl(var(--text))]">
          <input
            type="checkbox"
            checked={movePipeline}
            onChange={(event) => setMovePipeline(event.target.checked)}
            className="h-4 w-4 rounded border-[hsl(var(--border))]"
          />
          Mover candidato na pipeline agora
        </label>

        {movePipeline ? (
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
              Etapa de destino
            </span>
            <select
              value={targetStage}
              onChange={(event) => setTargetStage(event.target.value as HiringDecisionPipelineStage | "")}
              className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {PIPELINE_STAGES.map((stage) => (
                <option key={stage.value} value={stage.value}>
                  {stage.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <label className="flex items-start gap-2 text-sm text-[hsl(var(--text))]">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-[hsl(var(--border))]"
        />
        Confirmo que esta decisão foi tomada manualmente por pessoa autorizada.
      </label>

      {validationMessage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {validationMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {saving ? "Registrando..." : "Registrar decisão"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-muted))]/70 disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
