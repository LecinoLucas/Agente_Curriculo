import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CandidateBehavioralAssessmentPanel } from "../CandidateBehavioralAssessmentPanel";
import * as behavioralService from "../../../../../services/behavioralAssessmentService";

vi.mock("../../../../../services/behavioralAssessmentService");

describe("CandidateBehavioralAssessmentPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", async () => {
    vi.mocked(behavioralService.getCandidateBehavioralAssessment).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );

    const { container } = render(<CandidateBehavioralAssessmentPanel jobId="job-1" candidateId="candidate-1" />);

    // Check for the spinner loader SVG
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows empty state when no assessment exists", async () => {
    vi.mocked(behavioralService.getCandidateBehavioralAssessment).mockResolvedValue(null);

    render(<CandidateBehavioralAssessmentPanel jobId="job-1" candidateId="candidate-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Esta vaga não possui avaliação comportamental/i)).toBeInTheDocument();
    });
  });

  it("shows error message on service failure", async () => {
    vi.mocked(behavioralService.getCandidateBehavioralAssessment).mockRejectedValue(
      new Error("API Error")
    );

    render(<CandidateBehavioralAssessmentPanel jobId="job-1" candidateId="candidate-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Erro ao carregar avaliação comportamental/i)).toBeInTheDocument();
    });
  });

  it("displays pending assessment status", async () => {
    const mockAssessment = {
      id: "assessment-1",
      candidate_id: "candidate-1",
      job_id: "job-1",
      template_id: "template-1",
      template_name: "Behavioral Test",
      job_title: "Engineer",
      status: "pending" as const,
      assigned_at: "2026-05-01T10:00:00Z",
      started_at: null,
      submitted_at: null,
      expires_at: "2026-05-15T10:00:00Z",
      answered_count: 0,
      question_count: 5,
      competencies: [],
    };

    vi.mocked(behavioralService.getCandidateBehavioralAssessment).mockResolvedValue(
      mockAssessment
    );

    render(<CandidateBehavioralAssessmentPanel jobId="job-1" candidateId="candidate-1" />);

    await waitFor(() => {
      expect(screen.getByText("Behavioral Test")).toBeInTheDocument();
      expect(screen.getByText(/Avaliação pendente/i)).toBeInTheDocument();
      expect(screen.getByText(/Aguardando resposta do candidato/i)).toBeInTheDocument();
    });
  });

  it("displays submitted assessment with competencies and answers", async () => {
    const mockAssessment = {
      id: "assessment-1",
      candidate_id: "candidate-1",
      job_id: "job-1",
      template_id: "template-1",
      template_name: "Behavioral Assessment",
      job_title: "Product Manager",
      status: "submitted" as const,
      assigned_at: "2026-05-01T10:00:00Z",
      started_at: "2026-05-02T09:00:00Z",
      submitted_at: "2026-05-03T14:30:00Z",
      expires_at: "2026-05-15T10:00:00Z",
      answered_count: 3,
      question_count: 3,
      competencies: [
        {
          id: "comp-1",
          name: "Leadership",
          description: "Leadership abilities",
          display_order: 0,
          questions: [
            {
              id: "q-1",
              question_text: "Describe your leadership style",
              answer_type: "text" as const,
              is_required: true,
              display_order: 0,
              options_json: null,
              answer: {
                answer_text: "I believe in collaborative leadership...",
                answer_value: null,
                selected_options_json: null,
                updated_at: "2026-05-03T14:20:00Z",
              },
            },
            {
              id: "q-2",
              question_text: "Rate your communication skills",
              answer_type: "scale" as const,
              is_required: true,
              display_order: 1,
              options_json: null,
              answer: {
                answer_text: null,
                answer_value: 8,
                selected_options_json: null,
                updated_at: "2026-05-03T14:25:00Z",
              },
            },
          ],
        },
        {
          id: "comp-2",
          name: "Problem Solving",
          description: null,
          display_order: 1,
          questions: [
            {
              id: "q-3",
              question_text: "Select relevant approaches",
              answer_type: "multiple_choice" as const,
              is_required: true,
              display_order: 0,
              options_json: ["Analytical", "Creative", "Systematic"],
              answer: {
                answer_text: null,
                answer_value: null,
                selected_options_json: ["Analytical", "Systematic"],
                updated_at: "2026-05-03T14:30:00Z",
              },
            },
          ],
        },
      ],
    };

    vi.mocked(behavioralService.getCandidateBehavioralAssessment).mockResolvedValue(
      mockAssessment
    );

    render(<CandidateBehavioralAssessmentPanel jobId="job-1" candidateId="candidate-1" />);

    await waitFor(() => {
      expect(screen.getByText("Behavioral Assessment")).toBeInTheDocument();
      // Check for status badge - there might be multiple "Enviada" matches
      const statusBadge = screen.getAllByText(/Enviada/i)[0];
      expect(statusBadge).toBeInTheDocument();
    });

    expect(screen.getByText("Leadership")).toBeInTheDocument();
    expect(screen.getByText("Problem Solving")).toBeInTheDocument();

    expect(screen.getByText("Describe your leadership style")).toBeInTheDocument();
    expect(screen.getByText(/I believe in collaborative leadership/i)).toBeInTheDocument();

    expect(screen.getByText("Rate your communication skills")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();

    expect(screen.getByText("Select relevant approaches")).toBeInTheDocument();
    expect(screen.getByText("✓ Analytical")).toBeInTheDocument();
    expect(screen.getByText("✓ Systematic")).toBeInTheDocument();
  });

  it("displays progress bar correctly", async () => {
    const mockAssessment = {
      id: "assessment-1",
      candidate_id: "candidate-1",
      job_id: "job-1",
      template_id: "template-1",
      template_name: "Test",
      job_title: "Engineer",
      status: "in_progress" as const,
      assigned_at: "2026-05-01T10:00:00Z",
      started_at: "2026-05-02T09:00:00Z",
      submitted_at: null,
      expires_at: "2026-05-15T10:00:00Z",
      answered_count: 3,
      question_count: 5,
      competencies: [],
    };

    vi.mocked(behavioralService.getCandidateBehavioralAssessment).mockResolvedValue(
      mockAssessment
    );

    render(<CandidateBehavioralAssessmentPanel jobId="job-1" candidateId="candidate-1" />);

    await waitFor(() => {
      expect(screen.getByText("3 de 5")).toBeInTheDocument();
    });
  });

  it("does not load if jobId is missing", async () => {
    vi.mocked(behavioralService.getCandidateBehavioralAssessment).mockResolvedValue(null);
    render(<CandidateBehavioralAssessmentPanel jobId={null} candidateId="candidate-1" />);

    await waitFor(() => {
      expect(vi.mocked(behavioralService.getCandidateBehavioralAssessment)).not.toHaveBeenCalled();
    });
  });

  it("does not load if candidateId is missing", async () => {
    vi.mocked(behavioralService.getCandidateBehavioralAssessment).mockResolvedValue(null);
    render(<CandidateBehavioralAssessmentPanel jobId="job-1" candidateId={null} />);

    await waitFor(() => {
      expect(vi.mocked(behavioralService.getCandidateBehavioralAssessment)).not.toHaveBeenCalled();
    });
  });

  it("calls service with correct parameters", async () => {
    vi.mocked(behavioralService.getCandidateBehavioralAssessment).mockResolvedValue(null);

    render(<CandidateBehavioralAssessmentPanel jobId="job-xyz" candidateId="candidate-abc" />);

    await waitFor(() => {
      expect(vi.mocked(behavioralService.getCandidateBehavioralAssessment)).toHaveBeenCalledWith(
        "job-xyz",
        "candidate-abc"
      );
    });
  });
});
