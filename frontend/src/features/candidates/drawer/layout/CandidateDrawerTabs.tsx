import { Tabs } from "../../../../components/common/Tabs";

export type CandidateDrawerTab = "overview" | "experience" | "documents" | "history";

export const CANDIDATE_DRAWER_TABS = [
  { key: "overview" as const, label: "Resumo & Score" },
  { key: "experience" as const, label: "Experiência" },
  { key: "documents" as const, label: "Documentos" },
  { key: "history" as const, label: "Histórico" },
];

interface CandidateDrawerTabsProps {
  active: CandidateDrawerTab;
  onChange: (tab: CandidateDrawerTab) => void;
}

export function CandidateDrawerTabs({ active, onChange }: CandidateDrawerTabsProps) {
  return (
    <div className="shrink-0 bg-[hsl(var(--surface))] border-b border-[hsl(var(--border))]">
      <Tabs
        tabs={CANDIDATE_DRAWER_TABS}
        active={active}
        onChange={(key) => onChange(key as CandidateDrawerTab)}
      />
    </div>
  );
}
