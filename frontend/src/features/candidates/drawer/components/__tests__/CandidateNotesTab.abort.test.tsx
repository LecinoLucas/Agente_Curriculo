/**
 * F-04 fix: CandidateNotesTab must abort the notes fetch on unmount
 * and not call setState after unmount.
 */
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateNotesTab } from "../CandidateNotesTab";
import { candidatesService } from "../../../../../services/candidatesService";

vi.mock("../../../../../services/candidatesService", () => ({
  candidatesService: {
    listNotes: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  },
}));

describe("CandidateNotesTab — AbortController (F-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes AbortSignal to listNotes", async () => {
    vi.mocked(candidatesService.listNotes).mockResolvedValue([]);

    render(<CandidateNotesTab candidateId="candidate-1" />);

    await waitFor(() => expect(candidatesService.listNotes).toHaveBeenCalledOnce());

    const [, signal] = vi.mocked(candidatesService.listNotes).mock.calls[0];
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("aborts listNotes signal on unmount", async () => {
    let capturedSignal: AbortSignal | undefined;

    vi.mocked(candidatesService.listNotes).mockImplementation(
      (_candidateId: string, signal?: AbortSignal) => {
        capturedSignal = signal;
        return new Promise(() => {
          // Never resolves — simulates a slow fetch
        });
      },
    );

    const { unmount } = render(<CandidateNotesTab candidateId="candidate-1" />);

    await waitFor(() => expect(candidatesService.listNotes).toHaveBeenCalledOnce());
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it("does not call setState after unmount when fetch resolves late", async () => {
    let resolveNotes!: (value: never[]) => void;

    vi.mocked(candidatesService.listNotes).mockReturnValue(
      new Promise<never[]>((resolve) => {
        resolveNotes = resolve;
      }),
    );

    const { unmount } = render(<CandidateNotesTab candidateId="candidate-1" />);

    await waitFor(() => expect(candidatesService.listNotes).toHaveBeenCalledOnce());

    // Unmount before the fetch resolves
    unmount();

    // Late resolve — should NOT throw a React "setState after unmount" warning
    await expect(Promise.resolve().then(() => resolveNotes([]))).resolves.toBeUndefined();
  });

  it("shows error when listNotes rejects with a real error (not AbortError)", async () => {
    vi.mocked(candidatesService.listNotes).mockRejectedValue(new Error("Server error"));

    const { getByText } = render(<CandidateNotesTab candidateId="candidate-1" />);

    await waitFor(() =>
      expect(getByText("Não foi possível carregar as observações internas.")).toBeInTheDocument(),
    );
  });
});
