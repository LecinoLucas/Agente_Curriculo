import type { CandidateScoreDimensions } from "../../../types/domain";
import { normalizeScorePercent } from "../utils/scoreFormatting";

type CandidateScoreDimensionsCardProps = {
  dimensions: CandidateScoreDimensions | null;
};

type DimensionKey = "skills" | "experience" | "seniority" | "education" | "confidence";

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  skills: "Skills",
  experience: "Experiência",
  seniority: "Senioridade",
  education: "Educação",
  confidence: "Confiança",
};

const DIMENSION_ORDER: DimensionKey[] = [
  "skills",
  "experience",
  "seniority",
  "education",
  "confidence",
];

export function CandidateScoreDimensionsCard({ dimensions }: CandidateScoreDimensionsCardProps) {
  const rows = DIMENSION_ORDER.map((key) => {
    const rawValue = dimensions?.[key] ?? null;
    const percent = normalizeScorePercent(rawValue);
    return {
      key,
      label: DIMENSION_LABELS[key],
      percent,
      display: percent == null ? "—" : `${Math.round(percent)}%`,
    };
  });

  const hasData = rows.some((row) => row.percent != null);

  return (
    <div
      data-testid="preview-score-dimensions"
      className="rounded-lg border border-border/70 bg-[hsl(var(--bg))]/60 p-3"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Dimensões
      </p>
      {!hasData ? (
        <p
          className="mt-1.5 text-sm text-text-muted"
          data-testid="preview-score-dimensions-empty"
        >
          Dimensões ainda não disponíveis.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {rows.map((row) => (
            <div key={row.key} data-testid={`preview-dimension-${row.key}`}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="text-text-muted">{row.label}</span>
                <span className="font-medium text-text">{row.display}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  data-testid={`preview-dimension-bar-${row.key}`}
                  className={`h-full transition-all ${getBarToneClass(row.key, row.percent)}`}
                  style={{ width: `${row.percent ?? 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getBarToneClass(key: DimensionKey, percent: number | null): string {
  if (percent == null) return "bg-surface-muted";
  if (key === "confidence" && percent < 40) return "bg-[hsl(var(--danger))]";
  if (percent >= 75) return "bg-[hsl(var(--primary))]";
  if (percent >= 40) return "bg-[hsl(var(--warning))]";
  return "bg-[hsl(var(--danger))]";
}
