import { describe, expect, it } from "vitest";

import {
  advanceCurrentBatch,
  createLocalScenario,
  generateBatchForJob,
  resetLocalScenario,
} from "../demoScenarioOrchestrator";

const ANALISTA_JOB_ID = "job-analista-dados-senior";
const FRENTISTA_JOB_ID = "job-frentista";
const SUPERVISOR_JOB_ID = "job-supervisor-pista";

describe("demoScenarioOrchestrator", () => {
  it("cria cenário com 3 vagas", () => {
    const scenario = createLocalScenario();
    expect(scenario.jobs).toHaveLength(3);
    expect(scenario.jobs.map((job) => job.jobId)).toEqual([
      ANALISTA_JOB_ID,
      FRENTISTA_JOB_ID,
      SUPERVISOR_JOB_ID,
    ]);
  });

  it("cada vaga tem remessa inicial", () => {
    const scenario = createLocalScenario();
    scenario.jobs.forEach((job) => {
      expect(job.currentBatchNumber).toBe(1);
      expect(job.batches).toHaveLength(1);
      expect(job.batches[0].batchNumber).toBe(1);
    });
  });

  it("gerar nova remessa aumenta batchNumber", () => {
    const scenario = createLocalScenario();
    const next = generateBatchForJob(scenario, FRENTISTA_JOB_ID);
    const frentista = next.jobs.find((job) => job.jobId === FRENTISTA_JOB_ID);

    expect(frentista).toBeDefined();
    expect(frentista?.currentBatchNumber).toBe(2);
    expect(frentista?.batches).toHaveLength(2);
  });

  it("nova remessa não duplica candidatos anteriores", () => {
    const scenario = createLocalScenario();
    const frentistaBefore = scenario.jobs.find((job) => job.jobId === FRENTISTA_JOB_ID);
    const beforeIds = new Set(frentistaBefore?.candidates.map((candidate) => candidate.candidateId));

    const next = generateBatchForJob(scenario, FRENTISTA_JOB_ID);
    const frentistaAfter = next.jobs.find((job) => job.jobId === FRENTISTA_JOB_ID);
    const newBatch = frentistaAfter?.batches.find((batch) => batch.batchNumber === 2);

    expect(newBatch).toBeDefined();
    expect(newBatch?.candidateIds.length).toBeGreaterThan(0);

    newBatch?.candidateIds.forEach((candidateId) => {
      expect(beforeIds.has(candidateId)).toBe(false);
    });
  });

  it("avançar remessa move candidatos para etapas posteriores", () => {
    const scenario = createLocalScenario();
    const before = scenario.jobs.find((job) => job.jobId === FRENTISTA_JOB_ID);
    const candidateBefore = before?.candidates.find((candidate) => candidate.candidateId === "frentista-c5");
    expect(candidateBefore?.step).toBe("sem_avaliacao");

    const next = advanceCurrentBatch(scenario, FRENTISTA_JOB_ID);
    const after = next.jobs.find((job) => job.jobId === FRENTISTA_JOB_ID);
    const candidateAfter = after?.candidates.find((candidate) => candidate.candidateId === "frentista-c5");

    expect(candidateAfter?.step).toBe("triagem");
  });

  it("reset volta ao cenário inicial", () => {
    const scenario = createLocalScenario();
    const changed = generateBatchForJob(scenario, ANALISTA_JOB_ID);
    const changedJob = changed.jobs.find((job) => job.jobId === ANALISTA_JOB_ID);
    expect(changedJob?.currentBatchNumber).toBe(2);

    const reset = resetLocalScenario();
    const resetJob = reset.jobs.find((job) => job.jobId === ANALISTA_JOB_ID);
    expect(reset.status).toBe("ready");
    expect(resetJob?.currentBatchNumber).toBe(1);
    expect(resetJob?.batches).toHaveLength(1);
  });
});
