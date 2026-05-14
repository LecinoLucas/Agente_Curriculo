import { InterviewScorecardPanel } from "../components/InterviewScorecardPanel";

interface InterviewTabProps {
  jobId: string | null;
  candidateId: string | null;
}

export function InterviewTab({ jobId, candidateId }: InterviewTabProps) {
  return (
    <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
      <InterviewScorecardPanel jobId={jobId} candidateId={candidateId} />
    </div>
  );
}
