export type Role = "admin" | "recruiter" | "candidate" | "viewer" | "manager" | "hr";

export const ROLES: { key: Role; label: string; description: string }[] = [
  { key: "admin",     label: "Administrador", description: "Acesso total à plataforma" },
  { key: "recruiter", label: "Recrutador",    description: "Operação de recrutamento" },
  { key: "hr",        label: "RH",            description: "Admissão e contratos" },
  { key: "manager",   label: "Gestor",        description: "Revisão e Scorecards" },
  { key: "viewer",    label: "Leitor",         description: "Apenas visualização de dados" },
  { key: "candidate", label: "Candidato",     description: "Acesso restrito ao portal do candidato" },
];

export const SCREENS: { label: string; path: string; roles: Role[] }[] = [
  { label: "Dashboard",       path: "/dashboard",     roles: ["admin", "recruiter", "viewer", "manager"] },
  { label: "Pipeline",        path: "/pipeline",      roles: ["admin", "recruiter", "viewer", "manager"] },
  { label: "Candidatos",      path: "/candidatos",    roles: ["admin", "recruiter", "viewer", "manager"] },
  { label: "Vagas",           path: "/vagas",         roles: ["admin", "recruiter", "viewer", "manager"] },
  { label: "Agenda",          path: "/agenda",        roles: ["admin", "recruiter", "viewer", "manager"] },
  { label: "Importação",      path: "/importar",      roles: ["admin", "recruiter"] },
  { label: "Formulários",     path: "/importar-formulario", roles: ["admin", "recruiter"] },
  { label: "Análises IA",     path: "/analises-ia",   roles: ["admin", "recruiter"] },
  { label: "Revisão",         path: "/manager",       roles: ["admin", "manager"] },
  { label: "Meu perfil",      path: "/perfil",        roles: ["admin", "recruiter", "candidate", "viewer", "manager", "hr"] },
  { label: "Painel Admin",    path: "/admin",         roles: ["admin"] },
  { label: "Usuários Internos", path: "/admin/usuarios", roles: ["admin"] },
  { label: "Cadastros Gerais", path: "/admin/cadastros", roles: ["admin"] },
  { label: "Auditoria",       path: "/admin/auditoria", roles: ["admin"] },
  { label: "System Health",   path: "/admin/health",    roles: ["admin"] },
  { label: "Credenciais IA",  path: "/admin/ai-provider-credentials", roles: ["admin"] },
  { label: "BI & Métricas",   path: "/admin/bi",        roles: ["admin"] },
  { label: "Templates IA",    path: "/admin/behavioral-templates", roles: ["admin", "recruiter"] },
];
