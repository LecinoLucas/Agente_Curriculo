import * as React from "react";
import { Badge } from "@/components/ui/badge";

export type StatusPillTone = "neutral" | "success" | "warning" | "danger" | "mock";

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string;
  tone?: StatusPillTone;
}

const TONE_MAP: Record<StatusPillTone, "neutral" | "success" | "warning" | "danger" | "outline"> = {
  neutral: "neutral",
  success: "success",
  warning: "warning",
  danger: "danger",
  mock: "outline",
};

export function StatusPill({ label, tone = "neutral", className, ...props }: StatusPillProps) {
  return (
    <Badge variant={TONE_MAP[tone]} className={className} {...props}>
      {label}
    </Badge>
  );
}
