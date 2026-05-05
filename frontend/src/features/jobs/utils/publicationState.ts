import type { Job, JobFormValues, JobQualityResult } from "../../../types/domain";

export type PublicationPanelState = {
  label: "Rascunho" | "Incompleta" | "Pronta para publicar" | "Publicação bloqueada";
  tone: "neutral" | "warning" | "success" | "danger";
  description: string;
};

export function getPublicationPanelState(
  form: JobFormValues,
  currentJob: Job | null,
  backendQuality: JobQualityResult | null,
  frontendBlockers: string[],
): PublicationPanelState {
  if (backendQuality && !backendQuality.can_publish) {
    return {
      label: "Publicação bloqueada",
      tone: "danger",
      description: "Existem regras obrigatórias pendentes. O score não libera a publicação sozinho.",
    };
  }

  const hasStarted =
    Boolean(form.title.trim()) ||
    Boolean(form.description.trim()) ||
    Boolean(form.requirements?.trim()) ||
    frontendBlockers.length < 4;

  if (!hasStarted && !currentJob) {
    return {
      label: "Rascunho",
      tone: "neutral",
      description: "Você pode salvar uma vaga incompleta como rascunho.",
    };
  }

  if (frontendBlockers.length > 0) {
    return {
      label: "Incompleta",
      tone: "warning",
      description: "Faltam itens mínimos para permitir a publicação.",
    };
  }

  return {
    label: "Pronta para publicar",
    tone: "success",
    description: "A estrutura mínima está pronta. Use o botão Publicar para validar no backend.",
  };
}

export function getPanelToneClasses(tone: PublicationPanelState["tone"]) {
  switch (tone) {
    case "danger":
      return "border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))]";
    case "warning":
      return "border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))] text-[hsl(var(--warning))]";
    case "success":
      return "border-[hsl(var(--success))]/20 bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]";
    default:
      return "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]";
  }
}
