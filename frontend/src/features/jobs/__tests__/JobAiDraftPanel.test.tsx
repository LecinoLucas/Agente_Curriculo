import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { JobAiDraftPanel, draftToFormUpdates } from "../components/JobAiDraftPanel";
import { MOCK_AI_PROMPT_EXAMPLE, MOCK_JOB_AI_DRAFT } from "../utils/mockJobAiDraft";

describe("draftToFormUpdates", () => {
  it("mapeia os campos principais do rascunho para o formulário", () => {
    const result = draftToFormUpdates(MOCK_JOB_AI_DRAFT);

    expect(result).toEqual(
      expect.objectContaining({
        title: "Frentista",
        description: MOCK_JOB_AI_DRAFT.description,
        job_area: "Operação de pista",
        work_model: "onsite",
        location: "Unidade a definir",
        requires_manager_review: true,
        requires_behavioral_assessment: false,
      }),
    );
  });

  it("serializa responsabilidades e requisitos em texto de múltiplas linhas", () => {
    const result = draftToFormUpdates(MOCK_JOB_AI_DRAFT);

    expect(result.responsibilities).toContain("\n");
    expect(result.requirements).toContain("Boa comunicação");
  });

  it("preenche os campos dedicados de skills e triagem", () => {
    const result = draftToFormUpdates(MOCK_JOB_AI_DRAFT);

    expect(result.mandatory_skills).toEqual(
      expect.arrayContaining(["Atendimento ao cliente", "Responsabilidade com caixa"]),
    );
    expect(result.nice_to_have_skills).toEqual(
      expect.arrayContaining(["Experiência em posto de combustível"]),
    );
    expect(result.screening_questions).toEqual(
      expect.arrayContaining(["Você tem disponibilidade para trabalhar em escala?"]),
    );
  });

  it("não mistura o rascunho em campos manuais não relacionados", () => {
    const result = draftToFormUpdates(MOCK_JOB_AI_DRAFT);

    expect(result.behavioral_requirements).toBeUndefined();
    expect(result.experience_context).toBeUndefined();
  });
});

describe("JobAiDraftPanel", () => {
  async function generateDraft(formHasData = false, onApply = vi.fn()) {
    render(<JobAiDraftPanel formHasData={formHasData} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText(/Descrição da vaga para IA/i), {
      target: { value: "Preciso contratar um frentista para posto de combustível." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gerar exemplo com IA/i }));
    await screen.findByTestId("ai-draft-result");
    return onApply;
  }

  it("preenche o textarea com o exemplo quando o usuário clica em 'Usar exemplo'", () => {
    render(<JobAiDraftPanel formHasData={false} onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo/i }));
    expect(screen.getByLabelText(/Descrição da vaga para IA/i)).toHaveValue(
      MOCK_AI_PROMPT_EXAMPLE,
    );
  });

  it("exibe loading e depois o rascunho estruturado", async () => {
    render(<JobAiDraftPanel formHasData={false} onApply={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Descrição da vaga para IA/i), {
      target: { value: "Preciso contratar um frentista para posto de combustível." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gerar exemplo com IA/i }));

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(await screen.findByTestId("ai-draft-result")).toBeInTheDocument();
    expect(screen.getByTestId("draft-title-input")).toHaveValue("Frentista");
  });

  it("mostra validação quando tenta gerar sem descrição", () => {
    render(<JobAiDraftPanel formHasData={false} onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Gerar exemplo com IA/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Informe uma descrição para gerar o rascunho/i,
    );
  });

  it("aplica o rascunho diretamente quando o formulário ainda está vazio", async () => {
    const onApply = await generateDraft(false, vi.fn());

    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Frentista",
        job_area: "Operação de pista",
        screening_questions: expect.arrayContaining([
          "Você tem disponibilidade para trabalhar em escala?",
        ]),
      }),
      expect.objectContaining({
        mandatory: expect.arrayContaining(["Atendimento ao cliente"]),
        optional: expect.arrayContaining(["Experiência em posto de combustível"]),
      }),
    );
  });

  it("pede confirmação antes de aplicar sobre um formulário já preenchido", async () => {
    const onApply = await generateDraft(true, vi.fn());

    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    expect(
      screen.getByRole("dialog", { name: /Confirmar substituição/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("confirma e aplica quando o usuário aceita substituir campos existentes", async () => {
    const onApply = await generateDraft(true, vi.fn());

    fireEvent.click(screen.getByRole("button", { name: /Aplicar ao formulário/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar e aplicar/i }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Frentista" }),
      expect.objectContaining({
        mandatory: expect.arrayContaining(["Atendimento ao cliente"]),
      }),
    );
  });
});
