import { CandidatePreAdmissionPanel } from "../../drawer/components/CandidatePreAdmissionPanel";
import type { PreAdmissionEnvelope } from "../../../../types/domain";

export function CandidateProfilePreAdmissionTab({
  caseId,
  jobId,
  candidateId,
  userRole,
  candidateName,
  jobTitle,
  currentStage,
  sendingToProtheus,
  onSendToProtheus,
  onOpenHiringDecision,
  initialEnvelope,
  onCaseCreated,
}: {
  caseId: string | null;
  jobId: string | null;
  candidateId: string | null;
  userRole: string | null;
  candidateName: string | null;
  jobTitle: string | null;
  currentStage: string | null;
  sendingToProtheus: boolean;
  onSendToProtheus: () => Promise<unknown>;
  onOpenHiringDecision: () => void;
  initialEnvelope: PreAdmissionEnvelope | null;
  onCaseCreated: () => Promise<void>;
}) {
  return (
    <CandidatePreAdmissionPanel
      caseId={caseId}
      jobId={jobId}
      candidateId={candidateId}
      userRole={userRole}
      candidateName={candidateName}
      jobTitle={jobTitle}
      currentStage={currentStage}
      sendingToProtheus={sendingToProtheus}
      onSendToProtheus={onSendToProtheus}
      onOpenHiringDecision={onOpenHiringDecision}
      initialEnvelope={initialEnvelope}
      onCaseCreated={onCaseCreated}
    />
  );
}
