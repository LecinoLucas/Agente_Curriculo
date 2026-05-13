import { describe, expect, it } from "vitest";

import {
  buildAnalysisDecisionToast,
  shouldTrackAnalysisDecision,
} from "../analysisDispatchFeedback";

describe("analysisDispatchFeedback", () => {
  it("gera mensagem de análise criada", () => {
    const toast = buildAnalysisDecisionToast({
      analysis_id: "analysis-1",
      status: "pending",
      created: true,
      blocked: false,
      reused: false,
      stuck: false,
      reason: "analysis_created",
      stage: "entry",
      trigger_source: "automatic",
    });

    expect(toast?.tone).toBe("success");
    expect(toast?.message).toContain("Nova análise IA iniciada");
  });

  it("gera mensagem de bloqueio em etapa avançada", () => {
    const toast = buildAnalysisDecisionToast({
      analysis_id: null,
      status: null,
      created: false,
      blocked: true,
      reused: false,
      stuck: false,
      reason: "auto_analysis_blocked_after_screening",
      stage: "hr_interview",
      trigger_source: "automatic",
    });

    expect(toast?.tone).toBe("warning");
    expect(toast?.message).toContain("etapa avançada");
  });

  it("identifica quando deve iniciar tracking de polling", () => {
    expect(
      shouldTrackAnalysisDecision({
        analysis_id: "analysis-1",
        status: "processing",
        created: false,
        blocked: false,
        reused: true,
        stuck: false,
        reason: "auto_analysis_skipped_duplicate_processing",
        stage: "screening",
        trigger_source: "automatic",
      }),
    ).toBe(true);

    expect(
      shouldTrackAnalysisDecision({
        analysis_id: "analysis-1",
        status: "completed",
        created: false,
        blocked: false,
        reused: true,
        stuck: false,
        reason: "auto_analysis_skipped_existing_completed",
        stage: "screening",
        trigger_source: "automatic",
      }),
    ).toBe(false);
  });
});
