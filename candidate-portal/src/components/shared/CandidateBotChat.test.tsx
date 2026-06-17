// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../services/candidateBotService', () => ({
  candidateBotService: {
    getSession: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

vi.mock('../../services/candidateBotSessionStorage', () => ({
  candidateBotSessionStorage: {
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn(),
  },
}));

import { candidateBotService } from '../../services/candidateBotService';
import { candidateBotSessionStorage } from '../../services/candidateBotSessionStorage';
import { CandidateBotChat } from './CandidateBotChat';

function assistantTurn(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    session_id: 'bot-session-1',
    current_state: 'GUIDED_PORTAL_CHAT',
    assistant_message: 'Encontrei estas vagas públicas para você.',
    quick_replies: [{ value: 'falar_com_rh', label: 'Falar com RH' }],
    session: {
      id: 'bot-session-1',
      session_id: 'bot-session-1',
      channel: 'web',
      current_state: 'GUIDED_PORTAL_CHAT',
      status: 'active',
      context: {},
      assistant_message: 'Encontrei estas vagas públicas para você.',
      quick_replies: [{ value: 'falar_com_rh', label: 'Falar com RH' }],
      last_message_at: '2026-06-17T12:00:00Z',
      created_at: '2026-06-17T12:00:00Z',
      updated_at: '2026-06-17T12:00:00Z',
    },
    message: {
      id: 'assistant-msg-1',
      session_id: 'bot-session-1',
      role: 'assistant',
      direction: 'outbound',
      content: 'Encontrei estas vagas públicas para você.',
      message_type: 'text',
      interpreted_intent: null,
      metadata: null,
      created_at: '2026-06-17T12:00:00Z',
    },
    options: [{ value: 'falar_com_rh', label: 'Falar com RH' }],
    handoff_required: false,
    ...overrides,
  };
}

type AssistantTurnPayload = ReturnType<typeof assistantTurn>;

