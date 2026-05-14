import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdmissionPackagePanel } from "../AdmissionPackagePanel";
import * as admissionService from "../../../../../services/admissionPackageService";

vi.mock("../../../../../services/admissionPackageService");

const mockService = admissionService as unknown as {
  getPackageByCaseId: ReturnType<typeof vi.fn>;
  createPackage: ReturnType<typeof vi.fn>;
  approvePackage: ReturnType<typeof vi.fn>;
  downloadJson: ReturnType<typeof vi.fn>;
  downloadCsv: ReturnType<typeof vi.fn>;
  listErpAttempts: ReturnType<typeof vi.fn>;
  createProtheusDryRunAttempt: ReturnType<typeof vi.fn>;
  simulateErpAttempt: ReturnType<typeof vi.fn>;
};

const mockPackage = {
  id: "pkg-123",
  case_id: "case-123",
  candidate_id: "cand-123",
  job_id: "job-123",
  status: "ready_for_review" as const,
  created_at: "2026-05-14T10:00:00Z",
  updated_at: "2026-05-14T10:00:00Z",
  approved_at: null,
  exported_at: null,
  cancelled_at: null,
  created_by: "user-1",
  approved_by: null,
  exported_by: null,
  validation_errors: null,
  payload: {
    candidate: { id: "cand-123", full_name: "João Silva", email: "joao@example.com", phone: "+55", cpf: "123" },
    job: { id: "job-123", title: "Dev Senior", company: "Tech Co", department: null, location: null },
    pre_admission: { case_id: "case-123", status: "ready_for_admission", start_date: "2026-06-01", salary_offer: 10000, work_model: "CLT" },
    documents: [],
    decision: { hiring_decision_id: "dec-1", decision_outcome: "hire", reason_code: "strong", submitted_at: "2026-05-14T08:00:00Z" },
  },
};

describe("AdmissionPackagePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockService.getPackageByCaseId).mockResolvedValue(null);
    vi.mocked(mockService.listErpAttempts).mockResolvedValue({ attempts: [] });
  });

  it("shows nothing when case is not ready_for_admission", () => {
    const { container } = render(
      <AdmissionPackagePanel caseId="case-123" caseStatus="documents_pending" />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows generate button when no package exists", async () => {
    vi.mocked(mockService.getPackageByCaseId).mockResolvedValue(null);

    render(<AdmissionPackagePanel caseId="case-123" caseStatus="ready_for_admission" />);

    await waitFor(() => {
      expect(screen.getByText(/Gerar Pacote/i)).toBeInTheDocument();
    });
  });

  it("creates package on button click", async () => {
    const user = userEvent.setup();
    vi.mocked(mockService.getPackageByCaseId).mockResolvedValue(null);
    vi.mocked(mockService.createPackage).mockResolvedValue(mockPackage);

    render(<AdmissionPackagePanel caseId="case-123" caseStatus="ready_for_admission" />);

    await waitFor(() => {
      expect(screen.getByText(/Gerar Pacote/i)).toBeInTheDocument();
    });

    const btn = screen.getByText(/Gerar Pacote/i);
    await user.click(btn);

    expect(vi.mocked(mockService.createPackage)).toHaveBeenCalledWith("case-123");
  });

  it("shows preview when package status is ready_for_review", async () => {
    vi.mocked(mockService.getPackageByCaseId).mockResolvedValue(mockPackage);

    render(<AdmissionPackagePanel caseId="case-123" caseStatus="ready_for_admission" />);

    await waitFor(() => {
      expect(screen.getByText("João Silva")).toBeInTheDocument();
    });
  });

  it("shows approve button when ready_for_review", async () => {
    vi.mocked(mockService.getPackageByCaseId).mockResolvedValue(mockPackage);

    render(<AdmissionPackagePanel caseId="case-123" caseStatus="ready_for_admission" />);

    await waitFor(() => {
      expect(screen.getByText(/Aprovar Pacote/i)).toBeInTheDocument();
    });
  });

  it("approves package on button click", async () => {
    const user = userEvent.setup();
    vi.mocked(mockService.getPackageByCaseId).mockResolvedValue(mockPackage);
    vi.mocked(mockService.approvePackage).mockResolvedValue({
      ...mockPackage,
      status: "approved_for_export",
      approved_by: "user-1",
      approved_at: "2026-05-14T10:30:00Z",
    });

    render(<AdmissionPackagePanel caseId="case-123" caseStatus="ready_for_admission" />);

    await waitFor(() => {
      expect(screen.getByText(/Aprovar Pacote/i)).toBeInTheDocument();
    });

    const btn = screen.getByText(/Aprovar Pacote/i);
    await user.click(btn);

    expect(vi.mocked(mockService.approvePackage)).toHaveBeenCalledWith("pkg-123");
  });

  it("shows export buttons when approved_for_export", async () => {
    const approvedPackage = {
      ...mockPackage,
      status: "approved_for_export" as const,
      approved_by: "user-1",
      approved_at: "2026-05-14T10:30:00Z",
    };
    vi.mocked(mockService.getPackageByCaseId).mockResolvedValue(approvedPackage);

    render(<AdmissionPackagePanel caseId="case-123" caseStatus="ready_for_admission" />);

    await waitFor(() => {
      expect(screen.getByText(/Exportar JSON/i)).toBeInTheDocument();
      expect(screen.getByText(/Exportar CSV/i)).toBeInTheDocument();
    });
  });

  it("downloads JSON on button click", async () => {
    const user = userEvent.setup();
    const approvedPackage = {
      ...mockPackage,
      status: "approved_for_export" as const,
      approved_by: "user-1",
      approved_at: "2026-05-14T10:30:00Z",
    };
    vi.mocked(mockService.getPackageByCaseId).mockResolvedValue(approvedPackage);
    vi.mocked(mockService.downloadJson).mockResolvedValue(new Blob(["{}"], { type: "application/json" }));

    render(<AdmissionPackagePanel caseId="case-123" caseStatus="ready_for_admission" />);

    await waitFor(() => {
      expect(screen.getByText(/Exportar JSON/i)).toBeInTheDocument();
    });

    const btn = screen.getByText(/Exportar JSON/i);
    await user.click(btn);

    expect(vi.mocked(mockService.downloadJson)).toHaveBeenCalledWith("pkg-123");
  });

  it("shows loading state", () => {
    vi.mocked(mockService.getPackageByCaseId).mockImplementation(() => new Promise(() => {}));

    render(<AdmissionPackagePanel caseId="case-123" caseStatus="ready_for_admission" />);

    expect(screen.getByText(/Carregando/i)).toBeInTheDocument();
  });

  it("shows error message on failure", async () => {
    vi.mocked(mockService.getPackageByCaseId).mockRejectedValue(new Error("Network error"));

    render(<AdmissionPackagePanel caseId="case-123" caseStatus="ready_for_admission" />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});
