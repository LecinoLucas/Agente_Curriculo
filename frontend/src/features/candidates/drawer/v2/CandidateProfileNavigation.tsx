import { BarChart3, FileText, UserRound, Calendar, CheckSquare, ClipboardList, Mail } from "lucide-react";

type TabKey = "overview" | "score" | "documents" | "interview" | "assessment" | "pre_admission" | "communications";

interface CandidateProfileNavigationProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

const TABS: Array<{ key: TabKey; label: string; icon: typeof UserRound }> = [
  { key: "overview", label: "Resumo", icon: UserRound },
  { key: "score", label: "Análise", icon: BarChart3 },
  { key: "documents", label: "Documentos", icon: FileText },
  { key: "interview", label: "Entrevista", icon: Calendar },
  { key: "assessment", label: "Avaliação", icon: CheckSquare },
  { key: "communications", label: "Comunicações", icon: Mail },
  { key: "pre_admission", label: "Pré-admissão", icon: ClipboardList },
];

export function CandidateProfileNavigation({
  activeTab,
  onChange,
}: CandidateProfileNavigationProps) {
  return (
    <div className="shrink-0 border-b border-[hsl(var(--border))]/30 bg-[hsl(var(--surface))] px-5 py-3">
      <div className="rounded-xl border border-[hsl(var(--border))]/50 bg-[hsl(var(--surface-muted))]/45 p-1">
        <div className="flex gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={[
                "relative flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                activeTab === key
                  ? "bg-[hsl(var(--surface))] text-[hsl(var(--text))] shadow-sm ring-1 ring-[hsl(var(--border))]/60"
                  : "text-[hsl(var(--text-muted))] hover:bg-white/60 hover:text-[hsl(var(--text))]",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export type { TabKey };
