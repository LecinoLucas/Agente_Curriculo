// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Isolate the page from the real layout (header/footer/auth/router context).
vi.mock('../../components/layout/CandidatePortalLayout', () => ({
  CandidatePortalLayout: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../services/conversationsService', () => ({
  conversationsService: {
    createConversation: vi.fn(),
    getConversation: vi.fn(),
    sendConversationMessage: vi.fn(),
    listConversationMessages: vi.fn(),
  },
  HttpError: class HttpError extends Error {},
}));

vi.mock('../../services/conversationStorage', () => ({
  conversationStorage: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
}));

import { conversationsService } from '../../services/conversationsService';
import { conversationStorage } from '../../services/conversationStorage';
import { CandidatePortal2Page } from '../CandidatePortal2Page';

const SESSION = {
  id: 'sess-1',
  session_id: 'sess-1',
  channel: 'web',
  current_state: 'CHOOSE_LOCATION',
  status: 'active',
  context: {},
  assistant_message: 'Em qual cidade você procura vaga?',
  quick_replies: [{ value: 'peritoro', label: 'Peritoró' }],
  last_message_at: '2026-06-01T10:00:00Z',
  created_at: '2026-06-01T10:00:00Z',
  updated_at: '2026-06-01T10:00:00Z',
};

function assistantMessage(
  content: string,
  id = 'msg-1',
  metadata: Record<string, unknown> | null = null,
) {
  return {
    id,
    session_id: 'sess-1',
    role: 'assistant',
    direction: 'outbound',
    content,
    message_type: 'text',
    interpreted_intent: null,
    metadata,
    created_at: '2026-06-01T10:00:00Z',
  };
}

function candidateMessage(
  content: string,
  id = 'candidate-msg-1',
  messageType = 'text',
) {
  return {
    id,
    session_id: 'sess-1',
    role: 'candidate',
    direction: 'inbound',
    content,
    message_type: messageType,
    interpreted_intent: null,
    metadata: null,
    created_at: '2026-06-01T10:00:00Z',
  };
}

const OPENING_TURN = {
  session_id: 'sess-1',
  current_state: 'CHOOSE_LOCATION',
  assistant_message: 'Em qual cidade você procura vaga?',
  quick_replies: [{ value: 'peritoro', label: 'Peritoró' }],
  session: SESSION,
  message: assistantMessage('Em qual cidade você procura vaga?'),
  options: [{ value: 'peritoro', label: 'Peritoró' }],
};

const IDENTIFY_SESSION = {
  ...SESSION,
  current_state: 'IDENTIFY',
  assistant_message: 'Olá! Vou te ajudar a encontrar uma vaga. Para começar, me diga seu CPF ou WhatsApp.',
  quick_replies: [
    { value: 'cpf', label: 'Informar CPF' },
    { value: 'whatsapp', label: 'Informar WhatsApp' },
  ],
};

const IDENTIFY_TURN = {
  session_id: 'sess-1',
  current_state: 'IDENTIFY',
  assistant_message: IDENTIFY_SESSION.assistant_message,
  quick_replies: IDENTIFY_SESSION.quick_replies,
  session: IDENTIFY_SESSION,
  message: assistantMessage(IDENTIFY_SESSION.assistant_message),
  options: IDENTIFY_SESSION.quick_replies,
};

const OTP_SESSION = {
  ...SESSION,
  current_state: 'VERIFY_OTP',
  assistant_message: 'Enviamos um código de verificação. Digite o código de 6 dígitos para continuar.',
  quick_replies: [],
};

const OTP_TURN = {
  session_id: 'sess-1',
  current_state: 'VERIFY_OTP',
  assistant_message: OTP_SESSION.assistant_message,
  quick_replies: [],
  session: OTP_SESSION,
  message: assistantMessage(OTP_SESSION.assistant_message),
  options: [],
};

