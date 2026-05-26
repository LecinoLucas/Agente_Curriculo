import { ClipboardList } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonCards } from "@/components/common/Skeleton";
import { AdmissionCaseWorkspacePanel } from "../../../admission-workspace/AdmissionCaseWorkspacePanel";
import { formatContextError } from "../../../../services/errorMessages";
import { getPreAdmission } from "../../../../services/preAdmissionService";

interface CandidatePreAdmissionPanelProps {
  caseId?: string | null;
  jobId: string | null;
  candidateId: string | null;
  candidateName?: string | null;
  jobTitle?: string | null;
  currentStage?: string | null;
  sendingToProtheus?: boolean;
  onSendToProtheus?: () => Promise<void>;
  onOpenHiringDecision?: () => void;
}

function BootstrapLoadingState() {
  return (
    <div className="space-y-4">
      <div className="ui-card rounded-lg border border-[hsl(var(--border))] p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--accent-soft))] text-[hsl(var(--brand-dark))]">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-[hsl(var(--surface-muted))]" />
            <div className="h-3 w-72 animate-pulse rounded bg-[hsl(var(--surface-muted))]" />
          </div>
        </div>
      </div>
      <SkeletonCards count={4} columns={2} />
    </div>
  );
}

export function CandidatePreAdmissionPanel({
  caseId = null,
  jobId,
  candidateId,
  candidateName = null,
  jobTitle = null,
  onOpenHiringDecision,
}: CandidatePreAdmissionPanelProps) {
  const [resolvedCaseId, setResolvedCaseId] = useState<string | null>(caseId);
  const [loading, setLoading] = useState(!caseId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResolvedCaseId(caseId);
  }, [caseId]);

  useEffect(() => {
    if (caseId) {
      setLoading(false);
      setError(null);
      return;
    }

    if (!jobId || !candidateId) {
      setResolvedCaseId(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const bootstrapCase = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await getPreAdmission(jobId, candidateId);
        if (cancelled) return;
        setResolvedCaseId(payload.case?.id ?? null);
      } catch (requestError) {
        if (cancelled) return;
        setResolvedCaseId(null);
        setError(
          formatContextError(
            requestError,
            "Não foi possível localizar o caso de pré-admissão.",
            "Revise a decisão de contratação e tente novamente.",
          ),
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void bootstrapCase();

    return () => {
      cancelled = true;
    };
  }, [candidateId, caseId, jobId]);

  const openPageHref = useMemo(
    () => (resolvedCaseId ? `/admission/cases/${resolvedCaseId}` : null),
    [resolvedCaseId],
  );

  if (loading) {
    return <BootstrapLoadingState />;
  }

  if (error) {
    return (
      <div className="ui-card rounded-lg border border-[hsl(var(--border))] p-6">
        <EmptyState
          icon="⚠️"
          title="Pré-admissão indisponível"
          description={error}
          action={
            onOpenHiringDecision
              ? {
                  label: "Ir para workflow",
                  onClick: onOpenHiringDecision,
                }
              : undefined
          }
        />
      </div>
    );
  }

  if (!resolvedCaseId) {
    return (
      <div className="ui-card rounded-lg border border-[hsl(var(--border))] p-6">
        <EmptyState
          icon="📋"
          title="Caso admissional ainda não aberto"
          description={
            candidateName && jobTitle
              ? `${candidateName} ainda não possui um caso ativo de pré-admissão para ${jobTitle}.`
              : "Abra o caso após a decisão de contratação para começar o checklist operacional."
          }
          action={
            onOpenHiringDecision
              ? {
                  label: "Abrir workflow",
                  onClick: onOpenHiringDecision,
                }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <AdmissionCaseWorkspacePanel
      caseId={resolvedCaseId}
      openPageHref={openPageHref}
      integrationHref={`/admission/cases/${resolvedCaseId}/integration`}
    />
  );
}
