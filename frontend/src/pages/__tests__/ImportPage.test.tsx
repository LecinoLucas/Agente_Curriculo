import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ExtractionStatus = "pending" | "processing" | "completed" | "failed";

type PollingOptions = {
  items: string[];
  enabled: boolean;
  intervalMs?: number;
  onItemUpdate?: (
    resumeId: string,
    status: {
      extraction_status: ExtractionStatus;
      extraction_error: string | null;
    },
  ) => void;
};

const {
  resumeServiceMock,
  useExtractionPollingMock,
  linkCandidateJobModalMock,
} = vi.hoisted(() => ({
  resumeServiceMock: {
    initiateUpload: vi.fn(),
    uploadPdf: vi.fn(),
  },
  useExtractionPollingMock: vi.fn(),
  linkCandidateJobModalMock: vi.fn(),
}));

vi.mock("../../services/resumeService", () => ({
  resumeService: resumeServiceMock,
}));

vi.mock("../../shared/hooks/useExtractionPolling", () => ({
  useExtractionPolling: useExtractionPollingMock,
}));

vi.mock("../../features/candidates/components/LinkCandidateJobModal", () => ({
  LinkCandidateJobModal: (props: {
    isOpen: boolean;
    candidateId: string | null;
    candidateName?: string | null;
    onClose: () => void;
  }) => {
    linkCandidateJobModalMock(props);
    return props.isOpen ? (
      <div data-testid="link-candidate-job-modal">
        Vincular {props.candidateName} ({props.candidateId})
      </div>
    ) : null;
  },
}));

import { ImportPage } from "../ImportPage";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