beforeEach(() => {
  vi.mocked(conversationStorage.get).mockReturnValue(null);
  vi.mocked(conversationsService.createConversation).mockResolvedValue(OPENING_TURN);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CandidatePortal2Page', () => {
  it('creates a session on mount, renders the first assistant message and saves the session id', async () => {
    render(<CandidatePortal2Page />);

    expect(await screen.findByText('Em qual cidade você procura vaga?')).toBeTruthy();
    expect(conversationsService.createConversation).toHaveBeenCalledWith('web');
    expect(conversationStorage.set).toHaveBeenCalledWith('sess-1');
    // Quick reply option from the backend is rendered as a big button.
    expect(screen.getByRole('button', { name: 'Peritoró' })).toBeTruthy();
  });

  it('reuses an existing session id instead of creating a new one', async () => {
    vi.mocked(conversationStorage.get).mockReturnValue('sess-1');
    vi.mocked(conversationsService.getConversation).mockResolvedValue(SESSION);
    vi.mocked(conversationsService.listConversationMessages).mockResolvedValue([
      assistantMessage('Olá! Vou te ajudar a encontrar uma vaga.', 'msg-1', {
        quick_replies: [
          { value: 'cpf', label: 'Informar CPF' },
          { value: 'whatsapp', label: 'Informar WhatsApp' },
        ],
      }),
      candidateMessage('cpf', 'msg-2', 'quick_reply'),
      assistantMessage('Bem-vindo de volta!', 'msg-3'),
    ]);

    render(<CandidatePortal2Page />);

    expect(await screen.findByText('Bem-vindo de volta!')).toBeTruthy();
    expect(screen.getByText('Informar CPF')).toBeTruthy();
    expect(conversationsService.getConversation).toHaveBeenCalledWith('sess-1');
    expect(conversationsService.createConversation).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Peritoró' })).toBeTruthy();
  });

  it('sends a typed message to the correct endpoint and renders both bubbles', async () => {
    vi.mocked(conversationsService.sendConversationMessage).mockResolvedValue({
      session_id: 'sess-1',
      current_state: 'CHOOSE_FUNCTION',
      assistant_message: 'Qual função você procura?',
      quick_replies: [],
      session: { ...SESSION, current_state: 'CHOOSE_FUNCTION' },
      message: assistantMessage('Qual função você procura?', 'msg-2'),
      options: [],
    });

    render(<CandidatePortal2Page />);
    await screen.findByText('Em qual cidade você procura vaga?');

    fireEvent.change(screen.getByLabelText('Sua mensagem'), { target: { value: 'Peritoró' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    // Candidate bubble appears immediately (optimistic).
    expect(await screen.findByText('Peritoró')).toBeTruthy();
    // Assistant reply from the backend appears.
    expect(await screen.findByText('Qual função você procura?')).toBeTruthy();
    expect(conversationsService.sendConversationMessage).toHaveBeenCalledWith(
      'sess-1',
      'Peritoró',
      'text',
    );
  });

  it('does not send raw cpf quick reply and waits for the real CPF', async () => {
    vi.mocked(conversationsService.createConversation).mockResolvedValue(IDENTIFY_TURN);
    vi.mocked(conversationsService.sendConversationMessage).mockResolvedValue({
      session_id: 'sess-1',
      current_state: 'VERIFY_OTP',
      assistant_message: 'Digite o código de verificação.',
      quick_replies: [],
      session: { ...IDENTIFY_SESSION, current_state: 'VERIFY_OTP', quick_replies: [] },
      message: assistantMessage('Digite o código de verificação.', 'msg-2'),
      options: [],
    });

    render(<CandidatePortal2Page />);
    await screen.findByText(IDENTIFY_SESSION.assistant_message);

    fireEvent.click(screen.getByRole('button', { name: 'Identificar com CPF' }));

    expect(conversationsService.sendConversationMessage).not.toHaveBeenCalled();
    expect(await screen.findByText('Digite seu CPF no campo abaixo para continuar.')).toBeTruthy();
    const field = screen.getByPlaceholderText('Digite seu CPF') as HTMLInputElement;
    expect(field.getAttribute('inputmode')).toBe('numeric');

    fireEvent.change(field, { target: { value: '52998224725' } });
    expect(field.value).toBe('529.982.247-25');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('CPF informado com final 725')).toBeTruthy();
    expect(screen.queryByText('529.982.247-25')).toBeNull();
    expect(await screen.findByText('Digite o código de verificação.')).toBeTruthy();
    expect(conversationsService.sendConversationMessage).toHaveBeenCalledWith(
      'sess-1',
      '52998224725',
      'text',
    );
  });

  it('does not send raw whatsapp quick reply and sends the typed phone masked locally', async () => {
    vi.mocked(conversationsService.createConversation).mockResolvedValue(IDENTIFY_TURN);
    vi.mocked(conversationsService.sendConversationMessage).mockResolvedValue({
      session_id: 'sess-1',
      current_state: 'VERIFY_OTP',
      assistant_message: 'Digite o código de verificação.',
      quick_replies: [],
      session: { ...IDENTIFY_SESSION, current_state: 'VERIFY_OTP', quick_replies: [] },
      message: assistantMessage('Digite o código de verificação.', 'msg-2'),
      options: [],
    });

    render(<CandidatePortal2Page />);
    await screen.findByText(IDENTIFY_SESSION.assistant_message);

    fireEvent.click(screen.getByRole('button', { name: 'Identificar com WhatsApp' }));

    expect(conversationsService.sendConversationMessage).not.toHaveBeenCalled();
    expect(await screen.findByText('Digite seu WhatsApp com DDD no campo abaixo.')).toBeTruthy();
    const field = screen.getByPlaceholderText('Digite seu WhatsApp com DDD') as HTMLInputElement;
    expect(field.getAttribute('inputmode')).toBe('numeric');

    fireEvent.change(field, { target: { value: '11987654177' } });
    expect(field.value).toBe('(11) 98765-4177');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('WhatsApp informado com final 177')).toBeTruthy();
    expect(screen.queryByText('(11) 98765-4177')).toBeNull();
    expect(conversationsService.sendConversationMessage).toHaveBeenCalledWith(
      'sess-1',
      '11987654177',
      'text',
    );
  });

  it('continues sending non-identification quick replies to the backend', async () => {
    vi.mocked(conversationsService.sendConversationMessage).mockResolvedValue({
      session_id: 'sess-1',
      current_state: 'CHOOSE_UNIT_OR_ANY',
      assistant_message: 'Escolha um posto.',
      quick_replies: [],
      session: { ...SESSION, current_state: 'CHOOSE_UNIT_OR_ANY', quick_replies: [] },
      message: assistantMessage('Escolha um posto.', 'msg-2'),
      options: [],
    });

    render(<CandidatePortal2Page />);
    await screen.findByText('Em qual cidade você procura vaga?');

    fireEvent.click(screen.getByRole('button', { name: 'Peritoró' }));

    expect(await screen.findByText('Escolha um posto.')).toBeTruthy();
    expect(conversationsService.sendConversationMessage).toHaveBeenCalledWith(
      'sess-1',
      'peritoro',
      'quick_reply',
    );
  });

  it('shows a friendly message when creating the session fails', async () => {
    vi.mocked(conversationsService.createConversation).mockRejectedValue(new Error('boom'));

    render(<CandidatePortal2Page />);

    expect(
      await screen.findByText('Não consegui iniciar o assistente agora. Tente novamente.'),
    ).toBeTruthy();
  });

  it('shows a friendly retry message when sending a message fails', async () => {
    vi.mocked(conversationsService.sendConversationMessage).mockRejectedValue(new Error('boom'));

    render(<CandidatePortal2Page />);
    await screen.findByText('Em qual cidade você procura vaga?');

    fireEvent.change(screen.getByLabelText('Sua mensagem'), { target: { value: 'oi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(
      await screen.findByText('Não consegui enviar sua mensagem. Tente novamente.'),
    ).toBeTruthy();
  });

  // ---- OP-6D.2: restart + OTP UX ----

  it('shows resume feedback when an existing session is reused on reload', async () => {
    vi.mocked(conversationStorage.get).mockReturnValue('sess-1');
    vi.mocked(conversationsService.getConversation).mockResolvedValue(SESSION);
    vi.mocked(conversationsService.listConversationMessages).mockResolvedValue([
      assistantMessage('Bem-vindo de volta!', 'msg-1'),
    ]);

    render(<CandidatePortal2Page />);

    expect(await screen.findByText('Retomamos sua conversa')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recomeçar' })).toBeTruthy();
    expect(conversationsService.createConversation).not.toHaveBeenCalled();
  });

  it('"Recomeçar" clears the stored session id and creates a new one', async () => {
    render(<CandidatePortal2Page />);
    await screen.findByText('Em qual cidade você procura vaga?');

    expect(conversationsService.createConversation).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Recomeçar' }));

    await screen.findByText('Em qual cidade você procura vaga?');
    expect(conversationStorage.clear).toHaveBeenCalled();
    expect(conversationsService.createConversation).toHaveBeenCalledTimes(2);
    expect(conversationStorage.set).toHaveBeenCalledWith('sess-1');
  });

  it('uses the 6-digit code placeholder and numeric input in VERIFY_OTP', async () => {
    vi.mocked(conversationsService.createConversation).mockResolvedValue(OTP_TURN);

    render(<CandidatePortal2Page />);
    await screen.findByText(OTP_SESSION.assistant_message);

    const field = screen.getByPlaceholderText('Digite o código de 6 dígitos') as HTMLInputElement;
    expect(field.getAttribute('inputmode')).toBe('numeric');
    expect(field.getAttribute('maxlength')).toBe('6');
    expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: '1234567' } });
    expect(field.value).toBe('123456');
  });

  it('"Não recebi" shows local help and never sends an OTP attempt', async () => {
    vi.mocked(conversationsService.createConversation).mockResolvedValue(OTP_TURN);

    render(<CandidatePortal2Page />);
    await screen.findByText(OTP_SESSION.assistant_message);

    fireEvent.click(screen.getByRole('button', { name: 'Não recebi' }));

    expect(
      await screen.findByText(
        'Sem problema. Confira o CPF/WhatsApp informado ou comece de novo.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar digitar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Trocar dados' })).toBeTruthy();
    expect(conversationsService.sendConversationMessage).not.toHaveBeenCalled();
  });

  it('does not send non-numeric text typed in the OTP field', async () => {
    vi.mocked(conversationsService.createConversation).mockResolvedValue(OTP_TURN);

    render(<CandidatePortal2Page />);
    await screen.findByText(OTP_SESSION.assistant_message);

    const field = screen.getByLabelText('Sua mensagem') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'nao tenho' } });
    // Non-digits are stripped, so the field stays empty and send stays disabled.
    expect(field.value).toBe('');
    expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(conversationsService.sendConversationMessage).not.toHaveBeenCalled();
  });

  it('sends the code to the backend only when 6 digits are entered in VERIFY_OTP', async () => {
    vi.mocked(conversationsService.createConversation).mockResolvedValue(OTP_TURN);
    vi.mocked(conversationsService.sendConversationMessage).mockResolvedValue({
      session_id: 'sess-1',
      current_state: 'CHOOSE_LOCATION',
      assistant_message: 'Em qual cidade você procura vaga?',
      quick_replies: [],
      session: { ...OTP_SESSION, current_state: 'CHOOSE_LOCATION' },
      message: assistantMessage('Em qual cidade você procura vaga?', 'msg-2'),
      options: [],
    });

    render(<CandidatePortal2Page />);
    await screen.findByText(OTP_SESSION.assistant_message);

    const field = screen.getByLabelText('Sua mensagem');
    fireEvent.change(field, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await screen.findByText('Em qual cidade você procura vaga?');
    expect(conversationsService.sendConversationMessage).toHaveBeenCalledWith('sess-1', '123456', 'text');
  });

  it('"Trocar dados" in VERIFY_OTP restarts with a fresh session', async () => {
    vi.mocked(conversationsService.createConversation)
      .mockResolvedValueOnce(OTP_TURN)
      .mockResolvedValueOnce(IDENTIFY_TURN);

    render(<CandidatePortal2Page />);
    await screen.findByText(OTP_SESSION.assistant_message);

    fireEvent.click(screen.getByRole('button', { name: 'Trocar dados' }));

    await screen.findByText(IDENTIFY_SESSION.assistant_message);
    expect(conversationStorage.clear).toHaveBeenCalled();
    expect(conversationsService.createConversation).toHaveBeenCalledTimes(2);
  });
});
