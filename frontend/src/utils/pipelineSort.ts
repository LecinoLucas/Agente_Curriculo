import type { JobCandidate } from "../types/domain";

export type SortOrder = "score_desc" | "score_asc" | "name_az";

/**
 * Ordena candidatos por score/aderência à vaga (job_fit_score) ou nome.
 * Candidatos sem score ficam sempre no final quando a ordenação é por score.
 * Empates são resolvidos pelo nome do candidato para manter a ordenação determinística.
 */
export function sortCandidatesByScore(
  candidates: JobCandidate[],
  order: SortOrder = "score_desc"
): JobCandidate[] {
  return [...candidates].sort((a, b) => {
    if (order === "name_az") {
      return (a.candidate_name || "").localeCompare(b.candidate_name || "");
    }

    const hasScoreA = a.job_fit_score !== null && a.job_fit_score !== undefined;
    const hasScoreB = b.job_fit_score !== null && b.job_fit_score !== undefined;

    // Candidatos sem score ficam SEMPRE no final
    if (hasScoreA && !hasScoreB) return -1;
    if (!hasScoreA && hasScoreB) return 1;
    
    // Se ambos não têm score, desempata por nome
    if (!hasScoreA && !hasScoreB) {
      return (a.candidate_name || "").localeCompare(b.candidate_name || "");
    }

    // Ambos têm score, aplica a ordem desejada
    const scoreA = a.job_fit_score as number;
    const scoreB = b.job_fit_score as number;
    
    if (scoreA !== scoreB) {
      return order === "score_desc" ? scoreB - scoreA : scoreA - scoreB;
    }
    
    // Fallback determinístico por nome
    return (a.candidate_name || "").localeCompare(b.candidate_name || "");
  });
}
