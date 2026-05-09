const JOB_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicada",
  paused: "Pausada",
  closed: "Encerrada",
  cancelled: "Cancelada",
  archived: "Arquivada",
};

const SENIORITY_LABEL: Record<string, string> = {
  intern: "Estágio",
  junior: "Júnior",
  mid: "Pleno",
  senior: "Sênior",
  lead: "Lead",
  principal: "Principal",
  director: "Diretoria",
};

const WORK_MODEL_LABEL: Record<string, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  onsite: "Presencial",
};

const EDUCATION_LEVEL_LABEL: Record<string, string> = {
  none: "Nenhuma",
  high_school: "Ensino Médio",
  technical: "Técnico",
  bachelor: "Graduação",
  postgraduate: "Pós-Graduação",
  master: "Mestrado",
  phd: "Doutorado",
};

export function formatJobStatus(status: string | null | undefined): string {
  return JOB_STATUS_LABEL[status ?? ""] ?? status ?? "—";
}

export function jobStatusTone(
  status: string | null | undefined,
): "success" | "warning" | "danger" | "neutral" {
  if (status === "published") return "success";
  if (status === "paused" || status === "archived") return "warning";
  if (status === "closed" || status === "cancelled") return "danger";
  return "neutral";
}

export function formatSeniority(level: string | null | undefined): string {
  return SENIORITY_LABEL[level ?? ""] ?? level ?? "—";
}

export function formatWorkModel(model: string | null | undefined): string {
  return WORK_MODEL_LABEL[model ?? ""] ?? model ?? "—";
}

export function formatEducationLevel(level: string | null | undefined): string {
  return EDUCATION_LEVEL_LABEL[level ?? ""] ?? level ?? "—";
}
