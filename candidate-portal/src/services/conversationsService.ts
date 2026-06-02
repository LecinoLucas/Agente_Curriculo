// Conversation Engine client (OP-6B backend).
//
// These endpoints live under /api/v1/conversations — NOT under /public — so this
// service uses its own base URL instead of reusing publicApiClient.
//
// Priority for the base URL mirrors publicApiClient:
//   VITE_API_URL (already the /api/v1 base) > hardcoded localhost default.
const { VITE_API_URL } =
  (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env ?? {};
const BASE_URL = VITE_API_URL ?? 'http://localhost:8000/api/v1';

const CONNECTION_ERROR =
  'Falha na conexão com o servidor. Verifique sua internet e tente novamente.';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

// ---- Contract types (mirror backend conversation_schemas.py) ----

export type ConversationChannel = 'web' | 'whatsapp';

export interface ConversationSession {
  id: string;
  session_id?: string;
  channel: string;
  current_state: string;
  status: string;
  context: Record<string, unknown>;
  assistant_message?: string;
  quick_replies?: ConversationOption[];
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  session_id: string;
  role?: 'candidate' | 'assistant' | 'system' | string;
  direction?: 'inbound' | 'outbound' | 'system' | string;
  content: string;
  message_type: string;
  interpreted_intent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ConversationOption {
  value: string;
  label: string;
}

export interface ConversationTurn {
  session_id?: string;
  current_state?: string;
  assistant_message?: string;
  quick_replies?: ConversationOption[];
  session: ConversationSession;
  message: ConversationMessage;
  options: ConversationOption[];
}

export type ConversationMessageType = 'text' | 'quick_reply' | 'system';

// ---- Low-level request helper ----

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(CONNECTION_ERROR);
  }
  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const json = (await response.json()) as {
        detail?: unknown;
        error?: { message?: unknown };
      };
      if (json?.error?.message) message = String(json.error.message);
      else if (json?.detail) message = String(json.detail);
    } catch {
      /* ignore parse error */
    }
    throw new HttpError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---- Public API ----

export const conversationsService = {
  /** POST /conversations — start a new web session. Returns the opening turn. */
  createConversation(channel: ConversationChannel = 'web'): Promise<ConversationTurn> {
    return request<ConversationTurn>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ channel }),
    });
  },

  /** GET /conversations/{id} — fetch the current session state (used to resume). */
  getConversation(conversationId: string): Promise<ConversationSession> {
    return request<ConversationSession>(`/conversations/${conversationId}`);
  },

  /** POST /conversations/{id}/messages — send the candidate's reply, get the next turn. */
  sendConversationMessage(
    conversationId: string,
    content: string,
    messageType: ConversationMessageType = 'text',
  ): Promise<ConversationTurn> {
    return request<ConversationTurn>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, message_type: messageType }),
    });
  },

  /** GET /conversations/{id}/messages — full message history (used to repaint on resume). */
  listConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
    return request<ConversationMessage[]>(`/conversations/${conversationId}/messages`);
  },
};
