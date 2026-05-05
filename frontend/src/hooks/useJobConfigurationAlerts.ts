import { useMemo } from "react";
import type { DealBreaker } from "../types/domain";

export type AlertLevel = "critical" | "warning" | "success";

export type ConfigurationAlert = {
  level: AlertLevel;
  message: string;
  icon: string;
  category?: "objective" | "restrictiveness" | "completeness" | "general";
};

export type PublishReadinessStatus = "critical" | "warning" | "ready";

export type RestrictivenessLevel = "low" | "moderate" | "high" | "very_high";

type JobFormData = {
  title: string;
  description: string;
  requirements?: string;
  job_area?: string;
  responsibilities?: string;
  experience_context?: string;
  behavioral_requirements?: string[];
  status?: string;
  seniority_level?: string;
  minimum_education_level?: string;
  minimum_years_experience?: number;
  deal_breakers?: DealBreaker[];
};

// Helper para detectar deal-breakers inapropriados
function isSuspiciousDealBreaker(db: DealBreaker): boolean {
  const suspiciousFields = ["languages", "language", "english", "idioma", "availability", "disponibilidade", "custom_text"];
  return suspiciousFields.some(f => db.field?.toLowerCase().includes(f));
}

// Helper para calcular nível de restritividade
function calculateRestrictivenessLevel(
  experienceYears: number | null,
  educationLevel: string | null,
  dealBreakersActive: number,
  suspiciousDealBreakers: number
): RestrictivenessLevel {
  let score = 0;

  // Experiência: até 3 pontos
  if (experienceYears !== null) {
    if (experienceYears >= 10) score += 3;
    else if (experienceYears >= 8) score += 2;
    else if (experienceYears >= 6) score += 1;
  }

  // Educação: até 2 pontos
  if (educationLevel && ["master", "phd"].includes(educationLevel)) {
    score += 2;
  } else if (educationLevel === "technical" || educationLevel === "postgraduate") {
    score += 1;
  }

  // Deal-breakers: até 4 pontos
  if (dealBreakersActive >= 4) score += 4;
  else if (dealBreakersActive >= 3) score += 3;
  else if (dealBreakersActive >= 2) score += 2;
  else if (dealBreakersActive >= 1) score += 1;

  // Deal-breakers suspeitos: bônus de 1 ponto
  if (suspiciousDealBreakers > 0) score += 1;

  if (score >= 8) return "very_high";
  if (score >= 5) return "high";
  if (score >= 2) return "moderate";
  return "low";
}

