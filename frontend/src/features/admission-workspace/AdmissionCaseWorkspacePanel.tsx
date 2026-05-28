import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonCards } from "@/components/common/Skeleton";
import { formatContextError } from "../../services/errorMessages";
import { HttpError } from "../../services/http";
import { admissionWorkspaceService } from "../../services/admissionWorkspaceService";
import {
  approvePreAdmissionDocument,
  downloadPreAdmissionDocument,
  rejectPreAdmissionDocument,
  type RejectPreAdmissionDocumentPayload,
} from "../../services/preAdmissionService";
import { toast } from "../../shared/utils/toast";
import type {
  AdmissionCaseDocumentsPayload,
  AdmissionCaseEventsPage,
  AdmissionCaseOverview,
  AdmissionCaseWorkspace,
  AdmissionWorkspaceBlocker,
  AdmissionWorkspaceDocument,
} from "../../types/domain";
import { AdmissionCaseHeader } from "./components/AdmissionCaseHeader";
import { AdmissionChecklistCard } from "./components/AdmissionChecklistCard";
import { AdmissionBlockersCard } from "./components/AdmissionBlockersCard";
import { AdmissionDocumentsCard } from "./components/AdmissionDocumentsCard";
import { AdmissionNextActionsCard } from "./components/AdmissionNextActionsCard";
import { AdmissionRecentEventsCard } from "./components/AdmissionRecentEventsCard";
import { AdmissionSummaryCard } from "./components/AdmissionSummaryCard";
import { AdmissionProtheusIntegrationPanel } from "./AdmissionProtheusIntegrationPanel";

type AdmissionCaseWorkspacePanelProps = {
  caseId: string;
  openPageHref?: string | null;
  integrationHref?: string | null;
};

type DocumentReviewMode = "reject" | "request-correction";

function extractBlockersFromError(error: unknown): AdmissionWorkspaceBlocker[] {
  if (!(error instanceof HttpError) || !error.detail || typeof error.detail !== "object") {
    return [];
  }

  const maybeBlockers = (error.detail as { blockers?: unknown }).blockers;
  return Array.isArray(maybeBlockers) ? (maybeBlockers as AdmissionWorkspaceBlocker[]) : [];
}

function WorkspaceLoadingState() {
  return (
    <div className="admission-cockpit space-y-5 px-3 pt-5 sm:px-4">
      {/* Loading: page header */}
      <div className="space-y-2">
        <div className="h-3 w-40 animate-pulse rounded bg-surface-muted" />
        <div className="h-6 w-64 animate-pulse rounded bg-surface-muted" />
      </div>
      {/* Loading: summary bar */}
      <div className="admission-section-card h-24 animate-pulse p-5" />
      {/* Loading: main grid */}
      <SkeletonCards count={4} columns={2} />
    </div>
  );
}

function SectionLoadingState({ title }: { title: string }) {
  return (
    <section className="admission-section-card">
      <div className="px-5 py-4">
        <h2 className="text-base font-semibold text-text">{title}</h2>
      </div>
      <div className="px-5 pb-5">
        <div className="h-20 animate-pulse rounded-xl bg-surface-muted" />
      </div>
    </section>
  );
}

function SectionErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="admission-section-card p-5">
      <h2 className="text-base font-semibold text-text">{title}</h2>
      <p className="mt-2 text-sm text-text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="border border-border bg-surface text-text hover:bg-surface-muted transition mt-3 inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-medium"
      >
        Tentar novamente
      </button>
    </section>
  );
}

function buildWorkspace(
  overview: AdmissionCaseOverview,
  documentsPayload: AdmissionCaseDocumentsPayload | null,
  eventsPage: AdmissionCaseEventsPage | null,
): AdmissionCaseWorkspace {
  const fallbackChecklist = {
    total: overview.progress.total,
    approved: overview.progress.approved,
    pending: overview.progress.pending + overview.progress.in_review,
    blocked: overview.progress.rejected,
    items: [],
  };

  return {
    case: overview.case,
    candidate: overview.candidate,
    job: overview.job,
    checklist: documentsPayload?.checklist ?? fallbackChecklist,
    documents: documentsPayload?.documents ?? [],
    main_blockers: overview.main_blockers,
    next_actions: overview.next_actions,
    summary: overview.summary,
    recent_events: eventsPage?.items ?? [],
  };
}

