import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobAssessmentsSection } from "../sections/JobAssessmentsSection";
import { assessmentsService } from "../../../services/assessmentsService";

vi.mock("../../../services/assessmentsService", () => ({
  assessmentsService: {
    listTemplates: vi.fn(),
    listJobAssessments: vi.fn(),
    attachTemplateToJob: vi.fn(),
    updateJobAssessment: vi.fn(),
    deleteJobAssessment: vi.fn(),
  },
}));

vi.mock("../../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("JobAssessmentsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (assessmentsService.listTemplates as any).mockResolvedValue([]);
    (assessmentsService.listJobAssessments as any).mockResolvedValue([]);
  });

  it("exibe estado vazio quando a vaga ainda não foi salva", async () => {
    render(<JobAssessmentsSection jobId={null} />);
    expect(screen.getByText(/precisa ser salva como rascunho/)).toBeInTheDocument();
    expect(await screen.findByText(/Nenhum template ativo encontrado/)).toBeInTheDocument();
  });

  it("mostra templates ativos antes da vaga ser salva, sem permitir vínculo local falso", async () => {
    (assessmentsService.listTemplates as any).mockResolvedValue([
      {
        id: "tpl-1",
        title: "Teste ativo",
        type: "behavioral_test",
        status: "active",
        version: 1,
        question_count: 3,
        created_at: "2026-01-01T10:00:00Z",
        updated_at: "2026-01-01T10:00:00Z",
      },
    ]);

    render(<JobAssessmentsSection jobId={null} />);

    expect(await screen.findByText("Teste comportamental · Teste ativo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /vincular avaliação/i })).toBeDisabled();
    expect(assessmentsService.listJobAssessments).not.toHaveBeenCalled();
  });

  it("carrega templates ativos e associa avaliação à vaga", async () => {
    (assessmentsService.listTemplates as any).mockResolvedValue([
      {
        id: "tpl-1",
        title: "Teste de perfil",
        type: "behavioral_test",
        status: "active",
        version: 1,
        question_count: 5,
        created_at: "2026-01-01T10:00:00Z",
        updated_at: "2026-01-01T10:00:00Z",
      },
    ]);
    (assessmentsService.listJobAssessments as any).mockResolvedValue([]);
    (assessmentsService.attachTemplateToJob as any).mockResolvedValue({
      id: "job-assessment-1",
    });

    render(<JobAssessmentsSection jobId="job-1" />);

    expect(await screen.findByText("Avaliações do processo")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Template de avaliação"), {
      target: { value: "tpl-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /vincular avaliação/i }));

    await waitFor(() => {
      expect(assessmentsService.attachTemplateToJob).toHaveBeenCalledWith(
        "job-1",
        expect.objectContaining({ template_id: "tpl-1" }),
      );
    });
  });
});
