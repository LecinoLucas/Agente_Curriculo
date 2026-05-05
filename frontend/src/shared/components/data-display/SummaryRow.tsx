type SummaryRowProps = {
  label: string;
  value: string;
};

export function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[hsl(var(--text-muted))]">{label}</span>
      <span className="font-medium text-[hsl(var(--text))]">{value}</span>
    </div>
  );
}
