import { useEffect, useRef, useState } from "react";
import { Briefcase, Edit3, NotebookPen, RefreshCcw } from "lucide-react";

import { CandidateHiringDecisionPanel } from "../../drawer/components/CandidateHiringDecisionPanel";
import type {
  CandidateOverview,
  CandidatePipelineEntryOverview,
  Job,
  PipelineStage,
} from "../../../../types/domain";
import {
  STAGE_LABEL,
  isPostHiringActiveStage,
  isSuccessTerminalStage,
} from "../../utils/profile";
import { STAGE_OPTIONS } from "../profileStatusLabels";
import { ActionButton, DefinitionList, SectionCard } from "./ProfileSharedUI";
import { CurrentProcessHistoryHint } from "./CandidateProfileHistoryTab";

export function CandidateProfileWorkflowTab({
  overview,
  activeEntry,
  activeJob,
  jobsError,
  transferJobs,
  canTransfer,
  saving,
  onMoveStage,
  onRequestReject,
  onTransfer,
  onLinkJob,
  onEdit,
  onOpenPreAdmission,
  onOpenNotes,
  onOpenHistory,
  hiringDecisionFocusToken,
  onDecisionSubmitted,
  hiringDecisionOutcome = null,
}: {
  overview: CandidateOverview;
  activeEntry: CandidatePipelineEntryOverview | null;
  activeJob: Job | null;
  jobsError: string | null;
  transferJobs: Job[];
  canTransfer: boolean;
  saving: boolean;
  onMoveStage: (stage: PipelineStage, reason?: string | null) => Promise<boolean>;
  onRequestReject: () => void;
  onTransfer: (toJobId: string, reason: string) => Promise<void>;
  onLinkJob: () => void;
  onEdit: () => void;
  onOpenPreAdmission: () => void;
  onOpenNotes: () => void;
  onOpenHistory: () => void;
  hiringDecisionFocusToken: number;
  onDecisionSubmitted: () => Promise<void>;
  hiringDecisionOutcome?: string | null;
}) {
  const [stage, setStage] = useState<PipelineStage>(activeEntry?.stage ?? "entry");
  const [reason, setReason] = useState("");
  const [targetJobId, setTargetJobId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [decisionHighlighted, setDecisionHighlighted] = useState(false);
  const hiringDecisionRef = useRef<HTMLDivElement | null>(null);
  const postHiringActive =
    isPostHiringActiveStage(activeEntry?.stage) || activeEntry?.relationship_status === "hired";
  const admitted = isSuccessTerminalStage(activeEntry?.stage);
  const rejected = activeEntry?.stage === "rejected" || activeEntry?.relationship_status === "rejected";
  const terminal = rejected || admitted;
  const canMoveToHired = activeEntry?.stage === "offer" && !terminal;
  // "Mover para Pré-admissão" só aparece quando existe decisão de contratar (outcome === "hire")
  const canMoveToPreAdmission =
    activeEntry?.stage === "hired" && !terminal && hiringDecisionOutcome === "hire";
  const canMoveToProtheus = activeEntry?.stage === "pre_admission" && !terminal;
  const canMoveToAdmitted = activeEntry?.stage === "protheus" && !terminal;
  const preAdmissionNeedsAction = (overview.preview_pendencies ?? []).some(
    (pendency) => pendency.action === "open_pre_admission",
  );
  const hasPrimaryStageShortcut = canMoveToHired || canMoveToPreAdmission || canMoveToProtheus || canMoveToAdmitted;
  const decisionPendency = (overview.preview_pendencies ?? []).find((pendency) =>
    pendency.id === "final_decision_not_submitted" ||
    pendency.id === "manager_decision_missing" ||
    pendency.id === "hiring_decision_required" ||
    pendency.action === "open_decision"
  );
  const decisionDescription =
    decisionPendency?.id === "hiring_decision_required" ||
    decisionPendency?.id === "manager_decision_missing"
      ? "Registre a decisão de contratação antes de avançar para a etapa seguinte."
      : "Registro opcional para auditoria. A contratação acontece ao mover a pipeline para Contratado.";

  useEffect(() => {
    setStage(activeEntry?.stage ?? "entry");
    setReason("");
  }, [activeEntry?.job_id, activeEntry?.stage]);

  useEffect(() => {
    setTargetJobId((current) => {
      if (current && transferJobs.some((job) => job.id === current)) return current;
      return transferJobs[0]?.id ?? "";
    });
  }, [transferJobs]);

  useEffect(() => {
    if (hiringDecisionFocusToken <= 0) return;
    setDecisionHighlighted(true);
    window.setTimeout(() => {
      hiringDecisionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    const timeout = window.setTimeout(() => setDecisionHighlighted(false), 3500);
    return () => window.clearTimeout(timeout);
  }, [hiringDecisionFocusToken]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <CurrentProcessHistoryHint
        candidateId={overview.candidate.id}
        jobId={activeEntry?.job_id ?? null}
        onOpenHistory={onOpenHistory}
        className="xl:col-span-2"
      />
      <SectionCard title="Pipeline">
        <div className="space-y-4">
          <DefinitionList
            items={[
              ["Vaga atual", activeEntry?.job_title ?? activeJob?.title ?? "Sem vaga ativa"],
              ["Etapa", activeEntry ? STAGE_LABEL[activeEntry.stage] : "-"],
              ["Status", activeEntry?.relationship_status ?? "Sem vínculo ativo"],
            ]}
          />

          {activeEntry && !terminal ? (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="font-semibold text-text">Mover etapa</span>
                <select
                  value={stage}
                  onChange={(event) => setStage(event.target.value as PipelineStage)}
                  disabled={saving}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                >
                  {STAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-text">Motivo/observação</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={saving}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="Opcional, mas recomendado para reprovação ou correção de etapa."
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {canMoveToHired ? (
                  <ActionButton
                    onClick={() => void onMoveStage("hired", reason || "Contratação concluída.")}
                    disabled={saving}
                    primary
                  >
                    Mover para Contratado
                  </ActionButton>
                ) : null}
                {canMoveToPreAdmission ? (
                  <ActionButton
                    onClick={() => {
                      void onMoveStage("pre_admission", reason || "Pré-admissão iniciada.").then((moved) => {
                        if (moved) onOpenPreAdmission();
                      });
                    }}
                    disabled={saving}
                    primary
                  >
                    Mover para Pré-admissão
                  </ActionButton>
                ) : null}
                {canMoveToProtheus ? (
                  <ActionButton
                    onClick={() =>
                      preAdmissionNeedsAction
                        ? onOpenPreAdmission()
                        : void onMoveStage("protheus", reason || "Pré-admissão concluída.")
                    }
                    disabled={saving}
                    primary
                  >
                    {preAdmissionNeedsAction ? "Abrir pré-admissão" : "Mover para Integração ERP"}
                  </ActionButton>
                ) : null}
                {canMoveToAdmitted ? (
                  <ActionButton
                    onClick={() => void onMoveStage("admitted", reason || "Admissão concluída.")}
                    disabled={saving}
                    primary
                  >
                    Mover para Admitido
                  </ActionButton>
                ) : null}
                <ActionButton
                  onClick={() => void onMoveStage(stage, reason)}
                  disabled={saving || stage === activeEntry.stage}
                  primary={!hasPrimaryStageShortcut}
                >
                  Mover etapa
                </ActionButton>
                <ActionButton
                  onClick={onRequestReject}
                  disabled={saving || activeEntry.stage === "rejected"}
                >
                  Reprovar candidato
                </ActionButton>
              </div>
            </div>
          ) : activeEntry ? (
            <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-4 text-sm text-text-muted">
              <p>
                {admitted
                  ? "Candidato admitido nesta vaga. O vínculo final permanece disponível no histórico da pipeline."
                  : postHiringActive
                  ? "Candidato contratado nesta vaga. O vínculo e o histórico da pipeline permanecem disponíveis."
                  : "Processo encerrado para esta vaga."}
              </p>
              {rejected ? (
                <ActionButton
                  onClick={() => void onMoveStage("screening", reason || "Candidato reconsiderado.")}
                  disabled={saving}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Reconsiderar
                </ActionButton>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Este candidato não possui vaga ativa. Vincule uma vaga para liberar etapa, entrevistas e score.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={onLinkJob}>
              <Briefcase className="h-4 w-4" />
              Adicionar/vincular vaga
            </ActionButton>
            <ActionButton onClick={onEdit}>
              <Edit3 className="h-4 w-4" />
              Editar candidato
            </ActionButton>
            <ActionButton onClick={onOpenNotes}>
              <NotebookPen className="h-4 w-4" />
              Observações
            </ActionButton>
          </div>
        </div>
      </SectionCard>

      {activeEntry ? (
        <div
          ref={hiringDecisionRef}
          data-testid="hiring-decision-action-block"
          data-highlighted={decisionHighlighted ? "true" : "false"}
          className={`xl:col-span-2 rounded-xl transition ${
            decisionHighlighted
              ? "ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-[hsl(var(--bg))]"
              : ""
          }`}
        >
          <CandidateHiringDecisionPanel
            jobId={activeEntry.job_id}
            candidateId={overview.candidate.id}
            title="Decisão de contratação"
            description={decisionDescription}
            onDecisionSubmitted={onDecisionSubmitted}
          />
        </div>
      ) : null}

      <SectionCard title="Transferir candidato">
        <div className="space-y-3">
          {jobsError ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {jobsError}
            </p>
          ) : null}

          {!activeEntry ? (
            <p className="text-sm text-text-muted">
              Transferência exige vínculo atual. Use adicionar/vincular vaga.
            </p>
          ) : !canTransfer ? (
            <p className="text-sm text-text-muted">
              Transferência disponível apenas nas etapas iniciais. Para processos avançados, encerre ou reprove antes de corrigir a vaga.
            </p>
          ) : transferJobs.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nenhuma vaga disponível para transferência.
            </p>
          ) : (
            <>
              <label className="block text-sm">
                <span className="font-semibold text-text">Vaga destino</span>
                <select
                  value={targetJobId}
                  onChange={(event) => setTargetJobId(event.target.value)}
                  disabled={saving}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                >
                  {transferJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-text">Motivo da transferência</span>
                <textarea
                  value={transferReason}
                  onChange={(event) => setTransferReason(event.target.value)}
                  disabled={saving}
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="Explique por que o candidato deve sair da vaga atual."
                />
              </label>
              <ActionButton
                onClick={() => void onTransfer(targetJobId, transferReason)}
                disabled={saving || !targetJobId || !transferReason.trim()}
                primary
              >
                Transferir candidato
              </ActionButton>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
