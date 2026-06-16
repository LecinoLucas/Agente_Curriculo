/**
 * F-04 fix: CandidateHiringDecisionPanel must abort the initial load on unmount
 * and not call setState after unmount.
 */
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateHiringDecisionPanel } from "../CandidateHiringDecisionPanel";
import * as hiringDecisionService from "../../../../../services/hiringDecisionService";

vi.mock("../../../../../services/hiringDecisionService");

describe("CandidateHiringDecisionPanel — AbortController (F-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hiringDecisionService.getHiringDecision).mockResolvedValue({ decision: null });
    vi.mocked(hiringDecisionService.getHiringDecisionHistory).mockResolvedValue({ decisions: [] });
  });

  it("passes AbortSignal to getHiringDecision and getHiringDecisionHistory", async () => {
    render(<CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-1" />);

    await waitFor(() => expect(hiringDecisionService.getHiringDecision).toHaveBeenCalledOnce());

    const [, , signal] = vi.mocked(hiringDecisionService.getHiringDecision).mock.calls[0];
    expect(signal).toBeInstanceOf(AbortSignal);

    const [, , historySignal] = vi.mocked(hiringDecisionService.getHiringDecisionHistory).mock.calls[0];
    expect(historySignal).toBeInstanceOf(AbortSignal);
  });

  it("aborts getHiringDecision signal on unmount", async () => {
    let capturedSignal: AbortSignal | undefined;

    vi.mocked(hiringDecisionService.getHiringDecision).mockImplementation(
      (_jobId: string, _candidateId: string, signal?: AbortSignal) => {
        capturedSignal = signal;
        return new Promise(() => {
          // Never resolves — simulates a slow fetch
        });
      },
    );

    const { unmount } = render(
      <CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-1" />,
    );

    await waitFor(() =>
      expect(hiringDecisionService.getHiringDecision).toHaveBeenCalledOnce(),
    );
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it("does not call setState after unmount when load resolves late", async () => {
    let resolveDecision!: (value: { decision: null }) => void;

    vi.mocked(hiringDecisionService.getHiringDecision).mockReturnValue(
      new Promise<{ decision: null }>((resolve) => {
        resolveDecision = resolve;
      }),
    );
    vi.mocked(hiringDecisionService.getHiringDecisionHistory).mockResolvedValue({ decisions: [] });

    const { unmount } = render(
      <CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-1" />,
    );

    await waitFor(() =>
      expect(hiringDecisionService.getHiringDecision).toHaveBeenCalledOnce(),
    );

    unmount();

    // Late resolve — should NOT throw React "setState after unmount" warning
    await expect(
      Promise.resolve().then(() => resolveDecision({ decision: null })),
    ).resolves.toBeUndefined();
  });

  it("refetches when candidateId or jobId changes", async () => {
    const { rerender } = render(
      <CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-1" />,
    );

    await waitFor(() =>
      expect(hiringDecisionService.getHiringDecision).toHaveBeenCalledTimes(1),
    );

    rerender(<CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-2" />);

    await waitFor(() =>
      expect(hiringDecisionService.getHiringDecision).toHaveBeenCalledTimes(2),
    );
    expect(vi.mocked(hiringDecisionService.getHiringDecision).mock.calls[1][1]).toBe("candidate-2");
  });

  it("shows error when load fails with a real error (not AbortError)", async () => {
    vi.mocked(hiringDecisionService.getHiringDecision).mockRejectedValue(
      new Error("Network error"),
    );

    const { getByText } = render(
      <CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-1" />,
    );

    await waitFor(() =>
      expect(getByText(/Não foi possível carregar a decisão final/i)).toBeInTheDocument(),
    );
  });
});