beforeEach(() => {
  vi.mocked(candidateBotSessionStorage.get).mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CandidateBotChat', () => {
  it('renderiza saudação inicial e quick replies locais', async () => {
    render(<CandidateBotChat />);

    expect(
      screen.getByText(
        'Olá! Sou o assistente de recrutamento. Posso te ajudar a ver vagas, tirar dúvidas ou falar com o RH.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver vagas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Falar com RH' })).toBeTruthy();
  });

  it('envia mensagem e mostra resposta do assistente', async () => {
    vi.mocked(candidateBotService.sendMessage).mockResolvedValue(assistantTurn());

    render(<CandidateBotChat jobId="job-1" />);

    fireEvent.change(screen.getByLabelText('Sua mensagem'), {
      target: { value: 'Tem vaga em Goiânia?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Tem vaga em Goiânia?')).toBeTruthy();
    expect(await screen.findByText('Encontrei estas vagas públicas para você.')).toBeTruthy();
    expect(candidateBotService.sendMessage).toHaveBeenCalledWith({
      session_id: null,
      message: 'Tem vaga em Goiânia?',
      job_id: 'job-1',
    });
    expect(candidateBotSessionStorage.set).toHaveBeenCalledWith('bot-session-1');
  });

  it('bloqueia mensagem vazia', async () => {
    render(<CandidateBotChat />);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(candidateBotService.sendMessage).not.toHaveBeenCalled();
  });

  it('mostra estado de loading enquanto envia', async () => {
    let resolveTurn: ((value: AssistantTurnPayload) => void) | undefined;
    vi.mocked(candidateBotService.sendMessage).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTurn = resolve as (value: AssistantTurnPayload) => void;
        }),
    );

    render(<CandidateBotChat />);
    fireEvent.change(screen.getByLabelText('Sua mensagem'), {
      target: { value: 'Ver vagas' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enviar' }).hasAttribute('disabled')).toBe(true);
    });
    resolveTurn?.(assistantTurn());
    expect(await screen.findByText('Encontrei estas vagas públicas para você.')).toBeTruthy();
  });

  it('mostra erro amigável quando o envio falha', async () => {
    vi.mocked(candidateBotService.sendMessage).mockRejectedValue(new Error('Falha ao acessar o backend'));

    render(<CandidateBotChat />);
    fireEvent.change(screen.getByLabelText('Sua mensagem'), {
      target: { value: 'Acompanhar candidatura' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Falha ao acessar o backend')).toBeTruthy();
    expect(screen.queryByText('Acompanhar candidatura')).toBeTruthy();
  });

  it('mostra aviso visual de handoff quando o backend sinaliza handoff_required', async () => {
    vi.mocked(candidateBotService.sendMessage).mockResolvedValue(
      assistantTurn({
        assistant_message: 'Certo, vou encaminhar sua solicitação para o RH.',
        message: {
          id: 'assistant-msg-2',
          session_id: 'bot-session-1',
          role: 'assistant',
          direction: 'outbound',
          content: 'Certo, vou encaminhar sua solicitação para o RH.',
          message_type: 'text',
          interpreted_intent: null,
          metadata: null,
          created_at: '2026-06-17T12:00:00Z',
        },
        handoff_required: true,
      }),
    );

    render(<CandidateBotChat />);
    fireEvent.click(screen.getByRole('button', { name: 'Falar com RH' }));

    expect(await screen.findByText('Sua solicitação foi encaminhada para o RH.')).toBeTruthy();
    expect(candidateBotService.sendMessage).toHaveBeenCalledWith({
      session_id: null,
      message: 'falar_com_rh',
      job_id: null,
    });
  });

  it('reusa session_id salvo quando a sessão ainda é válida', async () => {
    vi.mocked(candidateBotSessionStorage.get).mockReturnValue('bot-session-1');
    vi.mocked(candidateBotService.getSession).mockResolvedValue({
      session: {
        id: 'bot-session-1',
        session_id: 'bot-session-1',
        channel: 'web',
        current_state: 'GUIDED_PORTAL_CHAT',
        status: 'active',
        context: {},
        assistant_message: 'Bem-vinda de volta.',
        quick_replies: [{ value: 'ver_vagas', label: 'Ver vagas' }],
        last_message_at: '2026-06-17T12:00:00Z',
        created_at: '2026-06-17T12:00:00Z',
        updated_at: '2026-06-17T12:00:00Z',
      },
      messages: [
        {
          id: 'assistant-msg-restore',
          session_id: 'bot-session-1',
          role: 'assistant',
          direction: 'outbound',
          content: 'Bem-vinda de volta.',
          message_type: 'text',
          interpreted_intent: null,
          metadata: null,
          created_at: '2026-06-17T12:00:00Z',
        },
      ],
      handoff_required: false,
    });

    render(<CandidateBotChat />);

    expect(await screen.findByText('Bem-vinda de volta.')).toBeTruthy();
    expect(candidateBotService.getSession).toHaveBeenCalledWith('bot-session-1');
  });

  it('renderiza resumo e confirma candidatura com quick reply seguro', async () => {
    vi.mocked(candidateBotService.sendMessage)
      .mockResolvedValueOnce(
        assistantTurn({
          assistant_message:
            'Confira sua candidatura:\nVaga: Caixa\nUnidade: Centro\nNome: Joana\nContato: joana@example.com\n\nConfirma que deseja enviar sua candidatura com essas informações?',
          quick_replies: [
            { value: 'confirmar_candidatura', label: 'Confirmar candidatura' },
            { value: 'alterar_dados', label: 'Alterar dados' },
            { value: 'cancelar_candidatura', label: 'Cancelar' },
          ],
          options: [
            { value: 'confirmar_candidatura', label: 'Confirmar candidatura' },
            { value: 'alterar_dados', label: 'Alterar dados' },
            { value: 'cancelar_candidatura', label: 'Cancelar' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        assistantTurn({
          assistant_message:
            'Sua candidatura foi enviada com sucesso. O RH poderá acompanhar suas informações pelo sistema.',
          message: {
            id: 'assistant-msg-2',
            session_id: 'bot-session-1',
            role: 'assistant',
            direction: 'outbound',
            content:
              'Sua candidatura foi enviada com sucesso. O RH poderá acompanhar suas informações pelo sistema.',
            message_type: 'text',
            interpreted_intent: null,
            metadata: null,
            created_at: '2026-06-17T12:00:00Z',
          },
          quick_replies: [{ value: 'acompanhar_candidatura', label: 'Acompanhar candidatura' }],
          options: [{ value: 'acompanhar_candidatura', label: 'Acompanhar candidatura' }],
        }),
      );

    render(<CandidateBotChat />);

    fireEvent.click(screen.getByRole('button', { name: 'Quero me candidatar' }));
    expect(await screen.findByText(/Confira sua candidatura:/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar candidatura' }));

    expect(await screen.findByText(/Sua candidatura foi enviada com sucesso/)).toBeTruthy();
    expect(candidateBotService.sendMessage).toHaveBeenNthCalledWith(1, {
      session_id: null,
      message: 'quero_me_candidatar',
      job_id: null,
    });
    expect(candidateBotService.sendMessage).toHaveBeenNthCalledWith(2, {
      session_id: 'bot-session-1',
      message: 'confirmar_candidatura',
      job_id: null,
    });
  });

  it('mostra erro de duplicidade retornado pelo backend', async () => {
    vi.mocked(candidateBotService.sendMessage).mockResolvedValue(
      assistantTurn({
        assistant_message:
          'Já encontramos uma candidatura sua para essa vaga. Se precisar de ajuda, posso encaminhar para o RH.',
      }),
    );

    render(<CandidateBotChat />);
    fireEvent.click(screen.getByRole('button', { name: 'Quero me candidatar' }));

    expect(await screen.findByText(/Já encontramos uma candidatura sua para essa vaga/)).toBeTruthy();
  });
});
