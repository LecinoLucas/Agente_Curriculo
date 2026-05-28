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

    // O card top match tem a classe border border-[#C1121F]/20
    const topMatchCards = screen.getAllByTestId(/kanban-card-/).filter(
      (card) => card.className.includes("border-[#C1121F]/20")
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
      (card) => card.className.includes("border-[#C1121F]/20")
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
      (card) => card.className.includes("border-[#C1121F]/20")
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
});
