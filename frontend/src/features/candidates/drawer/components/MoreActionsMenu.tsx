import { useState, useRef, useEffect } from "react";
import { MoreVertical } from "lucide-react";
import type { PipelineStage } from "../../../../types/domain";

type ActionKey =
  | "edit_candidate"
  | "open_documents"
  | "link_job"
  | "start_analysis"
  | "reprocess_analysis"
  | "transfer_job"
  | "view_history"
  | "view_profile";

interface MenuAction {
  key: ActionKey;
  label: string;
  handler: () => void;
  visible: boolean;
  separator?: boolean;
}

interface MoreActionsMenuProps {
  currentStage: PipelineStage | null;
  hasActiveJob: boolean;
  canTransferCurrentJob: boolean;
  onEditCandidate?: () => void;
  onOpenDocuments?: () => void;
  onLinkJob?: () => void;
  onStartAnalysis?: () => void;
  onOpenTransferJob?: () => void;
  onNavigateToFull?: () => void;
}

export function MoreActionsMenu({
  currentStage,
  hasActiveJob,
  canTransferCurrentJob,
  onEditCandidate,
  onOpenDocuments,
  onLinkJob,
  onStartAnalysis,
  onOpenTransferJob,
  onNavigateToFull,
}: MoreActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const actions: MenuAction[] = [
    {
      key: "edit_candidate",
      label: "Editar candidato",
      handler: onEditCandidate || (() => {}),
      visible: !!onEditCandidate,
    },
    {
      key: "open_documents",
      label: "Currículos",
      handler: onOpenDocuments || (() => {}),
      visible: !!onOpenDocuments,
    },
    {
      key: "link_job",
      label: "Vincular nova vaga",
      handler: onLinkJob || (() => {}),
      visible: !!onLinkJob && !hasActiveJob,
    },
    {
      key: "start_analysis",
      label: "Iniciar/Acompanhar análise",
      handler: onStartAnalysis || (() => {}),
      visible: !!onStartAnalysis && hasActiveJob,
    },
    {
      key: "transfer_job",
      label: "Transferir para outra vaga",
      handler: onOpenTransferJob || (() => {}),
      visible: !!onOpenTransferJob && canTransferCurrentJob,
      separator: true,
    },
    {
      key: "view_profile",
      label: "Ver perfil completo",
      handler: onNavigateToFull || (() => {}),
      visible: !!onNavigateToFull,
    },
  ];

  const visibleActions = actions.filter((action) => action.visible);

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-xl border border-border bg-surface p-2 text-text-muted hover:text-text hover:bg-surface-muted transition shadow-sm"
        aria-label="Mais ações"
        aria-expanded={isOpen}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-border bg-surface shadow-lg">
          <div className="overflow-hidden py-1">
            {visibleActions.map((action, idx) => (
              <div
                key={action.key}
                className={
                  action.separator && idx > 0
                    ? "border-t border-border/50"
                    : ""
                }
              >
                <button
                  type="button"
                  onClick={() => {
                    action.handler();
                    setIsOpen(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-text transition hover:bg-surface-muted"
                >
                  {action.label}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
