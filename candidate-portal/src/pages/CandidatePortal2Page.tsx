import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send, Sparkles, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Button } from '../components/ui/Button';
import {
  conversationsService,
  type ConversationMessage,
  type ConversationMessageType,
  type ConversationOption,
  type ConversationSession,
  type ConversationTurn,
} from '../services/conversationsService';
import { conversationStorage } from '../services/conversationStorage';

// Friendly, lay-candidate labels for the backend state machine states.
// Anything not mapped falls back to a neutral, non-technical phrase.
const STATE_LABELS: Record<string, string> = {
  IDENTIFY: 'Conhecendo você',
  CHOOSE_LOCATION: 'Escolhendo a cidade',
  CHOOSE_UNIT_OR_ANY: 'Escolhendo o posto',
  CHOOSE_FUNCTION: 'Escolhendo a função',
  CHOOSE_SHIFT: 'Escolhendo o turno',
  SHOW_JOBS: 'Vagas para você',
  COLLECT_RESUME: 'Seu currículo',
  CONFIRM_APPLICATION: 'Confirmando',
  DONE: 'Tudo certo!',
};

function stateLabel(state: string | null): string {
  if (!state) return 'Assistente de vagas';
  return STATE_LABELS[state] ?? 'Assistente de vagas';
}

interface UiMessage {
  id: string;
  role: 'candidate' | 'assistant';
  content: string;
}

function toUiMessage(message: ConversationMessage): UiMessage {
  return {
    id: message.id,
    role:
      message.role === 'candidate' || message.direction === 'inbound'
        ? 'candidate'
        : 'assistant',
    content: message.content,
  };
}

function quickRepliesFromMetadata(metadata: ConversationMessage['metadata']): ConversationOption[] {
  const rawQuickReplies = metadata?.quick_replies;
  if (!Array.isArray(rawQuickReplies)) return [];
  return rawQuickReplies.filter(
    (option): option is ConversationOption =>
      option !== null &&
      typeof option === 'object' &&
      typeof (option as ConversationOption).value === 'string' &&
      typeof (option as ConversationOption).label === 'string',
  );
}

function toUiMessages(history: ConversationMessage[]): UiMessage[] {
  let activeQuickReplies = new Map<string, string>();

  return history.map((message) => {
    const role =
      message.role === 'candidate' || message.direction === 'inbound'
        ? 'candidate'
        : 'assistant';
    const content =
      role === 'candidate' && message.message_type === 'quick_reply'
        ? activeQuickReplies.get(message.content) ?? message.content
        : message.content;

    if (role === 'assistant') {
      activeQuickReplies = new Map(
        quickRepliesFromMetadata(message.metadata).map((option) => [option.value, option.label]),
      );
    }

    return { id: message.id, role, content };
  });
}

function turnSessionId(turn: ConversationTurn): string {
  return turn.session_id ?? turn.session.id;
}

function turnState(turn: ConversationTurn): string {
  return turn.current_state ?? turn.session.current_state;
}

function turnOptions(turn: ConversationTurn): ConversationOption[] {
  return turn.quick_replies ?? turn.options;
}

function sessionOptions(session: ConversationSession): ConversationOption[] {
  return session.quick_replies ?? [];
}

interface FailedPayload {
  content: string;
  type: ConversationMessageType;
}

const INIT_ERROR = 'Não consegui iniciar o assistente agora. Tente novamente.';
const SEND_ERROR = 'Não consegui enviar sua mensagem. Tente novamente.';

