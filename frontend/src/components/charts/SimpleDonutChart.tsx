type SimpleDonutChartDatum = {
  label: string;
  value: number;
  color?: string;
};

type SimpleDonutChartProps = {
  data: SimpleDonutChartDatum[];
  ariaLabel: string;
  size?: number;
  thickness?: number;
  emptyLabel?: string;
  valueFormatter?: (value: number) => string;
};

function clampValue(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function SimpleDonutChart({
  data,
  ariaLabel,
  size = 220,
  thickness = 28,
  emptyLabel = "Sem dados",
  valueFormatter = (value) => new Intl.NumberFormat("pt-BR").format(value),
}: SimpleDonutChartProps) {
  const normalizedData = data
    .map((item) => ({
      ...item,
      value: clampValue(item.value),
    }))
    .filter((item) => item.value > 0);

  const total = normalizedData.reduce((sum, item) => sum + item.value, 0);
  const radius = Math.max(0, size / 2 - thickness / 2 - 4);
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  if (total <= 0) {
    return (
      <div className="flex flex-col items-center gap-4">
        <svg
          aria-label={ariaLabel}
          className="overflow-visible"
          height={size}
          role="img"
          width={size}
        >
          <circle
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke="hsl(var(--border))"
            strokeWidth={thickness}
          />
          <text
            dominantBaseline="middle"
            fill="hsl(var(--text-muted))"
            fontSize="14"
            textAnchor="middle"
            x={center}
            y={center}
          >
            {emptyLabel}
          </text>
        </svg>
        <p className="text-sm text-[hsl(var(--text-muted))]">{emptyLabel}</p>
      </div>
    );
  }

  let offset = 0;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="relative mx-auto flex-shrink-0">
        <svg
          aria-label={ariaLabel}
          className="overflow-visible"
          height={size}
          role="img"
          width={size}
        >
          <circle
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke="hsl(var(--border))"
            strokeWidth={thickness}
          />
          <g transform={`rotate(-90 ${center} ${center})`}>
            {normalizedData.map((item) => {
              const segmentLength = (item.value / total) * circumference;
              const segmentOffset = offset;
              offset += segmentLength;

              return (
                <circle
                  key={item.label}
                  cx={center}
                  cy={center}
                  fill="none"
                  r={radius}
                  stroke={item.color ?? "hsl(var(--primary))"}
                  strokeDasharray={`${segmentLength} ${Math.max(circumference - segmentLength, 0)}`}
                  strokeDashoffset={-segmentOffset}
                  strokeWidth={thickness}
                />
              );
            })}
          </g>
          <text
            dominantBaseline="middle"
            fill="hsl(var(--text))"
            fontSize="14"
            fontWeight="600"
            textAnchor="middle"
            x={center}
            y={center - 10}
          >
            {valueFormatter(total)}
          </text>
          <text
            dominantBaseline="middle"
            fill="hsl(var(--text-muted))"
            fontSize="12"
            textAnchor="middle"
            x={center}
            y={center + 12}
          >
            Total
          </text>
        </svg>
      </div>

      <div className="grid flex-1 gap-2">
        {normalizedData.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/40 px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                aria-hidden="true"
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: item.color ?? "hsl(var(--primary))" }}
              />
              <span className="truncate text-sm text-[hsl(var(--text))]">{item.label}</span>
            </div>
            <span className="text-sm font-semibold text-[hsl(var(--text))]">
              {valueFormatter(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type { SimpleDonutChartDatum };
