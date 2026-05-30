import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DemoRhPage } from "../DemoRhPage";

vi.mock("@/shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <DemoRhPage />
    </MemoryRouter>,
  );
}

function startJob(name: RegExp | string) {
  const card = screen.getByTestId(
    name instanceof RegExp
      ? name.test("Frentista")
        ? "job-card-frentista"
        : name.test("Operador de Caixa")
          ? "job-card-operador-caixa"
          : "job-card-analista-dados"
      : `job-card-${name}`,
  );
  fireEvent.click(within(card).getByRole("button", { name: /Iniciar demo desta vaga/i }));
}

function runUntilRanking() {
  fireEvent.click(screen.getByRole("button", { name: /Gerar vaga com IA/i }));
  fireEvent.click(screen.getByRole("button", { name: /^Carregar candidatos exemplo$/i }));
  fireEvent.click(screen.getByRole("button", { name: /Analisar candidatos com IA/i }));
}

describe("DemoRhPage", () => {
  it("renderiza cards das 3 vagas", () => {
    renderPage();

    expect(screen.getByTestId("job-card-frentista")).toHaveTextContent("Frentista");
    expect(screen.getByTestId("job-card-operador-caixa")).toHaveTextContent("Operador de Caixa");
    expect(screen.getByTestId("job-card-analista-dados")).toHaveTextContent("Analista de Dados");
    expect(screen.getAllByRole("button", { name: /Iniciar demo desta vaga/i })).toHaveLength(3);
  });

  it("inicia demo de uma vaga", () => {
    renderPage();
    startJob("frentista");

    expect(screen.getByTestId("active-demo")).toHaveTextContent("Frentista");
    expect(screen.getByTestId("demo-stepper")).toHaveTextContent("1. Criar vaga com IA");
    expect(screen.getByRole("button", { name: /Trocar vaga demo/i })).toBeInTheDocument();
  });

  it("gera vaga com IA simulada", () => {
    renderPage();
    startJob("frentista");

    fireEvent.click(screen.getByRole("button", { name: /Gerar vaga com IA/i }));

    const result = screen.getByTestId("ai-job-result");
    expect(result).toHaveTextContent("Responsabilidades");
    expect(result).toHaveTextContent("Requisitos obrigatórios");
    expect(result).toHaveTextContent("Perguntas de triagem");
    expect(result).toHaveTextContent("Etapas sugeridas");
  });

  it("carrega candidatos exemplo", () => {
    renderPage();
    startJob("frentista");
    fireEvent.click(screen.getByRole("button", { name: /Gerar vaga com IA/i }));

    fireEvent.click(screen.getByRole("button", { name: /^Carregar candidatos exemplo$/i }));

    const list = screen.getByTestId("candidate-list");
    expect(list).toHaveTextContent("Ana Souza");
    expect(list).toHaveTextContent("Carla Mendes");
    expect(list).toHaveTextContent("João Lima");
  });

  it("analisa candidatos com IA e mostra ranking ordenado", () => {
    renderPage();
    startJob("frentista");
    runUntilRanking();

    const ranking = screen.getByTestId("ranking-section");
    const candidates = within(ranking).getAllByTestId("ranking-candidate");
    expect(candidates[0]).toHaveTextContent("Ana Souza");
    expect(candidates[0]).toHaveTextContent("94% aderência");
    expect(candidates[1]).toHaveTextContent("Carla Mendes");
    expect(candidates[2]).toHaveTextContent("João Lima");
  });

  it("ações dos candidatos aparecem", () => {
    renderPage();
    startJob("frentista");
    runUntilRanking();

    const firstCandidate = screen.getAllByTestId("ranking-candidate")[0];
    expect(within(firstCandidate).getByRole("button", { name: /Ver análise/i })).toBeInTheDocument();
    expect(within(firstCandidate).getByRole("button", { name: /Marcar entrevista/i })).toBeInTheDocument();
    expect(within(firstCandidate).getByRole("button", { name: /Copiar WhatsApp/i })).toBeInTheDocument();
    expect(within(firstCandidate).getByRole("button", { name: /Reprovar/i })).toBeInTheDocument();
    expect(within(firstCandidate).getByRole("button", { name: /Ir para decisão/i })).toBeInTheDocument();
  });

  it("trocar vaga troca contexto", () => {
    renderPage();
    startJob("frentista");
    expect(screen.getByTestId("active-demo")).toHaveTextContent("Frentista");

    fireEvent.click(screen.getByRole("button", { name: /Trocar vaga demo/i }));
    startJob("analista-dados");

    expect(screen.getByTestId("active-demo")).toHaveTextContent("Analista de Dados");
    expect(screen.getByLabelText("Descrição da vaga")).toHaveValue("Contratar analista de dados para estruturar indicadores, consultar bases SQL, construir dashboards e apoiar áreas de negócio com análises recorrentes.");
  });

  it("carrega mais candidatos exemplo sem expor remessa", () => {
    renderPage();
    startJob("operador-caixa");
    fireEvent.click(screen.getByRole("button", { name: /Gerar vaga com IA/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Carregar candidatos exemplo$/i }));

    fireEvent.click(screen.getByRole("button", { name: /Carregar mais candidatos exemplo/i }));

    expect(screen.getByTestId("candidate-list")).toHaveTextContent("Paulo Madeira");
    expect(screen.queryByText(/backlog|orquestrador|remessa/i)).not.toBeInTheDocument();
  });

  describe("Painel Criar vaga por imagem ou descrição", () => {
    it("renderiza título 'Criar vaga por imagem ou descrição'", () => {
      renderPage();
      expect(screen.getByText("Criar vaga por imagem ou descrição")).toBeInTheDocument();
    });

    it("renderiza subtítulo do painel de criação por imagem", () => {
      renderPage();
      expect(
        screen.getByText("Simule como um cartaz ou texto vira uma vaga estruturada."),
      ).toBeInTheDocument();
    });

    it("renderiza o painel JobImageMockFillPanel", () => {
      renderPage();
      expect(screen.getByTestId("job-image-mock-fill-panel")).toBeInTheDocument();
    });

    describe("fluxo por imagem", () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("gera 'Assistente Fiscal' via imagem", async () => {
        renderPage();
        fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
        fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
        await act(async () => {
          vi.advanceTimersByTime(500);
        });
        const filledData = screen.getByRole("region", { name: /Dados preenchidos da vaga/i });
        expect(within(filledData).getByText("Assistente Fiscal")).toBeInTheDocument();
      });

      it("'Usar este preenchimento' mostra 'Vaga demo preenchida'", async () => {
        renderPage();
        fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
        fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
        await act(async () => {
          vi.advanceTimersByTime(500);
        });
        fireEvent.click(screen.getByRole("button", { name: /Usar este preenchimento/i }));
        expect(screen.getByTestId("demo-job-filled-summary")).toBeInTheDocument();
        expect(screen.getByText("Vaga demo preenchida")).toBeInTheDocument();
      });

      it("'Vaga demo preenchida' mostra Cargo, Área, Local e skills", async () => {
        renderPage();
        fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
        fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
        await act(async () => {
          vi.advanceTimersByTime(500);
        });
        fireEvent.click(screen.getByRole("button", { name: /Usar este preenchimento/i }));

        const summary = screen.getByTestId("demo-job-filled-summary");
        expect(within(summary).getByText("Assistente Fiscal")).toBeInTheDocument();
        expect(within(summary).getByText("Central de Notas")).toBeInTheDocument();
        expect(within(summary).getByText("Jardim Goiás — Goiânia/GO")).toBeInTheDocument();
        expect(within(summary).getByText("Excel")).toBeInTheDocument();
      });

      it("'Vaga demo preenchida' mostra 'Próximo passo: Ver candidatos demo'", async () => {
        renderPage();
        fireEvent.click(screen.getByRole("button", { name: /Usar exemplo de imagem/i }));
        fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
        await act(async () => {
          vi.advanceTimersByTime(500);
        });
        fireEvent.click(screen.getByRole("button", { name: /Usar este preenchimento/i }));
        const summary = screen.getByTestId("demo-job-filled-summary");
        expect(within(summary).getByText("Ver candidatos demo")).toBeInTheDocument();
      });
    });

    describe("fluxo por descrição", () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("gera 'Assistente Fiscal' via descrição", async () => {
        renderPage();
        fireEvent.click(screen.getByRole("button", { name: /^Descrição$/i }));
        fireEvent.click(screen.getByRole("button", { name: /Usar descrição exemplo/i }));
        fireEvent.click(screen.getByRole("button", { name: /Gerar preenchimento simulado/i }));
        await act(async () => {
          vi.advanceTimersByTime(500);
        });
        const filledData = screen.getByRole("region", { name: /Dados preenchidos da vaga/i });
        expect(within(filledData).getByText("Assistente Fiscal")).toBeInTheDocument();
      });
    });
  });
});
