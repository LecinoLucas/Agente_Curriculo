import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CollaborationTab } from "../CollaborationTab";

const {
  mockListCollaboration,
  mockCreateComment,
  mockRequestManagerReview,
  mockListManagers,
} = vi.hoisted(() => ({
  mockListCollaboration: vi.fn(),
  mockCreateComment: vi.fn(),
  mockRequestManagerReview: vi.fn(),
  mockListManagers: vi.fn(),
}));

vi.mock("../../../../../services/collaborationService", () => ({
  collaborationService: {
    listCollaboration: mockListCollaboration,
    createComment: mockCreateComment,
    requestManagerReview: mockRequestManagerReview,
  },
}));

vi.mock("../../../../../services/usersService", () => ({
  usersService: {
    listManagers: mockListManagers,
  },
}));

describe("CollaborationTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCollaboration.mockResolvedValue({ comments: [] });
    mockListManagers.mockResolvedValue({
      managers: [
        {
          id: "manager-1",
          name: "Marina Gestora",
          email: "marina@example.com",
          role: "manager",
        },
      ],
    });
  });

  function getSubmitReviewButton() {
    return screen.getAllByRole("button", { name: /Solicitar revisão do gestor/i }).at(-1)!;
  }

  it("carrega gestores ao entrar em solicitar revisão", async () => {
    const user = userEvent.setup();

    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await screen.findByText("Sem comentários de colaboração ainda");
    await user.click(screen.getByRole("button", { name: /Solicitar revisão do gestor/i }));

    await waitFor(() => {
      expect(mockListManagers).toHaveBeenCalledTimes(1);
    });
  });

  it("mostra o select de gestor quando existem gestores disponíveis", async () => {
    const user = userEvent.setup();

    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await screen.findByText("Sem comentários de colaboração ainda");
    await user.click(screen.getByRole("button", { name: /Solicitar revisão do gestor/i }));

    expect(await screen.findByLabelText("Gestor responsável")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Marina Gestora/i })).toBeInTheDocument();
  });

  it("com gestores disponíveis, a seleção é obrigatória", async () => {
    const user = userEvent.setup();

    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await screen.findByText("Sem comentários de colaboração ainda");
    await user.click(screen.getByRole("button", { name: /Solicitar revisão do gestor/i }));
    await screen.findByLabelText("Gestor responsável");
    await user.type(screen.getByPlaceholderText("Descreva o que o gestor deve avaliar..."), "Revisar aderência ao time");

    expect(getSubmitReviewButton()).toBeDisabled();
  });

  it("envia target_manager_id no submit da solicitação de revisão", async () => {
    const user = userEvent.setup();
    mockRequestManagerReview.mockResolvedValue({
      id: "comment-3",
      author_id: "recruiter-1",
      author_role: "recruiter",
      comment_type: "review_request",
      recommendation: null,
      message: "Revise a candidatura",
      target_manager_id: "manager-1",
      priority: "medium",
      created_at: "2026-05-15T12:00:00Z",
    });

    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await screen.findByText("Sem comentários de colaboração ainda");
    await user.click(screen.getByRole("button", { name: /Solicitar revisão do gestor/i }));
    await user.selectOptions(await screen.findByLabelText("Gestor responsável"), "manager-1");
    await user.type(screen.getByPlaceholderText("Descreva o que o gestor deve avaliar..."), "Revise a candidatura");
    await user.click(getSubmitReviewButton());

    await waitFor(() => {
      expect(mockRequestManagerReview).toHaveBeenCalledWith("job-1", "cand-1", {
        message: "Revise a candidatura",
        target_manager_id: "manager-1",
        priority: "medium",
      });
    });
  });

  it("sem gestores disponíveis, mostra aviso de solicitação genérica", async () => {
    const user = userEvent.setup();
    mockListManagers.mockResolvedValue({ managers: [] });

    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await screen.findByText("Sem comentários de colaboração ainda");
    await user.click(screen.getByRole("button", { name: /Solicitar revisão do gestor/i }));

    expect(
      await screen.findByText("Nenhum gestor cadastrado. A solicitação será genérica."),
    ).toBeInTheDocument();
  });

  it("continua permitindo comentário interno sem carregar gestores", async () => {
    const user = userEvent.setup();
    mockCreateComment.mockResolvedValue({
      id: "comment-1",
      author_id: "recruiter-1",
      author_role: "recruiter",
      comment_type: "comment",
      recommendation: null,
      message: "Comentário interno",
      created_at: "2026-05-15T12:00:00Z",
    });

    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await screen.findByText("Sem comentários de colaboração ainda");
    await user.type(screen.getByPlaceholderText("Adicione um comentário interno..."), "Comentário interno");
    await user.click(screen.getByRole("button", { name: /Enviar comentário/i }));

    await waitFor(() => {
      expect(mockCreateComment).toHaveBeenCalledWith("job-1", "cand-1", {
        message: "Comentário interno",
        comment_type: "comment",
      });
    });
    expect(mockListManagers).not.toHaveBeenCalled();
  });
});
