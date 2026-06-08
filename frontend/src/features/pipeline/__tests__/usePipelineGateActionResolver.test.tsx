import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePipelineGateActionResolver } from "../usePipelineTransitionBlocked";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe("usePipelineGateActionResolver", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("navega para /admissao/:caseId quando open_pre_admission traz case_id", () => {
    const onAfterNavigate = vi.fn();
    const { result } = renderHook(() => usePipelineGateActionResolver(onAfterNavigate), { wrapper });

    let handled = false;
    act(() => {
      handled = result.current({
        candidateId: "cand-1",
        action: "open_pre_admission",
        payload: { case_id: "case-123", job_id: "job-1" },
        gateCode: "pre_admission_case_required",
      });
    });

    expect(handled).toBe(true);
    expect(navigateMock).toHaveBeenCalledWith("/admissao/case-123");
    expect(onAfterNavigate).toHaveBeenCalledTimes(1);
  });

  it("retorna false quando open_pre_admission não traz case_id", () => {
    const onAfterNavigate = vi.fn();
    const { result } = renderHook(() => usePipelineGateActionResolver(onAfterNavigate), { wrapper });

    let handled = false;
    act(() => {
      handled = result.current({
        candidateId: "cand-1",
        action: "open_pre_admission",
        payload: { job_id: "job-1" },
        gateCode: "pre_admission_case_required",
      });
    });

    expect(handled).toBe(false);
    expect(navigateMock).not.toHaveBeenCalled();
    expect(onAfterNavigate).not.toHaveBeenCalled();
  });

  it("retorna false quando open_pre_admission não traz jobId nem caseId", () => {
    const onAfterNavigate = vi.fn();
    const { result } = renderHook(() => usePipelineGateActionResolver(onAfterNavigate), { wrapper });

    let handled = true;
    act(() => {
      handled = result.current({
        candidateId: "cand-1",
        action: "open_pre_admission",
        payload: null,
        gateCode: "pre_admission_case_required",
      });
    });

    expect(handled).toBe(false);
    expect(navigateMock).not.toHaveBeenCalled();
    expect(onAfterNavigate).not.toHaveBeenCalled();
  });
});
