import type { JobCandidate, JobPipelineBoard, PipelineStage } from "../../types/domain";

type CandidateUpdater = (candidate: JobCandidate) => JobCandidate;

export function updateBoardCandidate(
  board: JobPipelineBoard,
  candidateId: string,
  updater: CandidateUpdater,
): JobPipelineBoard {
  let changed = false;

  const columns = board.columns.map((column) => {
    let columnChanged = false;

    const candidates = column.candidates.map((candidate) => {
      if (candidate.candidate_id !== candidateId) {
        return candidate;
      }

      const nextCandidate = updater(candidate);
      if (nextCandidate === candidate) {
        return candidate;
      }

      columnChanged = true;
      changed = true;
      return nextCandidate;
    });

    return columnChanged ? { ...column, candidates } : column;
  });

  return changed ? { ...board, columns } : board;
}

export function moveBoardCandidate(
  board: JobPipelineBoard,
  candidateId: string,
  toStage: PipelineStage,
  candidateStatus?: string,
): JobPipelineBoard {
  const fromIndex = board.columns.findIndex((column) =>
    column.candidates.some((candidate) => candidate.candidate_id === candidateId),
  );
  const toIndex = board.columns.findIndex((column) => column.stage === toStage);

  if (fromIndex < 0 || toIndex < 0) {
    return board;
  }

  const sourceColumn = board.columns[fromIndex];
  const movingCandidate = sourceColumn.candidates.find(
    (candidate) => candidate.candidate_id === candidateId,
  );

  if (!movingCandidate) {
    return board;
  }

  const updatedCandidate: JobCandidate = {
    ...movingCandidate,
    stage: toStage,
    candidate_status: candidateStatus ?? movingCandidate.candidate_status,
  };

  if (fromIndex === toIndex) {
    return updateBoardCandidate(board, candidateId, () => updatedCandidate);
  }

  const columns = board.columns.map((column, index) => {
    if (index === fromIndex) {
      return {
        ...column,
        candidates: column.candidates.filter((candidate) => candidate.candidate_id !== candidateId),
      };
    }

    if (index === toIndex) {
      return {
        ...column,
        candidates: [updatedCandidate, ...column.candidates],
      };
    }

    return column;
  });

  return { ...board, columns };
}
