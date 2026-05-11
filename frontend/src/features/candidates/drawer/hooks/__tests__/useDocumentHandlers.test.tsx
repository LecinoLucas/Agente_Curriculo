import { act, renderHook, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resumeServiceMock, analysisServiceMock, feedbackMock, toastMock } = vi.hoisted(() => ({
  resumeServiceMock: {
    initiateUpload: vi.fn(),
    uploadPdf: vi.fn(),
    getExtractionStatus: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    activate: vi.fn(),
    delete: vi.fn(),
  },
  analysisServiceMock: {
    getInFlightByCandidate: vi.fn(),
  },
  feedbackMock: {
    uploadResume: {
      processing: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    },
  },
  toastMock: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../../../../../services/resumeService", () => ({
  resumeService: resumeServiceMock,
}));

vi.mock("../../../../../services/analysisService", () => ({
  analysisService: analysisServiceMock,
}));

vi.mock("../../../../../services/feedback", () => ({
  feedback: feedbackMock,
}));

vi.mock("../../../../../shared/utils/toast", () => ({
  toast: toastMock,
}));

import { useDocumentHandlers } from "../useDocumentHandlers";

describe("useDocumentHandlers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resumeServiceMock.initiateUpload.mockReset();
    resumeServiceMock.uploadPdf.mockReset();
    resumeServiceMock.getExtractionStatus.mockReset();
    analysisServiceMock.getInFlightByCandidate.mockReset();
    feedbackMock.uploadResume.processing.mockReset();
    feedbackMock.uploadResume.success.mockReset();
    feedbackMock.uploadResume.error.mockReset();
    toastMock.error.mockReset();
    toastMock.warning.mockReset();
    toastMock.success.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mantém upload individual, acompanha extração e não dispara análise automática indevida", async () => {
    vi.useRealTimers();
    resumeServiceMock.initiateUpload.mockResolvedValue({ resume_id: "resume-1" });
    resumeServiceMock.uploadPdf.mockResolvedValue({
      resume_id: "resume-1",
      candidate_id: "candidate-1",
      candidate_full_name: "Pessoa Teste",
      version_id: "version-1",
      analysis_auto_requested: false,
      analysis_id: null,
      analysis_status: null,
      original_file_name: "cv.pdf",
      file_size_bytes: 123,
      file_hash_sha256: "hash",
      extraction_status: "pending",
      page_count: null,
      word_count: null,
      prefilled_fields: [],
    });
    resumeServiceMock.getExtractionStatus
      .mockResolvedValue({
        resume_id: "resume-1",
        version_id: "version-1",
        extraction_status: "completed",
        extraction_error: null,
        original_file_name: "cv.pdf",
        page_count: 1,
        word_count: 20,
      });

    const refreshCandidateOverview = vi.fn().mockResolvedValue(undefined);
    const notifyCandidatesChanged = vi.fn();
    const startPolling = vi.fn();
    const syncAnalysisStart = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => {
      const fileInputRef = useRef<HTMLInputElement | null>(null);
      const [selectedFile, setSelectedFile] = useState<File | null>(null);
      const [uploadLoading, setUploadLoading] = useState(false);
      const [isDragActive, setIsDragActive] = useState(false);
      const [editingResumeId, setEditingResumeId] = useState<string | null>(null);
      const [editTitle, setEditTitle] = useState("");
      const [editSaving, setEditSaving] = useState(false);
      const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
      const [deletingId, setDeletingId] = useState<string | null>(null);
      const [analyzingResumeId, setAnalyzingResumeId] = useState<string | null>(null);

      const handlers = useDocumentHandlers(
        {
          overview: {
            candidate: { id: "candidate-1" },
            latest_analysis: null,
            resumes: [],
          } as never,
          activeJobId: null,
          canSpendRealTokens: true,
          refreshCandidateOverview,
          startPolling,
          switchPanelTab: vi.fn(),
          syncAnalysisStart,
          notifyCandidatesChanged,
          pollingAnalysisId: null,
        },
        {
          selectedFile,
          uploadLoading,
          isDragActive,
          editingResumeId,
          editTitle,
          editSaving,
          confirmDeleteId,
          deletingId,
          analyzingResumeId,
          fileInputRef,
        },
        {
          setSelectedFile,
          setUploadLoading,
          setIsDragActive,
          setEditingResumeId,
          setEditTitle,
          setEditSaving,
          setConfirmDeleteId,
          setDeletingId,
          setAnalyzingResumeId,
        },
      );

      return {
        handlers,
        selectedFile,
        uploadLoading,
      };
    });

    const file = new File(["pdf"], "cv.pdf", { type: "application/pdf" });

    act(() => {
      result.current.handlers.handleFileSelect(file);
    });

    expect(result.current.selectedFile?.name).toBe("cv.pdf");

    await act(async () => {
      await result.current.handlers.handleUpload();
    });

    expect(feedbackMock.uploadResume.processing).toHaveBeenCalledTimes(1);
    expect(feedbackMock.uploadResume.success).toHaveBeenCalledTimes(1);
    expect(startPolling).not.toHaveBeenCalled();
    expect(syncAnalysisStart).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(refreshCandidateOverview).toHaveBeenCalledTimes(2);
    });

    expect(notifyCandidatesChanged).toHaveBeenCalledTimes(2);
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
