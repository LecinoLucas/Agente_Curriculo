/**
 * Badge component for data quality status
 */

import { Badge } from "@/components/ui/badge";

export interface DataQualityBadgeProps {
  status: "valid" | "unknown" | "no_resume" | "empty_resume" | "parsing_failed" | "invalid_manual";
  size?: "sm" | "md";
}

const statusConfig = {
  valid: {
    label: "Válido",
    icon: "✅",
    className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  },
  unknown: {
    label: "Não verificado",
    icon: "❓",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100",
  },
  no_resume: {
    label: "Sem currículo",
    icon: "⚠️",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
  },
  empty_resume: {
    label: "Currículo vazio",
    icon: "📄",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100",
  },
  parsing_failed: {
    label: "Parsing incompleto",
    icon: "🟡",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  },
  invalid_manual: {
    label: "Dados inválidos",
    icon: "🔴",
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  },
};

export function DataQualityBadge({ status, size = "md" }: DataQualityBadgeProps) {
  const config = statusConfig[status];

  if (!config) {
    return null;
  }

  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 ${textSize} font-medium ${config.className}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
