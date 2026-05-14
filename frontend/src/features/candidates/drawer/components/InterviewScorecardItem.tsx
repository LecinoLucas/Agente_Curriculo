import type { InterviewScorecardItemInput } from "../../../../types/domain";

interface InterviewScorecardItemProps {
  item: InterviewScorecardItemInput;
  index: number;
  readOnly: boolean;
  onChange: (index: number, item: InterviewScorecardItemInput) => void;
}

export function InterviewScorecardItem({
  item,
  index,
  readOnly,
  onChange,
}: InterviewScorecardItemProps) {
  const update = (patch: Partial<InterviewScorecardItemInput>) => {
    onChange(index, { ...item, ...patch });
  };

  return (
    <div className="space-y-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Competência
          </span>
          <input
            value={item.competency_name}
            onChange={(event) => update({ competency_name: event.target.value })}
            disabled={readOnly}
            className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm disabled:bg-[hsl(var(--surface-muted))]/60"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Nota
          </span>
          <select
            value={item.rating ?? ""}
            onChange={(event) => update({ rating: event.target.value ? Number(event.target.value) : null })}
            disabled={readOnly}
            className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm disabled:bg-[hsl(var(--surface-muted))]/60"
            aria-label={`Nota de ${item.competency_name || "critério"}`}
          >
            <option value="">Sem nota</option>
            {[1, 2, 3, 4, 5].map((rating) => (
              <option key={rating} value={rating}>
                {rating}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
          Pergunta de apoio
        </span>
        <textarea
          value={item.question_text ?? ""}
          onChange={(event) => update({ question_text: event.target.value })}
          disabled={readOnly}
          rows={2}
          className="w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm disabled:bg-[hsl(var(--surface-muted))]/60"
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
          Evidência
        </span>
        <textarea
          value={item.evidence ?? ""}
          onChange={(event) => update({ evidence: event.target.value })}
          disabled={readOnly}
          rows={3}
          className="w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm disabled:bg-[hsl(var(--surface-muted))]/60"
        />
      </label>
    </div>
  );
}
