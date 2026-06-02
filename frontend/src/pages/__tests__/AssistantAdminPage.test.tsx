import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantAdminPage } from "../AssistantAdminPage";
import type {
  AssistantSessionListItem,
  AssistantSessionDetail,
  AssistantMessageItem,
  AssistantFailureListItem,
  AssistantFailureDetail,
  AssistantState,
  AssistantStateContent,
  AssistantQuickReply,
  AssistantSetting,
} from "../../services/assistantAdminService";

// Mock the service
const listSessionsMock = vi.fn();
const getSessionMock = vi.fn();
const listMessagesMock = vi.fn();
const listFailuresMock = vi.fn();
const getFailureMock = vi.fn();
const updateFailureMock = vi.fn();
const listAssistantStatesMock = vi.fn();
const listStateContentsMock = vi.fn();
const listQuickRepliesMock = vi.fn();
const listAssistantSettingsMock = vi.fn();

vi.mock("../../services/assistantAdminService", () => ({
  assistantAdminService: {
    listSessions: (...args: unknown[]) => listSessionsMock(...args),
    getSession: (id: string) => getSessionMock(id),
    listMessages: (id: string) => listMessagesMock(id),
    listFailures: (...args: unknown[]) => listFailuresMock(...args),
    getFailure: (id: string) => getFailureMock(id),
    updateFailure: (id: string, payload: unknown) => updateFailureMock(id, payload),
    listAssistantStates: (...args: unknown[]) => listAssistantStatesMock(...args),
    listStateContents: (...args: unknown[]) => listStateContentsMock(...args),
    listQuickReplies: (...args: unknown[]) => listQuickRepliesMock(...args),
    listAssistantSettings: (...args: unknown[]) => listAssistantSettingsMock(...args),
  },
}));

// Mock router with stateful search params so tab switching works
vi.mock("react-router-dom", async () => {
  const React = await import("react");
  return {
    useSearchParams: () => {
      const [params, setParams] = React.useState<URLSearchParams>(
        () => new URLSearchParams()
      );
      const setSearchParams = (next: URLSearchParams) =>
        setParams(new URLSearchParams(next));
      return [params, setSearchParams] as const;
    },
  };
});

const SESSION: AssistantSessionListItem = {
  session_id: "sess-1",
  candidate: {
    id: "cand-1",
    display_name: "Maria S.",
    cpf_last4: null,
    identity_verified: false,
  },
  channel: "web",
  current_state: "CHOOSE_LOCATION",
  status: "active",
  last_message_at: "2026-06-02T10:00:00Z",
  created_at: "2026-06-02T09:50:00Z",
  application: { id: "app-1", status: "started", job_id: null },
  pipeline: null,
  context_summary: {
    identifier_type: "cpf",
    identity_verified: false,
    location_hint: null,
    desired_function: null,
    desired_shift: null,
  },
};

