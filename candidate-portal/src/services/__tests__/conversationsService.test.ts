import { afterEach, describe, expect, it, vi } from 'vitest';

const BASE = 'http://localhost:8000/api/v1';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

const TURN = {
  session_id: 'sess-1',
  current_state: 'CHOOSE_LOCATION',
  assistant_message: 'Em qual cidade você procura vaga?',
  quick_replies: [{ value: 'peritoro', label: 'Peritoró' }],
  session: SESSION,
  message: {
    id: 'msg-1',
    session_id: 'sess-1',
    direction: 'outbound',
    content: 'Em qual cidade você procura vaga?',
    message_type: 'text',
    interpreted_intent: null,
    metadata: null,
    created_at: '2026-06-01T10:00:00Z',
  },
  options: [{ value: 'peritoro', label: 'Peritoró' }],
};

describe('conversationsService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('createConversation posts to /conversations with channel and returns the turn', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(TURN, 201));
    vi.stubGlobal('fetch', fetchMock);
    const { conversationsService } = await import('../conversationsService');

    const turn = await conversationsService.createConversation('web');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/conversations`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ channel: 'web' }),
      }),
    );
    expect(turn.session.id).toBe('sess-1');
    expect(turn.options[0].label).toBe('Peritoró');
  });

  it('getConversation fetches GET /conversations/{id}', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(SESSION));
    vi.stubGlobal('fetch', fetchMock);
    const { conversationsService } = await import('../conversationsService');

    const session = await conversationsService.getConversation('sess-1');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/conversations/sess-1`,
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(session.current_state).toBe('CHOOSE_LOCATION');
    expect(session.quick_replies?.[0].label).toBe('Peritoró');
  });

  it('sendConversationMessage posts content + message_type to the messages endpoint', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(TURN));
    vi.stubGlobal('fetch', fetchMock);
    const { conversationsService } = await import('../conversationsService');

    await conversationsService.sendConversationMessage('sess-1', 'peritoro', 'quick_reply');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/conversations/sess-1/messages`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ content: 'peritoro', message_type: 'quick_reply' }),
      }),
    );
  });

  it('listConversationMessages fetches GET /conversations/{id}/messages', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([TURN.message]));
    vi.stubGlobal('fetch', fetchMock);
    const { conversationsService } = await import('../conversationsService');

    const messages = await conversationsService.listConversationMessages('sess-1');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/conversations/sess-1/messages`,
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(messages).toHaveLength(1);
  });

  it('throws HttpError with backend detail on non-ok responses', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ detail: 'sessão não encontrada' }, 404));
    vi.stubGlobal('fetch', fetchMock);
    const { conversationsService, HttpError } = await import('../conversationsService');

    await expect(conversationsService.getConversation('missing')).rejects.toBeInstanceOf(
      HttpError,
    );
  });

  it('throws HttpError with backend public error message on non-ok responses', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { message: 'Conversa não encontrada' } }, 404),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { conversationsService } = await import('../conversationsService');

    await expect(conversationsService.getConversation('missing')).rejects.toThrow(
      'Conversa não encontrada',
    );
  });

  it('throws a connection error when fetch itself fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('network down');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { conversationsService } = await import('../conversationsService');

    await expect(conversationsService.createConversation()).rejects.toThrow(/conexão/i);
  });

  describe('uploadResume', () => {
    it('resolves without throwing on a 200 ok response', async () => {
      const fetchMock = vi.fn(async () => new Response('{"message":"ok"}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const { conversationsService } = await import('../conversationsService');

      await expect(
        conversationsService.uploadResume('sess-1', new FormData()),
      ).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/conversations/sess-1/resume`,
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
    });

    it('propagates backend detail message on 400 error', async () => {
      const fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: 'Arquivo muito grande (máx 10MB)' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const { conversationsService, HttpError } = await import('../conversationsService');

      const err = await conversationsService
        .uploadResume('sess-1', new FormData())
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpError);
      expect((err as InstanceType<typeof HttpError>).message).toBe('Arquivo muito grande (máx 10MB)');
      expect((err as InstanceType<typeof HttpError>).status).toBe(400);
    });

    it('propagates error.message from backend on non-ok response', async () => {
      const fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'Tipo de arquivo não permitido' } }), {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const { conversationsService } = await import('../conversationsService');

      await expect(
        conversationsService.uploadResume('sess-1', new FormData()),
      ).rejects.toThrow('Tipo de arquivo não permitido');
    });

    it('falls back to generic Erro {status} when backend returns no parseable body', async () => {
      const fetchMock = vi.fn(
        async () => new Response('not json', { status: 500 }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const { conversationsService, HttpError } = await import('../conversationsService');

      const err = await conversationsService
        .uploadResume('sess-1', new FormData())
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpError);
      expect((err as InstanceType<typeof HttpError>).message).toBe('Erro 500');
    });
  });
});
