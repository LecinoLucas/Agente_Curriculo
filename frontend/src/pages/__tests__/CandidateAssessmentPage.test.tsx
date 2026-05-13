import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateAssessmentPage } from "../CandidateAssessmentPage";
import { candidatePortalService } from "../../services/candidatePortalService";
import { toast } from "../../shared/utils/toast";

vi.mock("../../services/candidatePortalService", () => ({
  candidatePortalService: {
    startAssessment: vi.fn(),
    submitAssessment: vi.fn(),
  },
}));

vi.mock("../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("CandidateAssessmentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (candidatePortalService.startAssessment as any).mockResolvedValue({
      id: "assignment-1",
      type: "behavioral_test",
      title: "Teste comportamental",
      description: "Avaliação rápida",
      status: "in_progress",
      required: true,
      due_at: null,
      privacy_notice: "Suas respostas serão usadas exclusivamente para fins de recrutamento e seleção.",
      questions: [
        {
          id: "q-single",
          question_text: "Como você prefere trabalhar?",
          question_type: "single_choice",
          required: true,
          order_index: 1,
          metadata: null,
          options: [
            { id: "o-1", option_text: "Em equipe", order_index: 1 },
            { id: "o-2", option_text: "Individual", order_index: 2 },
          ],
        },
        {
          id: "q-multiple",
          question_text: "Quais ambientes você prefere?",
          question_type: "multiple_choice",
          required: true,
          order_index: 2,
          metadata: null,
          options: [
            { id: "m-1", option_text: "Equipe pequena", order_index: 1 },
            { id: "m-2", option_text: "Equipe multidisciplinar", order_index: 2 },
          ],
        },
        {
          id: "q-scale",
          question_text: "Como você avalia seu nível de organização?",
          question_type: "scale",
          required: true,
          order_index: 3,
          metadata: { min: 1, max: 5 },
          options: [],
        },
        {
          id: "q-text",
          question_text: "Descreva seu estilo de comunicação.",
          question_type: "text",
          required: true,
          order_index: 4,
          metadata: null,
          options: [],
        },
      ],
    });
  });

  it("bloqueia envio sem responder pergunta obrigatória", async () => {
    render(
      <MemoryRouter initialEntries={["/candidato/portal/avaliacoes/assignment-1"]}>
        <Routes>
          <Route path="/candidato/portal/avaliacoes/:assignmentId" element={<CandidateAssessmentPage />} />
          <Route path="/candidato/portal" element={<div>Portal</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Teste comportamental" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /enviar respostas/i }));

    expect(toast.error).toHaveBeenCalledWith("Responda todas as perguntas obrigatórias.");
    expect(candidatePortalService.submitAssessment).not.toHaveBeenCalled();
  });

  it("envia respostas de todos os tipos e volta ao portal", async () => {
    (candidatePortalService.submitAssessment as any).mockResolvedValue({
      id: "assignment-1",
      status: "completed",
      message: "Respostas enviadas com sucesso.",
    });

    render(
      <MemoryRouter initialEntries={["/candidato/portal/avaliacoes/assignment-1"]}>
        <Routes>
          <Route path="/candidato/portal/avaliacoes/:assignmentId" element={<CandidateAssessmentPage />} />
          <Route path="/candidato/portal" element={<div>Portal</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByLabelText("Em equipe"));
    fireEvent.click(screen.getByLabelText("Equipe pequena"));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "4" } });
    fireEvent.change(screen.getByRole("textbox", { name: "" }), {
      target: { value: "Comunicação direta e colaborativa." },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar respostas/i }));

    await waitFor(() => {
      expect(candidatePortalService.submitAssessment).toHaveBeenCalledWith(
        "assignment-1",
        expect.arrayContaining([
          expect.objectContaining({ question_id: "q-single", option_id: "o-1" }),
          expect.objectContaining({ question_id: "q-multiple", option_ids: ["m-1"] }),
          expect.objectContaining({ question_id: "q-scale", answer_value: 4 }),
          expect.objectContaining({
            question_id: "q-text",
            answer_text: "Comunicação direta e colaborativa.",
          }),
        ]),
      );
    });
    expect(await screen.findByText("Portal")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Respostas enviadas com sucesso.");
  });
});