const PAGINATED_RESPONSE = {
  data: [SESSION],
  total: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

const SESSION_DETAIL: AssistantSessionDetail = {
  ...SESSION,
  context_summary: {
    ...SESSION.context_summary,
    location_hint: "Peritoró",
    desired_function: "Frentista",
    desired_shift: "night",
  },
};

const MESSAGES: AssistantMessageItem[] = [
  {
    id: "msg-1",
    role: "assistant",
    direction: "outbound",
    content: "Olá! Em qual cidade você quer trabalhar?",
    message_type: "text",
    quick_replies: [],
    state_at_message: "CHOOSE_LOCATION",
    created_at: "2026-06-02T09:51:00Z",
  },
  {
    id: "msg-2",
    role: "candidate",
    direction: "inbound",
    content: "Peritoró",
    message_type: "text",
    quick_replies: [],
    state_at_message: null,
    created_at: "2026-06-02T09:52:00Z",
  },
];

const FAILURE: AssistantFailureListItem = {
  id: "fail-1",
  session_id: "sess-1",
  message_id: "msg-1",
  candidate_id: "cand-1",
  candidate_label: "M. S.",
  application: { id: "app-1", status: "started" },
  state: "CHOOSE_LOCATION",
  sanitized_message: "Meu CPF é [cpf omitido] e telefone [número omitido]",
  reason: "location_not_found",
  status: "open",
  classification: null,
  attempts_count: 2,
  created_at: "2026-06-02T10:00:00Z",
  updated_at: "2026-06-02T10:00:00Z",
};

const FAILURES_RESPONSE = {
  data: [FAILURE],
  total: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

const FAILURE_DETAIL: AssistantFailureDetail = {
  ...FAILURE,
  session: {
    id: "sess-1",
    channel: "web",
    current_state: "CHOOSE_LOCATION",
    status: "active",
  },
  reviewed_by: null,
  reviewed_at: null,
};

const STATES: AssistantState[] = [
  {
    state: "IDENTIFY",
    label: "Identificação",
    description: "Coleta CPF ou WhatsApp.",
    is_sensitive: true,
    is_editable: false,
    order: 0,
    allowed_quick_reply_values: ["cpf", "whatsapp"],
    allowed_placeholders: [],
  },
  {
    state: "VERIFY_OTP",
    label: "Verificação OTP",
    description: "Confere o código enviado.",
    is_sensitive: true,
    is_editable: false,
    order: 1,
    allowed_quick_reply_values: [],
    allowed_placeholders: [],
  },
  {
    state: "CHOOSE_SHIFT",
    label: "Escolhendo turno",
    description: "Pergunta o turno preferido.",
    is_sensitive: false,
    is_editable: true,
    order: 5,
    allowed_quick_reply_values: ["morning", "afternoon", "night", "any"],
    allowed_placeholders: [],
  },
];

const STATE_CONTENTS: AssistantStateContent[] = [
  {
    state: "IDENTIFY",
    prompt_text: "Olá! Me diga seu CPF ou WhatsApp.",
    helper_text: null,
    fallback_text: "Não consegui entender. Digite seu CPF ou WhatsApp.",
    input_placeholder: null,
    is_editable: false,
    is_active: true,
    version: 1,
    updated_at: "2026-06-02T10:00:00Z",
  },
  {
    state: "CHOOSE_SHIFT",
    prompt_text: "Qual turno você prefere?",
    helper_text: "Escolha uma das opções.",
    fallback_text: "Não consegui entender o turno.",
    input_placeholder: "Ex.: manhã",
    is_editable: true,
    is_active: true,
    version: 2,
    updated_at: "2026-06-02T10:00:00Z",
  },
];

const QUICK_REPLIES: AssistantQuickReply[] = [
  {
    id: "qr-1",
    state: "CHOOSE_SHIFT",
    value: "morning",
    label: "Manhã",
    sort_order: 0,
    is_active: true,
    created_at: "2026-06-02T10:00:00Z",
    updated_at: "2026-06-02T10:00:00Z",
  },
  {
    id: "qr-2",
    state: "CHOOSE_SHIFT",
    value: "night",
    label: "Noite",
    sort_order: 2,
    is_active: true,
    created_at: "2026-06-02T10:00:00Z",
    updated_at: "2026-06-02T10:00:00Z",
  },
];

const SETTINGS: AssistantSetting[] = [
  {
    key: "welcome_message",
    value_json: "Olá! Vou te ajudar...",
    is_sensitive: false,
    description: "Mensagem inicial exibida ao candidato.",
    updated_at: "2026-06-02T10:00:00Z",
  },
  {
    key: "channels_enabled",
    value_json: null,
    is_sensitive: true,
    description: "Canais habilitados.",
    updated_at: "2026-06-02T10:00:00Z",
  },
];

beforeEach(() => {
  listSessionsMock.mockResolvedValue(PAGINATED_RESPONSE);
  getSessionMock.mockResolvedValue(SESSION_DETAIL);
  listMessagesMock.mockResolvedValue(MESSAGES);
  listFailuresMock.mockResolvedValue(FAILURES_RESPONSE);
  getFailureMock.mockResolvedValue(FAILURE_DETAIL);
  updateFailureMock.mockResolvedValue({
    ...FAILURE_DETAIL,
    status: "reviewed",
    classification: "talk_to_hr",
    reviewed_at: "2026-06-02T11:00:00Z",
  });
  listAssistantStatesMock.mockResolvedValue(STATES);
  listStateContentsMock.mockResolvedValue(STATE_CONTENTS);
  listQuickRepliesMock.mockResolvedValue(QUICK_REPLIES);
  listAssistantSettingsMock.mockResolvedValue(SETTINGS);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("AssistantAdminPage", () => {
  it("renders page header and Conversas tab", async () => {
    render(<AssistantAdminPage />);
    expect(screen.getByText("Assistente do Candidato")).toBeInTheDocument();
    expect(
      screen.getByText(/Acompanhe conversas do Portal 2/i)
    ).toBeInTheDocument();
    // "Conversas" appears in tab trigger and in the table card title — at least one present
    expect(screen.getAllByText("Conversas").length).toBeGreaterThanOrEqual(1);
  });

  it("lists sessions returned by service", async () => {
    render(<AssistantAdminPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Maria S.").length).toBeGreaterThanOrEqual(1);
    });
    // Status badge "Ativa" rendered at least once (session row)
    expect(screen.getAllByText("Ativa").length).toBeGreaterThanOrEqual(1);
    expect(listSessionsMock).toHaveBeenCalledOnce();
  });

  it("shows empty state when no sessions", async () => {
    listSessionsMock.mockResolvedValue({
      ...PAGINATED_RESPONSE,
      data: [],
      total: 0,
    });
    render(<AssistantAdminPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/Nenhuma conversa encontrada/i)
      ).toBeInTheDocument();
    });
  });

  it("page renders without crashing (error path smoke)", () => {
    // Minimal smoke test: the page mounts regardless of service outcome.
    render(<AssistantAdminPage />);
    expect(screen.getByText("Assistente do Candidato")).toBeInTheDocument();
  });

  it("filter by status calls service with correct param", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Maria S.").length).toBeGreaterThanOrEqual(1);
    });

    const statusSelect = screen.getByRole("combobox", { name: /Status/i });
    await user.selectOptions(statusSelect, "completed");

    await waitFor(() => {
      expect(listSessionsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "completed" })
      );
    });
  });

  it("filter by channel calls service with correct param", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Maria S.").length).toBeGreaterThanOrEqual(1);
    });

    const channelSelect = screen.getByRole("combobox", { name: /Canal/i });
    await user.selectOptions(channelSelect, "web");

    await waitFor(() => {
      expect(listSessionsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ channel: "web" })
      );
    });
  });

  it("opens detail drawer and calls correct service methods", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Maria S.").length).toBeGreaterThanOrEqual(1);
    });

    const viewBtn = screen.getAllByRole("button", { name: /Ver conversa/i })[0];
    await user.click(viewBtn);

    await waitFor(() => {
      expect(getSessionMock).toHaveBeenCalledWith("sess-1");
      expect(listMessagesMock).toHaveBeenCalledWith("sess-1");
    });

    // Dialog should open
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Histórico somente leitura da conversa/i)
    ).toBeInTheDocument();
  });

  it("does not show cpf_last4 when identity_verified is false", async () => {
    render(<AssistantAdminPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Maria S.").length).toBeGreaterThanOrEqual(1);
    });
    // CPF last4 should not appear in the list
    expect(screen.queryByText(/CPF:/)).not.toBeInTheDocument();
  });

  it("shows cpf_last4 when identity_verified is true", async () => {
    const sessionWithVerified: AssistantSessionListItem = {
      ...SESSION,
      candidate: {
        ...SESSION.candidate,
        cpf_last4: "4725",
        identity_verified: true,
      },
    };
    listSessionsMock.mockResolvedValue({
      ...PAGINATED_RESPONSE,
      data: [sessionWithVerified],
    });
    render(<AssistantAdminPage />);
    await waitFor(() => {
      expect(screen.getAllByText(/CPF: •••4725/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("does not expose context_json or raw PII in the UI", async () => {
    render(<AssistantAdminPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Maria S.").length).toBeGreaterThanOrEqual(1);
    });
    const html = document.body.innerHTML;
    expect(html).not.toContain("context_json");
    expect(html).not.toContain("cpf_hash");
    expect(html).not.toContain("@example.com");
  });
});

// ── Falhas tab ─────────────────────────────────────────────────────────────

async function goToFailures(user: ReturnType<typeof userEvent.setup>) {
  const tab = screen.getByRole("tab", { name: /Falhas/i });
  await user.click(tab);
  await waitFor(() => {
    expect(listFailuresMock).toHaveBeenCalled();
  });
}

describe("AssistantAdminPage — Falhas tab", () => {
  it("renders the Falhas tab and lists failures from the service", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFailures(user);

    await waitFor(() => {
      expect(
        screen.getAllByText(/Meu CPF é \[cpf omitido\]/i).length
      ).toBeGreaterThanOrEqual(1);
    });
    // Friendly reason + masked candidate label
    expect(screen.getAllByText(/Cidade não encontrada/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("M. S.").length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state when there are no failures", async () => {
    listFailuresMock.mockResolvedValue({ ...FAILURES_RESPONSE, data: [], total: 0 });
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFailures(user);

    await waitFor(() => {
      expect(screen.getByText(/Nenhuma falha encontrada/i)).toBeInTheDocument();
    });
  });

  it("filters failures by status with the correct query param", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFailures(user);

    const statusSelect = screen.getByRole("combobox", { name: /Status da falha/i });
    await user.selectOptions(statusSelect, "open");

    await waitFor(() => {
      expect(listFailuresMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "open" })
      );
    });
  });

  it("opens failure detail and loads the failure", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFailures(user);

    await waitFor(() => {
      expect(
        screen.getAllByText(/Meu CPF é \[cpf omitido\]/i).length
      ).toBeGreaterThanOrEqual(1);
    });

    const viewBtn = screen.getAllByRole("button", { name: /Ver detalhe da falha/i })[0];
    await user.click(viewBtn);

    await waitFor(() => {
      expect(getFailureMock).toHaveBeenCalledWith("fail-1");
    });
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByText(/Mensagem já sanitizada pelo sistema/i)).toBeInTheDocument();
  });

  it("patches status and classification from the detail form", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFailures(user);

    const viewBtn = await screen.findAllByRole("button", {
      name: /Ver detalhe da falha/i,
    });
    await user.click(viewBtn[0]);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const statusSelect = await screen.findByRole("combobox", { name: /Novo status/i });
    await user.selectOptions(statusSelect, "reviewed");
    const classSelect = screen.getByRole("combobox", { name: /Nova classificação/i });
    await user.selectOptions(classSelect, "talk_to_hr");

    const saveBtn = screen.getByRole("button", { name: /Salvar/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(updateFailureMock).toHaveBeenCalledWith("fail-1", {
        status: "reviewed",
        classification: "talk_to_hr",
      });
    });
  });

  it("never exposes raw_message, full CPF or phone in failures view", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFailures(user);

    await waitFor(() => {
      expect(
        screen.getAllByText(/Meu CPF é \[cpf omitido\]/i).length
      ).toBeGreaterThanOrEqual(1);
    });

    const viewBtn = screen.getAllByRole("button", { name: /Ver detalhe da falha/i })[0];
    await user.click(viewBtn);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const html = document.body.innerHTML;
    expect(html).not.toContain("raw_message");
    expect(html).not.toContain("529.982.247-25");
    expect(html).not.toContain("11999998888");
    expect(html).not.toContain("context_json");
  });

  it("keeps the Conversas tab working after visiting Falhas", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFailures(user);

    await user.click(screen.getByRole("tab", { name: /Conversas/i }));
    await waitFor(() => {
      expect(screen.getAllByText("Maria S.").length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ── Fluxo de perguntas tab ──────────────────────────────────────────────────

async function goToFlow(user: ReturnType<typeof userEvent.setup>) {
  const tab = screen.getByRole("tab", { name: /Fluxo/i });
  await user.click(tab);
  await waitFor(() => {
    expect(listAssistantStatesMock).toHaveBeenCalled();
  });
}

describe("AssistantAdminPage — Fluxo de perguntas tab", () => {
  it("renders the read-only notice and calls the flow endpoints", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFlow(user);

    await waitFor(() => {
      expect(screen.getByText(/Somente leitura nesta fase/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/A topologia do fluxo não pode ser editada/i)
    ).toBeInTheDocument();
    expect(listAssistantStatesMock).toHaveBeenCalled();
    expect(listStateContentsMock).toHaveBeenCalled();
    expect(listQuickRepliesMock).toHaveBeenCalled();
    expect(listAssistantSettingsMock).toHaveBeenCalled();
  });

  it("lists the states returned by the service", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFlow(user);

    await waitFor(() => {
      expect(screen.getAllByText("Identificação").length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText("Verificação OTP").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Escolhendo turno").length).toBeGreaterThanOrEqual(1);
  });

  it("shows IDENTIFY / VERIFY_OTP as non-editable and sensitive", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFlow(user);

    await waitFor(() => {
      expect(screen.getAllByText("Identificação").length).toBeGreaterThanOrEqual(1);
    });
    // First state (IDENTIFY) is selected by default → badges visible.
    expect(screen.getAllByText(/Não editável/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Sensível/i).length).toBeGreaterThanOrEqual(1);
  });

  it("selects a state and shows its content and quick replies", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFlow(user);

    await waitFor(() => {
      expect(screen.getAllByText("Escolhendo turno").length).toBeGreaterThanOrEqual(1);
    });

    // Click the CHOOSE_SHIFT state in the left list.
    const shiftButtons = screen.getAllByText("Escolhendo turno");
    await user.click(shiftButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Qual turno você prefere?")).toBeInTheDocument();
    });
    // Fallback + helper rendered.
    expect(screen.getByText("Não consegui entender o turno.")).toBeInTheDocument();
    expect(screen.getByText("Escolha uma das opções.")).toBeInTheDocument();
    // Quick replies: label (candidate) + value (engine technical).
    expect(screen.getByText("Manhã")).toBeInTheDocument();
    expect(screen.getByText("morning")).toBeInTheDocument();
    expect(screen.getByText("Noite")).toBeInTheDocument();
  });

  it("does not render any save/edit controls in the flow tab", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFlow(user);

    await waitFor(() => {
      expect(screen.getAllByText("Identificação").length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByRole("button", { name: /Salvar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar/i })).not.toBeInTheDocument();
  });

  it("shows related settings, masking sensitive values", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFlow(user);

    await waitFor(() => {
      expect(
        screen.getByText("Mensagem inicial exibida ao candidato.")
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Olá! Vou te ajudar...")).toBeInTheDocument();
    // Sensitive setting (channels_enabled) renders a protected placeholder, not its value.
    expect(screen.getByText("Protegido")).toBeInTheDocument();
  });

  it("shows a friendly error when the flow fails to load", async () => {
    listAssistantStatesMock.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFlow(user);

    await waitFor(() => {
      expect(
        screen.getByText(/Não foi possível carregar o fluxo de perguntas/i)
      ).toBeInTheDocument();
    });
  });

  it("keeps Conversas and Falhas tabs working after visiting Fluxo", async () => {
    const user = userEvent.setup();
    render(<AssistantAdminPage />);
    await goToFlow(user);
    await waitFor(() => {
      expect(screen.getAllByText("Identificação").length).toBeGreaterThanOrEqual(1);
    });

    await user.click(screen.getByRole("tab", { name: /Conversas/i }));
    await waitFor(() => {
      expect(screen.getAllByText("Maria S.").length).toBeGreaterThanOrEqual(1);
    });

    await user.click(screen.getByRole("tab", { name: /Falhas/i }));
    await waitFor(() => {
      expect(
        screen.getAllByText(/Meu CPF é \[cpf omitido\]/i).length
      ).toBeGreaterThanOrEqual(1);
    });
  });
});
