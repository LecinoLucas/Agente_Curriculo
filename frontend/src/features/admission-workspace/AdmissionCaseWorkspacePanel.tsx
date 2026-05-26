import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonCards } from "@/components/common/Skeleton";
import { formatContextError } from "../../services/errorMessages";
import { HttpError } from "../../services/http";
import { admissionWorkspaceService } from "../../services/admissionWorkspaceService";
import { toast } from "../../shared/utils/toast";
import type { AdmissionCaseWorkspace, AdmissionWorkspaceBlocker } from "../../types/domain";
import { AdmissionCaseHeader } from "./components/AdmissionCaseHeader";
import { AdmissionChecklistCard } from "./components/AdmissionChecklistCard";
import { AdmissionBlockersCard } from "./components/AdmissionBlockersCard";
import { AdmissionDocumentsCard } from "./components/AdmissionDocumentsCard";
import { AdmissionNextActionsCard } from "./components/AdmissionNextActionsCard";
import { AdmissionRecentEventsCard } from "./components/AdmissionRecentEventsCard";
import { AdmissionSummaryCard } from "./components/AdmissionSummaryCard";

type ChecklistAction = "approve" | "reject" | "request-correction" | "mark-not-required";

type AdmissionCaseWorkspacePanelProps = {
  caseId: string;
  openPageHref?: string | null;
  integrationHref?: string | null;
};

function extractBlockersFromError(error: unknown): AdmissionWorkspaceBlocker[] {
  if (!(error instanceof HttpError) || !error.detail || typeof error.detail !== "object") {
    return [];
  }

  const maybeBlockers = (error.detail as { blockers?: unknown }).blockers;
  return Array.isArray(maybeBlockers) ? (maybeBlockers as AdmissionWorkspaceBlocker[]) : [];
}

function WorkspaceLoadingState() {
  return (
    <div className="admission-cockpit space-y-4">
      <div className="admission-section-card p-5">
        <div className="space-y-4">
          <div className="h-6 w-48 animate-pulse rounded bg-[hsl(var(--surface-muted))]" />
          <div className="h-4 w-72 animate-pulse rounded bg-[hsl(var(--surface-muted))]" />
          <div className="h-20 animate-pulse rounded-lg bg-[hsl(var(--surface-muted))]" />
        </div>
      </div>
      <SkeletonCards count={4} columns={2} />
    </div>
  );
}

export function AdmissionCaseWorkspacePanel({
  caseId,
  openPageHref,
  integrationHref,
}: AdmissionCaseWorkspacePanelProps) {
  const [workspace, setWorkspace] = useState<AdmissionCaseWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingActionKey, setLoadingActionKey] = useState<string | null>(null);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);

  const resolvedIntegrationHref = useMemo(
    () => integrationHref ?? `/admission/cases/${caseId}/integration`,
    [caseId, integrationHref],
  );

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await admissionWorkspaceService.getWorkspace(caseId);
      setWorkspace(payload);
    } catch (requestError) {
      setError(
        formatContextError(
          requestError,
          "Não foi possível carregar o workspace da pré-admissão.",
          "Atualize a página ou revise o vínculo do pipeline ativo.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const openChecklist = useCallback(() => {
    document.getElementById("admission-checklist-section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const runChecklistAction = useCallback(
    async (itemId: string, action: ChecklistAction) => {
      const actionMap = {
        approve: {
          fn: admissionWorkspaceService.approveChecklistItem,
          success: "Item aprovado.",
        },
        reject: {
          fn: admissionWorkspaceService.rejectChecklistItem,
          success: "Item rejeitado.",
        },
        "request-correction": {
          fn: admissionWorkspaceService.requestChecklistItemCorrection,
          success: "Correção solicitada.",
        },
        "mark-not-required": {
          fn: admissionWorkspaceService.markChecklistItemNotRequired,
          success: "Item marcado como não obrigatório.",
        },
      } as const;

      const actionMeta = actionMap[action];
      setLoadingActionKey(`${itemId}:${action}`);
      setSummaryMessage(null);
      try {
        await actionMeta.fn(itemId);
        toast.success(actionMeta.success);
      } catch (requestError) {
        toast.error(
          formatContextError(
            requestError,
            "Não foi possível atualizar o item do checklist.",
            "Tente novamente.",
          ),
        );
      } finally {
        setLoadingActionKey(null);
        await loadWorkspace();
      }
    },
    [loadWorkspace],
  );

  const handleMarkReady = useCallback(async () => {
    setLoadingActionKey("case:mark-ready");
    setSummaryMessage(null);
    try {
      await admissionWorkspaceService.markCaseReadyForExport(caseId);
      toast.success("Caso marcado como pronto para exportação.");
    } catch (requestError) {
      const blockers = extractBlockersFromError(requestError);
      setSummaryMessage(
        blockers.length > 0
          ? `Ainda existem ${blockers.length} pendência(s) operacionais impedindo a liberação.`
          : formatContextError(
              requestError,
              "Não foi possível validar o caso para exportação.",
              "Revise os bloqueios e tente novamente.",
            ),
      );
      toast.error(
        formatContextError(
          requestError,
          "Não foi possível validar o caso para exportação.",
          "Revise os bloqueios e tente novamente.",
        ),
      );
    } finally {
      setLoadingActionKey(null);
      await loadWorkspace();
    }
  }, [caseId, loadWorkspace]);

  if (loading) {
    return <WorkspaceLoadingState />;
  }

  if (error || !workspace) {
    return (
      <div className="admission-section-card p-6">
        <EmptyState
          icon="⚠️"
          title="Workspace indisponível"
          description={error ?? "Não foi possível localizar este caso admissional."}
          action={{ label: "Recarregar", onClick: () => void loadWorkspace() }}
        />
      </div>
    );
  }

  return (
    <div className="admission-cockpit admission-cockpit-shell space-y-6 p-3 sm:p-4">
      <AdmissionCaseHeader workspace={workspace} openPageHref={openPageHref} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <AdmissionChecklistCard
            items={workspace.checklist.items}
            loadingActionKey={loadingActionKey}
            onAction={runChecklistAction}
          />
          <AdmissionDocumentsCard documents={workspace.documents} />
          <AdmissionRecentEventsCard events={workspace.recent_events} />
        </div>

        <div className="admission-side-rail space-y-6">
          <AdmissionSummaryCard
            workspace={workspace}
            onMarkReady={handleMarkReady}
            submitting={loadingActionKey === "case:mark-ready"}
            actionMessage={summaryMessage}
          />
          <AdmissionBlockersCard blockers={workspace.main_blockers} />
          <AdmissionNextActionsCard
            actions={workspace.next_actions}
            integrationHref={resolvedIntegrationHref}
            onOpenChecklist={openChecklist}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void loadWorkspace()}
          className="ui-btn-secondary inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" />
          Recarregar workspace
        </button>
      </div>
    </div>
  );
}
