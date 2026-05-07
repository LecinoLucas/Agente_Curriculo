type Role = "admin" | "recruiter" | "candidate" | "viewer";

export const ROLES: { key: Role; label: string; description: string }[] = [
  { key: "admin",     label: "Administrador", description: "Acesso total à plataforma" },
  { key: "recruiter", label: "Recrutador",    description: "Operação de recrutamento" },
  { key: "candidate", label: "Candidato",     description: "Portal futuro (Phase 20.3+)" },
  { key: "viewer",    label: "Leitor",         description: "Somente leitura" },
];

export const SCREENS: { label: string; path: string; roles: Role[] }[] = [
  { label: "Pipeline",      path: "/pipeline",    roles: ["admin", "recruiter", "viewer"] },
  { label: "Candidatos",    path: "/candidatos",  roles: ["admin", "recruiter", "viewer"] },
  { label: "Vagas",         path: "/vagas",       roles: ["admin", "recruiter", "viewer"] },
  { label: "Análises IA",   path: "/analises-ia", roles: ["admin", "recruiter"] },
  { label: "Meu perfil",    path: "/perfil",      roles: ["admin", "recruiter", "candidate", "viewer"] },
  { label: "Administração", path: "/admin",       roles: ["admin"] },
  { label: "Importar vagas", path: "/admin/importar-vagas", roles: ["admin"] },
];
