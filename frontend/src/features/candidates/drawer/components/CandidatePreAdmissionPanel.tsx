import { ClipboardList } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonCards } from "@/components/common/Skeleton";
import { formatContextError } from "../../../../services/errorMessages";
import { HttpError } from "../../../../services/http";
import {
  createPreAdmission,
  getPreAdmission,
} from "../../../../services/preAdmissionService";
import { toast } from "../../../../shared/utils/toast";
import type { PreAdmissionEnvelope } from "../../../../types/domain";
import { PreAdmissionProfileSummaryCard } from "./PreAdmissionProfileSummaryCard";
import {
  PreAdmissionStartDrawer,
  type PreAdmissionStartDrawerResult,
} from "./PreAdmissionStartDrawer";

interface CandidatePreAdmissionPanelProps {
  caseId?: string | null;
  jobId: string | null;
  candidateId: string | null;
  userRole?: string | null;
  candidateName?: string | null;
  jobTitle?: string | null;
  currentStage?: string | null;
  sendingToProtheus?: boolean;
  onSendToProtheus?: () => Promise<void>;
  onOpenHiringDecision?: () => void;
  initialEnvelope?: PreAdmissionEnvelope | null;
  onCaseCreated?: (caseId: string) => void | Promise<void>;
}

function BootstrapLoadingState() {
  return (
    <div className="space-y-4">
      <div className="bg-surface shadow-sm text-text rounded-lg border border-border p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--accent-soft))] text-[hsl(var(--brand-dark))]">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-surface-muted" />
            <div className="h-3 w-72 animate-pulse rounded bg-surface-muted" />
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
  userRole = null,
  candidateName = null,
  jobTitle = null,
  onOpenHiringDecision,
  initialEnvelope = null,
  onCaseCreated,
}: CandidatePreAdmissionPanelProps) {
  const canAccessPreAdmission = userRole === "admin" || userRole === "hr";
  const [resolvedCaseId, setResolvedCaseId] = useState<string | null>(caseId);
  const [envelope, setEnvelope] = useState<PreAdmissionEnvelope | null>(initialEnvelope);
  const [loading, setLoading] = useState(!caseId && canAccessPreAdmission);
  const [creatingCase, setCreatingCase] = useState(false);
  const [startDrawerOpen, setStartDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResolvedCaseId(caseId);
  }, [caseId]);

  useEffect(() => {
    setEnvelope(initialEnvelope);
    if (!caseId && initialEnvelope?.case?.id) {
      setResolvedCaseId(initialEnvelope.case.id);
    }
  }, [caseId, initialEnvelope]);

  const refreshEnvelope = useCallback(async () => {
    if (!canAccessPreAdmission || !jobId || !candidateId) return null;

    setLoading(true);
    setError(null);
    try {
      const payload = await getPreAdmission(jobId, candidateId);
      setEnvelope(payload);
      setResolvedCaseId(payload.case?.id ?? null);
      return payload;
    } catch (requestError) {
      setResolvedCaseId(null);
      setEnvelope(null);
      setError(
        formatContextError(
          requestError,
          "Não foi possível localizar o caso de pré-admissão.",
          "Revise a decisão de contratação e tente novamente.",
        ),
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [canAccessPreAdmission, candidateId, jobId]);

  const handleCreateCase = useCallback(async (): Promise<PreAdmissionStartDrawerResult> => {
    if (!canAccessPreAdmission || !jobId || !candidateId) {
      throw new HttpError(403, "Acesso restrito ao RH.");
    }
    if (creatingCase) {
      throw new Error("Já existe uma criação de caso admissional em andamento.");
    }

    setCreatingCase(true);
    setError(null);
    try {
      const created = await createPreAdmission(jobId, candidateId, {});
      setEnvelope({
        case: created,
        can_create: false,
        hiring_decision_outcome: "hire",
      });
      setResolvedCaseId(created.id);
      await onCaseCreated?.(created.id);
      toast.success("Caso admissional criado.");
      return {
        caseId: created.id,
      };
    } catch (requestError) {
      if (requestError instanceof HttpError && requestError.status === 403) {
        throw requestError;
      }

      const refreshed = await refreshEnvelope();
      if (refreshed?.case?.id) {
        await onCaseCreated?.(refreshed.case.id);
        toast.info("Caso admissional existente localizado.");
        return {
          caseId: refreshed.case.id,
          reusedExistingCase: true,
        };
      }
      throw requestError;
    } finally {
      setCreatingCase(false);
    }
  }, [canAccessPreAdmission, candidateId, creatingCase, jobId, onCaseCreated, refreshEnvelope]);

  useEffect(() => {
    if (!canAccessPreAdmission) {
      setResolvedCaseId(null);
      setEnvelope(null);
      setLoading(false);
      setError(null);
      return;
    }

    if (caseId) {
      setLoading(false);
      setError(null);
      return;
    }

    if (!jobId || !candidateId) {
      setResolvedCaseId(null);
      setEnvelope(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const bootstrapCase = async () => {
      const payload = await refreshEnvelope();
      if (cancelled || !payload) return;
    };

    void bootstrapCase();

    return () => {
      cancelled = true;
    };
  }, [canAccessPreAdmission, candidateId, caseId, jobId, refreshEnvelope]);

  if (!canAccessPreAdmission) {
    return (
      <div className="bg-surface shadow-sm text-text rounded-lg border border-border p-6">
        <EmptyState
          icon="🔒"
          title="Pré-admissão restrita ao RH."
          description="A criação e gestão do caso admissional ficam disponíveis apenas para RH e administradores."
        />
      </div>
    );
  }

  if (loading) {
    return <BootstrapLoadingState />;
  }

  if (error) {
    return (
      <div className="bg-surface shadow-sm text-text rounded-lg border border-border p-6">
        <EmptyState
          icon="⚠️"
          title="Pré-admissão indisponível"
          description={error}
          action={
            onOpenHiringDecision
              ? {
                  label: "Revisar decisão de contratação",
                  onClick: onOpenHiringDecision,
                }
              : undefined
          }
        />
      </div>
    );
  }

  const startDrawer = (
    <PreAdmissionStartDrawer
      open={startDrawerOpen}
      candidateName={candidateName}
      jobTitle={jobTitle}
      onClose={() => {
        setStartDrawerOpen(false);
      }}
      onConfirm={handleCreateCase}
      onSuccess={() => {
        setStartDrawerOpen(false);
      }}
    />
  );

  if (!resolvedCaseId) {
    const canCreateCase = envelope?.can_create ?? false;
    const hasHireDecision = envelope?.hiring_decision_outcome === "hire";
    const emptyDescription = canCreateCase
      ? "Crie o caso admissional para iniciar checklist, documentos e integração."
      : hasHireDecision
        ? "A pré-admissão será liberada quando o candidato estiver em etapa compatível do pipeline."
        : candidateName && jobTitle
          ? `${candidateName} ainda não possui um caso ativo de pré-admissão para ${jobTitle}.`
          : "A pré-admissão fica disponível apenas após a decisão final de contratar.";

    return (
      <>
        <div className="bg-surface shadow-sm text-text rounded-lg border border-border p-6">
          <EmptyState
            icon="📋"
            title="Caso admissional ainda não aberto"
            description={emptyDescription}
            action={
              canCreateCase
                ? {
                    label: "Criar caso admissional",
                    onClick: () => {
                      setStartDrawerOpen(true);
                    },
                  }
                : onOpenHiringDecision
                ? {
                    label: "Revisar decisão de contratação",
                    onClick: onOpenHiringDecision,
                  }
                : undefined
            }
          />
        </div>
        {startDrawer}
      </>
    );
  }

  return (
    <>
      <PreAdmissionProfileSummaryCard caseId={resolvedCaseId} />
      {startDrawer}
    </>
  );
}
