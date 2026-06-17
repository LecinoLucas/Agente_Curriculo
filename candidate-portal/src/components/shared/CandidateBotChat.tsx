import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, MessageCircle, Send } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  candidateBotService,
  type CandidateBotSessionEnvelope,
  type ConversationMessage,
  type ConversationOption,
  type ConversationTurn,
} from '../../services/candidateBotService';
import { candidateBotSessionStorage } from '../../services/candidateBotSessionStorage';

const MAX_MESSAGE_LENGTH = 500;

const INITIAL_OPTIONS: ConversationOption[] = [
  { value: 'ver_vagas', label: 'Ver vagas' },
  { value: 'quero_me_candidatar', label: 'Quero me candidatar' },
  { value: 'acompanhar_candidatura', label: 'Acompanhar candidatura' },
  { value: 'falar_com_rh', label: 'Falar com RH' },
];

const INITIAL_ASSISTANT_MESSAGE =
  'Olá! Sou o assistente de recrutamento. Posso te ajudar a ver vagas, tirar dúvidas ou falar com o RH.';

interface UiMessage {
  id: string;
  role: 'candidate' | 'assistant';
  content: string;
}

function toUiMessage(message: ConversationMessage): UiMessage {
  return {
    id: message.id,
    role: message.role === 'candidate' ? 'candidate' : 'assistant',
    content: message.content,
  };
}

function initialMessages(): UiMessage[] {
  return [{ id: 'candidate-bot-welcome', role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }];
}

function extractOptions(turn: ConversationTurn): ConversationOption[] {
  return turn.quick_replies ?? turn.options ?? [];
}

function extractSessionId(turn: ConversationTurn): string {
  return turn.session_id ?? turn.session.id;
}

function friendlyErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Não consegui enviar sua mensagem agora. Tente novamente.';
}

export function CandidateBotChat({ jobId }: { jobId?: string | null }) {
  const [messages, setMessages] = useState<UiMessage[]>(() => initialMessages());
  const [options, setOptions] = useState<ConversationOption[]>(INITIAL_OPTIONS);
  const [input, setInput] = useState('');
  const [loadingSession, setLoadingSession] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoffRequired, setHandoffRequired] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const transcriptLoadedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const trimmedInput = input.trim();
  const tooLong = input.length > MAX_MESSAGE_LENGTH;
  const canSend = trimmedInput.length > 0 && !tooLong && !sending;

  useEffect(() => {
    if (transcriptLoadedRef.current) return;
    transcriptLoadedRef.current = true;

    const stored = candidateBotSessionStorage.get();
    if (!stored) {
      setLoadingSession(false);
      return;
    }

    candidateBotService
      .getSession(stored)
      .then((payload: CandidateBotSessionEnvelope) => {
        sessionIdRef.current = payload.session.id;
        setMessages(payload.messages.length ? payload.messages.map(toUiMessage) : initialMessages());
        setOptions(payload.session.quick_replies ?? INITIAL_OPTIONS);
        setHandoffRequired(payload.handoff_required);
      })
      .catch(() => {
        candidateBotSessionStorage.clear();
        sessionIdRef.current = null;
        setMessages(initialMessages());
        setOptions(INITIAL_OPTIONS);
        setHandoffRequired(false);
      })
      .finally(() => {
        setLoadingSession(false);
      });
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, loadingSession, sending]);

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || sending || message.length > MAX_MESSAGE_LENGTH) return;

    setError(null);
    setSending(true);

    const optimisticId = `candidate-local-${Date.now()}`;
    setMessages((current) => [...current, { id: optimisticId, role: 'candidate', content: message }]);
    setInput('');

    try {
      const turn = await candidateBotService.sendMessage({
        session_id: sessionIdRef.current,
        message,
        job_id: jobId ?? null,
      });
      const sessionId = extractSessionId(turn);
      sessionIdRef.current = sessionId;
      candidateBotSessionStorage.set(sessionId);
      setOptions(extractOptions(turn));
      setHandoffRequired(Boolean(turn.handoff_required));
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimisticId),
        { id: optimisticId, role: 'candidate', content: message },
        {
          id: turn.message.id,
          role: 'assistant',
          content: turn.assistant_message ?? turn.message.content,
        },
      ]);
    } catch (sendError) {
      setMessages((current) => current.filter((item) => item.id !== optimisticId));
      setInput(message);
      setError(friendlyErrorMessage(sendError));
    } finally {
      setSending(false);
    }
  }

  const helperText = useMemo(() => {
    if (tooLong) {
      return `Limite de ${MAX_MESSAGE_LENGTH} caracteres por mensagem.`;
    }
    return 'Não envie dados sensíveis ou documentos admissionais por aqui.';
  }, [tooLong]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-red-700">
              <MessageCircle className="h-3.5 w-3.5" />
              Assistente de recrutamento
            </p>
            <h3 className="mt-2 text-lg font-extrabold tracking-tight text-gray-950">
              Mensagens e orientação segura
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Tire dúvidas sobre vagas públicas, processo seletivo e fale com o RH quando precisar.
            </p>
          </div>
        </div>
      </div>

      {handoffRequired ? (
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-900 sm:px-6">
          Sua solicitação foi encaminhada para o RH.
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="max-h-[420px] min-h-[320px] space-y-4 overflow-y-auto px-5 py-5 sm:px-6"
        aria-label="Histórico da conversa"
      >
        {loadingSession ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando conversa…
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={[
                'flex',
                message.role === 'candidate' ? 'justify-end' : 'justify-start',
              ].join(' ')}
            >
              <div
                className={[
                  'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
                  message.role === 'candidate'
                    ? 'bg-gray-950 text-white'
                    : 'border border-gray-200 bg-gray-50 text-gray-800',
                ].join(' ')}
              >
                {message.content}
              </div>
            </div>
          ))
        )}
      </div>

      {options.length ? (
        <div className="border-t border-gray-100 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <button
                key={`${option.value}:${option.label}`}
                type="button"
                className="rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={sending || loadingSession}
                onClick={() => void sendMessage(option.label)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form
        className="border-t border-gray-100 px-5 py-4 sm:px-6"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
        }}
      >
        <label htmlFor="candidate-bot-input" className="sr-only">
          Sua mensagem
        </label>
        <div className="flex gap-3">
          <input
            id="candidate-bot-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Escreva sua dúvida sobre vagas, processo ou atendimento."
            className="min-w-0 flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-red-300 focus:ring-2 focus:ring-red-100"
            maxLength={MAX_MESSAGE_LENGTH + 40}
            aria-invalid={tooLong}
          />
          <Button type="submit" size="md" disabled={!canSend} loading={sending}>
            {!sending && <Send className="mr-1.5 h-4 w-4" />}
            Enviar
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className={tooLong ? 'font-semibold text-red-700' : 'text-gray-500'}>{helperText}</p>
          <span className="text-gray-400">{Math.min(input.length, MAX_MESSAGE_LENGTH)}/{MAX_MESSAGE_LENGTH}</span>
        </div>
        {error ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : null}
      </form>
    </section>
  );
}
