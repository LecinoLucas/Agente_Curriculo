import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CadastrosPage } from "../CadastrosPage";
import { skillsService } from "../../services/skillsService";
import { jobAreasService } from "../../services/jobAreasService";
import { candidatesService } from "../../services/candidatesService";
import { listJobs } from "../../services/jobsService";
import { behavioralTemplatesService } from "../../services/behavioralTemplatesService";

vi.mock("../../services/skillsService", () => ({
  skillsService: {
    listSkills: vi.fn(),
    deactivateSkill: vi.fn(),
    activateSkill: vi.fn(),
    restoreSkill: vi.fn(),
  },
}));

vi.mock("../../services/jobAreasService", () => ({
  jobAreasService: {
    listJobAreas: vi.fn(),
    deactivateJobArea: vi.fn(),
    activateJobArea: vi.fn(),
  },
}));

vi.mock("../../services/candidatesService", () => ({
  candidatesService: {
    list: vi.fn(),
    restore: vi.fn(),
  },
}));

vi.mock("../../services/jobsService", () => ({
  listJobs: vi.fn(),
}));

vi.mock("../../services/behavioralTemplatesService", () => ({
  behavioralTemplatesService: {
    listTemplates: vi.fn(),
  },
}));

describe("CadastrosPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(skillsService.listSkills).mockResolvedValue({ data: [], total: 0, page: 1, page_size: 100, total_pages: 0 });
    vi.mocked(jobAreasService.listJobAreas).mockResolvedValue({ data: [], total: 0, page: 1, page_size: 100, total_pages: 0 });
    vi.mocked(candidatesService.list).mockResolvedValue({ data: [], total: 0, page: 1, page_size: 100, total_pages: 0 });
    vi.mocked(listJobs).mockResolvedValue({ data: [], total: 0, page: 1, page_size: 100, total_pages: 0 });
    vi.mocked(behavioralTemplatesService.listTemplates).mockResolvedValue([]);
  });

  it("mostra templates comportamentais arquivados na aba de arquivados", async () => {
    vi.mocked(behavioralTemplatesService.listTemplates).mockResolvedValue([
      {
        id: "template-1",
        name: "Template Comportamental Arquivado",
        description: "Histórico de avaliação comportamental",
        status: "archived",
        version: 1,
        competency_count: 2,
        question_count: 6,
        created_at: "2026-05-13T00:00:00Z",
        updated_at: "2026-05-14T00:00:00Z",
        archived_at: "2026-05-14T12:00:00Z",
      },
      {
        id: "template-2",
        name: "Template Ativo",
        description: null,
        status: "active",
        version: 1,
        competency_count: 1,
        question_count: 3,
        created_at: "2026-05-13T00:00:00Z",
        updated_at: "2026-05-13T00:00:00Z",
      },
    ]);

    render(<CadastrosPage />);

    fireEvent.click(screen.getByRole("button", { name: "Arquivados" }));
    fireEvent.click(screen.getByRole("button", { name: /templates comportamentais/i }));

    await waitFor(() => {
      expect(screen.getByText("Template Comportamental Arquivado")).toBeInTheDocument();
    });

    expect(screen.getByText("Histórico de avaliação comportamental")).toBeInTheDocument();
    expect(screen.getByText(/2 competências/)).toBeInTheDocument();
    expect(screen.queryByText("Template Ativo")).not.toBeInTheDocument();
  });
});
