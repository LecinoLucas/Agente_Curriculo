import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BehavioralAssessmentForm } from "../BehavioralAssessmentForm";
import type { BehavioralAssignmentDetail } from "../../../../services/candidatePortalService";

function makeAssignment(overrides?: Partial<BehavioralAssignmentDetail>): BehavioralAssignmentDetail {
  return {
    id: "assign-1",
    candidate_id: "cand-1",
    job_id: "job-1",
    job_title: "Analista",
    template_id: "tpl-1",
    template_name: "Avaliação Comportamental",
    status: "in_progress",
    assigned_at: "2026-05-01T00:00:00Z",
    started_at: "2026-05-01T01:00:00Z",
    submitted_at: null,
    expires_at: null,
    answered_count: 0,
    question_count: 5,
    competencies: [
      {
        id: "comp-1",
        name: "Organização",
        description: null,
        display_order: 0,
        questions: [
          {
            id: "q-text",
            question_text: "Como você organiza suas tarefas?",
            answer_type: "text",
            is_required: true,
            display_order: 0,
            options_json: null,
            answer: null,
          },
        ],
      },
      {
        id: "comp-2",
        name: "Atendimento",
        description: null,
        display_order: 1,
        questions: [
          {
            id: "q-choice",
            question_text: "Com que frequência você busca feedback?",
            answer_type: "multiple_choice",
            is_required: true,
            display_order: 0,
            options_json: ["Sempre", "Frequentemente", "Às vezes", "Raramente"],
            answer: null,
          },
        ],
      },
      {
        id: "comp-3",
        name: "Colaboração",
        description: null,
        display_order: 2,
        questions: [
          {
            id: "q-scale",
            question_text: "Como você avalia seu trabalho em equipe?",
            answer_type: "scale",
            is_required: true,
            display_order: 0,
            options_json: null,
            answer: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("BehavioralAssessmentForm", () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exibe o nome do template e o título da vaga", () => {
    render(
      <BehavioralAssessmentForm
        assignment={makeAssignment()}
        onSave={onSave}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    );
    expect(screen.getByText("Avaliação Comportamental")).toBeInTheDocument();
    expect(screen.getByText("Analista")).toBeInTheDocument();
  });

  it("exibe as competências e perguntas", () => {
    render(
      <BehavioralAssessmentForm
        assignment={makeAssignment()}
        onSave={onSave}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    );
    expect(screen.getByText("Organização")).toBeInTheDocument();
    expect(screen.getByText("Como você organiza suas tarefas?")).toBeInTheDocument();
    expect(screen.getByText("Atendimento")).toBeInTheDocument();
    expect(screen.getByText("Com que frequência você busca feedback?")).toBeInTheDocument();
    expect(screen.getByText("Colaboração")).toBeInTheDocument();
  });

  it("bloqueia envio e mostra mensagem de validação quando há pergunta obrigatória sem resposta", async () => {
    render(
      <BehavioralAssessmentForm
        assignment={makeAssignment()}
        onSave={onSave}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /enviar avaliação/i }));
    expect(await screen.findByText("Responda todas as perguntas obrigatórias antes de enviar.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("chama onSubmit quando todas as perguntas obrigatórias estão respondidas", async () => {
    const user = userEvent.setup();
    render(
      <BehavioralAssessmentForm
        assignment={makeAssignment()}
        onSave={onSave}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    );

    await user.type(screen.getByRole("textbox"), "Uso listas de prioridade.");
    fireEvent.click(screen.getByLabelText("Sempre"));
    fireEvent.click(screen.getByLabelText("3"));

    await user.click(screen.getByRole("button", { name: /enviar avaliação/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ question_id: "q-text", answer_text: "Uso listas de prioridade." }),
        expect.objectContaining({ question_id: "q-choice", selected_options_json: ["Sempre"] }),
        expect.objectContaining({ question_id: "q-scale", answer_value: 3 }),
      ])
    );
  });

  it("chama onSave ao clicar em Salvar rascunho", async () => {
    const user = userEvent.setup();
    render(
      <BehavioralAssessmentForm
        assignment={makeAssignment()}
        onSave={onSave}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    );

    await user.type(screen.getByRole("textbox"), "rascunho parcial");
    await user.click(screen.getByRole("button", { name: /salvar rascunho/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it("exibe opções de múltipla escolha e permite selecionar uma", () => {
    render(
      <BehavioralAssessmentForm
        assignment={makeAssignment()}
        onSave={onSave}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    );
    expect(screen.getByLabelText("Sempre")).toBeInTheDocument();
    expect(screen.getByLabelText("Frequentemente")).toBeInTheDocument();
    expect(screen.getByLabelText("Às vezes")).toBeInTheDocument();
    expect(screen.getByLabelText("Raramente")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Frequentemente"));
    expect((screen.getByLabelText("Frequentemente") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Sempre") as HTMLInputElement).checked).toBe(false);
  });

  it("exibe opções de escala 1–5", () => {
    render(
      <BehavioralAssessmentForm
        assignment={makeAssignment()}
        onSave={onSave}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    );
    for (const value of [1, 2, 3, 4, 5]) {
      expect(screen.getByLabelText(String(value))).toBeInTheDocument();
    }
  });

  it("preserva respostas existentes ao abrir avaliação em andamento", () => {
    const assignmentWithAnswers = makeAssignment({
      status: "in_progress",
      competencies: [
        {
          id: "comp-1",
          name: "Organização",
          description: null,
          display_order: 0,
          questions: [
            {
              id: "q-text",
              question_text: "Como você organiza suas tarefas?",
              answer_type: "text",
              is_required: true,
              display_order: 0,
              options_json: null,
              answer: {
                question_id: "q-text",
                answer_text: "Resposta salva anteriormente",
                answer_value: null,
                selected_options_json: null,
              },
            },
          ],
        },
      ],
    });

    render(
      <BehavioralAssessmentForm
        assignment={assignmentWithAnswers}
        onSave={onSave}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    );

    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Resposta salva anteriormente");
  });

  it("quando status é submitted: inputs desabilitados, botões ocultos, banner exibido", () => {
    const submitted = makeAssignment({ status: "submitted" });
    render(
      <BehavioralAssessmentForm
        assignment={submitted}
        onSave={onSave}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    );

    expect(screen.getByText("Avaliação enviada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /salvar rascunho/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar avaliação/i })).not.toBeInTheDocument();

    const textarea = screen.queryByRole("textbox");
    if (textarea) {
      expect(textarea).toBeDisabled();
    }
  });

  it("chama onClose ao clicar em Fechar", () => {
    render(
      <BehavioralAssessmentForm
        assignment={makeAssignment()}
        onSave={onSave}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /fechar/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("limpa mensagem de validação ao submeter com sucesso após erro anterior", async () => {
    const user = userEvent.setup();
    render(
      <BehavioralAssessmentForm
        assignment={makeAssignment()}
        onSave={onSave}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /enviar avaliação/i }));
    expect(await screen.findByText("Responda todas as perguntas obrigatórias antes de enviar.")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox"), "resposta");
    fireEvent.click(screen.getByLabelText("Sempre"));
    fireEvent.click(screen.getByLabelText("2"));
    await user.click(screen.getByRole("button", { name: /enviar avaliação/i }));

    await waitFor(() => {
      expect(screen.queryByText("Responda todas as perguntas obrigatórias antes de enviar.")).not.toBeInTheDocument();
    });
  });
});
