import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resumeServiceMock } = vi.hoisted(() => ({
  resumeServiceMock: {
    getExtractionStatus: vi.fn(),
  },
}));

vi.mock("../../../services/resumeService", () => ({
  resumeService: resumeServiceMock,
}));

import { useExtractionPolling } from "../useExtractionPolling";

describe("useExtractionPolling", () => {
  beforeEach(() => {
    resumeServiceMock.getExtractionStatus.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("para o polling quando todos os itens ficam completed ou failed", async () => {
    resumeServiceMock.getExtractionStatus
      .mockResolvedValueOnce({
        resume_id: "resume-1",
        version_id: "version-1",
        extraction_status: "pending",
        extraction_error: null,
        original_file_name: "resume-1.pdf",
        page_count: null,
        word_count: null,
      })
      .mockResolvedValueOnce({
        resume_id: "resume-2",
        version_id: "version-2",
        extraction_status: "processing",
        extraction_error: null,
        original_file_name: "resume-2.pdf",
        page_count: null,
        word_count: null,
      })
      .mockResolvedValueOnce({
        resume_id: "resume-1",
        version_id: "version-1",
        extraction_status: "completed",
        extraction_error: null,
        original_file_name: "resume-1.pdf",
        page_count: 1,
        word_count: 100,
      })
      .mockResolvedValueOnce({
        resume_id: "resume-2",
        version_id: "version-2",
        extraction_status: "failed",
        extraction_error: "Falha no OCR",
        original_file_name: "resume-2.pdf",
        page_count: null,
        word_count: null,
      });

    const onCompleted = vi.fn();
    const onFailed = vi.fn();

    const { result } = renderHook(() =>
      useExtractionPolling({
        items: ["resume-1", "resume-2"],
        enabled: true,
        intervalMs: 5,
        onCompleted,
        onFailed,
      }),
    );

    await waitFor(() => {
      expect(result.current.isPolling).toBe(false);
      expect(result.current.hasPending).toBe(false);
    });

    expect(onCompleted).toHaveBeenCalledWith(
      "resume-1",
      expect.objectContaining({ extraction_status: "completed" }),
    );
    expect(onFailed).toHaveBeenCalledWith(
      "resume-2",
      expect.objectContaining({ extraction_status: "failed" }),
    );
    expect(resumeServiceMock.getExtractionStatus).toHaveBeenCalledTimes(4);
  });

  it("limpa o timeout no unmount", async () => {
    resumeServiceMock.getExtractionStatus.mockResolvedValue({
      resume_id: "resume-1",
      version_id: "version-1",
      extraction_status: "pending",
      extraction_error: null,
      original_file_name: "resume-1.pdf",
      page_count: null,
      word_count: null,
    });

    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    const { unmount } = renderHook(() =>
      useExtractionPolling({
        items: ["resume-1"],
        enabled: true,
        intervalMs: 20,
      }),
    );

    await waitFor(() => {
      expect(resumeServiceMock.getExtractionStatus).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
