/**
 * Hook to calculate data quality statistics from ranking
 */

import { useMemo } from "react";
import type { JobRankingResponse } from "../types/ranking";

export interface DataQualityStats {
  total: number;
  valid: number;
  unknown: number;
  invalid: number;
  filtered: number;
  byStatus: {
    valid: number;
    unknown: number;
    no_resume: number;
    empty_resume: number;
    parsing_failed: number;
    invalid_manual: number;
  };
}

/**
 * Calculates data quality statistics from ranking
 * Assumes ranking only includes "valid" and "unknown" candidates
 */
export function useDataQualityStats(ranking: JobRankingResponse | null): DataQualityStats {
  return useMemo(() => {
    if (!ranking) {
      return {
        total: 0,
        valid: 0,
        unknown: 0,
        invalid: 0,
        filtered: 0,
        byStatus: {
          valid: 0,
          unknown: 0,
          no_resume: 0,
          empty_resume: 0,
          parsing_failed: 0,
          invalid_manual: 0,
        },
      };
    }

    // Count by eligibility status (which reflects data quality)
    const byStatus = {
      valid: 0,
      unknown: 0,
      no_resume: 0,
      empty_resume: 0,
      parsing_failed: 0,
      invalid_manual: 0,
    };

    // In the current ranking, we only see valid + unknown
    for (const candidate of ranking.candidates) {
      // Data quality is reflected in eligibility_status
      // "unknown" eligibility might indicate data quality issue
      if (candidate.eligibility_status === "unknown") {
        byStatus.unknown++;
      } else {
        // All visible candidates are "valid" or at least passed data quality
        byStatus.valid++;
      }
    }

    // Total visible = valid + unknown
    const total = ranking.candidates.length;
    const valid = byStatus.valid;
    const unknown = byStatus.unknown;

    return {
      total,
      valid,
      unknown,
      // These are estimated based on the fact that we filter invalid ones
      // In a real scenario, the backend would return this
      invalid: 0, // Backend doesn't expose filtered count yet
      filtered: 0,
      byStatus,
    };
  }, [ranking]);
}
