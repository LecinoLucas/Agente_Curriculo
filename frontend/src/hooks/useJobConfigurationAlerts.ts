import { useMemo } from "react";
import type { DealBreaker } from "../types/domain";

export type AlertLevel = "critical" | "warning" | "success";

export type ConfigurationAlert = {
  level: AlertLevel;
  message: string;
  icon: string;
};

export type PublishReadinessStatus = "critical" | "warning" | "ready";

type JobFormData = {
  title: string;
  description: string;
  requirements?: string;
  status?: string;
  seniority_level?: string;
  minimum_education_level?: string;
  minimum_years_experience?: number;
  deal_breakers?: DealBreaker[];
};

export function useJobConfigurationAlerts(form: JobFormData): {
  alerts: ConfigurationAlert[];
  summary: {
    educationLevel: string | null;
    experienceYears: number | null;
    dealBreakersActive: number;
    publishReadiness: PublishReadinessStatus;
  };
} {
  return useMemo(() => {
    const alerts: ConfigurationAlert[] = [];

    // Summary data
    const educationLevel = form.minimum_education_level || null;
    const experienceYears = form.minimum_years_experience ?? null;
    const dealBreakersActive = (form.deal_breakers ?? []).filter((db) => db.is_active).length;
    const isBasicConfigured = form.title.trim().length > 0 && form.description.trim().length > 0;

    // Check: description length
    if (form.description.trim().length < 30 && form.description.trim().length > 0) {
      alerts.push({
        level: "critical",
        message: "Descrição muito curta — adicione mais detalhes",
        icon: "⚠️",
      });
    }

    // Check: missing title
    if (!form.title.trim()) {
      alerts.push({
        level: "critical",
        message: "Título é obrigatório",
        icon: "⚠️",
      });
    }

    // Check: missing description
    if (!form.description.trim()) {
      alerts.push({
        level: "critical",
        message: "Descrição é obrigatória",
        icon: "⚠️",
      });
    }

    // Check: high experience requirement
    if (experienceYears !== null && experienceYears >= 8) {
      alerts.push({
        level: "warning",
        message: `Experiência mínima alta (${experienceYears} anos) — pode restringir bastante o pool`,
        icon: "📊",
      });
    }

    // Check: high education requirement
    if (
      educationLevel &&
      ["master", "phd"].includes(educationLevel)
    ) {
      alerts.push({
        level: "warning",
        message: `Educação mínima alta (${educationLevel}) — considere o impacto no pool de candidatos`,
        icon: "🎓",
      });
    }

    // Check: too many deal-breakers
    if (dealBreakersActive > 3) {
      alerts.push({
        level: "warning",
        message: `${dealBreakersActive} critérios eliminatórios ativos — verifique se não está muito restritivo`,
        icon: "🔪",
      });
    }

    const hasCriticalAlerts = alerts.some((alert) => alert.level === "critical");
    const hasWarningAlerts = alerts.some((alert) => alert.level === "warning");
    const publishReadiness: PublishReadinessStatus = hasCriticalAlerts
      ? "critical"
      : hasWarningAlerts
        ? "warning"
        : isBasicConfigured
          ? "ready"
          : "critical";

    if (publishReadiness === "ready") {
      alerts.push({
        level: "success",
        message: educationLevel || experienceYears !== null
          ? "Vaga bem configurada com requisitos objetivos — pronta para publicação"
          : "Configuração básica completa — você pode publicar agora",
        icon: "✅",
      });
    }

    return {
      alerts,
      summary: {
        educationLevel,
        experienceYears,
        dealBreakersActive,
        publishReadiness,
      },
    };
  }, [form]);
}
