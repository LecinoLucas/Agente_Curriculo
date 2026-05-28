import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { EmptyState } from "../../../components/common/EmptyState";

type ChartCardProps = {
  title: string;
  description: string;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
};

export function ChartCard({
  title,
  description,
  loading = false,
  empty = false,
  emptyMessage = "Sem dados disponíveis para este gráfico.",
  children,
}: ChartCardProps) {
  return (
    <Card className="border-border bg-surface">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base text-text">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-72 animate-pulse rounded-2xl bg-surface-muted" />
        ) : empty ? (
          <EmptyState icon="◌" title="Sem dados" description={emptyMessage} />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
