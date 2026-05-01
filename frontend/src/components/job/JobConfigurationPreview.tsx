import type {
  ConfigurationAlert,
  AlertLevel,
  PublishReadinessStatus,
  RestrictivenessLevel,
} from "../../hooks/useJobConfigurationAlerts";

interface JobConfigurationPreviewProps {
  alerts: ConfigurationAlert[];
  summary: {
    educationLevel: string | null;
    experienceYears: number | null;
    dealBreakersActive: number;
    publishReadiness: PublishReadinessStatus;
    restrictiveness: RestrictivenessLevel;
  };
  jobTitle?: string;
}

const educationLevelLabels: Record<string, string> = {
  none: "Nenhuma",
  high_school: "Ensino Médio",
  technical: "Técnico",
  bachelor: "Graduação",
  postgraduate: "Pós-Graduação",
  master: "Mestrado",
  phd: "Doutorado",
};

const restrictivenessLabels: Record<string, { label: string; emoji: string; color: string; bgColor: string }> = {
  low: {
    label: "Baixa",
    emoji: "🟢",
    color: "text-[hsl(var(--success))]",
    bgColor: "bg-[hsl(var(--success-soft))]",
  },
  moderate: {
    label: "Moderada",
    emoji: "🟡",
    color: "text-[hsl(var(--warning))]",
    bgColor: "bg-[hsl(var(--warning-soft))]",
  },
  high: {
    label: "Alta",
    emoji: "🟠",
    color: "text-[hsl(var(--warning))]",
    bgColor: "bg-[hsl(var(--warning-soft))]",
  },
  very_high: {
    label: "Muito Alta",
    emoji: "🔴",
    color: "text-[hsl(var(--danger))]",
    bgColor: "bg-[hsl(var(--danger-soft))]",
  },
};

function getAlertTone(level: AlertLevel): string {
  switch (level) {
    case "critical":
      return "text-[hsl(var(--danger))]";
    case "warning":
      return "text-[hsl(var(--warning))]";
    case "success":
      return "text-[hsl(var(--success))]";
  }
}

function getAlertBgTone(level: AlertLevel): string {
  switch (level) {
    case "critical":
      return "bg-[hsl(var(--danger-soft))] border-[hsl(var(--danger))]/20";
    case "warning":
      return "bg-[hsl(var(--warning-soft))] border-[hsl(var(--warning))]/20";
    case "success":
      return "bg-[hsl(var(--success-soft))] border-[hsl(var(--success))]/20";
  }
}

function getReadinessLabel(status: PublishReadinessStatus): string {
  switch (status) {
    case "critical":
      return "Configuração crítica pendente";
    case "warning":
      return "Pode publicar com atenção";
    case "ready":
      return "Pronta para publicar";
  }
}

function getReadinessTone(status: PublishReadinessStatus): string {
  switch (status) {
    case "critical":
      return "text-[hsl(var(--danger))]";
    case "warning":
      return "text-[hsl(var(--warning))]";
    case "ready":
      return "text-[hsl(var(--success))]";
  }
}

