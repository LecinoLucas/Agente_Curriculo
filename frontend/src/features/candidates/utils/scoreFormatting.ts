export function normalizeScorePercent(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return Math.min(100, Math.max(0, normalized));
}

export function normalizeScoreUnit(value: number | null | undefined): number | null {
  const percent = normalizeScorePercent(value);
  return percent == null ? null : percent / 100;
}

export function formatScorePercent(
  value: number | null | undefined,
  emptyLabel = "—",
): string {
  const percent = normalizeScorePercent(value);
  return percent == null ? emptyLabel : `${Math.round(percent)}%`;
}

export function getScoreTone(value: number | null | undefined): "high" | "mid" | "low" | "neutral" {
  const percent = normalizeScorePercent(value);
  if (percent == null) return "neutral";
  if (percent >= 75) return "high";
  if (percent >= 40) return "mid";
  return "low";
}
