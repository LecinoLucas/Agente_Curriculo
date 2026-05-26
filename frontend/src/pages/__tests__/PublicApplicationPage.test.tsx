import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

import { PublicApplicationPage } from "../PublicApplicationPage";
import { candidateAuthService } from "../../services/candidateAuthService";
import { publicApplicationService } from "../../features/public-application/services/publicApplicationService";
import { __resetGoogleIdentityForTests } from "../../services/googleIdentityService";
import { HttpError } from "../../services/http";
import { toast } from "../../shared/utils/toast";

vi.mock("../../services/candidateAuthService", () => ({
  candidateAuthService: {
    googleLogin: vi.fn(),
  },
}));

vi.mock("../../features/public-application/services/publicApplicationService", () => ({
  publicApplicationService: {
    listPublishedJobs: vi.fn(),
    submitApplication: vi.fn(),
    checkExists: vi.fn(() => Promise.resolve({ status: "ok" })),
  },
}));

vi.mock("../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function installGoogleMock(credential = "google-credential") {
  let callback: ((response: { credential?: string }) => void) | null = null;
  window.google = {
    accounts: {
      id: {
        initialize: vi.fn((options) => {
          callback = options.callback;
        }),
        renderButton: vi.fn((element: HTMLElement) => {
          const hiddenButton = document.createElement("button");
          hiddenButton.type = "button";
          hiddenButton.textContent = "Continuar com Google";
          hiddenButton.onclick = () => callback?.({ credential });
          element.appendChild(hiddenButton);
        }),
        prompt: vi.fn(),
      },
    },
  };
}

async function advanceToJobResume() {
  fireEvent.click(screen.getByRole("button", { name: /preencher manualmente/i }));

  fireEvent.change(screen.getByLabelText(/nome completo/i), { target: { value: "Maria Silva" } });
  fireEvent.change(screen.getByLabelText(/^cpf/i), { target: { value: "12345678909" } });
  fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "maria@example.com" } });
  fireEvent.change(screen.getByLabelText(/telefone \/ whatsapp/i), { target: { value: "11987654321" } });
  fireEvent.change(screen.getByLabelText(/cidade/i), { target: { value: "São Paulo" } });
  fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: "SenhaSegura123" } });
  fireEvent.change(screen.getByLabelText(/confirmar senha/i), { target: { value: "SenhaSegura123" } });
  fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
  await screen.findByText(/Nenhuma vaga publicada no momento/i);
}

