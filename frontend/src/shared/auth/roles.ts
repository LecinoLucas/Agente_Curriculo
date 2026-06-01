import type { UserRole } from "../../types/auth";

export const ALL_AUTH_ROLES: UserRole[] = [
  "admin",
  "recruiter",
  "candidate",
  "viewer",
  "manager",
  "hr",
];

export const ADMIN_ONLY_ROLES: UserRole[] = ["admin"];
export const STAFF_ROLES: UserRole[] = ["admin", "recruiter", "viewer", "manager", "hr"];
export const INTERNAL_STAFF_ROLES: UserRole[] = ["admin", "recruiter", "manager", "hr"];
export const RH_DASHBOARD_ROLES: UserRole[] = ["admin", "recruiter", "viewer", "hr"];
export const AGENDA_ACCESS_ROLES: UserRole[] = ["admin", "recruiter", "viewer", "hr"];
export const AGENDA_MUTATION_ROLES: UserRole[] = ["admin", "hr", "recruiter"];
export const CANDIDATES_ACCESS_ROLES: UserRole[] = ["admin", "recruiter"];
export const JOB_MANAGEMENT_ROLES: UserRole[] = ["admin", "recruiter"];
export const ANALYSIS_ROLES: UserRole[] = ["admin", "recruiter"];
export const PRE_ADMISSION_AREA_ROLES: UserRole[] = ["admin", "hr"];
export const CANDIDATE_PRE_ADMISSION_ROLES: UserRole[] = PRE_ADMISSION_AREA_ROLES;
export const PIPELINE_MUTATION_ROLES: UserRole[] = ["admin", "recruiter"];
export const CANDIDATURAS_WRITE_ROLES: UserRole[] = ["admin", "hr", "recruiter"];
export const MANAGER_AREA_ROLES: UserRole[] = ["admin", "manager"];
export const CANDIDATE_PORTAL_ROLES: UserRole[] = ["candidate"];
export const OPERATIONAL_MASTER_ROLES: UserRole[] = ["admin", "hr", "recruiter"];

export function hasRole(
  role: UserRole | null | undefined,
  allowedRoles: readonly UserRole[],
): role is UserRole {
  return Boolean(role) && allowedRoles.includes(role);
}

export function isAdmin(role: UserRole | null | undefined): role is "admin" {
  return role === "admin";
}

export function isHr(role: UserRole | null | undefined): role is "hr" {
  return role === "hr";
}

export function isRecruiter(role: UserRole | null | undefined): role is "recruiter" {
  return role === "recruiter";
}

export function isViewer(role: UserRole | null | undefined): role is "viewer" {
  return role === "viewer";
}

export function isManager(role: UserRole | null | undefined): role is "manager" {
  return role === "manager";
}

export function isCandidate(role: UserRole | null | undefined): role is "candidate" {
  return role === "candidate";
}

export function isStaffRole(role: UserRole | null | undefined): role is Exclude<UserRole, "candidate"> {
  return hasRole(role, STAFF_ROLES);
}

export function isInternalStaffRole(role: UserRole | null | undefined): boolean {
  return hasRole(role, INTERNAL_STAFF_ROLES);
}

export function canAccessPreAdmission(role: UserRole | null | undefined): boolean {
  return hasRole(role, PRE_ADMISSION_AREA_ROLES);
}

export function canAccessCandidatePreAdmission(role: UserRole | null | undefined): boolean {
  return hasRole(role, CANDIDATE_PRE_ADMISSION_ROLES);
}

export function canWritePreAdmission(role: UserRole | null | undefined): boolean {
  return canAccessPreAdmission(role);
}

export function canAccessAnalysis(role: UserRole | null | undefined): boolean {
  return hasRole(role, ANALYSIS_ROLES);
}

export function canWriteAnalysis(role: UserRole | null | undefined): boolean {
  return hasRole(role, ANALYSIS_ROLES);
}

export function canManageJobs(role: UserRole | null | undefined): boolean {
  return hasRole(role, JOB_MANAGEMENT_ROLES);
}

export function canViewManagerArea(role: UserRole | null | undefined): boolean {
  return hasRole(role, MANAGER_AREA_ROLES);
}

export function canMutatePipeline(role: UserRole | null | undefined): boolean {
  return hasRole(role, PIPELINE_MUTATION_ROLES);
}

export function canUseCandidaturasWriteActions(role: UserRole | null | undefined): boolean {
  return hasRole(role, CANDIDATURAS_WRITE_ROLES);
}

export function canMutateAgenda(role: UserRole | null | undefined): boolean {
  return hasRole(role, AGENDA_MUTATION_ROLES);
}

export function canAccessCandidates(role: UserRole | null | undefined): boolean {
  return hasRole(role, CANDIDATES_ACCESS_ROLES);
}

export function canAccessInternalNotifications(role: UserRole | null | undefined): boolean {
  return hasRole(role, INTERNAL_STAFF_ROLES);
}

export function canDownloadCandidateResume(role: UserRole | null | undefined): boolean {
  return hasRole(role, JOB_MANAGEMENT_ROLES);
}