export function AdmissionCaseWorkspacePanel({
  caseId,
  openPageHref,
  integrationHref,
}: AdmissionCaseWorkspacePanelProps) {
  const [overview, setOverview] = useState<AdmissionCaseOverview | null>(null);
  const [documentsPayload, setDocumentsPayload] = useState<AdmissionCaseDocumentsPayload | null>(null);
  const [eventsPage, setEventsPage] = useState<AdmissionCaseEventsPage | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [loadingActionKey, setLoadingActionKey] = useState<string | null>(null);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const [highlightedDocumentId, setHighlightedDocumentId] = useState<string | null>(null);

  const resolvedIntegrationHref = useMemo(
    () => integrationHref ?? `/admission/cases/${caseId}/integration`,
    [caseId, integrationHref],
  );

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const payload = await admissionWorkspaceService.getOverview(caseId);
      setOverview(payload);
    } catch (requestError) {
      setOverviewError(
        formatContextError(
          requestError,
          "Não foi possível carregar o overview da pré-admissão.",
          "Atualize a página ou revise o vínculo do pipeline ativo.",
        ),
      );
    } finally {
      setOverviewLoading(false);
    }
  }, [caseId]);

  const loadDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const payload = await admissionWorkspaceService.getDocuments(caseId);
      setDocumentsPayload(payload);
    } catch (requestError) {
      setDocumentsError(
        formatContextError(
          requestError,
          "Não foi possível carregar documentos e checklist.",
          "Tente novamente para revisar os arquivos do caso.",
        ),
      );
    } finally {
      setDocumentsLoading(false);
    }
  }, [caseId]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError(null);
    try {
      const payload = await admissionWorkspaceService.getEvents(caseId, 1, 20);
      setEventsPage(payload);
    } catch (requestError) {
      setEventsError(
        formatContextError(
          requestError,
          "Não foi possível carregar o histórico recente.",
          "Tente novamente para recarregar os eventos.",
        ),
      );
    } finally {
      setEventsLoading(false);
    }
  }, [caseId]);

  const reloadSections = useCallback(async () => {
    await Promise.all([loadOverview(), loadDocuments(), loadEvents()]);
  }, [loadDocuments, loadEvents, loadOverview]);

  useEffect(() => {
    void Promise.all([loadOverview(), loadDocuments(), loadEvents()]);
  }, [loadDocuments, loadEvents, loadOverview]);

  const workspace = useMemo(
    () => (overview ? buildWorkspace(overview, documentsPayload, eventsPage) : null),
    [documentsPayload, eventsPage, overview],
  );

  const openChecklist = useCallback(() => {
    document.getElementById("admission-checklist-section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const openDocuments = useCallback((documentId?: string | null) => {
    setHighlightedDocumentId(documentId ?? null);
    document.getElementById("admission-documents-section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const handleMarkNotRequired = useCallback(
    async (itemId: string) => {
      setLoadingActionKey(`${itemId}:mark-not-required`);
      setSummaryMessage(null);
      try {
        await admissionWorkspaceService.markChecklistItemNotRequired(itemId);
        toast.success("Item marcado como não obrigatório.");
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
        await Promise.all([loadOverview(), loadDocuments(), loadEvents()]);
      }
    },
    [loadDocuments, loadEvents, loadOverview],
  );

  const handleApproveDocument = useCallback(
    async (documentData: AdmissionWorkspaceDocument) => {
      setLoadingActionKey(`document:${documentData.id}:approve`);
      setSummaryMessage(null);
      try {
        await approvePreAdmissionDocument(documentData.id);
        toast.success("Documento aprovado.");
      } catch (requestError) {
        toast.error(
          formatContextError(
            requestError,
            "Não foi possível aprovar o documento.",
            "Tente novamente.",
          ),
        );
      } finally {
        setLoadingActionKey(null);
        await Promise.all([loadOverview(), loadDocuments(), loadEvents()]);
      }
    },
    [loadDocuments, loadEvents, loadOverview],
  );

  const handleRejectDocument = useCallback(
    async (
      documentData: AdmissionWorkspaceDocument,
      payload: RejectPreAdmissionDocumentPayload,
      mode: DocumentReviewMode,
    ) => {
      setLoadingActionKey(`document:${documentData.id}:${mode}`);
      setSummaryMessage(null);
      try {
        await rejectPreAdmissionDocument(documentData.id, payload);
        toast.success(mode === "request-correction" ? "Correção solicitada." : "Documento rejeitado.");
      } catch (requestError) {
        toast.error(
          formatContextError(
            requestError,
            "Não foi possível registrar a revisão do documento.",
            "Tente novamente.",
          ),
        );
        throw requestError;
      } finally {
        setLoadingActionKey(null);
        await Promise.all([loadOverview(), loadDocuments(), loadEvents()]);
      }
    },
    [loadDocuments, loadEvents, loadOverview],
  );

  const handleDownloadDocument = useCallback(
    async (documentData: AdmissionWorkspaceDocument) => {
      setLoadingActionKey(`document:${documentData.id}:download`);
      try {
        const blob = await downloadPreAdmissionDocument(documentData.id);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = documentData.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (requestError) {
        toast.error(
          formatContextError(
            requestError,
            "Não foi possível baixar o documento.",
            "Tente novamente.",
          ),
        );
      } finally {
        setLoadingActionKey(null);
      }
    },
    [],
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
      await Promise.all([loadOverview(), loadDocuments(), loadEvents()]);
    }
  }, [caseId, loadDocuments, loadEvents, loadOverview]);

  if (overviewLoading && !overview) {
    return <WorkspaceLoadingState />;
  }

  if (overviewError || !workspace) {
    return (
      <div className="admission-section-card p-6">
        <EmptyState
          icon="⚠️"
          title="Workspace indisponível"
          description={overviewError ?? "Não foi possível localizar este caso admissional."}
          action={{ label: "Recarregar", onClick: () => void loadOverview() }}
        />
      </div>
    );
  }

  return (
    <div
      className="admission-cockpit space-y-5"
      data-page="admission-case-workspace"
    >
      {/* Header: breadcrumb + title + horizontal summary bar */}
      <AdmissionCaseHeader workspace={workspace} openPageHref={openPageHref} />

      {/* ─── Main 2-column grid ─────────────────────────────────────────── */}
      {/*
          LEFT  (larger): Checklist admissional + Pendências principais
          RIGHT (smaller): Resumo do caso + Documentos enviados + Próximas ações + Histórico recente
      */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">

        {/* ── Left column ─────────────────────────────────────────────── */}
        <div className="space-y-5">
          {documentsLoading && !documentsPayload ? (
            <SectionLoadingState title="Checklist admissional" />
          ) : documentsError && !documentsPayload ? (
            <SectionErrorState
              title="Checklist admissional"
              message={documentsError}
              onRetry={() => void loadDocuments()}
            />
          ) : (
            <AdmissionChecklistCard
              items={workspace.checklist.items}
              loadingActionKey={loadingActionKey}
              onMarkNotRequired={handleMarkNotRequired}
              onReviewDocument={openDocuments}
            />
          )}
          <AdmissionBlockersCard
            blockers={workspace.main_blockers}
            onOpenChecklist={openChecklist}
          />
        </div>

        {/* ── Right column (sticky on xl) ──────────────────────────────── */}
        <div className="admission-side-rail space-y-5">
          <AdmissionSummaryCard
            workspace={workspace}
            onMarkReady={handleMarkReady}
            submitting={loadingActionKey === "case:mark-ready"}
            actionMessage={summaryMessage}
          />
          {documentsLoading && !documentsPayload ? (
            <SectionLoadingState title="Documentos enviados" />
          ) : documentsError && !documentsPayload ? (
            <SectionErrorState
              title="Documentos enviados"
              message={documentsError}
              onRetry={() => void loadDocuments()}
            />
          ) : (
            <AdmissionDocumentsCard
              documents={workspace.documents}
              highlightedDocumentId={highlightedDocumentId}
              loadingActionKey={loadingActionKey}
              onApprove={handleApproveDocument}
              onReject={handleRejectDocument}
              onDownload={handleDownloadDocument}
            />
          )}
          <AdmissionNextActionsCard
            actions={workspace.next_actions}
            integrationHref={resolvedIntegrationHref}
            onOpenChecklist={openChecklist}
          />
          <AdmissionProtheusIntegrationPanel
            caseId={caseId}
            variant="embedded"
            workspace={workspace}
          />
          {eventsLoading && !eventsPage ? (
            <SectionLoadingState title="Histórico recente" />
          ) : eventsError && !eventsPage ? (
            <SectionErrorState
              title="Histórico recente"
              message={eventsError}
              onRetry={() => void loadEvents()}
            />
          ) : (
            <AdmissionRecentEventsCard events={workspace.recent_events} />
          )}
        </div>
      </div>

      {/* Refresh button */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => void reloadSections()}
          className="border border-border bg-surface text-text hover:bg-surface-muted transition inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium"
        >
          <RefreshCw className="h-4 w-4" />
          Recarregar workspace
        </button>
      </div>
    </div>
  );
}
