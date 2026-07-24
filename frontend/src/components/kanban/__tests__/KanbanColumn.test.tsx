import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KanbanColumn } from "../KanbanColumn";
import type { PipelineColumn } from "../../../types/domain";
import "@testing-library/jest-dom";

describe("KanbanColumn", () => {
  const mockColumn = {
    stage: "entry",
    label: "Entrada",
    candidates: [
      { candidate_id: "1", candidate_name: "Candidato A", job_fit_score: 90 },
      { candidate_id: "2", candidate_name: "Candidato B", job_fit_score: 80 },
    ],
  } as unknown as PipelineColumn;

  it("deve destacar apenas o primeiro card quando showTopMatchHighlight for true", () => {
    render(
      <KanbanColumn
        column={mockColumn}
        colIndex={0}
        showTopMatchHighlight={true}
      />
    );

    // O card top match tem a classe border ring-emerald-200
    const topMatchCards = screen.getAllByTestId(/kanban-card-/).filter(
      (card) => card.className.includes("ring-emerald-200")
    );
    expect(topMatchCards.length).toBe(1);
  });

  it("não deve destacar nenhum card quando showTopMatchHighlight for false", () => {
    render(
      <KanbanColumn
        column={mockColumn}
        colIndex={0}
        showTopMatchHighlight={false}
      />
    );

    const topMatchCards = screen.getAllByTestId(/kanban-card-/).filter(
      (card) => card.className.includes("ring-emerald-200")
    );
    expect(topMatchCards.length).toBe(0);
  });

  it("não deve destacar se o primeiro candidato não tiver score", () => {
    const columnNoScore = {
      stage: "entry",
      label: "Entrada",
      candidates: [
        { candidate_id: "1", candidate_name: "Candidato A", job_fit_score: null },
        { candidate_id: "2", candidate_name: "Candidato B", job_fit_score: 80 },
      ],
    } as unknown as PipelineColumn;

    render(
      <KanbanColumn
        column={columnNoScore}
        colIndex={0}
        showTopMatchHighlight={true}
      />
    );

    const topMatchCards = screen.getAllByTestId(/kanban-card-/).filter(
      (card) => card.className.includes("ring-emerald-200")
    );
    expect(topMatchCards.length).toBe(0);
  });

  it("permite arrastar cards e dropar na coluna", () => {
    const onCardDragStart = vi.fn();
    const onColumnDrop = vi.fn();
    const dataTransfer = {
      effectAllowed: "move",
      setData: vi.fn(),
      dropEffect: "move",
    };

    render(
      <KanbanColumn
        column={mockColumn}
        colIndex={0}
        draggableCards={true}
        draggingCandidateId="1"
        onCardDragStart={onCardDragStart}
        onColumnDrop={onColumnDrop}
      />
    );

    fireEvent.dragStart(screen.getByTestId("kanban-card-1"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("kanban-column-entry"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-entry"), { dataTransfer });

    expect(onCardDragStart).toHaveBeenCalled();
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "1");
    expect(onColumnDrop).toHaveBeenCalledWith("entry");
  });

  it("não usa mais cor de fundo por etapa no header da coluna (fica neutro)", () => {
    const column = { stage: "offer", macroId: "decisao", label: "Decisão", candidates: [] } as unknown as PipelineColumn;
    render(<KanbanColumn column={column} colIndex={0} />);

    const header = screen.getByText("Decisão").closest("div.pipeline-kanban-column__header");
    expect(header).not.toBeNull();
    expect(header!.className).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });

  it("contador de candidatos usa o mesmo estilo neutro em qualquer etapa", () => {
    const stages = [
      { stage: "entry", macroId: "entrada", label: "Entrada" },
      { stage: "offer", macroId: "decisao", label: "Decisão" },
    ] as const;

    const classNames = stages.map((s) => {
      const column = { ...s, candidates: [] } as unknown as PipelineColumn;
      const { getByTestId, unmount } = render(<KanbanColumn column={column} colIndex={0} />);
      const className = getByTestId("kanban-column-count").className;
      unmount();
      return className;
    });

    expect(classNames[0]).toBe(classNames[1]);
  });

  it("estado vazio usa círculo de ícone neutro em qualquer etapa", () => {
    const macroIds = ["entrada", "decisao"] as const;

    const classNames = macroIds.map((macroId) => {
      const column = { stage: macroId, macroId, label: macroId, candidates: [] } as unknown as PipelineColumn;
      const { container, unmount } = render(<KanbanColumn column={column} colIndex={0} />);
      const circle = container.querySelector(".pipeline-kanban-column__empty div[class*='rounded-full']");
      const className = circle?.className;
      unmount();
      return className;
    });

    expect(classNames[0]).toBe(classNames[1]);
  });
});
