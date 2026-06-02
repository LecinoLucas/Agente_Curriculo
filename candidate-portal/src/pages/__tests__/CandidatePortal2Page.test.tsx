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
});
