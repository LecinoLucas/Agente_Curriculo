import { describe, expect, it } from "vitest";

import type { PipelineColumn, PipelineStage } from "../../../../types/domain";
import {
  groupCandidatesByMacroColumn,
  mapStageToMacroColumn,
  PIPELINE_STAGE_SUBSTATUS_LABEL,
} from "../pipelineKanbanColumns";

const stages: PipelineStage[] = [
  "entry",
  "screening",
  "hr_interview",
  "technical_interview",
  "final",
  "offer",
  "hired",
  "pre_admission",
  "protheus",
  "admitted",
  "rejected",
];

function boardColumns(): PipelineColumn[] {
  return stages.map((stage) => ({
    stage,
    label: stage,
    candidates: [
      {
        candidate_id: `candidate-${stage}`,
        candidate_name: `Candidate ${stage}`,
        stage,
        candidate_status: stage,
        ai_status: "completed",
        job_fit_score: 80,
        top_skills: [],
      },
    ],
  }));
}

describe("pipelineKanbanColumns", () => {
  it.each([
    ["entry", "entrada"],
    ["screening", "analise"],
    ["final", "avaliacao"],
    ["hr_interview", "entrevista"],
    ["technical_interview", "entrevista"],
    ["offer", "decisao"],
    ["hired", "admissao"],
    ["pre_admission", "admissao"],
    ["protheus", "admissao"],
    ["admitted", "finalizado"],
    ["rejected", "finalizado"],
  ] as const)("%s cai em %s", (stage, macroId) => {
    expect(mapStageToMacroColumn(stage).id).toBe(macroId);
  });

  it("agrupa candidatos em 7 macrocolunas preservando o stage real", () => {
    const grouped = groupCandidatesByMacroColumn(boardColumns());

    expect(grouped.map((column) => column.macroId)).toEqual([
      "entrada",
      "analise",
      "entrevista",
      "avaliacao",
      "decisao",
      "admissao",
      "finalizado",
    ]);
    expect(grouped).toHaveLength(7);
    expect(grouped.find((column) => column.macroId === "entrevista")?.candidates.map((candidate) => candidate.stage)).toEqual([
      "hr_interview",
      "technical_interview",
    ]);
    expect(grouped.find((column) => column.macroId === "admissao")?.candidates.map((candidate) => candidate.stage)).toEqual([
      "hired",
      "pre_admission",
      "protheus",
    ]);
    expect(grouped.find((column) => column.macroId === "finalizado")?.candidates.map((candidate) => candidate.stage)).toEqual([
      "admitted",
      "rejected",
    ]);
  });

  it("define substatus reais para o card", () => {
    expect(PIPELINE_STAGE_SUBSTATUS_LABEL.protheus).toBe("Protheus");
    expect(PIPELINE_STAGE_SUBSTATUS_LABEL.rejected).toBe("Encerrado");
  });
});