export function useJobConfigurationAlerts(form: JobFormData): {
  alerts: ConfigurationAlert[];
  summary: {
    educationLevel: string | null;
    experienceYears: number | null;
    dealBreakersActive: number;
    publishReadiness: PublishReadinessStatus;
    restrictiveness: RestrictivenessLevel;
  };
} {
  return useMemo(() => {
    const alerts: ConfigurationAlert[] = [];

    // Summary data
    const educationLevel = form.minimum_education_level || null;
    const experienceYears = form.minimum_years_experience ?? null;
    const activeDealBreakers = (form.deal_breakers ?? []).filter((db) => db.is_active);
    const dealBreakersActive = activeDealBreakers.length;
    const suspiciousDealBreakers = activeDealBreakers.filter(isSuspiciousDealBreaker).length;
    const isBasicConfigured = form.title.trim().length > 0 && form.description.trim().length > 0;

    // Calculate restrictiveness level
    const restrictiveness = calculateRestrictivenessLevel(
      experienceYears,
      educationLevel,
      dealBreakersActive,
      suspiciousDealBreakers
    );

    // ─────────────────────────────────────────────────────────────────
    // SECTION 1: Completeness Checks (Critical)
    // ─────────────────────────────────────────────────────────────────

    // Check: missing title
    if (!form.title.trim()) {
      alerts.push({
        level: "critical",
        message: "Título é obrigatório",
        icon: "⚠️",
        category: "completeness",
      });
    }

    // Check: missing description
    if (!form.description.trim()) {
      alerts.push({
        level: "critical",
        message: "Descrição é obrigatória",
        icon: "⚠️",
        category: "completeness",
      });
    }

    // Check: description length
    if (form.description.trim().length < 30 && form.description.trim().length > 0) {
      alerts.push({
        level: "critical",
        message: "Descrição muito curta — adicione mais detalhes (mínimo 30 caracteres)",
        icon: "⚠️",
        category: "completeness",
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // SECTION 2: Restrictiveness Checks (Warning)
    // ─────────────────────────────────────────────────────────────────

    // Check: suspicious deal-breakers (language, availability)
    if (suspiciousDealBreakers > 0) {
      alerts.push({
        level: "warning",
        message: `⚠️ Encontrados ${suspiciousDealBreakers} critério(s) eliminatório(s) potencialmente inapropriado(s) (idioma, disponibilidade). Esses devem ser requisitos desejáveis, não eliminatórios.`,
        icon: "🚨",
        category: "restrictiveness",
      });
    }

    // Check: high experience requirement
    if (experienceYears !== null && experienceYears >= 8) {
      alerts.push({
        level: "warning",
        message: `Experiência mínima muito alta (${experienceYears} anos) — isso elimina muitos candidatos qualificados. Considere reduzir para 5-6 anos.`,
        icon: "📊",
        category: "restrictiveness",
      });
    }

    // Check: high education requirement
    if (educationLevel && ["master", "phd"].includes(educationLevel)) {
      alerts.push({
        level: "warning",
        message: `Educação mínima alta (${educationLevel}) — pode reduzir significativamente o pool. Considere "bachelor" ou "postgraduate".`,
        icon: "🎓",
        category: "restrictiveness",
      });
    }

    // Check: too many deal-breakers
    if (dealBreakersActive >= 3) {
      alerts.push({
        level: "warning",
        message: `${dealBreakersActive} critério(s) eliminatório(s) ativos — vaga pode estar muito restritiva. Candidatos fortes podem ser rejeitados.`,
        icon: "🔪",
        category: "restrictiveness",
      });
    }

    // Check: very high restrictiveness
    if (restrictiveness === "very_high") {
      alerts.push({
        level: "warning",
        message: "🚨 ATENÇÃO: Vaga MUITO restritiva. Combinação de educação alta + muita experiência + deal-breakers pode resultar em zero candidatos. Revise os requisitos.",
        icon: "⛔",
        category: "restrictiveness",
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // SECTION 3: General Completeness (Warning)
    // ─────────────────────────────────────────────────────────────────

    if (!form.job_area?.trim()) {
      alerts.push({
        level: "warning",
        message: "Área da vaga não definida — isso enfraquece a análise de compatibilidade",
        icon: "🧭",
        category: "general",
      });
    }

    if (!form.responsibilities?.trim()) {
      alerts.push({
        level: "warning",
        message: "Responsabilidades principais não foram detalhadas — adicione para melhor matching",
        icon: "🧱",
        category: "general",
      });
    }

    if (!form.experience_context?.trim()) {
      alerts.push({
        level: "warning",
        message: "Contexto de experiência não informado — ajuda a qualificar candidatos",
        icon: "🧪",
        category: "general",
      });
    }

    if ((form.behavioral_requirements ?? []).length === 0) {
      alerts.push({
        level: "warning",
        message: "Sem requisitos comportamentais — adicione para melhor fit cultural",
        icon: "🗣️",
        category: "general",
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // Summary Status
    // ─────────────────────────────────────────────────────────────────

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
        message: `✅ Configuração base concluída. Nível de restritividade: ${restrictiveness.toUpperCase()}${
          restrictiveness === "low" || restrictiveness === "moderate"
            ? " — configuração balanceada"
            : ""
        }`,
        icon: "✅",
        category: "general",
      });
    }

    return {
      alerts,
      summary: {
        educationLevel,
        experienceYears,
        dealBreakersActive,
        publishReadiness,
        restrictiveness,
      },
    };
  }, [form]);
}
