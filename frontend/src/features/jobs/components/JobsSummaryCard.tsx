import { Card, CardContent } from "@/components/ui/card";

type SummaryCardType = "published" | "drafts" | "attention";

const cardConfig: Record<
  SummaryCardType,
  {
    label: string;
    description: string;
    borderClass: string;
    bgClass: string;
  }
> = {
  published: {
    label: "Publicadas nesta página",
    description: "Pipeline disponível imediatamente para estas vagas.",
    borderClass: "border-[hsl(var(--success))]/15",
    bgClass: "bg-[hsl(var(--success-soft))]/40",
  },
  drafts: {
    label: "Rascunhos nesta página",
    description: "Use a nova página guiada para completar a estrutura e publicar.",
    borderClass: "",
    bgClass: "",
  },
  attention: {
    label: "Precisam de atenção",
    description: "Vagas com qualidade fraca ou aceitável entre os resultados carregados.",
    borderClass: "border-[hsl(var(--warning))]/15",
    bgClass: "bg-[hsl(var(--warning-soft))]/35",
  },
};

export function JobsSummaryCard({
  type,
  value,
}: {
  type: SummaryCardType;
  value: number;
}) {
  const config = cardConfig[type];
  const textColor =
    type === "published"
      ? "text-[hsl(var(--success))]"
      : type === "attention"
        ? "text-[hsl(var(--warning))]"
        : "text-[hsl(var(--text-muted))]";

  return (
    <Card className={`${config.borderClass} ${config.bgClass}`}>
      <CardContent className="p-5">
        <p className={`text-xs font-semibold uppercase tracking-wide ${textColor}`}>{config.label}</p>
        <p className="mt-3 text-3xl font-semibold text-[hsl(var(--text))]">{value}</p>
        <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">{config.description}</p>
      </CardContent>
    </Card>
  );
}