function renderPage(initialEntry = "/candidato/cadastro") {
  return render(
    <MemoryRouter future={routerFuture} initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/candidato/cadastro" element={<PublicApplicationPage />} />
        <Route path="/candidato/portal" element={<div>Portal destino</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PublicApplicationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    delete window.google;
    __resetGoogleIdentityForTests();
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "frontend-client-id.apps.googleusercontent.com");
    installGoogleMock();
    (publicApplicationService.listPublishedJobs as any).mockResolvedValue([]);
    (publicApplicationService.submitApplication as any).mockResolvedValue({
      candidate_id: "candidate-1",
      resume_id: "resume-1",
      resume_version_id: "resume-version-1",
      job_id: null,
      pipeline_id: null,
      analysis_auto_requested: false,
      analysis_id: null,
      analysis_status: null,
      talent_pool: true,
      talent_pool_profile_status: null,
      portal_access_hint: "Portal do candidato",
      status: "awaiting_job",
      message: "ok",
    });
  });

  it("renderiza o botão do Google quando VITE_GOOGLE_CLIENT_ID existe", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: /continuar com google/i })).toBeInTheDocument();
  });

  it("renderiza campo Pretensão salarial", async () => {
    renderPage();
    await advanceToJobResume();
    expect(screen.getByLabelText(/pretensão salarial/i)).toBeInTheDocument();
  });

  it("exige pretensão salarial obrigatória", async () => {
    renderPage();
    await advanceToJobResume();
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(await screen.findByText("Informe sua pretensão salarial.")).toBeInTheDocument();
  });

  it("não envia o formulário sem pretensão salarial", async () => {
    renderPage();
    await advanceToJobResume();
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    await waitFor(() => {
      expect(publicApplicationService.submitApplication).not.toHaveBeenCalled();
    });
  });

  it("normaliza o valor BRL corretamente antes do envio", async () => {
    renderPage();
    await advanceToJobResume();

    fireEvent.change(screen.getByLabelText(/pretensão salarial/i), { target: { value: "250000" } });
    expect(
      screen.getByDisplayValue((value) => /R\$\s*2\.500,00/.test(value))
    ).toBeInTheDocument();

    const file = new File(["curriculo"], "curriculo.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/clique para selecionar ou arraste um arquivo/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    fireEvent.click(screen.getByLabelText(/ao enviar sua candidatura/i));
    fireEvent.click(screen.getByRole("button", { name: /enviar candidatura/i }));

    await waitFor(() => {
      expect(publicApplicationService.submitApplication).toHaveBeenCalledTimes(1);
    });

    const formData = (publicApplicationService.submitApplication as any).mock.calls[0][0] as FormData;
    expect(formData.get("salary_expectation")).toBe("2500.00");
  });

  it("google needs_completion preenche nome e e-mail e mantém o formulário aberto", async () => {
    (candidateAuthService.googleLogin as any).mockResolvedValue({
      status: "needs_completion",
      message: "Complete os dados restantes para finalizar sua candidatura.",
      redirect_to: "/candidato/cadastro",
      session_expires_at: "2026-05-17T14:00:00Z",
      candidate: {
        id: "candidate-1",
        full_name: "Maria Google",
        email: "maria.google@example.com",
        phone: null,
        cpf: null,
        salary_expectation: null,
        has_resume: false,
        picture_url: null,
        email_locked: true,
      },
      missing_fields: ["phone", "salary_expectation", "resume", "lgpd_consent", "cpf"],
    });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /continuar com google/i }));

    expect(await screen.findByDisplayValue("Maria Google")).toBeInTheDocument();
    expect(screen.getByDisplayValue("maria.google@example.com")).toBeDisabled();
    expect(screen.getAllByText(/complete os dados restantes/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /continuar/i })).toBeInTheDocument();
  });

  it("não consulta duplicidade para e-mail pré-preenchido pelo Google", async () => {
    (candidateAuthService.googleLogin as any).mockResolvedValue({
      status: "needs_completion",
      message: "Complete os dados restantes para finalizar sua candidatura.",
      redirect_to: "/candidato/cadastro",
      session_expires_at: "2026-05-17T14:00:00Z",
      candidate: {
        id: "candidate-1",
        full_name: "Maria Google",
        email: "maria.google@example.com",
        phone: null,
        cpf: null,
        salary_expectation: null,
        has_resume: false,
        picture_url: null,
        email_locked: true,
      },
      missing_fields: ["phone", "salary_expectation", "resume", "lgpd_consent", "cpf"],
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /continuar com google/i }));

    expect(await screen.findByDisplayValue("maria.google@example.com")).toBeDisabled();
    await waitFor(() => {
      expect((publicApplicationService as any).checkExists).not.toHaveBeenCalled();
    });
    expect(screen.queryByText(/e-mail já está cadastrado/i)).not.toBeInTheDocument();
  });

  it("google authenticated redireciona para o portal", async () => {
    (candidateAuthService.googleLogin as any).mockResolvedValue({
      status: "authenticated",
      message: "Login com Google realizado com sucesso.",
      redirect_to: "/candidato/portal",
      session_expires_at: "2026-05-17T14:00:00Z",
      candidate: {
        id: "candidate-1",
        full_name: "Maria Google",
        email: "maria.google@example.com",
        phone: "11999999999",
        cpf: "12345678909",
        salary_expectation: "5500.00",
        has_resume: true,
        picture_url: null,
        email_locked: true,
      },
      missing_fields: [],
    });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /continuar com google/i }));

    expect(await screen.findByText("Portal destino")).toBeInTheDocument();
  });

  it("mostra mensagem clara quando o Google falha", async () => {
    (candidateAuthService.googleLogin as any).mockRejectedValue(new Error("Google indisponível."));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /continuar com google/i }));

    expect(await screen.findByText("Google indisponível.")).toBeInTheDocument();
  });

  it("não chama check-exists nem mostra erro de CPF/e-mail cadastrado para anônimo", async () => {
    renderPage();
    
    // Avançar para dados pessoais
    fireEvent.click(screen.getByRole("button", { name: /preencher manualmente/i }));

    // Preencher campos
    fireEvent.change(screen.getByLabelText(/nome completo/i), { target: { value: "Maria Silva" } });
    fireEvent.change(screen.getByLabelText(/^cpf/i), { target: { value: "12345678909" } });
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "maria@example.com" } });
    fireEvent.change(screen.getByLabelText(/telefone \/ whatsapp/i), { target: { value: "11987654321" } });
    fireEvent.change(screen.getByLabelText(/cidade/i), { target: { value: "São Paulo" } });
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: "SenhaSegura123" } });
    fireEvent.change(screen.getByLabelText(/confirmar senha/i), { target: { value: "SenhaSegura123" } });
    
    // Tentar avançar
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));

    await screen.findByText(/Nenhuma vaga publicada no momento/i);
    expect((publicApplicationService as any).checkExists).not.toHaveBeenCalled();
    expect(screen.queryByText(/CPF já cadastrado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/e-mail já cadastrado/i)).not.toBeInTheDocument();
  });

  it("exibe mensagem genérica segura quando o submit retorna conflito", async () => {
    (publicApplicationService.submitApplication as any).mockRejectedValue(
      new HttpError(409, "Já existe um cadastro com este CPF. Faça login para continuar.")
    );

    renderPage();
    await advanceToJobResume();

    fireEvent.change(screen.getByLabelText(/pretensão salarial/i), { target: { value: "250000" } });
    const file = new File(["curriculo"], "curriculo.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/clique para selecionar ou arraste um arquivo/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    fireEvent.click(screen.getByLabelText(/ao enviar sua candidatura/i));
    fireEvent.click(screen.getByRole("button", { name: /enviar candidatura/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Recebemos sua solicitação. Se já houver cadastro, atualizaremos seu processo conforme as regras do RH."
      );
    });
  });
});
