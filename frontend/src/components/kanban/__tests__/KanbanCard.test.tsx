import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KanbanCard } from "../KanbanCard";
import type { JobCandidate } from "../../../types/domain";
import "@testing-library/jest-dom";

describe("KanbanCard", () => {
  const mockCandidate = {
    candidate_id: "1",
    candidate_name: "Lecino Lucas",
    job_fit_score: 97,
    top_skills: ["React", "TypeScript"],
  } as JobCandidate;

  it("deve renderizar o badge 'Mais aderente' quando isTopMatch for true", () => {
    render(
      <KanbanCard
        candidate={mockCandidate}
        isSaving={false}
        enterDelay={0}
        isTopMatch={true}
      />
    );

    expect(screen.getByText("Mais aderente")).toBeInTheDocument();
  });

  it("não deve renderizar o badge 'Mais aderente' quando isTopMatch for false", () => {
    render(
      <KanbanCard
        candidate={mockCandidate}
        isSaving={false}
        enterDelay={0}
        isTopMatch={false}
      />
    );

    expect(screen.queryByText("Mais aderente")).not.toBeInTheDocument();
  });

  it("deve renderizar o número do ranking para os top 3", () => {
    render(
      <KanbanCard
        candidate={mockCandidate}
        isSaving={false}
        enterDelay={0}
        rank={1}
      />
    );

    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("mostra IA na fila quando ai_status é pending", () => {
    render(
      <KanbanCard
        candidate={{ ...mockCandidate, ai_status: "pending", job_fit_score: null }}
        isSaving={false}
        enterDelay={0}
      />
    );

    expect(screen.getByTestId("kanban-ai-status-badge")).toHaveTextContent("IA na fila");
    expect(screen.getByText("Aguardando IA")).toBeInTheDocument();
  });

  it("mostra IA analisando quando ai_status é processing", () => {
    render(
      <KanbanCard
        candidate={{ ...mockCandidate, ai_status: "processing", job_fit_score: null }}
        isSaving={false}
        enterDelay={0}
      />
    );

    expect(screen.getByTestId("kanban-ai-status-badge")).toHaveTextContent("IA analisando");
    expect(screen.getByText("Aguardando IA")).toBeInTheDocument();
  });
});
