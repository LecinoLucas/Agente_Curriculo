import type { Tab } from "../../../components/common/Tabs";
import {
  isCandidateProfileTabKey,
  type CandidateProfileTabKey,
} from "./utils/getVisibleCandidateProfileTabs";

export const PROFILE_TABS: Tab[] = [
  { key: "overview", label: "Visão geral" },
  { key: "workflow", label: "Ações" },
  { key: "pre_admission", label: "Pré-admissão" },
  { key: "score", label: "Score e análise" },
  { key: "documents", label: "Currículo e documentos" },
  { key: "interviews", label: "Entrevistas" },
  { key: "assessments", label: "Avaliações" },
  { key: "communications", label: "Comunicação" },
  { key: "notes", label: "Observações" },
  { key: "history", label: "Histórico" },
];

export type CandidateProfileFocus =
  | "behavioral_ai"
  | "scorecard"
  | "hiring_decision"
  | "manager_review";

export function resolveSearchTab(search: string): CandidateProfileTabKey | null {
  const tab = new URLSearchParams(search).get("tab");
  return isCandidateProfileTabKey(tab) ? tab : null;
}

export function resolveInitialTab(search: string): CandidateProfileTabKey {
  return resolveSearchTab(search) ?? "overview";
}

export function resolveInitialFocus(search: string): CandidateProfileFocus | null {
  const focus = new URLSearchParams(search).get("focus");
  if (focus === "behavioral_ai") return focus;
  if (focus === "scorecard") return focus;
  if (focus === "hiring_decision") return focus;
  if (focus === "manager_review") return focus;
  return null;
}
