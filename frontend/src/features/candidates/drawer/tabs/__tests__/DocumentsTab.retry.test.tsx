/**
 * Testes do botão "Reprocessar extração" no DocumentsTab do drawer.
 * Foca na regra: o botão aparece SOMENTE quando can_retry_extraction=true (vindo do backend).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentsTab } from "../DocumentsTab";
import { resumeService } from "../../../../../services/resumeService";
import type { CandidateOverview } from "../../../../../types/domain";

vi.mock("../../../../../services/resumeService", () => ({
  resumeService: {
    retryExtraction: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    activate: vi.fn(),
    delete: vi.fn(),
    uploadPdf: vi.fn(),
    initiateUpload: vi.fn(),
    downloadCandidateResume: vi.fn(),
    downloadByCandidateId: vi.fn(),
    fetchCandidateResumeFile: vi.fn(),
    getCandidateResumeDownloadUrl: vi.fn(),
  },
}));

vi.mock("../hooks/useDocumentHandlers", () => ({
  useDocumentHandlers: () => ({
    selectedFile: null,
    uploadLoading: false,
    isDragActive: false,
    editSaving: false,
    handleFileChange: vi.fn(),
    handleUpload: vi.fn(),
    handleEditSave: vi.fn(),
    handleToggleStatus: vi.fn(),
    handleDelete: vi.fn(),
    handleAnalyze: vi.fn(),
  }),
}));

vi.mock("../../../../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    dismissKey: vi.fn(),
  },
}));

const baseResume = {
  resume_id: "resume-1",
  title: "Currículo Teste",
  status: "active",
  current_version: 1,
  current_version_id: "version-1",
  current_file_name: "cv.pdf",
  extraction_status: "failed",
  can_retry_extraction: false,
  retry_extraction_reason: null,
  extraction_status_label: null,
  updated_at: "2026-01-01T10:00:00Z",
};

const baseOverview: CandidateOverview = {
  candidate: {
    id: "candidate-1",
    full_name: "Wesley Teste",
    email: "wesley@teste.com",
    phone: null,
    cpf: null,
    application_source: null,
    location_city: null,
    location_state: null,
    location_country: "Brasil",
    linkedin_url: null,
    github_url: null,
    portfolio_url: null,
    internal_notes: null,
    tags: [],
    user_id: null,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  resumes: [baseResume],
  latest_analysis: null,
  latest_analysis_pipeline: null,
  top_matches: [],
  active_job_id: null,
  active_job: null,
  pipeline_entries: [],
  active_job_decision: null,
  active_job_skill_preview: null,
  latest_note: null,
  preview_pendencies: [],
  latest_movement: null,
};

const baseProps = {
  overview: baseOverview,
  activeJobId: null,
  activePipelineEntry: null,
  canSpendRealTokens: true,
  pollingAnalysisId: null,
  refreshCandidateOverview: vi.fn().mockResolvedValue(undefined),
  startPolling: vi.fn(),
  switchPanelTab: vi.fn(),
  syncAnalysisStart: vi.fn().mockResolvedValue(undefined),
  notifyCandidatesChanged: vi.fn(),
  userRole: "admin" as const,
};

describe("DocumentsTab — botão Reprocessar extração", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("não exibe o botão quando can_retry_extraction=false", () => {
    render(
      <DocumentsTab
        {...baseProps}
        overview={{
          ...baseOverview,
          resumes: [{ ...baseResume, extraction_status: "completed", can_retry_extraction: false }],
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: /reprocessar extração/i })).toBeNull();
  });

  it("exibe o botão quando can_retry_extraction=true (falha)", () => {
    render(
      <DocumentsTab
        {...baseProps}
        overview={{
          ...baseOverview,
          resumes: [
            {
              ...baseResume,
              extraction_status: "failed",
              can_retry_extraction: true,
              retry_extraction_reason: "extraction_failed",
              extraction_status_label: "Falha na extração",
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("button", { name: /reprocessar extração/i })).toBeInTheDocument();
  });

  it("não exibe botão para pending recente (can_retry_extraction=false)", () => {
    render(
      <DocumentsTab
        {...baseProps}
        overview={{
          ...baseOverview,
          resumes: [
            {
              ...baseResume,
              extraction_status: "pending",
              can_retry_extraction: false,
              extraction_status_label: "Na fila",
            },
          ],
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: /reprocessar extração/i })).toBeNull();
  });

  it("exibe botão para pending antigo (can_retry_extraction=true)", () => {
    render(
      <DocumentsTab
        {...baseProps}
        overview={{
          ...baseOverview,
          resumes: [
            {
              ...baseResume,
              extraction_status: "pending",
              can_retry_extraction: true,
              retry_extraction_reason: "extraction_stale_pending",
              extraction_status_label: "Extração pendente",
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("button", { name: /reprocessar extração/i })).toBeInTheDocument();
  });

  it("chama retryExtraction ao clicar no botão", async () => {
    vi.mocked(resumeService.retryExtraction).mockResolvedValue({
      resume_id: "resume-1",
      version_id: "version-1",
      extraction_status: "pending",
      queued: true,
      can_retry_extraction: false,
      message: "Extração reenfileirada. Aguarde o processamento.",
    });

    render(
      <DocumentsTab
        {...baseProps}
        overview={{
          ...baseOverview,
          resumes: [
            {
              ...baseResume,
              extraction_status: "failed",
              can_retry_extraction: true,
              retry_extraction_reason: "extraction_failed",
              extraction_status_label: "Falha na extração",
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /reprocessar extração/i }));

    await waitFor(() => {
      expect(resumeService.retryExtraction).toHaveBeenCalledWith("resume-1");
    });
  });

  it("mostra loading durante o retry", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(resumeService.retryExtraction).mockReturnValue(new Promise((r) => { resolve = r; }));

    render(
      <DocumentsTab
        {...baseProps}
        overview={{
          ...baseOverview,
          resumes: [
            {
              ...baseResume,
              extraction_status: "failed",
              can_retry_extraction: true,
              retry_extraction_reason: "extraction_failed",
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /reprocessar extração/i }));

    expect(await screen.findByRole("button", { name: /reenfileirando/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reenfileirando/i })).toBeDisabled();

    resolve({
      resume_id: "resume-1",
      version_id: "version-1",
      extraction_status: "pending",
      queued: true,
      can_retry_extraction: false,
      message: "ok",
    });
  });

  it("não clica duas vezes (previne double-submit)", () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(resumeService.retryExtraction).mockReturnValue(new Promise((r) => { resolve = r; }));

    render(
      <DocumentsTab
        {...baseProps}
        overview={{
          ...baseOverview,
          resumes: [
            {
              ...baseResume,
              extraction_status: "failed",
              can_retry_extraction: true,
            },
          ],
        }}
      />,
    );

    const btn = screen.getByRole("button", { name: /reprocessar extração/i });
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(resumeService.retryExtraction).toHaveBeenCalledTimes(1);
    resolve({ queued: true, extraction_status: "pending", resume_id: "r", version_id: "v", can_retry_extraction: false, message: "" });
  });

  it("não exibe dados sensíveis", () => {
    render(
      <DocumentsTab
        {...baseProps}
        overview={{
          ...baseOverview,
          resumes: [
            {
              ...baseResume,
              extraction_status: "failed",
              can_retry_extraction: true,
            },
          ],
        }}
      />,
    );

    const html = document.body.innerHTML;
    expect(html).not.toContain("extracted_text");
    expect(html).not.toContain("s3_key");
    expect(html).not.toContain("uploads/");
  });
});
