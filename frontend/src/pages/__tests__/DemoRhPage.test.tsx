import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { DemoRhPage } from "../DemoRhPage";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

function renderPage() {
  return render(
    <MemoryRouter future={routerFuture}>
      <DemoRhPage />
    </MemoryRouter>,
  );
}

function startDemo() {
  fireEvent.click(screen.getByRole("button", { name: /Começar demo/i }));
}

async function tick() {
  await act(async () => {
    vi.advanceTimersByTime(1100);
  });
}

// ── Helpers de navegação ──────────────────────────────────────────────────────

async function gerarVaga() {
  fireEvent.click(screen.getByRole("button", { name: /Preencher exemplo/i }));
  fireEvent.click(screen.getByRole("button", { name: /Gerar vaga com IA/i }));
  await tick();
}

async function usarVaga() {
  await gerarVaga();
  fireEvent.click(screen.getByRole("button", { name: /Usar esta vaga/i }));
}

async function irParaCandidatos() {
  renderPage();
  startDemo();
  await usarVaga();
}

async function carregarEAnalisar() {
  await irParaCandidatos();
  fireEvent.click(screen.getByRole("button", { name: /Carregar candidatos exemplo/i }));
  fireEvent.click(screen.getByRole("button", { name: /Analisar com IA/i }));
  await tick();
}

function confirmarEntrevista() {
  fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-06-01" } });
  fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "10:00" } });
  fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "rh" } });
  fireEvent.change(screen.getByLabelText("Formato"), { target: { value: "online" } });
  fireEvent.change(screen.getByLabelText(/Local ou link/i), {
    target: { value: "https://meet.google.com/abc" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Confirmar entrevista/i }));
}

// ─────────────────────────────────────────────────────────────────────────────

