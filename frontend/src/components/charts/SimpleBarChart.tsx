type SimpleBarChartDatum = {
  label: string;
  value: number;
  color?: string;
  note?: string;
};

type SimpleBarChartProps = {
  data: SimpleBarChartDatum[];
  ariaLabel: string;
  orientation?: "vertical" | "horizontal";
  height?: number;
  emptyLabel?: string;
  valueFormatter?: (value: number) => string;
};

function normalizeValue(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function SimpleBarChart({
  data,
  ariaLabel,
  orientation = "vertical",
  height = 288,
  emptyLabel = "Sem dados",
  valueFormatter = (value) => new Intl.NumberFormat("pt-BR").format(value),
}: SimpleBarChartProps) {
  const normalizedData = data.map((item) => ({
    ...item,
    value: normalizeValue(item.value),
  }));
  const maxValue = Math.max(...normalizedData.map((item) => item.value), 0);

  if (normalizedData.length === 0 || maxValue <= 0) {
    return (
      <div
        aria-label={ariaLabel}
        className="flex h-full min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-border bg-surface-muted/30 text-sm text-text-muted"
        role="img"
      >
        {emptyLabel}
      </div>
    );
  }

  if (orientation === "horizontal") {
    return (
      <div
        aria-label={ariaLabel}
        className="flex flex-col gap-3"
        role="img"
        style={{ minHeight: `${height}px` }}
      >
        {normalizedData.map((item) => {
          const percent = (item.value / maxValue) * 100;
          return (
            <div key={item.label} className="grid gap-2 sm:grid-cols-[160px_1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{item.label}</p>
                {item.note ? (
                  <p className="truncate text-xs text-text-muted">{item.note}</p>
                ) : null}
              </div>
              <div className="h-3 rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${item.value > 0 ? Math.max(percent, 4) : 0}%`,
                    backgroundColor: item.color ?? "hsl(var(--primary))",
                  }}
                />
              </div>
              <span className="text-sm font-semibold text-text">
                {valueFormatter(item.value)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      aria-label={ariaLabel}
      className="flex h-full items-end gap-3 overflow-x-auto pb-1"
      role="img"
      style={{ minHeight: `${height}px` }}
    >
      {normalizedData.map((item) => {
        const percent = (item.value / maxValue) * 100;
        return (
          <div
            key={item.label}
            className="flex min-w-[72px] flex-1 flex-col items-center gap-2"
            title={`${item.label}: ${valueFormatter(item.value)}`}
          >
            <span className="text-xs font-medium text-text-muted">
              {valueFormatter(item.value)}
            </span>
            <div className="flex h-56 w-full items-end rounded-2xl bg-surface-muted/40 px-2 py-2">
              <div
                className="w-full rounded-xl"
                style={{
                  height: `${item.value > 0 ? Math.max(percent, 4) : 0}%`,
                  backgroundColor: item.color ?? "hsl(var(--primary))",
                }}
              />
            </div>
            <span className="line-clamp-2 text-center text-xs text-text-muted">
              {item.label}
            </span>
            {item.note ? (
              <span className="line-clamp-2 text-center text-[10px] text-text-muted">
                {item.note}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export type { SimpleBarChartDatum };
