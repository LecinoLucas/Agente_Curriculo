import { Badge } from "@/components/ui/badge";

type Tone = "neutral" | "success" | "warning" | "danger" | "mock";

const VARIANTS: Record<Tone, "neutral" | "success" | "warning" | "danger" | "outline"> = {
  neutral: "neutral",
  success: "success",
  warning: "warning",
  danger: "danger",
  mock: "outline",
};

type StatusBadgeProps = {
  label: string;
  tone?: Tone;
};

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return <Badge variant={VARIANTS[tone]}>{label}</Badge>;
}
