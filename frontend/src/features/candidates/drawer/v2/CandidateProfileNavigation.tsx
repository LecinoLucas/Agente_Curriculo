import { useState, useEffect } from "react";
import { BarChart3, FileText, UserRound, Calendar, CheckSquare, ClipboardList, Mail, MessageCircle, NotebookPen, ChevronDown, ChevronUp } from "lucide-react";
import { getVisibleCandidateTabs, type GetVisibleCandidateTabsInput, type UserRole } from "../utils/getVisibleCandidateTabs";
import type { PipelineStage } from "../../../../types/domain";

type TabKey = "overview" | "score" | "documents" | "interview" | "assessment" | "pre_admission" | "communications" | "collaboration" | "notes";

interface CandidateProfileNavigationProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  // Optional context for filtering tabs
  pipelineStage?: PipelineStage | null;
  pipelineStatus?: string | null;
  activeJobDecision?: string | null;
  hasActiveJob?: boolean;
  hasBehavioralAssessment?: boolean;
  hasInterviews?: boolean;
  hasScorecard?: boolean;
  hasHiringDecision?: boolean;
  hasPreAdmission?: boolean;
  hasAdmissionPackage?: boolean;
  hasCollaboration?: boolean;
  userRole?: UserRole;
}

const TABS: Array<{ key: TabKey; label: string; icon: typeof UserRound }> = [
  { key: "overview", label: "Resumo", icon: UserRound },
  { key: "score", label: "Análise", icon: BarChart3 },
  { key: "documents", label: "Documentos", icon: FileText },
  { key: "interview", label: "Entrevista", icon: Calendar },
  { key: "assessment", label: "Avaliação", icon: CheckSquare },
  { key: "communications", label: "Comunicações", icon: Mail },
  { key: "collaboration", label: "Colaboração", icon: MessageCircle },
  { key: "notes", label: "Observações", icon: NotebookPen },
  { key: "pre_admission", label: "Pré-admissão", icon: ClipboardList },
];

export function CandidateProfileNavigation({
  activeTab,
  onChange,
  pipelineStage = null,
  pipelineStatus = null,
  activeJobDecision = null,
  hasActiveJob = false,
  hasBehavioralAssessment = false,
  hasInterviews = false,
  hasScorecard = false,
  hasHiringDecision = false,
  hasPreAdmission = false,
  hasAdmissionPackage = false,
  hasCollaboration = false,
  userRole = "user",
}: CandidateProfileNavigationProps) {
  const [showAll, setShowAll] = useState(false);

  // Ensure activeTab is visible; otherwise redirect to overview
  const visibleTabs = getVisibleCandidateTabs({
    pipelineStage,
    pipelineStatus,
    activeJobDecision,
    hasActiveJob,
    hasBehavioralAssessment,
    hasInterviews,
    hasScorecard,
    hasHiringDecision,
    hasPreAdmission,
    hasAdmissionPackage,
    hasCollaboration,
    userRole,
    showAll,
  });

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      onChange("overview");
    }
  }, [visibleTabs, activeTab, onChange]);

  const tabsToRender = showAll
    ? TABS
    : TABS.filter(({ key }) => visibleTabs.includes(key));

  const hasMoreTabs = visibleTabs.length < TABS.length;

  return (
    <div className="shrink-0 border-b border-[hsl(var(--border))]/30 bg-[hsl(var(--surface))] px-5 py-3">
      <div className="space-y-2">
        <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]/50 bg-[hsl(var(--surface-muted))]/45 p-1">
          <div className="flex gap-1">
            {tabsToRender.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                className={[
                  "relative flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition whitespace-nowrap",
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

        {hasMoreTabs && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--text-muted))] transition hover:text-[hsl(var(--text))]"
          >
            {showAll ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Mostrar menos</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Mostrar tudo</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export type { TabKey };