export function JobConfigurationPreview({
  alerts,
  summary,
  jobTitle,
}: JobConfigurationPreviewProps) {
  const criticalCount = alerts.filter((a) => a.level === "critical").length;
  const warningCount = alerts.filter((a) => a.level === "warning").length;
  const successCount = alerts.filter((a) => a.level === "success").length;

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
      <h3 className="text-sm font-semibold text-[hsl(var(--text))] mb-3">
        📋 Preview da Configuração
      </h3>

      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
        <div className="rounded bg-[hsl(var(--surface-muted))] px-3 py-2">
          <div className="text-[hsl(var(--text-muted))]">Educação</div>
          <div className="font-semibold text-[hsl(var(--text))] mt-1">
            {summary.educationLevel
              ? educationLevelLabels[summary.educationLevel] || summary.educationLevel
              : "—"}
          </div>
        </div>
        <div className="rounded bg-[hsl(var(--surface-muted))] px-3 py-2">
          <div className="text-[hsl(var(--text-muted))]">Experiência</div>
          <div className="font-semibold text-[hsl(var(--text))] mt-1">
            {summary.experienceYears !== null ? `${summary.experienceYears} anos` : "—"}
          </div>
        </div>
        <div className="rounded bg-[hsl(var(--surface-muted))] px-3 py-2">
          <div className="text-[hsl(var(--text-muted))]">Deal-breakers</div>
          <div className="font-semibold text-[hsl(var(--text))] mt-1">{summary.dealBreakersActive}</div>
        </div>
        <div className={`rounded ${restrictivenessLabels[summary.restrictiveness].bgColor} px-3 py-2 border border-current`}>
          <div className="text-[hsl(var(--text-muted))]">Restritividade</div>
          <div className={`font-semibold mt-1 ${restrictivenessLabels[summary.restrictiveness].color}`}>
            {restrictivenessLabels[summary.restrictiveness].emoji} {restrictivenessLabels[summary.restrictiveness].label}
          </div>
        </div>
      </div>

      {/* Restrictiveness Warning Banner */}
      {(summary.restrictiveness === "high" || summary.restrictiveness === "very_high") && (
        <div className={`rounded-lg border px-3 py-3 mb-4 ${restrictivenessLabels[summary.restrictiveness].bgColor}`}>
          <div className={`text-xs font-semibold ${restrictivenessLabels[summary.restrictiveness].color} flex gap-2`}>
            <span className="flex-shrink-0">⚠️</span>
            <span>
              {summary.restrictiveness === "very_high"
                ? "Essa vaga está MUITO restritiva. Pode resultar em zero candidatos qualificados. Revise educação mínima, anos de experiência e deal-breakers."
                : "Essa vaga está restritiva. Candidatos fortes podem ser eliminados. Considere se os critérios são realmente obrigatórios."}
            </span>
          </div>
          <div className="text-xs text-[hsl(var(--text-muted))] mt-2 italic">
            💡 Skills complementares (Git, UX/UI, Idiomas) devem ser desejáveis, não eliminatórios.
          </div>
        </div>
      )}

      {/* Alerts */}
      <div className="space-y-2">
        {alerts.length === 0 ? (
          <div className="text-xs text-[hsl(var(--text-muted))] italic">
            Preencha os campos obrigatórios para ver alertas e sugestões.
          </div>
        ) : (
          <>
            {/* Alert Summary */}
            {(criticalCount > 0 || warningCount > 0 || successCount > 0) && (
              <div className="flex gap-3 text-xs mb-2">
                {criticalCount > 0 && (
                  <span className="text-[hsl(var(--danger))]">
                    ⚠️ {criticalCount} {criticalCount === 1 ? "crítico" : "críticos"}
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="text-[hsl(var(--warning))]">
                    📊 {warningCount} {warningCount === 1 ? "aviso" : "avisos"}
                  </span>
                )}
                {successCount > 0 && (
                  <span className="text-[hsl(var(--success))]">
                    ✅ {successCount} OK
                  </span>
                )}
              </div>
            )}

            {/* Individual Alerts */}
            {alerts.map((alert, idx) => (
              <div
                key={idx}
                className={`flex gap-2 rounded border px-3 py-2 text-xs ${getAlertBgTone(alert.level)}`}
              >
                <span className="flex-shrink-0">{alert.icon}</span>
                <span className={`flex-1 ${getAlertTone(alert.level)}`}>{alert.message}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* CTA if ready */}
      {summary.publishReadiness === "ready" && (
        <div className="mt-4 rounded-lg bg-[hsl(var(--success-soft))] border border-[hsl(var(--success))]/20 px-3 py-2 text-xs text-[hsl(var(--success))]">
          💡 A vaga está pronta! Clique em "{jobTitle ? "Salvar alterações" : "Criar vaga"}" para continuar.
        </div>
      )}
    </div>
  );
}
