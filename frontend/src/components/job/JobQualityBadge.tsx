import { AlertCircle, AlertTriangle, CheckCircle } from "lucide-react";
import { JobQualityResult } from "../../types/domain";

type Props = {
  quality?: JobQualityResult | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
};

export function JobQualityBadge({ quality, loading = false, error = null, compact = false }: Props) {
  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100">
        <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
        <span className="text-sm text-gray-600">Verificando...</span>
      </div>
    );
  }

  if (error || !quality) {
    return null;
  }

  const statusColors = {
    weak: { bg: "bg-red-50", text: "text-red-700", icon: AlertTriangle },
    acceptable: { bg: "bg-yellow-50", text: "text-yellow-700", icon: AlertCircle },
    good: { bg: "bg-green-50", text: "text-green-700", icon: CheckCircle },
  };

  const config = statusColors[quality.status];
  const Icon = config.icon;

  const statusLabel = {
    weak: "Fraco",
    acceptable: "Aceitável",
    good: "Excelente",
  }[quality.status];

  const canPublishLabel = quality.can_publish ? "Pronta para publicar" : "Não pode publicar";

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 rounded-full border border-current border-opacity-20 px-2.5 py-1 ${config.bg}`}>
        <Icon className={`h-3.5 w-3.5 ${config.text}`} />
        <span className={`text-xs font-medium ${config.text}`}>
          {quality.quality_score}/100
        </span>
        <span className={`text-xs ${config.text} opacity-75`}>
          {statusLabel}
        </span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-full ${config.bg} border border-current border-opacity-20`}>
      <Icon className={`w-4 h-4 ${config.text}`} />
      <div className="flex flex-col gap-0.5">
        <span className={`text-sm font-medium ${config.text}`}>
          {quality.quality_score}/100 • {statusLabel}
        </span>
        <span className={`text-xs ${config.text} opacity-75`}>{canPublishLabel}</span>
      </div>
    </div>
  );
}
