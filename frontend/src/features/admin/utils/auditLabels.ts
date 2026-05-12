import { AuditLogItem } from "../../../services/auditLogsService";

const ACTION_LABELS: Record<string, string> = {
  "http.error": "Erro HTTP",
  archive_job: "Vaga arquivada",
  restore_job: "Vaga restaurada",
  discard_analysis: "Análise descartada",
  create_skill: "Skill criada",
  update_skill: "Skill atualizada",
  deactivate_skill: "Skill inativada",
  activate_skill: "Skill reativada",
  archive_skill: "Skill arquivada",
  restore_skill: "Skill restaurada",
  create_job_area: "Área criada",
  update_job_area: "Área atualizada",
  activate_job_area: "Área reativada",
  deactivate_job_area: "Área inativada",
  delete_job_area: "Área excluída",
  archive_candidate: "Candidato arquivado",
  restore_candidate: "Candidato restaurado",
  delete_candidate: "Candidato excluído",
};

const ENTITY_LABELS: Record<string, string> = {
  job: "Vaga",
  analysis: "Análise",
  skill: "Skill",
  skill_catalog: "Skill",
  job_area: "Área",
  candidate: "Candidato",
  http: "HTTP",
};

const DETAIL_KEYS = [
  "reason",
  "note",
  "previous_state",
  "next_state",
  "name",
  "title",
  "candidate_name",
  "skill_name",
  "area_name",
];

function formatFallback(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getAuditActionLabel(action: string) {
  return ACTION_LABELS[action] ?? formatFallback(action);
}

export function getAuditEntityLabel(entityType: string) {
  return ENTITY_LABELS[entityType] ?? formatFallback(entityType);
}

export function getAuditUserLabel(log: AuditLogItem) {
  if (isNonEmptyString(log.user_name)) return log.user_name;
  if (isNonEmptyString(log.user_email)) return log.user_email;
  if (isNonEmptyString(log.user_id)) return log.user_id;
  return "Sistema";
}

export function getAuditUserSecondaryLabel(log: AuditLogItem) {
  if (isNonEmptyString(log.user_name) && isNonEmptyString(log.user_email)) {
    return log.user_email;
  }
  if (isNonEmptyString(log.user_id) && log.user_id !== log.user_name && log.user_id !== log.user_email) {
    return log.user_id;
  }
  return null;
}

export function getAuditDetailSummary(log: AuditLogItem) {
  for (const key of DETAIL_KEYS) {
    const value = log.metadata?.[key];
    if (isNonEmptyString(value)) return value;
  }

  if (log.after_state && typeof log.after_state === "object") {
    const afterTitle = log.after_state.title;
    if (isNonEmptyString(afterTitle)) return afterTitle;
    const afterName = log.after_state.name;
    if (isNonEmptyString(afterName)) return afterName;
  }

  return "Sem detalhes adicionais";
}

export function getAuditHighlightedMetadata(log: AuditLogItem) {
  return DETAIL_KEYS.flatMap((key) => {
    const value = log.metadata?.[key];
    if (!isNonEmptyString(value)) return [];
    return [{ key, value }];
  });
}
