import type { JobCandidate, PipelineColumn, PipelineStage } from "../../../types/domain";

export type PipelineMacroColumnId =
  | "entrada"
  | "analise"
  | "avaliacao"
  | "entrevista"
  | "decisao"
  | "admissao"
  | "finalizado";

export type PipelineMacroColumnConfig = {
  id: PipelineMacroColumnId;
  label: string;
  description: string;
  stages: PipelineStage[];
  dropTargetStage: PipelineStage | null;
};

export type PipelineMacroColumn = PipelineColumn & {
  macroId: PipelineMacroColumnId;
  description: string;
  realStages: PipelineStage[];
  dropTargetStage: PipelineStage | null;
  dropDisabledReason?: string;
};

export const PIPELINE_MACRO_COLUMNS: readonly PipelineMacroColumnConfig[] = [
  {
    id: "entrada",
    label: "Entrada",
    description: "Candidato vinculado à vaga e pronto para triagem",
    stages: ["entry"],
    dropTargetStage: "entry",
  },
  {
    id: "analise",
    label: "Triagem",
    description: "Revisão inicial humana do perfil e aderência",
    stages: ["screening"],
    dropTargetStage: "screening",
  },
  {
    id: "entrevista",
    label: "Entrevistas",
    description: "Entrevistas RH, técnica e scorecards",
    stages: ["hr_interview", "technical_interview"],
    dropTargetStage: null,
  },
  {
    id: "avaliacao",
    label: "Decisão",
    description: "Consolidação das evidências e decisão final",
    stages: ["final"],
    dropTargetStage: "final",
  },
  {
    id: "decisao",
    label: "Oferta",
    description: "Oferta, aceite e negociação",
    stages: ["offer"],
    dropTargetStage: "offer",
  },
  {
    id: "admissao",
    label: "Admissão",
    description: "Contratação, prazos e onboarding",
    stages: ["hired", "pre_admission", "protheus"],
    dropTargetStage: null,
  },
  {
    id: "finalizado",
    label: "Finalizados",
    description: "Admitidos e processos encerrados",
    stages: ["admitted", "rejected"],
    dropTargetStage: null,
  },
];

const MACRO_BY_STAGE = new Map<PipelineStage, PipelineMacroColumnConfig>(
  PIPELINE_MACRO_COLUMNS.flatMap((column) =>
    column.stages.map((stage) => [stage, column] as const),
  ),
);

export const PIPELINE_STAGE_SUBSTATUS_LABEL: Record<PipelineStage, string> = {
  entry: "Entrada",
  screening: "Triagem",
  hr_interview: "Entrevista RH",
  technical_interview: "Entrevista técnica",
  final: "Decisão",
  offer: "Oferta",
  hired: "Contratado / iniciar admissão",
  pre_admission: "Pré-admissão",
  protheus: "Protheus",
  admitted: "Admitido",
  rejected: "Encerrado",
};

export const PIPELINE_STAGE_OPERATIONAL_SUMMARY: Partial<Record<PipelineStage, string>> = {
  hired: "Aguardando pré-admissão",
  pre_admission: "Admissão em andamento",
  protheus: "Protheus pendente",
};

export function mapStageToMacroColumn(stage: PipelineStage): PipelineMacroColumnConfig {
  return MACRO_BY_STAGE.get(stage) ?? PIPELINE_MACRO_COLUMNS[0];
}

export function groupCandidatesByMacroColumn(
  columnsFromApi: readonly PipelineColumn[],
): PipelineMacroColumn[] {
  const candidatesByMacro = new Map<PipelineMacroColumnId, JobCandidate[]>(
    PIPELINE_MACRO_COLUMNS.map((column) => [column.id, []]),
  );

  for (const column of columnsFromApi) {
    for (const candidate of column.candidates) {
      const realStage = candidate.stage ?? column.stage;
      const macro = mapStageToMacroColumn(realStage);
      candidatesByMacro.get(macro.id)?.push({
        ...candidate,
        stage: realStage,
      });
    }
  }

  return PIPELINE_MACRO_COLUMNS.map((macro) => ({
    macroId: macro.id,
    stage: macro.dropTargetStage ?? macro.stages[0],
    label: macro.label,
    description: macro.description,
    realStages: macro.stages,
    dropTargetStage: macro.dropTargetStage,
    dropDisabledReason:
      macro.dropTargetStage === null
        ? "Esta macrocoluna reúne mais de um status real. Abra o candidato para escolher a ação específica."
        : undefined,
    candidates: candidatesByMacro.get(macro.id) ?? [],
  }));
}
