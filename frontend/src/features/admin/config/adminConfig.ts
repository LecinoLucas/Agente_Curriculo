import {
  ADMIN_ONLY_ROLES,
  AGENDA_ACCESS_ROLES,
  ALL_AUTH_ROLES,
  ANALYSIS_ROLES,
  CANDIDATES_ACCESS_ROLES,
  JOB_MANAGEMENT_ROLES,
  MANAGER_AREA_ROLES,
  PRE_ADMISSION_AREA_ROLES,
  RH_DASHBOARD_ROLES,
  STAFF_ROLES,
} from "../../../shared/auth/roles";
import type { UserRole } from "../../../types/auth";

export type Role = UserRole;

export const ROLES: { key: Role; label: string; description: string }[] = [
  { key: "admin",     label: "Administrador", description: "Acesso total à plataforma" },
  { key: "recruiter", label: "Recrutador",    description: "Operação de recrutamento" },
  { key: "hr",        label: "RH",            description: "Admissão e contratos" },
  { key: "manager",   label: "Gestor",        description: "Revisão e Scorecards" },
  { key: "viewer",    label: "Leitor",         description: "Apenas visualização de dados" },
  { key: "candidate", label: "Candidato",     description: "Acesso restrito ao portal do candidato" },
];

export const SCREENS: { label: string; path: string; roles: Role[] }[] = [
  { label: "Central RH",      path: "/rh",            roles: RH_DASHBOARD_ROLES },
  { label: "Pipeline",        path: "/pipeline",      roles: STAFF_ROLES },
  { label: "Candidatos",      path: "/candidatos",    roles: CANDIDATES_ACCESS_ROLES },
  { label: "Vagas",           path: "/vagas",         roles: STAFF_ROLES },
  { label: "Agenda",          path: "/agenda",        roles: AGENDA_ACCESS_ROLES },
  { label: "Importação",      path: "/importar",      roles: JOB_MANAGEMENT_ROLES },
  { label: "Formulários",     path: "/importar-formulario", roles: JOB_MANAGEMENT_ROLES },
  { label: "Análises IA",     path: "/analises-ia",   roles: ANALYSIS_ROLES },
  { label: "Revisão",         path: "/manager",       roles: MANAGER_AREA_ROLES },
  { label: "Meu perfil",      path: "/perfil",        roles: ALL_AUTH_ROLES },
  { label: "Painel Admin",    path: "/admin",         roles: ADMIN_ONLY_ROLES },
  { label: "Usuários Internos", path: "/admin/usuarios", roles: ADMIN_ONLY_ROLES },
  { label: "Cadastros Gerais", path: "/admin/cadastros", roles: ADMIN_ONLY_ROLES },
  { label: "Auditoria",       path: "/admin/auditoria", roles: ADMIN_ONLY_ROLES },
  { label: "System Health",   path: "/admin/health",    roles: ADMIN_ONLY_ROLES },
  { label: "Credenciais IA",  path: "/admin/ai-provider-credentials", roles: ADMIN_ONLY_ROLES },
  { label: "Laboratório IA",  path: "/admin/ia", roles: ADMIN_ONLY_ROLES },
  { label: "BI & Métricas",   path: "/admin/bi",        roles: ADMIN_ONLY_ROLES },
  { label: "Templates IA",    path: "/admin/behavioral-templates", roles: JOB_MANAGEMENT_ROLES },
  { label: "Checklists Admissionais", path: "/admissao/checklists", roles: PRE_ADMISSION_AREA_ROLES },
];