export function CandidatePortal2Page() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'init-error'>('loading');
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [options, setOptions] = useState<ConversationOption[]>([]);
  const [currentState, setCurrentState] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const lastFailedRef = useRef<FailedPayload | null>(null);
  const initStartedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function startConversation() {
    setPhase('loading');

    // Try to resume an existing session first.
    const stored = conversationStorage.get();
    if (stored) {
      try {
        const session = await conversationsService.getConversation(stored);
        const history = await conversationsService.listConversationMessages(stored);
        sessionIdRef.current = stored;
        setMessages(toUiMessages(history));
        setCurrentState(session.current_state);
        setOptions(sessionOptions(session));
        setPhase('ready');
        return;
      } catch {
        // Stored session is gone/expired — drop it and start fresh.
        conversationStorage.clear();
        sessionIdRef.current = null;
      }
    }

    // No usable session — create a new one.
    try {
      const turn = await conversationsService.createConversation('web');
      const sessionId = turnSessionId(turn);
      sessionIdRef.current = sessionId;
      conversationStorage.set(sessionId);
      setMessages([toUiMessage(turn.message)]);
      setOptions(turnOptions(turn));
      setCurrentState(turnState(turn));
      setPhase('ready');
    } catch {
      setPhase('init-error');
    }
  }

  // Create or resume the session exactly once on mount (StrictMode-safe).
  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;
    void startConversation();
  }, []);

  // Keep the latest message in view. (scrollTo is optional — absent in jsdom.)
  useEffect(() => {
    const el = scrollRef.current;
    el?.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, options]);

  async function performSend(payload: FailedPayload) {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    setSending(true);
    setSendError(null);
    try {
      const turn = await conversationsService.sendConversationMessage(
        sessionId,
        payload.content,
        payload.type,
      );
      setMessages((prev) => [...prev, toUiMessage(turn.message)]);
      setOptions(turnOptions(turn));
      setCurrentState(turnState(turn));
      lastFailedRef.current = null;
    } catch {
      setSendError(SEND_ERROR);
      lastFailedRef.current = payload;
    } finally {
      setSending(false);
    }
  }

  function submitCandidateReply(content: string, type: ConversationMessageType, display: string) {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((prev) => [...prev, { id: localId, role: 'candidate', content: display.trim() }]);
    setOptions([]); // a reply was chosen/typed — consume the current quick replies
    setInput('');
    void performSend({ content: trimmed, type });
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitCandidateReply(input, 'text', input);
  }

  function handleQuickReply(option: ConversationOption) {
    submitCandidateReply(option.value, 'quick_reply', option.label);
  }

  function handleRetrySend() {
    const failed = lastFailedRef.current;
    if (!failed) return;
    void performSend(failed);
  }

  // ---- Render ----

  return (
    <CandidatePortalLayout maxWidth="content">
      <div className="mx-auto flex max-w-content flex-col">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50">
            <Sparkles className="h-6 w-6 text-primary-700" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900">Assistente de vagas</h1>
            <p className="text-sm text-gray-500">{stateLabel(currentState)}</p>
          </div>
        </div>

        {/* Chat surface */}
        <div className="flex min-h-[60vh] flex-col rounded-2xl border border-gray-200 bg-white shadow-card">
          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto p-4"
            style={{ maxHeight: '60vh' }}
            aria-live="polite"
          >
            {phase === 'loading' && (
              <div className="flex h-40 flex-col items-center justify-center text-gray-400">
                <Loader2 className="mb-2 h-6 w-6 animate-spin" />
                <p className="text-sm">Iniciando o assistente…</p>
              </div>
            )}

            {phase === 'init-error' && (
              <div className="flex h-40 flex-col items-center justify-center text-center">
                <AlertCircle className="mb-3 h-8 w-8 text-primary-700" />
                <p className="text-base font-semibold text-gray-700">{INIT_ERROR}</p>
                <button
                  onClick={() => void startConversation()}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 underline hover:text-primary-800"
                >
                  <RefreshCw className="h-4 w-4" />
                  Tentar novamente
                </button>
              </div>
            )}

            {phase === 'ready' &&
              messages.map((message) => (
                <div
                  key={message.id}
                  className={message.role === 'candidate' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={[
                      'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm sm:text-base',
                      message.role === 'candidate'
                        ? 'bg-primary-700 text-white'
                        : 'bg-gray-100 text-gray-900',
                    ].join(' ')}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
          </div>

          {/* Quick replies */}
          {phase === 'ready' && options.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-gray-100 p-4">
              {options.map((option) => (
                <Button
                  key={option.value}
                  variant="outline"
                  size="lg"
                  fullWidth
                  disabled={sending}
                  onClick={() => handleQuickReply(option)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          )}

          {/* Send error */}
          {sendError && (
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-primary-50 px-4 py-2.5">
              <p className="text-sm text-primary-800">{sendError}</p>
              <button
                onClick={handleRetrySend}
                disabled={sending}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 underline hover:text-primary-800 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                Tentar de novo
              </button>
            </div>
          )}

          {/* Input */}
          {phase === 'ready' && (
            <form onSubmit={handleFormSubmit} className="flex items-center gap-2 border-t border-gray-100 p-3">
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Escreva sua resposta…"
                aria-label="Sua mensagem"
                disabled={sending}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20 disabled:opacity-60 sm:text-base"
              />
              <Button type="submit" size="lg" loading={sending} disabled={!input.trim()}>
                <Send className="h-4 w-4" />
                <span className="sr-only">Enviar</span>
              </Button>
            </form>
          )}
        </div>

        <p className="mt-3 text-center text-xs text-gray-400">
          O assistente ajuda você a encontrar uma vaga. É rápido e simples.
        </p>
      </div>
    </CandidatePortalLayout>
  );
}
