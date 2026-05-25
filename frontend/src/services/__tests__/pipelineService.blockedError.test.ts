import { describe, expect, it } from "vitest";

import { HttpError } from "../http";
import {
  isPipelineTransitionBlockedError,
  readPipelineTransitionBlockedResponse,
} from "../pipelineService";

const VALID_PAYLOAD = {
  code: "pipeline_transition_blocked",
  message: "Avanço bloqueado.",
  current_stage: "final",
  target_stage: "offer",
  missing_gates: [
    {
      code: "behavioral_ai_pending",
      label: "IA pendente",
      description: "Aguarde a IA.",
      action: "open_behavioral_ai",
      action_payload: { assignment_id: "abc" },
      severity: "block",
      forceable: false,
    },
  ],
  can_force: false,
  force_requires_reason: true,
};

describe("isPipelineTransitionBlockedError", () => {
  it("detects the structured 409 payload at the top level of the response", () => {
    const err = new HttpError(409, "Conflict", undefined, VALID_PAYLOAD);
    expect(isPipelineTransitionBlockedError(err)).toBe(true);
  });

  it("returns false for plain Error", () => {
    expect(isPipelineTransitionBlockedError(new Error("boom"))).toBe(false);
  });

  it("returns false for HttpError with different status", () => {
    const err = new HttpError(422, "Validation", undefined, VALID_PAYLOAD);
    expect(isPipelineTransitionBlockedError(err)).toBe(false);
  });

  it("returns false when payload lacks the pipeline_transition_blocked code", () => {
    const err = new HttpError(409, "Conflict", undefined, { code: "something_else" });
    expect(isPipelineTransitionBlockedError(err)).toBe(false);
  });

  it("returns false when missing_gates is not an array", () => {
    const err = new HttpError(409, "Conflict", undefined, {
      ...VALID_PAYLOAD,
      missing_gates: "not-an-array",
    });
    expect(isPipelineTransitionBlockedError(err)).toBe(false);
  });
});

describe("readPipelineTransitionBlockedResponse", () => {
  it("returns null for unrelated errors", () => {
    expect(readPipelineTransitionBlockedResponse(new Error("boom"))).toBeNull();
  });

  it("normalizes a valid payload", () => {
    const err = new HttpError(409, "Conflict", undefined, VALID_PAYLOAD);
    const result = readPipelineTransitionBlockedResponse(err);
    expect(result).not.toBeNull();
    expect(result!.target_stage).toBe("offer");
    expect(result!.current_stage).toBe("final");
    expect(result!.missing_gates).toHaveLength(1);
    expect(result!.missing_gates[0]).toMatchObject({
      code: "behavioral_ai_pending",
      action: "open_behavioral_ai",
    });
    expect(result!.can_force).toBe(false);
    expect(result!.force_requires_reason).toBe(true);
  });

  it("filters out missing_gates with unknown action codes", () => {
    const err = new HttpError(409, "Conflict", undefined, {
      ...VALID_PAYLOAD,
      missing_gates: [
        VALID_PAYLOAD.missing_gates[0],
        {
          code: "weird",
          label: "Weird",
          description: "?",
          action: "open_unknown_thing",
        },
      ],
    });
    const result = readPipelineTransitionBlockedResponse(err);
    expect(result!.missing_gates).toHaveLength(1);
    expect(result!.missing_gates[0].action).toBe("open_behavioral_ai");
  });
});
