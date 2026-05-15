import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MoreActionsMenu } from "../MoreActionsMenu";

describe("MoreActionsMenu", () => {
  it("não renderiza quando não há ações visíveis", () => {
    render(
      <MoreActionsMenu
        currentStage="entry"
        hasActiveJob={false}
        canTransferCurrentJob={false}
      />
    );

    expect(screen.queryByLabelText("Mais ações")).not.toBeInTheDocument();
  });

  it("renderiza o botão de menu quando há ações visíveis", () => {
    render(
      <MoreActionsMenu
        currentStage="entry"
        hasActiveJob={true}
        canTransferCurrentJob={false}
        onEditCandidate={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Mais ações")).toBeInTheDocument();
  });

  it("abre e fecha o menu ao clicar no botão", async () => {
    const user = userEvent.setup();

    render(
      <MoreActionsMenu
        currentStage="entry"
        hasActiveJob={true}
        canTransferCurrentJob={false}
        onEditCandidate={vi.fn()}
      />
    );

    const button = screen.getByLabelText("Mais ações");

    // Menu deve estar fechado inicialmente
    expect(screen.queryByText("Editar candidato")).not.toBeInTheDocument();

    // Abre o menu
    await user.click(button);
    expect(screen.getByText("Editar candidato")).toBeInTheDocument();

    // Fecha o menu
    await user.click(button);
    expect(screen.queryByText("Editar candidato")).not.toBeInTheDocument();
  });

  it("exibe ações secundárias quando há vaga ativa", async () => {
    const user = userEvent.setup();

    render(
      <MoreActionsMenu
        currentStage="entry"
        hasActiveJob={true}
        canTransferCurrentJob={false}
        onEditCandidate={vi.fn()}
        onOpenDocuments={vi.fn()}
        onStartAnalysis={vi.fn()}
      />
    );

    await user.click(screen.getByLabelText("Mais ações"));

    expect(screen.getByText("Editar candidato")).toBeInTheDocument();
    expect(screen.getByText("Currículos")).toBeInTheDocument();
    expect(screen.getByText("Iniciar/Acompanhar análise")).toBeInTheDocument();
  });

  it("mostra opção de transferência quando pode transferir", async () => {
    const user = userEvent.setup();

    render(
      <MoreActionsMenu
        currentStage="screening"
        hasActiveJob={true}
        canTransferCurrentJob={true}
        onOpenTransferJob={vi.fn()}
      />
    );

    await user.click(screen.getByLabelText("Mais ações"));
    expect(screen.getByText("Transferir para outra vaga")).toBeInTheDocument();
  });

  it("chama handler ao clicar em ação", async () => {
    const user = userEvent.setup();
    const onEditCandidate = vi.fn();

    render(
      <MoreActionsMenu
        currentStage="entry"
        hasActiveJob={true}
        canTransferCurrentJob={false}
        onEditCandidate={onEditCandidate}
      />
    );

    await user.click(screen.getByLabelText("Mais ações"));
    await user.click(screen.getByText("Editar candidato"));

    expect(onEditCandidate).toHaveBeenCalledTimes(1);
  });

  it("mostra 'Vincular nova vaga' apenas quando não há vaga ativa", async () => {
    const user = userEvent.setup();

    render(
      <MoreActionsMenu
        currentStage="entry"
        hasActiveJob={false}
        canTransferCurrentJob={false}
        onLinkJob={vi.fn()}
        onEditCandidate={vi.fn()}
      />
    );

    await user.click(screen.getByLabelText("Mais ações"));
    expect(screen.getByText("Vincular nova vaga")).toBeInTheDocument();
  });

  it("fecha o menu ao clicar fora", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <MoreActionsMenu
          currentStage="entry"
          hasActiveJob={true}
          canTransferCurrentJob={false}
          onEditCandidate={vi.fn()}
        />
        <button>Outside Button</button>
      </div>
    );

    await user.click(screen.getByLabelText("Mais ações"));
    expect(screen.getByText("Editar candidato")).toBeInTheDocument();

    await user.click(screen.getByText("Outside Button"));
    expect(screen.queryByText("Editar candidato")).not.toBeInTheDocument();
  });
});
