import { describe, expect, it, vi } from "vitest";

import { HttpError } from "../http";
import {
  isPipelineTransitionBlockedError,
  pipelineService,
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

  it("normalizes missing_gates with unknown action codes to open_profile", () => {
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
    expect(result!.missing_gates).toHaveLength(2);
    expect(result!.missing_gates[0].action).toBe("open_behavioral_ai");
    expect(result!.missing_gates[1].action).toBe("open_profile");
  });
});


describe("pipelineService.moveCandidateStage — force payload", () => {
  it("inclui force/force_reason no body somente quando force=true", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as never)
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }) as never);

    await pipelineService.moveCandidateStage("job-1", "c-1", {
      stage: "offer",
      force: true,
      force_reason: "Entrevista realizada por telefone com autorização externa",
    });

    expect(fetchSpy).toHaveBeenCalled();
    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const init = lastCall[1] as RequestInit;
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      stage: "offer",
      force: true,
      force_reason: "Entrevista realizada por telefone com autorização externa",
    });

    fetchSpy.mockRestore();
  });

  it("não inclui force/force_reason quando force=false (padrão)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as never)
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }) as never);

    await pipelineService.moveCandidateStage("job-1", "c-1", { stage: "screening" });

    const init = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty("force");
    expect(body).not.toHaveProperty("force_reason");

    fetchSpy.mockRestore();
  });

  it("normaliza required_action e pre_admission_case_id no retorno", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as never)
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            candidate_id: "c-1",
            job_id: "job-1",
            stage: "pre_admission",
            candidate_status: "Pré-admissão",
            status: "active",
            transition_id: "tr-1",
            updated_at: "2026-05-25T00:00:00Z",
            required_action: "open_pre_admission",
            pre_admission_case_id: "case-1",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ) as never,
      );

    const response = await pipelineService.moveCandidateStage("job-1", "c-1", { stage: "pre_admission" });
    expect(response.required_action).toBe("open_pre_admission");
    expect(response.pre_admission_case_id).toBe("case-1");

    fetchSpy.mockRestore();
  });
});
