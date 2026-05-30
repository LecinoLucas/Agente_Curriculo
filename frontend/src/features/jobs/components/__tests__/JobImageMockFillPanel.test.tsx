import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";

import { JobImageMockFillPanel, MOCK_JOB_FILL_UPDATES } from "../JobImageMockFillPanel";
import { toast } from "../../../../shared/utils/toast";

vi.mock("../../../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

async function finishLoading() {
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
}

describe("JobImageMockFillPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renderiza título 'Criar vaga a partir de imagem ou descrição'", () => {
    render(<JobImageMockFillPanel />);
    expect(screen.getByText("Criar vaga a partir de imagem ou descrição")).toBeInTheDocument();
  });

  it("mostra badges de modo demo e preenchimento simulado", () => {
    render(<JobImageMockFillPanel />);
    expect(screen.getByText("Modo demo")).toBeInTheDocument();
    expect(screen.getByText("Preenchimento simulado")).toBeInTheDocument();
  });

  it("mostra opções Imagem e Descrição", () => {
    render(<JobImageMockFillPanel />);
    expect(screen.getByRole("button", { name: /^Imagem$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Descrição$/i })).toBeInTheDocument();
  });

  it("aba Imagem mostra botão 'Usar exemplo de imagem'", () => {
    render(<JobImageMockFillPanel />);
    expect(screen.getByRole("button", { name: /Usar exemplo de imagem/i })).toBeInTheDocument();
  });

  it("clicar 'Usar exemplo de imagem' mostra arquivo mockado", () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
    expect(screen.getByText("cartaz_assistente_fiscal_marajo.png")).toBeInTheDocument();
    expect(screen.getByText("Imagem pronta para processamento")).toBeInTheDocument();
  });

  it("gerar por imagem mostra loading 'Processando imagem...'", () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    expect(screen.getByRole("status")).toHaveTextContent("Processando imagem...");
  });

  it("depois do loading por imagem mostra 'Assistente Fiscal'", async () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    await finishLoading();
    const filledData = screen.getByRole("region", { name: /Dados preenchidos da vaga/i });
    expect(within(filledData).getByText("Assistente Fiscal")).toBeInTheDocument();
  });

  it("aba Descrição mostra campo 'Descreva a vaga'", () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /^Descrição$/i }));
    expect(screen.getByLabelText("Descreva a vaga")).toBeInTheDocument();
  });

  it("'Usar descrição exemplo' preenche textarea", () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /^Descrição$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Usar descrição exemplo/i }));
    const textarea = screen.getByLabelText("Descreva a vaga") as HTMLTextAreaElement;
    expect(textarea.value).toContain("Preciso contratar Assistente Fiscal");
  });

  it("gerar por descrição mostra loading 'Organizando descrição...'", () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /^Descrição$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Usar descrição exemplo/i }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    expect(screen.getByRole("status")).toHaveTextContent("Organizando descrição...");
  });

  it("depois do loading por descrição mostra 'Assistente Fiscal'", async () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /^Descrição$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Usar descrição exemplo/i }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    await finishLoading();
    const filledData = screen.getByRole("region", { name: /Dados preenchidos da vaga/i });
    expect(within(filledData).getByText("Assistente Fiscal")).toBeInTheDocument();
  });

  it("gerar sem imagem/descrição mostra validação", () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Use uma imagem exemplo|Envie uma imagem/i);
  });

  it("resultado mostra Dados principais", async () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    await finishLoading();
    expect(screen.getByText("Dados principais")).toBeInTheDocument();
  });

  it("resultado mostra Atividades principais", async () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    await finishLoading();
    expect(screen.getByText("Atividades principais")).toBeInTheDocument();
  });

  it("resultado mostra Requisitos", async () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    await finishLoading();
    expect(screen.getByText("Requisitos")).toBeInTheDocument();
  });

  it("resultado mostra Benefícios", async () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    await finishLoading();
    expect(screen.getByText("Benefícios")).toBeInTheDocument();
  });

  it("resultado mostra Skills sugeridas", async () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    await finishLoading();
    const filledData = screen.getByRole("region", { name: /Dados preenchidos da vaga/i });
    expect(screen.getByText("Skills sugeridas")).toBeInTheDocument();
    expect(within(filledData).getByText("Excel")).toBeInTheDocument();
  });

  it("resultado mostra '18/20 campos preenchidos'", async () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    await finishLoading();
    expect(screen.getByText("18/20")).toBeInTheDocument();
    expect(screen.getByText("campos preenchidos")).toBeInTheDocument();
  });

  it("'Trocar imagem/descrição' volta ao estado inicial", async () => {
    render(<JobImageMockFillPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    await finishLoading();
    fireEvent.click(screen.getByRole("button", { name: /Trocar imagem\/descrição/i }));
    expect(screen.getByText("Comece a simulação")).toBeInTheDocument();
  });

  it("'Usar este preenchimento' chama onApply e mostra feedback sem salvar/publicar", async () => {
    const onApply = vi.fn();
    render(<JobImageMockFillPanel onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    await finishLoading();
    fireEvent.click(screen.getByRole("button", { name: /Usar este preenchimento/i }));
    expect(onApply).toHaveBeenCalledWith(MOCK_JOB_FILL_UPDATES);
    expect(toast.success).toHaveBeenCalledWith(
      "Preenchimento aplicado. Revise os campos antes de salvar.",
    );
    expect(screen.queryByRole("button", { name: /^Salvar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Publicar/i })).not.toBeInTheDocument();
  });

  it("cancelar confirmação não aplica preenchimento", async () => {
    const onApply = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<JobImageMockFillPanel hasFormData onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    await finishLoading();
    fireEvent.click(screen.getByRole("button", { name: /Usar este preenchimento/i }));

    expect(confirmSpy).toHaveBeenCalledWith("Isso substituirá campos já preenchidos. Deseja continuar?");
    expect(onApply).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("confirmar substituição aplica preenchimento", async () => {
    const onApply = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<JobImageMockFillPanel hasFormData onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
    await finishLoading();
    fireEvent.click(screen.getByRole("button", { name: /Usar este preenchimento/i }));

    expect(confirmSpy).toHaveBeenCalledWith("Isso substituirá campos já preenchidos. Deseja continuar?");
    expect(onApply).toHaveBeenCalledWith(MOCK_JOB_FILL_UPDATES);
    expect(toast.success).toHaveBeenCalledWith(
      "Preenchimento aplicado. Revise os campos antes de salvar.",
    );
    confirmSpy.mockRestore();
  });
});
