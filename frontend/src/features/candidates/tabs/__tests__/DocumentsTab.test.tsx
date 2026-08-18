import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateProfilePage } from "../../../../pages/CandidateProfilePage";
import { candidatesService } from "../../../../services/candidatesService";
import { listJobs, getCandidateRankingEntry } from "../../../../services/jobsService";
import { resumeService } from "../../../../services/resumeService";
import { scoreExplanationService } from "../../../../services/scoreExplanationService";
import type { CandidateOverview } from "../../../../types/domain";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      role: "admin",
      real_ai_token_spend_enabled: true,
    },
  }),
}));

vi.mock("../../../../features/candidates/drawer/components/CandidateNotesTab", () => ({
  CandidateNotesTab: () => null,
}));

vi.mock("../../../../services/candidatesService", () => ({
  candidatesService: {
    getOverview: vi.fn(),
    getProcessHistory: vi.fn(),
    listSummaries: vi.fn(),
    checkDuplicate: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    archive: vi.fn(),
  },
}));

vi.mock("../../../../services/jobsService", () => ({
  listJobs: vi.fn(),
  getCandidateRankingEntry: vi.fn(),
}));

vi.mock("../../../../services/resumeService", () => ({
  resumeService: {
    get: vi.fn(),
    initiateUpload: vi.fn(),
    uploadPdf: vi.fn(),
    downloadCandidateResume: vi.fn(),
    fetchCandidateResumeFile: vi.fn(),
    getCandidateResumeDownloadUrl: vi.fn(),
    retryExtraction: vi.fn(),
  },
}));

vi.mock("../../../../services/analysisService", () => ({
  analysisService: {
    result: vi.fn(),
  },
}));

vi.mock("../../../../services/scoreExplanationService", () => ({
  scoreExplanationService: {
    get: vi.fn(),
    saveFeedback: vi.fn(),
  },
}));

const baseOverview: CandidateOverview = {
  candidate: {
    id: "candidate-1",
    full_name: "Ana Souza",
    email: "ana@example.com",
    phone: "(11) 99999-9999",
    cpf: null,
    application_source: null,
    location_city: "São Paulo",
    location_state: "SP",
    location_country: "BR",
    linkedin_url: null,
    github_url: null,
    portfolio_url: null,
    internal_notes: null,
    tags: [],
    user_id: null,
    created_by: "user-1",
    created_at: "2026-05-01T10:00:00Z",
    updated_at: "2026-05-01T10:00:00Z",
  },
  resumes: [
    {
      resume_id: "resume-1",
      title: "Currículo Ana",
      status: "active",
      current_version: 2,
      current_version_id: "version-2",
      current_file_name: "ana-v2.pdf",
      extraction_status: "completed",
      updated_at: "2026-05-12T10:00:00Z",
    },
  ],
  latest_analysis: null,
  latest_analysis_pipeline: null,
  top_matches: [],
  active_job_id: "job-1",
  active_job: { id: "job-1", title: "Analista Protheus", status: "published" },
  pipeline_entries: [],
  active_job_decision: null,
  active_job_skill_preview: null,
  latest_note: null,
  preview_pendencies: [],
  latest_movement: null,
};

