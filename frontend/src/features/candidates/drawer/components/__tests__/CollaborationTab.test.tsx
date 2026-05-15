import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollaborationTab } from "../CollaborationTab";

const { mockListCollaboration, mockCreateComment, mockRequestManagerReview } = vi.hoisted(() => ({
  mockListCollaboration: vi.fn(),
  mockCreateComment: vi.fn(),
  mockRequestManagerReview: vi.fn(),
}));

vi.mock("../../../../../services/collaborationService", () => ({
  collaborationService: {
    listCollaboration: mockListCollaboration,
    createComment: mockCreateComment,
    requestManagerReview: mockRequestManagerReview,
  },
}));

// Mock Date.toLocaleDateString to work around jsdom limitation with timeStyle option
const originalToLocaleDateString = Date.prototype.toLocaleDateString;
Date.prototype.toLocaleDateString = function(locale?: string | string[], options?: any) {
  if (options?.timeStyle) {
    // Fallback to a simple format since jsdom doesn't support timeStyle
    return originalToLocaleDateString.call(this, locale, { dateStyle: "short" });
  }
  return originalToLocaleDateString.call(this, locale, options);
};

const mockComments = [
  {
    id: "comment-1",
    author_id: "recruiter-1",
    author_role: "recruiter",
    comment_type: "comment",
    recommendation: null,
    message: "Strong technical background",
    created_at: "2026-05-14T10:00:00Z",
  },
  {
    id: "comment-2",
    author_id: "manager-1",
    author_role: "manager",
    comment_type: "manager_feedback",
    recommendation: "advance",
    message: "Candidate aligns with our needs",
    created_at: "2026-05-14T11:00:00Z",
  },
];

describe("CollaborationTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", async () => {
    mockListCollaboration.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { container } = render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    // Check for the loader spinner (animate-spin class on SVG)
    const spinner = container.querySelector("[class*='animate-spin']");
    expect(spinner).toBeInTheDocument();
  });

  it("renders comments list after loading", async () => {
    mockListCollaboration.mockResolvedValue({
      comments: mockComments,
    });

    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await waitFor(() => {
      expect(screen.getByText("Strong technical background")).toBeInTheDocument();
    });

    expect(screen.getByText("Candidate aligns with our needs")).toBeInTheDocument();
  });

  it("displays comment metadata correctly", async () => {
    mockListCollaboration.mockResolvedValue({
      comments: [mockComments[0]],
    });

    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await waitFor(() => {
      expect(screen.getByText("Recrutador")).toBeInTheDocument();
    });

    // Look for the Comentário badge in the comment type area
    const comentarioTexts = screen.getAllByText("Comentário");
    expect(comentarioTexts.length).toBeGreaterThan(0);
  });

  it("displays recommendation when present", async () => {
    mockListCollaboration.mockResolvedValue({
      comments: [mockComments[1]],
    });

    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await waitFor(() => {
      expect(screen.getByText("Avançar")).toBeInTheDocument();
    });
  });

  it("shows empty state when no comments", async () => {
    mockListCollaboration.mockResolvedValue({
      comments: [],
    });

    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await waitFor(() => {
      expect(screen.getByText("Sem comentários de colaboração ainda")).toBeInTheDocument();
    });
  });

  it("submits comment when 'Comentário' button clicked", async () => {
    const user = userEvent.setup();
    const newComment = {
      id: "comment-3",
      author_id: "recruiter-1",
      author_role: "recruiter",
      comment_type: "comment",
      recommendation: null,
      message: "New comment",
      created_at: "2026-05-14T12:00:00Z",
    };

    mockListCollaboration.mockResolvedValue({
      comments: [],
    });
    mockCreateComment.mockResolvedValue(newComment);

    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    const textarea = await screen.findByPlaceholderText(
      /Adicione um comentário ou solicite revisão/
    );
    await user.type(textarea, "New comment");

    const buttons = screen.getAllByRole("button");
    const commentButton = buttons.find((b) => b.textContent.includes("Comentário"));

    if (commentButton) {
      fireEvent.click(commentButton);
    }

    await waitFor(() => {
      expect(mockCreateComment).toHaveBeenCalledWith("job-1", "cand-1", {
        message: "New comment",
        comment_type: "comment",
      });
    });
  });

  it("submits review request when 'Solicitar revisão' button clicked", async () => {
    const user = userEvent.setup();
    const reviewRequest = {
      id: "comment-3",
      author_id: "recruiter-1",
      author_role: "recruiter",
      comment_type: "review_request",
      recommendation: null,
      message: "Please review",
      created_at: "2026-05-14T12:00:00Z",
    };

    mockListCollaboration.mockResolvedValue({
      comments: [],
    });
    mockRequestManagerReview.mockResolvedValue(reviewRequest);

    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    const textarea = await screen.findByPlaceholderText(
      /Adicione um comentário ou solicite revisão/
    );
    await user.type(textarea, "Please review");

    const buttons = screen.getAllByRole("button");
    const reviewButton = buttons.find((b) => b.textContent.includes("Solicitar revisão"));

    if (reviewButton) {
      fireEvent.click(reviewButton);
    }

    await waitFor(() => {
      expect(mockRequestManagerReview).toHaveBeenCalledWith("job-1", "cand-1", {
        message: "Please review",
      });
    });
  });

  it("disables buttons when message is empty", async () => {
    mockListCollaboration.mockResolvedValue({
      comments: [],
    });

    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await screen.findByPlaceholderText(/Adicione um comentário ou solicite revisão/);

    const buttons = screen.getAllByRole("button");
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });

  it("shows error message on failure", async () => {
    mockListCollaboration.mockRejectedValue(
      new Error("Network error")
    );

    render(<CollaborationTab candidateId="cand-1" jobId="job-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar os comentários/)).toBeInTheDocument();
    });
  });
});