describe("ImportPage", () => {
  beforeEach(() => {
    resumeServiceMock.initiateUpload.mockReset();
    resumeServiceMock.uploadPdf.mockReset();
    useExtractionPollingMock.mockReset();
    linkCandidateJobModalMock.mockReset();
    useExtractionPollingMock.mockReturnValue({
      statuses: {},
      isPolling: false,
      hasPending: false,
      refresh: vi.fn(),
      stop: vi.fn(),
    });
  });

  it("usa o hook compartilhado e atualiza cada arquivo do lote independentemente", async () => {
    const user = userEvent.setup();
    let pollingOptions: PollingOptions | null = null;

    useExtractionPollingMock.mockImplementation((options: PollingOptions) => {
      pollingOptions = options;
      return {
        statuses: {},
        isPolling: Boolean(options.enabled),
        hasPending: Boolean(options.enabled),
        refresh: vi.fn(),
        stop: vi.fn(),
      };
    });

    resumeServiceMock.initiateUpload
      .mockResolvedValueOnce({ resume_id: "resume-1" })
      .mockResolvedValueOnce({ resume_id: "resume-2" });

    resumeServiceMock.uploadPdf
      .mockResolvedValueOnce({
        resume_id: "resume-1",
        candidate_id: "candidate-1",
        candidate_full_name: "Pessoa Um",
        version_id: "version-1",
        analysis_auto_requested: false,
        analysis_id: null,
        analysis_status: null,
        original_file_name: "cv-1.pdf",
        file_size_bytes: 123,
        file_hash_sha256: "hash-1",
        extraction_status: "pending",
        page_count: null,
        word_count: null,
        prefilled_fields: [],
      })
      .mockResolvedValueOnce({
        resume_id: "resume-2",
        candidate_id: "candidate-2",
        candidate_full_name: "Pessoa Dois",
        version_id: "version-2",
        analysis_auto_requested: false,
        analysis_id: null,
        analysis_status: null,
        original_file_name: "cv-2.pdf",
        file_size_bytes: 456,
        file_hash_sha256: "hash-2",
        extraction_status: "pending",
        page_count: null,
        word_count: null,
        prefilled_fields: [],
      });

    const { container } = render(
      <MemoryRouter future={routerFuture}>
        <ImportPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/não cria pipeline automaticamente/i)).toBeInTheDocument();
    expect(screen.queryByText("Aderência à Vaga")).not.toBeInTheDocument();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const fileOne = new File(["pdf-1"], "cv-1.pdf", { type: "application/pdf" });
    const fileTwo = new File(["pdf-2"], "cv-2.pdf", { type: "application/pdf" });

    await user.upload(input, [fileOne, fileTwo]);

    expect(await screen.findByText("cv-1.pdf")).toBeInTheDocument();
    expect(screen.getByText("cv-2.pdf")).toBeInTheDocument();
    expect(screen.getAllByText("Aguardando extração")).toHaveLength(2);
    expect(pollingOptions?.items).toEqual(["resume-1", "resume-2"]);
    expect(pollingOptions?.enabled).toBe(true);

    await act(async () => {
      pollingOptions?.onItemUpdate?.("resume-1", {
        extraction_status: "completed",
        extraction_error: null,
      });
    });

    const rowOne = screen.getByText("cv-1.pdf").closest("tr");
    const rowTwo = screen.getByText("cv-2.pdf").closest("tr");

    expect(rowOne).not.toBeNull();
    expect(rowTwo).not.toBeNull();

    expect(within(rowOne!).getByText("Extraído")).toBeInTheDocument();
    expect(within(rowOne!).getByRole("button", { name: "Adicionar a uma vaga" })).toBeInTheDocument();
    expect(within(rowTwo!).getByText("Aguardando extração")).toBeInTheDocument();
    expect(
      within(rowTwo!).queryByRole("button", { name: "Adicionar a uma vaga" }),
    ).not.toBeInTheDocument();

    await act(async () => {
      pollingOptions?.onItemUpdate?.("resume-2", {
        extraction_status: "failed",
        extraction_error: "Falha no OCR",
      });
    });

    expect(within(rowTwo!).getByText("Falha na extração")).toBeInTheDocument();
    expect(within(rowTwo!).getByText("Falha no OCR")).toBeInTheDocument();
    expect(
      within(rowTwo!).getByRole("button", { name: "Reprocessar extração" }),
    ).toBeDisabled();
    expect(screen.queryByText("Match da vaga ativa")).not.toBeInTheDocument();
  });

  it("abre o vínculo manual só para itens completed e não cria pipeline automaticamente", async () => {
    const user = userEvent.setup();
    let pollingOptions: PollingOptions | null = null;

    useExtractionPollingMock.mockImplementation((options: PollingOptions) => {
      pollingOptions = options;
      return {
        statuses: {},
        isPolling: Boolean(options.enabled),
        hasPending: Boolean(options.enabled),
        refresh: vi.fn(),
        stop: vi.fn(),
      };
    });

    resumeServiceMock.initiateUpload.mockResolvedValue({ resume_id: "resume-1" });
    resumeServiceMock.uploadPdf.mockResolvedValue({
      resume_id: "resume-1",
      candidate_id: "candidate-1",
      candidate_full_name: "Pessoa Teste",
      version_id: "version-1",
      analysis_auto_requested: false,
      analysis_id: null,
      analysis_status: null,
      original_file_name: "cv.pdf",
      file_size_bytes: 123,
      file_hash_sha256: "hash",
      extraction_status: "pending",
      page_count: null,
      word_count: null,
      prefilled_fields: [],
    });

    const { container } = render(
      <MemoryRouter future={routerFuture}>
        <ImportPage />
      </MemoryRouter>,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["pdf"], "cv.pdf", { type: "application/pdf" });

    await user.upload(input, file);

    expect(screen.queryByRole("button", { name: "Adicionar a uma vaga" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("link-candidate-job-modal")).not.toBeInTheDocument();

    await act(async () => {
      pollingOptions?.onItemUpdate?.("resume-1", {
        extraction_status: "completed",
        extraction_error: null,
      });
    });

    const addToJobButton = await screen.findByRole("button", {
      name: "Adicionar a uma vaga",
    });

    await user.click(addToJobButton);

    await waitFor(() => {
      expect(screen.getByTestId("link-candidate-job-modal")).toBeInTheDocument();
    });

    expect(linkCandidateJobModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isOpen: true,
        candidateId: "candidate-1",
        candidateName: "Pessoa Teste",
      }),
    );
  });
});
