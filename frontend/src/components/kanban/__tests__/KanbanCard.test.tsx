import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KanbanCard } from "../KanbanCard";
import type { JobCandidate } from "../../../types/domain";
import "@testing-library/jest-dom";

describe("KanbanCard", () => {
  function candidate(overrides: Partial<JobCandidate> & Record<string, unknown> = {}): JobCandidate {
    return {
      candidate_id: "1",
      candidate_name: "Lecino Lucas",
      job_fit_score: null,
      ai_status: "completed",
      stage: "entry",
      ...overrides,
    } as JobCandidate;
  }

  describe("badge de score", () => {
    it("renderiza '97%' quando job_fit_score é 97", () => {
      render(
        <KanbanCard candidate={candidate({ job_fit_score: 97 })} isSaving={false} enterDelay={0} />,
      );
      expect(screen.getByText("97%")).toBeInTheDocument();
    });

    it("renderiza estado de IA na fila quando ai_status é pending e não há score", () => {
      render(
        <KanbanCard
          candidate={candidate({ job_fit_score: null, ai_status: "pending" })}
          isSaving={false}
          enterDelay={0}
        />,
      );
      expect(screen.getAllByText("IA na fila").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("IA pendente")).toBeInTheDocument();
    });
  });

  describe("badges operacionais de IA", () => {
    it("renderiza badge 'IA pendente' quando ai_status é null", () => {
      render(
        <KanbanCard
          candidate={candidate({ ai_status: null, job_fit_score: null })}
          isSaving={false}
          enterDelay={0}
        />,
      );
      expect(screen.getByText("IA pendente")).toBeInTheDocument();
    });

    it("renderiza badge 'Análise em andamento' quando ai_status é processing", () => {
      render(
        <KanbanCard
          candidate={candidate({ ai_status: "processing", job_fit_score: null })}
          isSaving={false}
          enterDelay={0}
        />,
      );
      expect(screen.getByText("Análise em andamento")).toBeInTheDocument();
    });

    it("renderiza badge 'Aguardando extração' quando ai_status é waiting_extraction", () => {
      render(
        <KanbanCard
          candidate={candidate({ ai_status: "waiting_extraction", job_fit_score: null })}
          isSaving={false}
          enterDelay={0}
        />,
      );
      expect(screen.getAllByText("Aguardando extração").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("badges de admissão", () => {
    it("renderiza 'Iniciar admissão' quando stage é hired", () => {
      render(
        <KanbanCard
          candidate={candidate({ stage: "hired", job_fit_score: 88 })}
          isSaving={false}
          enterDelay={0}
        />,
      );
      expect(screen.getByText("Iniciar admissão")).toBeInTheDocument();
    });

    it("renderiza 'Pré-admissão pendente' quando stage é pre_admission", () => {
      render(
        <KanbanCard
          candidate={candidate({ stage: "pre_admission", job_fit_score: 88 })}
          isSaving={false}
          enterDelay={0}
        />,
      );
      expect(screen.getByText("Pré-admissão pendente")).toBeInTheDocument();
    });

    it("renderiza 'ERP pendente' quando stage é protheus", () => {
      render(
        <KanbanCard
          candidate={candidate({ stage: "protheus", job_fit_score: 88 })}
          isSaving={false}
          enterDelay={0}
        />,
      );
      expect(screen.getByText("ERP pendente")).toBeInTheDocument();
    });

    it("não renderiza badge de admissão para stage admitted", () => {
      render(
        <KanbanCard
          candidate={candidate({ stage: "admitted", job_fit_score: 88 })}
          isSaving={false}
          enterDelay={0}
        />,
      );
      expect(screen.queryByText("Iniciar admissão")).not.toBeInTheDocument();
      expect(screen.queryByText("Pré-admissão pendente")).not.toBeInTheDocument();
      expect(screen.queryByText("ERP pendente")).not.toBeInTheDocument();
    });
  });

  describe("sem badges operacionais", () => {
    it("não renderiza badges operacionais quando o candidato não tem pendência", () => {
      render(
        <KanbanCard
          candidate={candidate({ ai_status: "completed", job_fit_score: 88, stage: "entry" })}
          isSaving={false}
          enterDelay={0}
        />,
      );
      expect(screen.queryByText("IA pendente")).not.toBeInTheDocument();
      expect(screen.queryByText("Iniciar admissão")).not.toBeInTheDocument();
      expect(screen.queryByText("Análise em andamento")).not.toBeInTheDocument();
    });
  });
});
