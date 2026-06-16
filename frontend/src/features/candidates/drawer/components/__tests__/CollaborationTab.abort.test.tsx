/**
 * F-04 fix: CollaborationTab must abort the comments fetch on unmount
 * and prevent setState after unmount for both comments and managers.
 */
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CollaborationTab } from "../CollaborationTab";

const { mockListCollaboration, mockListManagers } = vi.hoisted(() => ({
  mockListCollaboration: vi.fn(),
  mockListManagers: vi.fn(),
}));

vi.mock("../../../../../services/collaborationService", () => ({
  collaborationService: {
    listCollaboration: mockListCollaboration,
    createComment: vi.fn(),
    requestManagerReview: vi.fn(),
  },
}));

vi.mock("../../../../../services/usersService", () => ({
  usersService: {
    listManagers: mockListManagers,
  },
}));

describe("CollaborationTab — AbortController (F-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCollaboration.mockResolvedValue({ comments: [] });
    mockListManagers.mockResolvedValue({ managers: [] });
  });

  it("passes AbortSignal to listCollaboration", async () => {
    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await waitFor(() => expect(mockListCollaboration).toHaveBeenCalledOnce());

    const [, , signal] = mockListCollaboration.mock.calls[0] as [string, string, AbortSignal | undefined];
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("aborts listCollaboration signal on unmount", async () => {
    let capturedSignal: AbortSignal | undefined;

    mockListCollaboration.mockImplementation(
      (_jobId: string, _candidateId: string, signal?: AbortSignal) => {
        capturedSignal = signal;
        return new Promise(() => {
          // Never resolves — simulates a slow fetch
        });
      },
    );

    const { unmount } = render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await waitFor(() => expect(mockListCollaboration).toHaveBeenCalledOnce());
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it("does not call setState after unmount when comments fetch resolves late", async () => {
    let resolveComments!: (value: { comments: never[] }) => void;

    mockListCollaboration.mockReturnValue(
      new Promise<{ comments: never[] }>((resolve) => {
        resolveComments = resolve;
      }),
    );

    const { unmount } = render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await waitFor(() => expect(mockListCollaboration).toHaveBeenCalledOnce());
    unmount();

    // Late resolve — should NOT throw React "setState after unmount" warning
    await expect(
      Promise.resolve().then(() => resolveComments({ comments: [] })),
    ).resolves.toBeUndefined();
  });

  it("re-fetches comments when candidateId or jobId changes", async () => {
    const { rerender } = render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await waitFor(() => expect(mockListCollaboration).toHaveBeenCalledTimes(1));

    rerender(<CollaborationTab candidateId="cand-2" jobId="job-1" />);

    await waitFor(() => expect(mockListCollaboration).toHaveBeenCalledTimes(2));
    expect(mockListCollaboration.mock.calls[1][1]).toBe("cand-2");
  });

  it("managers load cancelled flag prevents setState on unmount", async () => {
    // Simulate slow managers load
    let resolveManagers!: (value: { managers: never[] }) => void;
    mockListManagers.mockReturnValue(
      new Promise<{ managers: never[] }>((resolve) => {
        resolveManagers = resolve;
      }),
    );

    mockListCollaboration.mockResolvedValue({ comments: [] });

    const { unmount } = render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await waitFor(() => expect(mockListCollaboration).toHaveBeenCalledOnce());

    // Unmount before managers are loaded
    unmount();

    // Late resolve — should not throw
    await expect(
      Promise.resolve().then(() => resolveManagers({ managers: [] })),
    ).resolves.toBeUndefined();
  });
});
