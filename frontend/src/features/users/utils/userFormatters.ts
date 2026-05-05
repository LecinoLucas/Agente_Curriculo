import { UserRole, UserStatus } from "../../../types/auth";

export const ROLES: UserRole[] = ["admin", "recruiter", "viewer", "candidate"];
export const INTERNAL_ROLES: UserRole[] = ["admin", "recruiter", "viewer"];
export const STATUSES: UserStatus[] = ["active", "pending_verification", "suspended", "inactive"];

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  recruiter: "Recrutador",
  candidate: "Candidato",
  viewer: "Leitor",
};

export const ROLE_CLASS: Record<string, string> = {
  admin: "bg-indigo-50 text-indigo-700 border-indigo-200",
  recruiter: "bg-purple-50 text-purple-700 border-purple-200",
  viewer: "bg-gray-100 text-gray-600 border-gray-200",
  candidate: "bg-amber-50 text-amber-700 border-amber-200",
};

export const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  pending_verification: "Aguardando validação",
  suspended: "Suspenso",
  inactive: "Inativo",
};

export const STATUS_CLASS: Record<string, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  pending_verification: "bg-amber-50 text-amber-700 border-amber-200",
  suspended: "bg-red-50 text-red-700 border-red-200",
  inactive: "bg-gray-100 text-gray-500 border-gray-200",
};

export const inputCls =
  "h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

export const selectCls =
  "h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

export const filterSelectCls =
  "h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

export function buildStrongPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const all = `${upper}${lower}${digits}${symbols}`;
  const picks = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  while (picks.length < 14) {
    picks.push(all[Math.floor(Math.random() * all.length)]);
  }

  return picks.sort(() => Math.random() - 0.5).join("");
}

export function passwordStrength(password: string): { label: "—" | "fraca" | "média" | "forte"; score: 0 | 1 | 2 | 3 } {
  if (!password) return { label: "—", score: 0 };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { label: "fraca", score: 1 };
  if (score === 2) return { label: "média", score: 2 };
  return { label: "forte", score: 3 };
}

export function strengthTone(score: number): string {
  if (score === 1) return "bg-red-500";
  if (score === 2) return "bg-amber-500";
  return "bg-emerald-500";
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export async function copyPassword(value: string): Promise<void> {
  if (!value) return;
  const { toast } = await import("../../../shared/utils/toast");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (!copied) {
        throw new Error("copy_failed");
      }
    }
    toast.success("Senha copiada");
  } catch {
    toast.error("Não foi possível copiar a senha");
  }
}
