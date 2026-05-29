import { DEMO_SCENARIO_SEED } from "./demoScenarioSeed";
import { DemoCandidate, DemoJob, DemoJobSummary, DemoScenario } from "./types";

const STEP_SEQUENCE: DemoCandidate["step"][] = [
  "sem_avaliacao",
  "triagem",
  "ranking_ia",
  "aguardando_acao",
  "entrevista_rh",
  "entrevista_gestor",
  "pre_admissao",
  "admitido",
];

function cloneScenario(seed: DemoScenario): DemoScenario {
  return JSON.parse(JSON.stringify(seed)) as DemoScenario;
}

function nowIso(): string {
  return new Date().toISOString();
}

function bumpScenario(scenario: DemoScenario, nextJobs?: DemoJob[]): DemoScenario {
  const next = cloneScenario(scenario);
  if (nextJobs) {
    next.jobs = nextJobs;
  }
  next.updatedAt = nowIso();
  if (next.status === "ready") {
    next.status = "in_progress";
  }
  const batchNumbers = next.jobs.map((job) => job.currentBatchNumber);
  next.currentBatchNumber = batchNumbers.length > 0 ? Math.max(...batchNumbers) : 0;
  if (next.jobs.every((job) => job.pendingCandidates.length === 0)) {
    next.status = "completed";
  }
  return next;
}

function computeJobStatus(job: DemoJob): DemoJob["status"] {
  const hasWaitingAction = job.candidates.some((candidate) => candidate.status === "aguardando_acao");
  const hasAdvanced = job.candidates.some((candidate) =>
    candidate.step === "pre_admissao" || candidate.step === "admitido",
  );
  if (hasWaitingAction) return "gargalo";
  if (hasAdvanced) return "pronto_pre_admissao";
  if (job.candidates.length > 0) return "em_andamento";
  return "nao_iniciado";
}

function nextStep(step: DemoCandidate["step"]): DemoCandidate["step"] {
  const currentIndex = STEP_SEQUENCE.indexOf(step);
  if (currentIndex < 0 || currentIndex === STEP_SEQUENCE.length - 1) return step;
  return STEP_SEQUENCE[currentIndex + 1];
}

function statusForStep(step: DemoCandidate["step"], score: number | null): DemoCandidate["status"] {
  if (step === "sem_avaliacao") return "sem_avaliacao";
  if (step === "aguardando_acao") return "aguardando_acao";
  if (step === "pre_admissao" || step === "admitido") return "etapa_avancada";
  if (typeof score === "number" && score >= 90) return "top_match";
  return "em_andamento";
}

export function createLocalScenario(): DemoScenario {
  const seedClone = cloneScenario(DEMO_SCENARIO_SEED);
  const createdAt = nowIso();
  return {
    ...seedClone,
    scenarioId: `demo-rh-${Date.now()}`,
    status: "ready",
    createdAt,
    updatedAt: createdAt,
  };
}

export function resetLocalScenario(): DemoScenario {
  return createLocalScenario();
}

export function selectDemoJob(scenario: DemoScenario, jobId: string): DemoScenario {
  if (!scenario.jobs.some((job) => job.jobId === jobId)) return scenario;
  const next = cloneScenario(scenario);
  next.selectedJobId = jobId;
  next.updatedAt = nowIso();
  return next;
}

export function generateBatchForJob(scenario: DemoScenario, jobId: string): DemoScenario {
  const currentJob = scenario.jobs.find((job) => job.jobId === jobId);
  if (!currentJob || currentJob.pendingCandidates.length === 0) {
    return scenario;
  }

  const nextJobs = scenario.jobs.map((job) => {
    if (job.jobId !== jobId) return job;

    const batchNumber = job.currentBatchNumber + 1;
    const batchId = `${job.jobId}-batch-${batchNumber}`;
    const newCandidates = job.pendingCandidates.slice(0, 3).map((candidate) => ({
      ...candidate,
      batchId,
      batchNumber,
      step: "sem_avaliacao",
      status: "sem_avaliacao",
    }));

    if (newCandidates.length === 0) return job;

    const nextBatches = [
      ...job.batches,
      {
        batchId,
        batchNumber,
        jobId: job.jobId,
        candidateIds: newCandidates.map((candidate) => candidate.candidateId),
        createdAt: nowIso(),
        status: "open" as const,
      },
    ];

    const nextJob: DemoJob = {
      ...job,
      batches: nextBatches,
      currentBatchNumber: batchNumber,
      candidates: [...job.candidates, ...newCandidates],
      pendingCandidates: job.pendingCandidates.slice(newCandidates.length),
    };
    nextJob.status = computeJobStatus(nextJob);
    return nextJob;
  });

  return bumpScenario(scenario, nextJobs);
}

export function advanceCurrentBatch(scenario: DemoScenario, jobId: string): DemoScenario {
  const currentJob = scenario.jobs.find((job) => job.jobId === jobId);
  if (!currentJob) return scenario;

  const currentBatch = currentJob.batches.find((batch) => batch.batchNumber === currentJob.currentBatchNumber);
  if (!currentBatch) return scenario;

  const targetIds = new Set(currentBatch.candidateIds);

  const nextJobs = scenario.jobs.map((job) => {
    if (job.jobId !== jobId) return job;

    const nextCandidates = job.candidates.map((candidate) => {
      if (!targetIds.has(candidate.candidateId)) return candidate;
      const advancedStep = nextStep(candidate.step);
      return {
        ...candidate,
        step: advancedStep,
        status: statusForStep(advancedStep, candidate.score),
      };
    });

    const nextBatches = job.batches.map((batch) =>
      batch.batchId === currentBatch.batchId ? { ...batch, status: "advanced" as const } : batch,
    );

    const nextJob: DemoJob = {
      ...job,
      candidates: nextCandidates,
      batches: nextBatches,
    };
    nextJob.status = computeJobStatus(nextJob);
    return nextJob;
  });

  return bumpScenario(scenario, nextJobs);
}

export function getJobDemoSummary(scenario: DemoScenario, jobId: string): DemoJobSummary {
  const job = scenario.jobs.find((item) => item.jobId === jobId);
  if (!job) {
    return {
      totalCandidates: 0,
      currentBatchNumber: 0,
      predominantStep: "sem_avaliacao",
      topMatchCount: 0,
      withoutEvaluationCount: 0,
      waitingActionCount: 0,
      advancedStageCount: 0,
    };
  }

  const stepCounts = new Map<DemoCandidate["step"], number>();
  for (const candidate of job.candidates) {
    stepCounts.set(candidate.step, (stepCounts.get(candidate.step) ?? 0) + 1);
  }

  const predominantStep = [...stepCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "sem_avaliacao";

  return {
    totalCandidates: job.candidates.length,
    currentBatchNumber: job.currentBatchNumber,
    predominantStep,
    topMatchCount: job.candidates.filter((candidate) => candidate.status === "top_match").length,
    withoutEvaluationCount: job.candidates.filter((candidate) => candidate.score === null).length,
    waitingActionCount: job.candidates.filter((candidate) => candidate.status === "aguardando_acao").length,
    advancedStageCount: job.candidates.filter((candidate) => candidate.step === "pre_admissao" || candidate.step === "admitido").length,
  };
}
