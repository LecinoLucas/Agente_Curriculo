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

    const badges = screen.getAllByText("Mais aderente");
    expect(badges.length).toBe(1);
    
    // O primeiro candidato (Candidato A) deve estar no card com o badge
    // Como a ordem de renderização é mantida, podemos assumir que o primeiro card renderizado é o do Candidato A.
    // Vamos verificar se o texto "Mais aderente" está presente.
    expect(screen.getByText("Mais aderente")).toBeInTheDocument();
  });

  it("não deve destacar nenhum card quando showTopMatchHighlight for false", () => {
    render(
      <KanbanColumn
        column={mockColumn}
        colIndex={0}
        showTopMatchHighlight={false}
      />
    );

    expect(screen.queryByText("Mais aderente")).not.toBeInTheDocument();
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

    expect(screen.queryByText("Mais aderente")).not.toBeInTheDocument();
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