function setupDocumentPage() {
  return render(
    <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=documents"]}>
      <Routes>
        <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CandidateProfilePage documents tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(candidatesService.getOverview).mockResolvedValue(baseOverview);
    vi.mocked(candidatesService.getProcessHistory).mockResolvedValue({
      candidate_id: "candidate-1",
      processes: [],
    });
    vi.mocked(listJobs).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      page_size: 100,
      total_pages: 1,
    });
    vi.mocked(getCandidateRankingEntry).mockResolvedValue(null);
    vi.mocked(scoreExplanationService.get).mockResolvedValue(null);

    vi.mocked(resumeService.get).mockResolvedValue({
      id: "resume-1",
      candidate_id: "candidate-1",
      title: "Currículo Ana",
      status: "active",
      current_version: 2,
      created_at: "2026-05-01T10:00:00Z",
      updated_at: "2026-05-12T10:00:00Z",
      versions: [
        {
          id: "version-2",
          version_number: 2,
          original_file_name: "ana-v2.pdf",
          mime_type: "application/pdf",
          extraction_status: "completed",
          uploaded_at: "2026-05-12T10:00:00Z",
        },
      ],
    });
    vi.mocked(resumeService.fetchCandidateResumeFile).mockResolvedValue({
      blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      contentType: "application/pdf",
      filename: "ana-v2.pdf",
    });
    vi.mocked(resumeService.downloadCandidateResume).mockResolvedValue();
    vi.mocked(resumeService.getCandidateResumeDownloadUrl).mockResolvedValue({
      url: "http://localhost:8000/api/v1/candidates/candidate-1/resumes/resume-1/download?disposition=inline",
      expires_at: null,
      content_type: "application/pdf",
      filename: "ana-v2.pdf",
    });

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, "open", {
      configurable: true,
      value: vi.fn(() => ({})),
    });
  });

  it("renderiza estado vazio quando candidato não tem currículo", async () => {
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...baseOverview,
      resumes: [],
    });

    setupDocumentPage();
    expect(await screen.findByText("Nenhum currículo enviado")).toBeInTheDocument();
  });

  it("mostra preview de PDF ao visualizar currículo", async () => {
    setupDocumentPage();

    fireEvent.click(await screen.findByRole("button", { name: "Visualizar currículo" }));

    expect(await screen.findByTitle("ana-v2.pdf")).toBeInTheDocument();
  });

  it("mostra preview de imagem quando arquivo é imagem", async () => {
    vi.mocked(resumeService.get).mockResolvedValue({
      id: "resume-1",
      candidate_id: "candidate-1",
      title: "Currículo Ana",
      status: "active",
      current_version: 1,
      created_at: "2026-05-01T10:00:00Z",
      updated_at: "2026-05-12T10:00:00Z",
      versions: [
        {
          id: "version-1",
          version_number: 1,
          original_file_name: "ana.png",
          mime_type: "image/png",
          extraction_status: "completed",
          uploaded_at: "2026-05-12T10:00:00Z",
        },
      ],
    });
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...baseOverview,
      resumes: [{ ...baseOverview.resumes[0], current_version: 1, current_version_id: "version-1", current_file_name: "ana.png" }],
    });
    vi.mocked(resumeService.fetchCandidateResumeFile).mockResolvedValue({
      blob: new Blob(["img"], { type: "image/png" }),
      contentType: "image/png",
      filename: "ana.png",
    });

    setupDocumentPage();
    fireEvent.click(await screen.findByRole("button", { name: "Visualizar currículo" }));

    expect(await screen.findByAltText("ana.png")).toBeInTheDocument();
  });

  it("mostra fallback para DOCX sem preview embutido", async () => {
    vi.mocked(resumeService.get).mockResolvedValue({
      id: "resume-1",
      candidate_id: "candidate-1",
      title: "Currículo Ana",
      status: "active",
      current_version: 1,
      created_at: "2026-05-01T10:00:00Z",
      updated_at: "2026-05-12T10:00:00Z",
      versions: [
        {
          id: "version-1",
          version_number: 1,
          original_file_name: "ana.docx",
          mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          extraction_status: "completed",
          uploaded_at: "2026-05-12T10:00:00Z",
        },
      ],
    });
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...baseOverview,
      resumes: [{ ...baseOverview.resumes[0], current_version: 1, current_version_id: "version-1", current_file_name: "ana.docx" }],
    });
    vi.mocked(resumeService.fetchCandidateResumeFile).mockResolvedValue({
      blob: new Blob(["doc"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: "ana.docx",
    });

    setupDocumentPage();
    fireEvent.click(await screen.findByRole("button", { name: "Visualizar currículo" }));

    expect(
      await screen.findByText("Pré-visualização indisponível para este formato. Baixe o arquivo para visualizar."),
    ).toBeInTheDocument();
  });

  it("botão Baixar chama service seguro", async () => {
    setupDocumentPage();

    fireEvent.click(await screen.findByRole("button", { name: "Baixar currículo" }));

    await waitFor(() => {
      expect(resumeService.downloadCandidateResume).toHaveBeenCalledWith(
        "candidate-1",
        "resume-1",
        { versionId: "version-2" },
      );
    });
  });

  it("Abrir em nova aba usa blob autenticado, não a URL protegida da API", async () => {
    setupDocumentPage();

    fireEvent.click(await screen.findByRole("button", { name: "Abrir em nova aba" }));

    await waitFor(() => {
      expect(resumeService.fetchCandidateResumeFile).toHaveBeenCalledWith(
        "candidate-1",
        "resume-1",
        { versionId: "version-2", disposition: "inline" },
      );
      expect(window.open).toHaveBeenCalledWith("blob:preview", "_blank", "noopener,noreferrer");
      expect(resumeService.getCandidateResumeDownloadUrl).not.toHaveBeenCalled();
    });
  });

  it("mostra erro amigável quando preview falha", async () => {
    vi.mocked(resumeService.fetchCandidateResumeFile).mockRejectedValue(new Error("falha"));
    setupDocumentPage();

    fireEvent.click(await screen.findByRole("button", { name: "Visualizar currículo" }));

    expect(await screen.findByText("Não foi possível carregar o currículo.")).toBeInTheDocument();
  });

});
