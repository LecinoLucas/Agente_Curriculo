import { Plus, Save, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  InterviewFinalRecommendation,
  InterviewScorecard,
  InterviewScorecardItemInput,
} from "../../../../types/domain";
import { InterviewScorecardItem } from "./InterviewScorecardItem";

const RECOMMENDATIONS: Array<{ value: InterviewFinalRecommendation; label: string }> = [
  { value: "strong_yes", label: "Forte sim" },
  { value: "yes", label: "Sim" },
  { value: "neutral", label: "Neutro" },
  { value: "no", label: "Não" },
  { value: "strong_no", label: "Forte não" },
];

function buildInitialItems(scorecard: InterviewScorecard | null): InterviewScorecardItemInput[] {
  if (scorecard?.items.length) {
    return scorecard.items.map((item) => ({
      id: item.id,
      competency_name: item.competency_name,
      question_text: item.question_text,
      rating: item.rating,
      evidence: item.evidence,
      weight: Number(item.weight || 1),
      display_order: item.display_order,
    }));
  }

  return [
    { competency_name: "Competência técnica", rating: null, evidence: "", display_order: 1 },
    { competency_name: "Comunicação", rating: null, evidence: "", display_order: 2 },
    { competency_name: "Colaboração", rating: null, evidence: "", display_order: 3 },
  ];
}

interface InterviewScorecardFormProps {
  scorecard: InterviewScorecard | null;
  saving: boolean;
  submitting: boolean;
  onSave: (payload: {
    final_recommendation: InterviewFinalRecommendation | null;
    overall_notes: string | null;
    items: InterviewScorecardItemInput[];
  }) => Promise<InterviewScorecard>;
  onSubmit: (scorecardId: string) => Promise<void>;
}

export function InterviewScorecardForm({
  scorecard,
  saving,
  submitting,
  onSave,
  onSubmit,
}: InterviewScorecardFormProps) {
  const readOnly = scorecard?.status === "submitted";
  const [items, setItems] = useState<InterviewScorecardItemInput[]>(() => buildInitialItems(scorecard));
  const [overallNotes, setOverallNotes] = useState(scorecard?.overall_notes ?? "");
  const [finalRecommendation, setFinalRecommendation] = useState<InterviewFinalRecommendation | "">(
    scorecard?.final_recommendation ?? "",
  );
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const submitLockedRef = useRef(false);

  const canSubmit = useMemo(() => Boolean(finalRecommendation), [finalRecommendation]);

  useEffect(() => {
    setItems(buildInitialItems(scorecard));
    setOverallNotes(scorecard?.overall_notes ?? "");
    setFinalRecommendation(scorecard?.final_recommendation ?? "");
  }, [scorecard?.id, scorecard?.status]);

  const handleItemChange = (index: number, nextItem: InterviewScorecardItemInput) => {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? nextItem : item)));
  };

  const handleSave = async () => {
    setValidationMessage(null);
    return onSave({
      final_recommendation: finalRecommendation || null,
      overall_notes: overallNotes.trim() || null,
      items: items.map((item, index) => ({ ...item, display_order: index + 1, weight: item.weight ?? 1 })),
    });
  };

  const handleSubmit = async () => {
    if (saving || submitting || submitLockedRef.current) return;

    if (!canSubmit) {
      setValidationMessage("Selecione a recomendação final antes de enviar.");
      return;
    }

    submitLockedRef.current = true;
    try {
      const savedScorecard = await handleSave();
      await onSubmit(savedScorecard.id);
    } catch {
      return;
    } finally {
      submitLockedRef.current = false;
    }
  };

  return (
    <div className="space-y-5">
      {readOnly ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          Scorecard enviado. Esta fase não permite edição após envio.
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[hsl(var(--text))]">Critérios</p>
          {!readOnly ? (
            <button
              type="button"
              onClick={() =>
                setItems((current) => [
                  ...current,
                  {
                    competency_name: "Novo critério",
                    rating: null,
                    evidence: "",
                    display_order: current.length + 1,
                  },
                ])
              }
              className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-medium text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-muted))]/70"
            >
              <Plus className="h-4 w-4" />
              Critério
            </button>
          ) : null}
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <InterviewScorecardItem
              key={item.id ?? `${item.competency_name}-${index}`}
              item={item}
              index={index}
              readOnly={readOnly}
              onChange={handleItemChange}
            />
          ))}
        </div>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
          Observações finais
        </span>
        <textarea
          value={overallNotes}
          onChange={(event) => setOverallNotes(event.target.value)}
          disabled={readOnly}
          rows={4}
          className="w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm disabled:bg-[hsl(var(--surface-muted))]/60"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
          Recomendação final
        </span>
        <select
          value={finalRecommendation}
          onChange={(event) => setFinalRecommendation(event.target.value as InterviewFinalRecommendation | "")}
          disabled={readOnly}
          className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm disabled:bg-[hsl(var(--surface-muted))]/60"
        >
          <option value="">Selecione</option>
          {RECOMMENDATIONS.map((recommendation) => (
            <option key={recommendation.value} value={recommendation.value}>
              {recommendation.label}
            </option>
          ))}
        </select>
      </label>

      {validationMessage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {validationMessage}
        </div>
      ) : null}

      {!readOnly ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              void handleSave().catch(() => undefined);
            }}
            disabled={saving || submitting}
            className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-muted))]/70 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar rascunho"}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {submitting ? "Enviando..." : "Enviar scorecard"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