describe("DemoRhPage", () => {
  // ── Placeholder (antes de iniciar) ───────────────────────────────────────

  describe("tela placeholder (antes de iniciar)", () => {
    it("renderiza título Fluxo RH Simples", () => {
      renderPage();
      expect(screen.getByRole("heading", { name: /Fluxo RH Simples/i })).toBeInTheDocument();
    });

    it("exibe o subtítulo de demonstração", () => {
      renderPage();
      expect(screen.getByText(/Demonstração do processo de vaga/i)).toBeInTheDocument();
    });

    it("exibe badge Demo", () => {
      renderPage();
      expect(screen.getByText("Demo")).toBeInTheDocument();
    });

    it("exibe aviso de tela demonstrativa", () => {
      renderPage();
      expect(
        screen.getByText(/Esta tela é demonstrativa e não cria dados reais/i),
      ).toBeInTheDocument();
    });

    it("lista as 5 etapas do fluxo", () => {
      renderPage();
      expect(screen.getByText(/Criar vaga com IA/i)).toBeInTheDocument();
      expect(screen.getByText(/Triagem de candidatos/i)).toBeInTheDocument();
      // "Entrevistas" and "Decisão" also appear in the subtitle, so use getAllByText
      expect(screen.getAllByText(/Entrevistas/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Decisão/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Pré-admissão/i)).toBeInTheDocument();
    });

    it("botão Começar demo está habilitado", () => {
      renderPage();
      expect(screen.getByRole("button", { name: /Começar demo/i })).not.toBeDisabled();
    });

    it("botão Voltar ao Dashboard existe", () => {
      renderPage();
      expect(screen.getByRole("button", { name: /Voltar ao Dashboard/i })).toBeInTheDocument();
    });
  });

  // ── Stepper e etapa Vaga ─────────────────────────────────────────────────

  describe("após iniciar demo (etapa Vaga)", () => {
    it("clicar em Começar demo mostra o stepper e o card Criar vaga com IA", () => {
      renderPage();
      startDemo();
      expect(screen.getByRole("navigation", { name: /Etapas da demo/i })).toBeInTheDocument();
      expect(screen.getByText("Criar vaga com IA")).toBeInTheDocument();
    });

    it("stepper exibe todas as 5 etapas", () => {
      renderPage();
      startDemo();
      const nav = screen.getByRole("navigation", { name: /Etapas da demo/i });
      for (const label of ["Vaga", "Candidatos", "Entrevistas", "Decisão", "Pré-admissão"]) {
        expect(nav).toHaveTextContent(label);
      }
    });

    it("textarea da descrição renderiza com placeholder correto", () => {
      renderPage();
      startDemo();
      const textarea = screen.getByRole("textbox", { name: /Descreva a vaga em linguagem simples/i });
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveAttribute("placeholder", expect.stringContaining("frentista"));
    });

    it("Preencher exemplo preenche o textarea", () => {
      renderPage();
      startDemo();
      fireEvent.click(screen.getByRole("button", { name: /Preencher exemplo/i }));
      const textarea = screen.getByRole("textbox", {
        name: /Descreva a vaga em linguagem simples/i,
      });
      expect((textarea as HTMLTextAreaElement).value).toContain("frentista");
    });

    it("tentar gerar com campo vazio mostra mensagem de validação", () => {
      renderPage();
      startDemo();
      fireEvent.click(screen.getByRole("button", { name: /Gerar vaga com IA/i }));
      expect(screen.getByRole("alert")).toHaveTextContent(/Descreva a vaga antes de gerar/i);
    });

    it("não mostra erro de validação inicialmente", () => {
      renderPage();
      startDemo();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  // ── Geração de vaga ──────────────────────────────────────────────────────

  describe("geração de vaga com IA simulada", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("Gerar vaga com IA mostra loading enquanto processa", async () => {
      renderPage();
      startDemo();
      fireEvent.click(screen.getByRole("button", { name: /Preencher exemplo/i }));
      fireEvent.click(screen.getByRole("button", { name: /Gerar vaga com IA/i }));
      expect(screen.getByText(/Gerando vaga/i)).toBeInTheDocument();
    });

    it("após o loading exibe o resultado com título Frentista", async () => {
      renderPage();
      startDemo();
      await gerarVaga();
      expect(screen.getByText("Frentista")).toBeInTheDocument();
    });

    it("resultado exibe responsabilidades e requisitos", async () => {
      renderPage();
      startDemo();
      await gerarVaga();
      expect(screen.getByText(/Atender clientes com cordialidade/i)).toBeInTheDocument();
      expect(screen.getByText(/Ensino médio completo/i)).toBeInTheDocument();
    });

    it("resultado exibe perguntas de triagem", async () => {
      renderPage();
      startDemo();
      await gerarVaga();
      expect(
        screen.getByText(/Você tem disponibilidade para escala 12x36/i),
      ).toBeInTheDocument();
    });

    it("resultado exibe botão Usar esta vaga", async () => {
      renderPage();
      startDemo();
      await gerarVaga();
      expect(screen.getByRole("button", { name: /Usar esta vaga/i })).toBeInTheDocument();
    });
  });

  // ── Etapa Candidatos ──────────────────────────────────────────────────────

  describe("etapa Candidatos", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("avança para candidatos após Usar esta vaga", async () => {
      await irParaCandidatos();
      expect(screen.getByText(/Candidatos recebidos/i)).toBeInTheDocument();
    });

    it("Carregar candidatos exemplo cria 5 candidatos na tabela", async () => {
      await irParaCandidatos();
      fireEvent.click(screen.getByRole("button", { name: /Carregar candidatos exemplo/i }));
      expect(screen.getByText("Ana Souza")).toBeInTheDocument();
      expect(screen.getByText("Carla Mendes")).toBeInTheDocument();
      expect(screen.getByText("João Lima")).toBeInTheDocument();
      expect(screen.getByText("Pedro Alves")).toBeInTheDocument();
      expect(screen.getByText("Marina Rocha")).toBeInTheDocument();
    });

    it("antes da análise, todos os candidatos mostram Aguardando análise", async () => {
      await irParaCandidatos();
      fireEvent.click(screen.getByRole("button", { name: /Carregar candidatos exemplo/i }));
      expect(screen.getAllByText("Aguardando análise")).toHaveLength(5);
    });

    it("antes da análise, coluna aderência não exibe valores por testid", async () => {
      await irParaCandidatos();
      fireEvent.click(screen.getByRole("button", { name: /Carregar candidatos exemplo/i }));
      expect(screen.queryByTestId("aderencia-c1")).not.toBeInTheDocument();
    });

    it("botão Analisar com IA fica desabilitado quando não há candidatos", async () => {
      await irParaCandidatos();
      expect(screen.getByRole("button", { name: /Analisar com IA/i })).toBeDisabled();
    });

    it("botão Carregar candidatos exemplo fica desabilitado após carregar", async () => {
      await irParaCandidatos();
      fireEvent.click(screen.getByRole("button", { name: /Carregar candidatos exemplo/i }));
      expect(
        screen.getByRole("button", { name: /Carregar candidatos exemplo/i }),
      ).toBeDisabled();
    });

    it("Analisar com IA mostra loading enquanto processa", async () => {
      await irParaCandidatos();
      fireEvent.click(screen.getByRole("button", { name: /Carregar candidatos exemplo/i }));
      fireEvent.click(screen.getByRole("button", { name: /Analisar com IA/i }));
      expect(screen.getByText(/Analisando/i)).toBeInTheDocument();
    });

    it("Analisar com IA preenche aderência de todos os candidatos", async () => {
      await carregarEAnalisar();
      expect(screen.getByTestId("aderencia-c2")).toHaveTextContent("91%");
      expect(screen.getByTestId("aderencia-c1")).toHaveTextContent("82%");
      expect(screen.getByTestId("aderencia-c5")).toHaveTextContent("76%");
      expect(screen.getByTestId("aderencia-c3")).toHaveTextContent("64%");
      expect(screen.getByTestId("aderencia-c4")).toHaveTextContent("42%");
    });

    it("após análise, status muda para Analisado", async () => {
      await carregarEAnalisar();
      expect(screen.getByTestId("status-c1")).toHaveTextContent("Analisado");
      expect(screen.getByTestId("status-c2")).toHaveTextContent("Analisado");
    });

    it("tabela ordena por aderência decrescente após análise (Carla 91% primeiro)", async () => {
      await carregarEAnalisar();
      const rows = screen.getAllByRole("row");
      // rows[0] = header, rows[1] = primeiro candidato (Carla, 91%)
      expect(rows[1]).toHaveTextContent("Carla Mendes");
      expect(rows[1]).toHaveTextContent("91%");
    });

    it("segundo da tabela é Ana (82%) após ordenação", async () => {
      await carregarEAnalisar();
      const rows = screen.getAllByRole("row");
      expect(rows[2]).toHaveTextContent("Ana Souza");
      expect(rows[2]).toHaveTextContent("82%");
    });

    // ── Ver análise ──────────────────────────────────────────────────────────

    it("Ver análise abre painel com nome e aderência do candidato", async () => {
      await carregarEAnalisar();
      fireEvent.click(screen.getByRole("button", { name: /Ver análise de Ana Souza/i }));
      const panel = screen.getByTestId("detail-panel");
      expect(panel).toBeInTheDocument();
      expect(panel).toHaveTextContent("Ana Souza");
      expect(panel).toHaveTextContent("82%");
    });

    it("painel de análise exibe pontos fortes e de atenção", async () => {
      await carregarEAnalisar();
      fireEvent.click(screen.getByRole("button", { name: /Ver análise de Carla Mendes/i }));
      const panel = screen.getByTestId("detail-panel");
      expect(
        within(panel).getByText(/Experiência direta em posto de combustível/i),
      ).toBeInTheDocument();
      expect(
        within(panel).getByText(/Confirmar disponibilidade de escala 12x36/i),
      ).toBeInTheDocument();
    });

    it("fechar painel remove o detail-panel", async () => {
      await carregarEAnalisar();
      fireEvent.click(screen.getByRole("button", { name: /Ver análise de Ana Souza/i }));
      expect(screen.getByTestId("detail-panel")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Fechar painel/i }));
      expect(screen.queryByTestId("detail-panel")).not.toBeInTheDocument();
    });

    it("painel mostra aviso demonstrativo", async () => {
      await carregarEAnalisar();
      fireEvent.click(screen.getByRole("button", { name: /Ver análise de Ana Souza/i }));
      expect(screen.getByText(/Resultado demonstrativo/i)).toBeInTheDocument();
    });

    // ── Marcar entrevista ────────────────────────────────────────────────────

    it("Marcar entrevista exibe o formulário de entrevista", async () => {
      await carregarEAnalisar();
      fireEvent.click(screen.getByRole("button", { name: /Marcar entrevista com Ana Souza/i }));
      expect(screen.getByTestId("interview-form")).toBeInTheDocument();
    });

    it("formulário de entrevista valida campos obrigatórios", async () => {
      await carregarEAnalisar();
      fireEvent.click(screen.getByRole("button", { name: /Marcar entrevista com Ana Souza/i }));
      fireEvent.click(screen.getByRole("button", { name: /Confirmar entrevista/i }));
      expect(screen.getByRole("alert")).toHaveTextContent(/obrigatória/i);
    });

    it("confirmar entrevista muda status do candidato para Entrevista marcada", async () => {
      await carregarEAnalisar();
      fireEvent.click(screen.getByRole("button", { name: /Marcar entrevista com Ana Souza/i }));
      confirmarEntrevista();
      expect(screen.getByTestId("status-c1")).toHaveTextContent("Entrevista marcada");
    });

    it("após confirmar entrevista, formulário desaparece", async () => {
      await carregarEAnalisar();
      fireEvent.click(screen.getByRole("button", { name: /Marcar entrevista com Ana Souza/i }));
      confirmarEntrevista();
      expect(screen.queryByTestId("interview-form")).not.toBeInTheDocument();
    });

    // ── Reprovar ─────────────────────────────────────────────────────────────

    it("Reprovar muda status do candidato para Reprovado", async () => {
      await carregarEAnalisar();
      fireEvent.click(screen.getByRole("button", { name: /Reprovar Ana Souza/i }));
      expect(screen.getByTestId("status-c1")).toHaveTextContent("Reprovado");
    });

    it("candidato reprovado não exibe mais o botão Reprovar", async () => {
      await carregarEAnalisar();
      fireEvent.click(screen.getByRole("button", { name: /Reprovar Ana Souza/i }));
      expect(
        screen.queryByRole("button", { name: /Reprovar Ana Souza/i }),
      ).not.toBeInTheDocument();
    });

    // ── Copiar WhatsApp ──────────────────────────────────────────────────────

    it("Copiar WhatsApp gera mensagem com nome do candidato e título da vaga", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      await irParaCandidatos();
      fireEvent.click(screen.getByRole("button", { name: /Carregar candidatos exemplo/i }));

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Copiar WhatsApp de Ana Souza/i }));
      });

      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Ana Souza"));
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Frentista"));
    });

    it("após copiar WhatsApp, botão mostra Copiado", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      await irParaCandidatos();
      fireEvent.click(screen.getByRole("button", { name: /Carregar candidatos exemplo/i }));

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Copiar WhatsApp de Ana Souza/i }));
      });

      expect(
        screen.getByRole("button", { name: /Copiar WhatsApp de Ana Souza/i }),
      ).toHaveTextContent("Copiado");
    });

    // ── Adicionar candidato manual ────────────────────────────────────────────

    it("Adicionar candidato manual exibe o formulário", async () => {
      await irParaCandidatos();
      fireEvent.click(screen.getByRole("button", { name: /Adicionar candidato manual/i }));
      expect(screen.getByTestId("add-candidate-form")).toBeInTheDocument();
    });

    it("formulário manual valida nome obrigatório", async () => {
      await irParaCandidatos();
      fireEvent.click(screen.getByRole("button", { name: /Adicionar candidato manual/i }));
      fireEvent.click(screen.getByRole("button", { name: "Adicionar candidato" }));
      expect(screen.getByRole("alert")).toHaveTextContent(/Nome é obrigatório/i);
    });

    it("adicionar candidato manual com dados válidos cria novo candidato na tabela", async () => {
      await irParaCandidatos();
      fireEvent.click(screen.getByRole("button", { name: /Adicionar candidato manual/i }));

      fireEvent.change(screen.getByLabelText("Nome"), {
        target: { value: "Carlos Teste" },
      });
      fireEvent.change(screen.getByLabelText("Telefone"), {
        target: { value: "(62) 91111-2222" },
      });
      fireEvent.change(screen.getByLabelText("E-mail"), {
        target: { value: "carlos@teste.com" },
      });
      fireEvent.change(screen.getByLabelText(/Resumo do currículo/i), {
        target: { value: "Experiência em atendimento." },
      });
      fireEvent.click(screen.getByRole("button", { name: "Adicionar candidato" }));

      expect(screen.getByText("Carlos Teste")).toBeInTheDocument();
    });

    it("após adicionar candidato manualmente, formulário fecha", async () => {
      await irParaCandidatos();
      fireEvent.click(screen.getByRole("button", { name: /Adicionar candidato manual/i }));

      fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Carlos" } });
      fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "62999" } });
      fireEvent.change(screen.getByLabelText("E-mail"), {
        target: { value: "carlos@teste.com" },
      });
      fireEvent.change(screen.getByLabelText(/Resumo do currículo/i), {
        target: { value: "Texto qualquer." },
      });
      fireEvent.click(screen.getByRole("button", { name: "Adicionar candidato" }));

      expect(screen.queryByTestId("add-candidate-form")).not.toBeInTheDocument();
    });

    // ── Ir para decisão ──────────────────────────────────────────────────────

    it("botão Ir para decisão avança para etapa Decisão", async () => {
      await irParaCandidatos();
      fireEvent.click(screen.getByRole("button", { name: /Carregar candidatos exemplo/i }));
      fireEvent.click(screen.getByRole("button", { name: /Ir para decisão/i }));
      expect(screen.getByTestId("decisao-step")).toBeInTheDocument();
    });
  });

  // ── Sidebar multi-candidato ──────────────────────────────────────────────

  describe("sidebar com múltiplos candidatos", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("sidebar mostra Nenhuma vaga criada antes de usar a vaga", () => {
      renderPage();
      startDemo();
      expect(screen.getByTestId("sidebar-vaga")).toHaveTextContent("Nenhuma vaga criada");
    });

    it("sidebar mostra status Criando vaga no início", () => {
      renderPage();
      startDemo();
      expect(screen.getByTestId("sidebar-status")).toHaveTextContent("Criando vaga");
    });

    it("sidebar mostra Frentista como vaga após usar vaga", async () => {
      await irParaCandidatos();
      expect(screen.getByTestId("sidebar-vaga")).toHaveTextContent("Frentista");
    });

    it("sidebar mostra total 0 antes de carregar candidatos", async () => {
      await irParaCandidatos();
      expect(screen.getByTestId("sidebar-total")).toHaveTextContent("0");
    });

    it("sidebar mostra total 5 após carregar exemplos", async () => {
      await irParaCandidatos();
      fireEvent.click(screen.getByRole("button", { name: /Carregar candidatos exemplo/i }));
      expect(screen.getByTestId("sidebar-total")).toHaveTextContent("5");
    });

    it("sidebar mostra analisados 5 após análise com IA", async () => {
      await carregarEAnalisar();
      expect(screen.getByTestId("sidebar-analisados")).toHaveTextContent("5");
    });

    it("sidebar mostra recomendados 2 (Ana e Carla têm recomendação Avançar)", async () => {
      await carregarEAnalisar();
      expect(screen.getByTestId("sidebar-recomendados")).toHaveTextContent("2");
    });

    it("sidebar mostra entrevistas marcadas 1 após confirmar uma entrevista", async () => {
      await carregarEAnalisar();
      fireEvent.click(screen.getByRole("button", { name: /Marcar entrevista com Ana Souza/i }));
      confirmarEntrevista();
      expect(screen.getByTestId("sidebar-entrevistas")).toHaveTextContent("1");
    });
  });

  // ── Resumo lateral (estados iniciais) ────────────────────────────────────

  describe("resumo lateral antes de usar vaga", () => {
    it("mostra Nenhuma vaga criada quando demo iniciada mas vaga não usada", () => {
      renderPage();
      startDemo();
      expect(screen.getByTestId("sidebar-vaga")).toHaveTextContent("Nenhuma vaga criada");
    });

    it("mostra status Criando vaga antes de usar", () => {
      renderPage();
      startDemo();
      expect(screen.getByTestId("sidebar-status")).toHaveTextContent("Criando vaga");
    });
  });
});
