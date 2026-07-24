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
    it("renderiza score em destaque quando job_fit_score é 97", () => {
      render(
        <KanbanCard candidate={candidate({ job_fit_score: 97 })} isSaving={false} enterDelay={0} />,
      );
      expect(screen.getByText("97%")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-card-score")).toHaveTextContent("aderência");
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

    it("quando não há score, não inventa porcentagem", () => {
      render(
        <KanbanCard
          candidate={candidate({ job_fit_score: null, ai_status: "completed" })}
          isSaving={false}
          enterDelay={0}
        />,
      );

      expect(screen.queryByTestId("kanban-card-score")).not.toBeInTheDocument();
      expect(screen.getByTestId("kanban-card-score-empty")).toHaveTextContent(/sem score/i);
      expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
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

    it("não renderiza affordance de menu sem ação no rodapé do card", () => {
      render(
        <KanbanCard
          candidate={candidate({ ai_status: "completed", job_fit_score: 88, stage: "entry" })}
          isSaving={false}
          enterDelay={0}
        />,
      );

      expect(screen.queryByText("...")).not.toBeInTheDocument();
    });
  });

  describe("densidade e leitura rápida", () => {
    it("mostra no máximo 2 skills e agrega o restante com +N", () => {
      render(
        <KanbanCard
          candidate={candidate({
            job_fit_score: 88,
            top_skills: ["React", "TypeScript", "SQL", "Node.js"],
          })}
          isSaving={false}
          enterDelay={0}
        />,
      );

      expect(screen.getByTestId("kanban-card-skills")).toHaveTextContent("React · TypeScript +2");
      expect(screen.queryByText("SQL")).not.toBeInTheDocument();
      expect(screen.queryByText("Node.js")).not.toBeInTheDocument();
    });

    it("sem skills não cria linha vazia de skills", () => {
      render(
        <KanbanCard
          candidate={candidate({ job_fit_score: 88, top_skills: [] })}
          isSaving={false}
          enterDelay={0}
        />,
      );

      expect(screen.queryByTestId("kanban-card-skills")).not.toBeInTheDocument();
    });

    it("mostra o tempo na etapa quando entered_at existe", () => {
      const enteredAt = new Date();
      enteredAt.setDate(enteredAt.getDate() - 3);

      render(
        <KanbanCard
          candidate={candidate({ job_fit_score: 88, entered_at: enteredAt.toISOString() })}
          isSaving={false}
          enterDelay={0}
        />,
      );

      expect(screen.getByTestId("kanban-card-progress")).toHaveTextContent("Há 3 dias na etapa");
    });

    it("formata entrevista agendada como próxima ação real", () => {
      const interview = new Date();
      interview.setDate(interview.getDate() + 2);
      interview.setHours(14, 30, 0, 0);
      const expectedDate = interview.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
      const expectedTime = interview.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      render(
        <KanbanCard
          candidate={candidate({
            job_fit_score: 88,
            interview_scheduled_start: interview.toISOString(),
          })}
          isSaving={false}
          enterDelay={0}
        />,
      );

      expect(screen.getByTestId("kanban-card-next-action")).toHaveTextContent(
        `${expectedDate}, ${expectedTime}`,
      );
    });

    it("mantém apenas uma pendência principal visível", () => {
      render(
        <KanbanCard
          candidate={candidate({
            job_fit_score: null,
            ai_status: null,
            requires_behavioral_assessment: true,
            behavioral_assessment_status: "not_started",
            requires_interview: true,
            interview_status: "pending",
          })}
          isSaving={false}
          enterDelay={0}
        />,
      );

      expect(screen.getAllByTestId("kanban-card-primary-badge")).toHaveLength(1);
    });
  });

  describe("identidade visual do avatar", () => {
    it("usa o mesmo estilo de avatar independente do nome do candidato", () => {
      const names = ["Ana Beatriz", "Zeca Roberto", "Maria Clara", "João Pedro", "Carlos Eduardo"];

      const classNames = names.map((name) => {
        const { container, unmount } = render(
          <KanbanCard candidate={candidate({ candidate_name: name })} isSaving={false} enterDelay={0} />,
        );
        const className = container.querySelector(".pipeline-candidate-card__avatar")?.className;
        unmount();
        return className;
      });

      expect(new Set(classNames).size).toBe(1);
      expect(classNames[0]).toContain("hsl(var(--primary)");
    });
  });
});
