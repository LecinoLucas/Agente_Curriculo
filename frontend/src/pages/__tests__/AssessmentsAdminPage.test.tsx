import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssessmentsAdminPage } from "../AssessmentsAdminPage";
import { assessmentsService } from "../../services/assessmentsService";
import type { AssessmentTemplateDetail } from "../../types/domain";

vi.mock("../../services/assessmentsService", () => ({
  assessmentsService: {
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    archiveTemplate: vi.fn(),
    duplicateTemplate: vi.fn(),
    createQuestion: vi.fn(),
    updateQuestion: vi.fn(),
    deleteQuestion: vi.fn(),
    createOption: vi.fn(),
    updateOption: vi.fn(),
    deleteOption: vi.fn(),
  },
}));

vi.mock("../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const baseTemplate: AssessmentTemplateDetail = {
  id: "tpl-1",
  title: "Teste comportamental inicial",
  description: "Descrição",
  type: "behavioral_test",
  status: "draft",
  version: 1,
  question_count: 2,
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
  is_used: false,
  job_link_count: 0,
  assignment_count: 0,
  questions: [
    {
      id: "q-1",
      question_text: "Como você organiza?",
      question_type: "single_choice",
      required: true,
      order_index: 1,
      metadata: null,
      options: [
        { id: "opt-1", option_text: "Por prioridade", score_value: null, metadata: null, order_index: 1 },
        { id: "opt-2", option_text: "Por prazo", score_value: null, metadata: null, order_index: 2 },
      ],
    },
    {
      id: "q-2",
      question_text: "Como você comunica?",
      question_type: "text",
      required: false,
      order_index: 2,
      metadata: null,
      options: [],
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AssessmentsAdminPage />
    </MemoryRouter>,
  );
}

describe("AssessmentsAdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (assessmentsService.listTemplates as any).mockResolvedValue([
      {
        id: "tpl-1",
        title: "Teste comportamental inicial",
        type: "behavioral_test",
        status: "draft",
        version: 1,
        question_count: 2,
        created_at: "2026-01-01T10:00:00Z",
        updated_at: "2026-01-01T10:00:00Z",
      },
    ]);
    (assessmentsService.getTemplate as any).mockResolvedValue(baseTemplate);
    (assessmentsService.updateTemplate as any).mockResolvedValue(baseTemplate);
    (assessmentsService.archiveTemplate as any).mockResolvedValue({ ...baseTemplate, status: "archived" });
    (assessmentsService.duplicateTemplate as any).mockResolvedValue({
      ...baseTemplate,
      id: "tpl-copy",
      title: "Teste comportamental inicial (cópia)",
      status: "draft",
      version: 2,
    });
    (assessmentsService.updateQuestion as any).mockResolvedValue(baseTemplate.questions[0]);
    (assessmentsService.updateOption as any).mockResolvedValue(baseTemplate.questions[0].options[0]);
  });

  it("renderiza página de avaliações com lista de templates", async () => {
    renderPage();

    expect(await screen.findByText("Avaliações")).toBeInTheDocument();
    expect(await screen.findByText("Teste comportamental inicial")).toBeInTheDocument();
  });

  it("cria novo template", async () => {
    (assessmentsService.createTemplate as any).mockResolvedValue({
      id: "tpl-2",
      title: "Pesquisa cultural",
      type: "behavioral_survey",
      status: "draft",
      version: 1,
      question_count: 0,
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-01T10:00:00Z",
    });

    renderPage();

    fireEvent.change(await screen.findByPlaceholderText("Título do template"), {
      target: { value: "Pesquisa cultural" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Criar avaliação/i }));

    await waitFor(() => {
      expect(assessmentsService.createTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pesquisa cultural",
          type: "behavioral_test",
        }),
      );
    });
  });

  it("edita título e descrição do template", async () => {
    renderPage();

    fireEvent.change(await screen.findByDisplayValue("Teste comportamental inicial"), {
      target: { value: "Teste revisado" },
    });
    fireEvent.change(screen.getByDisplayValue("Descrição"), {
      target: { value: "Descrição revisada" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Salvar template/i }));

    await waitFor(() => {
      expect(assessmentsService.updateTemplate).toHaveBeenCalledWith(
        "tpl-1",
        expect.objectContaining({
          title: "Teste revisado",
          description: "Descrição revisada",
        }),
      );
    });
  });

  it("edita pergunta e alternativa existentes", async () => {
    renderPage();

    fireEvent.change(await screen.findByDisplayValue("Como você organiza?"), {
      target: { value: "Como você organiza seu trabalho?" },
    });
    fireEvent.click(screen.getAllByLabelText("Salvar pergunta")[0]);

    await waitFor(() => {
      expect(assessmentsService.updateQuestion).toHaveBeenCalledWith(
        "q-1",
        expect.objectContaining({ question_text: "Como você organiza seu trabalho?" }),
      );
    });

    fireEvent.change(screen.getByDisplayValue("Por prioridade"), {
      target: { value: "Por prioridade do negócio" },
    });
    fireEvent.click(screen.getAllByLabelText("Salvar alternativa")[0]);

    await waitFor(() => {
      expect(assessmentsService.updateOption).toHaveBeenCalledWith(
        "opt-1",
        expect.objectContaining({ option_text: "Por prioridade do negócio" }),
      );
    });
  });

  it("reordena pergunta e alternativa", async () => {
    renderPage();

    fireEvent.click((await screen.findAllByLabelText("Mover pergunta para baixo"))[0]);
    await waitFor(() => {
      expect(assessmentsService.updateQuestion).toHaveBeenCalledWith("q-1", { order_index: 2 });
      expect(assessmentsService.updateQuestion).toHaveBeenCalledWith("q-2", { order_index: 1 });
    });

    fireEvent.click(screen.getAllByLabelText("Mover alternativa para baixo")[0]);
    await waitFor(() => {
      expect(assessmentsService.updateOption).toHaveBeenCalledWith("opt-1", { order_index: 2 });
      expect(assessmentsService.updateOption).toHaveBeenCalledWith("opt-2", { order_index: 1 });
    });
  });

  it("duplica e arquiva template", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Duplicar/i }));
    await waitFor(() => {
      expect(assessmentsService.duplicateTemplate).toHaveBeenCalledWith(
        "tpl-1",
        expect.objectContaining({ title: "Teste comportamental inicial (cópia)", status: "draft" }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Arquivar/i }));
    await waitFor(() => {
      expect(assessmentsService.archiveTemplate).toHaveBeenCalledWith("tpl-1");
    });
  });

  it("mostra aviso e bloqueia edição estrutural quando template ativo está em uso", async () => {
    (assessmentsService.getTemplate as any).mockResolvedValue({
      ...baseTemplate,
      status: "active",
      is_used: true,
      job_link_count: 1,
    });

    renderPage();

    expect(await screen.findByText(/Este template já está em uso/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText("Salvar pergunta")[0]).toBeDisabled();
    expect(screen.getAllByLabelText("Salvar alternativa")[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: /Adicionar pergunta/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Duplicar/i })).toBeEnabled();
  });
});
