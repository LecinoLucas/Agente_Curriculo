import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "../../services/http";

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
  candidatesServiceMock,
  useExtractionPollingMock,
  linkCandidateJobModalMock,
} = vi.hoisted(() => ({
  resumeServiceMock: {
    initiateUpload: vi.fn(),
    uploadPdf: vi.fn(),
  },
  candidatesServiceMock: {
    create: vi.fn(),
    checkDuplicate: vi.fn(),
  },
  useExtractionPollingMock: vi.fn(),
  linkCandidateJobModalMock: vi.fn(),
}));

vi.mock("../../services/resumeService", () => ({
  resumeService: resumeServiceMock,
}));

vi.mock("../../services/candidatesService", () => ({
  candidatesService: candidatesServiceMock,
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

const baseUploadResponse = {
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
};

function setupPolling(): { getOptions: () => PollingOptions | null } {
  let captured: PollingOptions | null = null;
  useExtractionPollingMock.mockImplementation((options: PollingOptions) => {
    captured = options;
    return {
      statuses: {},
      isPolling: Boolean(options.enabled),
      hasPending: Boolean(options.enabled),
      refresh: vi.fn(),
      stop: vi.fn(),
    };
  });
  return { getOptions: () => captured };
}

async function fillFormAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
  overrides: { name?: string; email?: string; phone?: string; cpf?: string; file?: File } = {},
) {
  const name = overrides.name ?? "Pessoa Um";
  const email = overrides.email ?? "pessoa.um@example.com";
  const file =
    overrides.file ?? new File(["pdf-1"], "cv-1.pdf", { type: "application/pdf" });

  await user.type(screen.getByLabelText(/nome completo/i), name);
  await user.type(screen.getByLabelText(/e-mail/i), email);
  if (overrides.phone) await user.type(screen.getByLabelText(/telefone/i), overrides.phone);
  if (overrides.cpf) await user.type(screen.getByLabelText(/^cpf$/i), overrides.cpf);

  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(fileInput, file);

  await user.click(screen.getByRole("button", { name: /cadastrar candidato/i }));
}

describe("ImportPage", () => {
  beforeEach(() => {
    resumeServiceMock.initiateUpload.mockReset();
    resumeServiceMock.uploadPdf.mockReset();
    candidatesServiceMock.create.mockReset();
    candidatesServiceMock.checkDuplicate.mockReset();
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

  it("não chama /resumes sem candidate_id e exige campos mínimos", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter future={routerFuture}>
        <ImportPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /cadastrar candidato/i }));

    // Form-level validation rejects the submit; nothing is sent to the backend
    // and a clear inline error is shown to the user.
    expect(
      await screen.findByText(/informe o nome completo/i),
    ).toBeInTheDocument();
    expect(candidatesServiceMock.create).not.toHaveBeenCalled();
    expect(resumeServiceMock.initiateUpload).not.toHaveBeenCalled();
    expect(resumeServiceMock.uploadPdf).not.toHaveBeenCalled();
  });

  it("cria candidato primeiro e envia currículo com candidate_id", async () => {
    const user = userEvent.setup();
    const { getOptions } = setupPolling();

    candidatesServiceMock.create.mockResolvedValue({
      id: "candidate-1",
      full_name: "Pessoa Um",
      email: "pessoa.um@example.com",
    });
    resumeServiceMock.initiateUpload.mockResolvedValue({ resume_id: "resume-1" });
    resumeServiceMock.uploadPdf.mockResolvedValue(baseUploadResponse);

    const { container } = render(
      <MemoryRouter future={routerFuture}>
        <ImportPage />
      </MemoryRouter>,
    );

    await fillFormAndSubmit(user, container);

    await waitFor(() => expect(candidatesServiceMock.create).toHaveBeenCalledTimes(1));
    expect(candidatesServiceMock.create).toHaveBeenCalledWith({
      full_name: "Pessoa Um",
      email: "pessoa.um@example.com",
    });
    await waitFor(() => expect(resumeServiceMock.initiateUpload).toHaveBeenCalledWith("candidate-1"));
    expect(resumeServiceMock.uploadPdf).toHaveBeenCalledWith("resume-1", expect.any(File));

    expect(await screen.findByText("cv-1.pdf")).toBeInTheDocument();
    expect(getOptions()?.items).toEqual(["resume-1"]);
  });

  it("mostra mensagem amigável quando email já existe (409), mantém formulário e oferece abrir candidato existente", async () => {
    const user = userEvent.setup();
    candidatesServiceMock.create.mockRejectedValue(
      new HttpError(
        409,
        "Candidato com este e-mail já existe",
        undefined,
        null,
        "Candidato com este e-mail já existe",
      ),
    );
    candidatesServiceMock.checkDuplicate.mockResolvedValue({
      exists: true,
      candidate_id: "existing-candidate-1",
      full_name: "Pessoa Um",
    });

    const { container } = render(
      <MemoryRouter future={routerFuture}>
        <ImportPage />
      </MemoryRouter>,
    );
    await fillFormAndSubmit(user, container);

    expect(await screen.findByText(/já existe um candidato com este e-mail/i)).toBeInTheDocument();
    expect(resumeServiceMock.initiateUpload).not.toHaveBeenCalled();
    // Form values must be preserved
    expect((screen.getByLabelText(/nome completo/i) as HTMLInputElement).value).toBe("Pessoa Um");
    expect((screen.getByLabelText(/e-mail/i) as HTMLInputElement).value).toBe("pessoa.um@example.com");
    // "Abrir candidato existente" CTA appears once the lookup resolved.
    expect(
      await screen.findByRole("button", { name: /abrir candidato existente/i }),
    ).toBeInTheDocument();
    expect(candidatesServiceMock.checkDuplicate).toHaveBeenCalledWith(
      "pessoa.um@example.com",
      undefined,
    );
  });

  it("vínculo manual aparece só após extração completed", async () => {
    const user = userEvent.setup();
    const { getOptions } = setupPolling();
    candidatesServiceMock.create.mockResolvedValue({
      id: "candidate-1",
      full_name: "Pessoa Um",
      email: "pessoa.um@example.com",
    });
    resumeServiceMock.initiateUpload.mockResolvedValue({ resume_id: "resume-1" });
    resumeServiceMock.uploadPdf.mockResolvedValue(baseUploadResponse);

    const { container } = render(
      <MemoryRouter future={routerFuture}>
        <ImportPage />
      </MemoryRouter>,
    );

    await fillFormAndSubmit(user, container);

    expect(await screen.findByText("cv-1.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar a uma vaga" })).not.toBeInTheDocument();

    await act(async () => {
      getOptions()?.onItemUpdate?.("resume-1", {
        extraction_status: "completed",
        extraction_error: null,
      });
    });

    const addToJobButton = await screen.findByRole("button", { name: "Adicionar a uma vaga" });
    await user.click(addToJobButton);
    await waitFor(() => expect(screen.getByTestId("link-candidate-job-modal")).toBeInTheDocument());
    expect(linkCandidateJobModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isOpen: true,
        candidateId: "candidate-1",
        candidateName: "Pessoa Um",
      }),
    );
  });

  it("falha de upload mantém candidato criado e mostra erro recuperável", async () => {
    const user = userEvent.setup();
    setupPolling();
    candidatesServiceMock.create.mockResolvedValue({
      id: "candidate-2",
      full_name: "Pessoa Dois",
      email: "pessoa.dois@example.com",
    });
    resumeServiceMock.initiateUpload.mockResolvedValue({ resume_id: "resume-2" });
    resumeServiceMock.uploadPdf.mockRejectedValue(
      new HttpError(413, "Arquivo muito grande", undefined, null, "Arquivo muito grande"),
    );

    const { container } = render(
      <MemoryRouter future={routerFuture}>
        <ImportPage />
      </MemoryRouter>,
    );
    await fillFormAndSubmit(user, container, {
      name: "Pessoa Dois",
      email: "pessoa.dois@example.com",
    });

    await waitFor(() => expect(candidatesServiceMock.create).toHaveBeenCalled());
    // The recoverable-failure row is what we care about — message + hint that
    // the candidate has already been created.
    expect(await screen.findByText(/candidato já foi criado/i)).toBeInTheDocument();
    expect(screen.getAllByText(/arquivo muito grande/i).length).toBeGreaterThan(0);
  });
});

// Hint for the unused import warning when running this file standalone.
void within;
