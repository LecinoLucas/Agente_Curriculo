import { DemoBatch, DemoCandidate, DemoJob, DemoScenario } from "./types";

function timestamp() {
  return "2026-01-01T10:00:00.000Z";
}

function candidate(
  jobId: string,
  candidateId: string,
  fullName: string,
  score: number | null,
  step: DemoCandidate["step"],
  status: DemoCandidate["status"],
  batchId: string,
  batchNumber: number,
): DemoCandidate {
  return {
    candidateId,
    jobId,
    fullName,
    score,
    step,
    status,
    batchId,
    batchNumber,
  };
}

function pendingCandidate(
  jobId: string,
  candidateId: string,
  fullName: string,
  score: number | null,
): Omit<DemoCandidate, "batchId" | "batchNumber"> {
  return {
    candidateId,
    jobId,
    fullName,
    score,
    step: "sem_avaliacao",
    status: "sem_avaliacao",
  };
}

function batch(jobId: string, batchId: string, batchNumber: number, candidateIds: string[]): DemoBatch {
  return {
    batchId,
    batchNumber,
    jobId,
    candidateIds,
    createdAt: timestamp(),
    status: "open",
  };
}

function makeJob(
  jobId: string,
  title: string,
  status: DemoJob["status"],
  initialCandidates: DemoCandidate[],
  pendingCandidates: DemoJob["pendingCandidates"],
): DemoJob {
  return {
    jobId,
    title,
    status,
    realJobId: null,
    candidates: initialCandidates,
    pendingCandidates,
    batches: [batch(jobId, `${jobId}-batch-1`, 1, initialCandidates.map((c) => c.candidateId))],
    currentBatchNumber: 1,
  };
}

const dadosJobId = "job-analista-dados-senior";
const frentistaJobId = "job-frentista";
const supervisorJobId = "job-supervisor-pista";

const analistaDados = makeJob(
  dadosJobId,
  "Analista de Dados Sênior",
  "em_andamento",
  [
    candidate(dadosJobId, "dados-c1", "Aline Matos", 95, "entrevista_gestor", "top_match", `${dadosJobId}-batch-1`, 1),
    candidate(dadosJobId, "dados-c2", "Bruno Leite", 88, "entrevista_rh", "em_andamento", `${dadosJobId}-batch-1`, 1),
    candidate(dadosJobId, "dados-c3", "Carina Costa", 74, "ranking_ia", "aguardando_acao", `${dadosJobId}-batch-1`, 1),
    candidate(dadosJobId, "dados-c4", "Daniel Prado", null, "sem_avaliacao", "sem_avaliacao", `${dadosJobId}-batch-1`, 1),
    candidate(dadosJobId, "dados-c5", "Erica Bessa", 69, "triagem", "em_andamento", `${dadosJobId}-batch-1`, 1),
    candidate(dadosJobId, "dados-c6", "Felipe Nunes", 83, "pre_admissao", "etapa_avancada", `${dadosJobId}-batch-1`, 1),
  ],
  [
    pendingCandidate(dadosJobId, "dados-p1", "Gisele Araujo", 91),
    pendingCandidate(dadosJobId, "dados-p2", "Heitor Faria", 77),
    pendingCandidate(dadosJobId, "dados-p3", "Iara Castro", null),
  ],
);

const frentista = makeJob(
  frentistaJobId,
  "Frentista",
  "gargalo",
  [
    candidate(frentistaJobId, "frentista-c1", "Ana Souza", 90, "entrevista_rh", "top_match", `${frentistaJobId}-batch-1`, 1),
    candidate(frentistaJobId, "frentista-c2", "Carla Mendes", 86, "aguardando_acao", "aguardando_acao", `${frentistaJobId}-batch-1`, 1),
    candidate(frentistaJobId, "frentista-c3", "Joao Lima", 71, "triagem", "em_andamento", `${frentistaJobId}-batch-1`, 1),
    candidate(frentistaJobId, "frentista-c4", "Pedro Alves", 48, "ranking_ia", "em_andamento", `${frentistaJobId}-batch-1`, 1),
    candidate(frentistaJobId, "frentista-c5", "Marina Rocha", null, "sem_avaliacao", "sem_avaliacao", `${frentistaJobId}-batch-1`, 1),
    candidate(frentistaJobId, "frentista-c6", "Sandro Viana", 81, "entrevista_gestor", "etapa_avancada", `${frentistaJobId}-batch-1`, 1),
  ],
  [
    pendingCandidate(frentistaJobId, "frentista-p1", "Talita Maia", 79),
    pendingCandidate(frentistaJobId, "frentista-p2", "Ulisses Braga", 65),
    pendingCandidate(frentistaJobId, "frentista-p3", "Vanessa Melo", null),
  ],
);

const supervisorPista = makeJob(
  supervisorJobId,
  "Supervisor de Pista",
  "pronto_pre_admissao",
  [
    candidate(supervisorJobId, "sup-c1", "Rafael Guerra", 93, "pre_admissao", "top_match", `${supervisorJobId}-batch-1`, 1),
    candidate(supervisorJobId, "sup-c2", "Patricia Reis", 84, "entrevista_gestor", "etapa_avancada", `${supervisorJobId}-batch-1`, 1),
    candidate(supervisorJobId, "sup-c3", "Tiago Mota", 75, "entrevista_rh", "em_andamento", `${supervisorJobId}-batch-1`, 1),
    candidate(supervisorJobId, "sup-c4", "Livia Campos", 68, "ranking_ia", "aguardando_acao", `${supervisorJobId}-batch-1`, 1),
    candidate(supervisorJobId, "sup-c5", "Mateus Dias", null, "sem_avaliacao", "sem_avaliacao", `${supervisorJobId}-batch-1`, 1),
    candidate(supervisorJobId, "sup-c6", "Nara Couto", 79, "triagem", "em_andamento", `${supervisorJobId}-batch-1`, 1),
  ],
  [
    pendingCandidate(supervisorJobId, "sup-p1", "Olivia Brandao", 88),
    pendingCandidate(supervisorJobId, "sup-p2", "Paulo Madeira", 72),
    pendingCandidate(supervisorJobId, "sup-p3", "Renata Bello", null),
  ],
);

export const DEMO_SCENARIO_SEED: DemoScenario = {
  scenarioId: "demo-rh-seed",
  status: "ready",
  jobs: [analistaDados, frentista, supervisorPista],
  selectedJobId: analistaDados.jobId,
  currentBatchNumber: 1,
  createdAt: timestamp(),
  updatedAt: timestamp(),
};
