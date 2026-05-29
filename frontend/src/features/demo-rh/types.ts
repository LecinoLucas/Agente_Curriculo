export type DemoStep =
  | "sem_avaliacao"
  | "triagem"
  | "ranking_ia"
  | "aguardando_acao"
  | "entrevista_rh"
  | "entrevista_gestor"
  | "pre_admissao"
  | "admitido";

export type DemoScenarioStatus = "idle" | "ready" | "in_progress" | "completed";

export type DemoJobStatus = "nao_iniciado" | "em_andamento" | "gargalo" | "pronto_pre_admissao";

export type DemoCandidateStatus =
  | "sem_avaliacao"
  | "aguardando_acao"
  | "em_andamento"
  | "etapa_avancada"
  | "top_match";

export type DemoBatchStatus = "open" | "advanced";

export interface DemoCandidate {
  candidateId: string;
  jobId: string;
  fullName: string;
  score: number | null;
  step: DemoStep;
  status: DemoCandidateStatus;
  batchId: string;
  batchNumber: number;
}

export interface DemoBatch {
  batchId: string;
  batchNumber: number;
  jobId: string;
  candidateIds: string[];
  createdAt: string;
  status: DemoBatchStatus;
}

export interface DemoJob {
  jobId: string;
  title: string;
  status: DemoJobStatus;
  realJobId: string | null;
  candidates: DemoCandidate[];
  pendingCandidates: Omit<DemoCandidate, "batchId" | "batchNumber">[];
  batches: DemoBatch[];
  currentBatchNumber: number;
}

export interface DemoScenario {
  scenarioId: string;
  status: DemoScenarioStatus;
  jobs: DemoJob[];
  selectedJobId: string | null;
  currentBatchNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface DemoJobSummary {
  totalCandidates: number;
  currentBatchNumber: number;
  predominantStep: DemoStep;
  topMatchCount: number;
  withoutEvaluationCount: number;
  waitingActionCount: number;
  advancedStageCount: number;
}
