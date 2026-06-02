import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Send, Sparkles, AlertCircle, RefreshCw, RotateCcw, Loader2 } from 'lucide-react';
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
  VERIFY_OTP: 'Confirmando identidade',
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

type IdentifierMode = 'cpf' | 'whatsapp';

const IDENTIFIER_GUIDANCE: Record<IdentifierMode, { instruction: string; placeholder: string }> = {
  cpf: {
    instruction: 'Digite seu CPF no campo abaixo para continuar.',
    placeholder: 'Digite seu CPF',
  },
  whatsapp: {
    instruction: 'Digite seu WhatsApp com DDD no campo abaixo.',
    placeholder: 'Digite seu WhatsApp com DDD',
  },
};

const OTP_PLACEHOLDER = 'Digite o código de 6 dígitos';
const OTP_HELP_MESSAGE =
  'Sem problema. Você pode conferir o CPF/WhatsApp informado ou começar de novo.';

// Accepts a complete 6-digit verification code only — anything shorter or
// non-numeric ("não tenho", "nao recebi", …) is never sent to the backend as OTP.
function isCompleteOtp(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

export function CandidatePortal2Page() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'init-error'>('loading');
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [options, setOptions] = useState<ConversationOption[]>([]);
  const [currentState, setCurrentState] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [identifierMode, setIdentifierMode] = useState<IdentifierMode | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  const [otpHelpShown, setOtpHelpShown] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const lastFailedRef = useRef<FailedPayload | null>(null);
  const initStartedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isOtpState = currentState === 'VERIFY_OTP';

  // Create a brand-new backend session and reset the chat to its opening turn.
  async function createFreshSession() {
    const turn = await conversationsService.createConversation('web');
    const sessionId = turnSessionId(turn);
    sessionIdRef.current = sessionId;
    conversationStorage.set(sessionId);
    setMessages([toUiMessage(turn.message)]);
    setOptions(turnOptions(turn));
    setCurrentState(turnState(turn));
    setPhase('ready');
  }

  async function startConversation() {
    setPhase('loading');

    // Try to resume an existing session first (reload should keep the conversation).
    const stored = conversationStorage.get();
    if (stored) {
      try {
        const session = await conversationsService.getConversation(stored);
        const history = await conversationsService.listConversationMessages(stored);
        sessionIdRef.current = stored;
        setMessages(toUiMessages(history));
        setCurrentState(session.current_state);
        setOptions(sessionOptions(session));
        setResumed(true);
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
      await createFreshSession();
    } catch {
      setPhase('init-error');
    }
  }

  // Manual "start over": wipe the stored session + local history, then open a
  // fresh conversation back at the IDENTIFY step. Reload-resume keeps working
  // because we only clear storage here, on explicit user action.
  async function restartConversation() {
    conversationStorage.clear();
    sessionIdRef.current = null;
    lastFailedRef.current = null;
    setResumed(false);
    setOtpHelpShown(false);
    setIdentifierMode(null);
    setSendError(null);
    setInput('');
    setMessages([]);
    setOptions([]);
    setCurrentState(null);
    setPhase('loading');
    try {
      await createFreshSession();
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
      setIdentifierMode(null);
      setOtpHelpShown(false);
      setResumed(false);
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

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    // In VERIFY_OTP keep only digits (max 6) so the candidate can't type
    // free text like "não tenho" into the code field.
    setInput(isOtpState ? raw.replace(/\D/g, '').slice(0, 6) : raw);
  }

  function showOtpHelp() {
    setOtpHelpShown(true);
    setInput('');
    setMessages((prev) => [
      ...prev,
      {
        id: `local-otp-help-${Date.now()}`,
        role: 'assistant',
        content: OTP_HELP_MESSAGE,
      },
    ]);
  }

  function focusCodeInput() {
    setOtpHelpShown(false);
    inputRef.current?.focus();
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Guard the OTP step: never send an incomplete/non-numeric code as an
    // attempt — offer local help instead.
    if (isOtpState && !isCompleteOtp(input)) {
      if (input.trim().length > 0) showOtpHelp();
      return;
    }
    submitCandidateReply(input, 'text', input);
  }

  const canSubmit = isOtpState ? isCompleteOtp(input) : input.trim().length > 0;

  function handleQuickReply(option: ConversationOption) {
    if (
      currentState === 'IDENTIFY' &&
      (option.value === 'cpf' || option.value === 'whatsapp')
    ) {
      const mode = option.value;
      const guidance = IDENTIFIER_GUIDANCE[mode];
      setIdentifierMode(mode);
      setInput('');
      setOptions([]);
      setMessages((prev) => [
        ...prev,
        { id: `local-mode-${mode}-${Date.now()}`, role: 'candidate', content: option.label },
        {
          id: `local-guidance-${mode}-${Date.now()}`,
          role: 'assistant',
          content: guidance.instruction,
        },
      ]);
      return;
    }
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
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold text-gray-900">Assistente de vagas</h1>
            <p className="text-sm text-gray-500">{stateLabel(currentState)}</p>
          </div>
          {phase === 'ready' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void restartConversation()}
              className="flex-shrink-0"
              aria-label="Começar nova conversa"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Começar nova conversa</span>
            </Button>
          )}
        </div>

        {/* Resumed-session feedback */}
        {phase === 'ready' && resumed && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            <RefreshCw className="h-4 w-4 flex-shrink-0 text-primary-700" />
            <span>Continuamos de onde você parou.</span>
          </div>
        )}

        {/* Chat surface */}
        <div className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-card">
          {/* Messages */}
          <div
            ref={scrollRef}
            className="min-h-[180px] space-y-3 overflow-y-auto p-4 sm:min-h-[200px]"
            style={{ maxHeight: '44vh' }}
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

          {/* OTP step — friendly quick actions for lay candidates */}
          {phase === 'ready' && isOtpState && (
            <div className="flex flex-col gap-2 border-t border-gray-100 p-4">
              {!otpHelpShown ? (
                <>
                  <p className="text-sm text-gray-500">
                    Digite o código de 6 dígitos no campo abaixo ou escolha uma opção:
                  </p>
                  <Button variant="outline" size="lg" fullWidth onClick={focusCodeInput}>
                    Digitar código
                  </Button>
                  <Button variant="outline" size="lg" fullWidth onClick={showOtpHelp}>
                    Não recebi o código
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    onClick={() => void restartConversation()}
                  >
                    Trocar CPF/WhatsApp
                  </Button>
                  <Button
                    variant="ghost"
                    size="lg"
                    fullWidth
                    onClick={() => void restartConversation()}
                  >
                    Começar de novo
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="lg" fullWidth onClick={focusCodeInput}>
                    Tentar digitar o código
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    onClick={() => void restartConversation()}
                  >
                    Trocar CPF/WhatsApp
                  </Button>
                  <Button
                    variant="ghost"
                    size="lg"
                    fullWidth
                    onClick={() => void restartConversation()}
                  >
                    Começar de novo
                  </Button>
                </>
              )}
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
                ref={inputRef}
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder={
                  isOtpState
                    ? OTP_PLACEHOLDER
                    : identifierMode
                      ? IDENTIFIER_GUIDANCE[identifierMode].placeholder
                      : 'Escreva sua resposta…'
                }
                inputMode={isOtpState ? 'numeric' : undefined}
                maxLength={isOtpState ? 6 : undefined}
                aria-label="Sua mensagem"
                disabled={sending}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20 disabled:opacity-60 sm:text-base"
              />
              <Button type="submit" size="lg" loading={sending} disabled={!canSubmit}>
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
