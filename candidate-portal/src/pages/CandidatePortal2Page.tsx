import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Send,
  Sparkles,
  AlertCircle,
  RefreshCw,
  RotateCcw,
  Loader2,
  UploadCloud,
  File as FileIcon,
  X,
} from 'lucide-react';
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
  AWAITING_RESUME_UPLOAD: 'Seu currículo',
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

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatWhatsapp(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidCpfDigits(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;

  const calcDigit = (length: number) => {
    const sum = digits
      .slice(0, length)
      .split('')
      .reduce((acc, digit, index) => acc + Number(digit) * (length + 1 - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calcDigit(9) === Number(digits[9]) && calcDigit(10) === Number(digits[10]);
}

function maskIdentifierDisplay(mode: IdentifierMode, value: string): string {
  const digits = onlyDigits(value);
  const finalDigits = digits.slice(-3) || '---';
  return mode === 'cpf'
    ? `CPF informado com final ${finalDigits}`
    : `WhatsApp informado com final ${finalDigits}`;
}

function maskLikelyIdentifier(content: string): string {
  const digits = onlyDigits(content);
  if (digits.length < 10 || digits.length > 11) return content;
  const finalDigits = digits.slice(-3);
  return isValidCpfDigits(digits)
    ? `CPF informado com final ${finalDigits}`
    : `WhatsApp informado com final ${finalDigits}`;
}

function toUiMessage(message: ConversationMessage): UiMessage {
  const role =
    message.role === 'candidate' || message.direction === 'inbound'
      ? 'candidate'
      : 'assistant';
  return {
    id: message.id,
    role,
    content: role === 'candidate' ? maskLikelyIdentifier(message.content) : message.content,
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

    return {
      id: message.id,
      role,
      content: role === 'candidate' ? maskLikelyIdentifier(content) : content,
    };
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

function optionDisplayLabel(option: ConversationOption, state: string | null): string {
  if (state === 'IDENTIFY' && option.value === 'cpf') return 'Identificar com CPF';
  if (state === 'IDENTIFY' && option.value === 'whatsapp') return 'Identificar com WhatsApp';
  return option.label;
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
const OTP_HELP_MESSAGE = 'Sem problema. Confira o CPF/WhatsApp informado ou comece de novo.';

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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const lastFailedRef = useRef<FailedPayload | null>(null);
  const initStartedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isOtpState = currentState === 'VERIFY_OTP';
  const isAwaitingResumeState = currentState === 'AWAITING_RESUME_UPLOAD';

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
    setUploading(false);
    setUploadError(null);
    setSelectedFile(null);
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
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, options, phase, sendError, otpHelpShown, uploadError]);

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

  function sendEvent(eventName: string) {
    const sessionId = sessionIdRef.current;
    if (!sessionId || sending || uploading) return;
    void performSend({ content: eventName, type: 'event' });
  }

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Tipo de arquivo inválido. Apenas PDF, DOC, e DOCX são permitidos.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      // 10MB
      setUploadError('Arquivo muito grande. O tamanho máximo é 10MB.');
      return;
    }

    setSelectedFile(file);
    setUploadError(null);
  }

  async function handleUploadResume() {
    const sessionId = sessionIdRef.current;
    if (!selectedFile || !sessionId) return;

    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      await conversationsService.uploadResume(sessionId, formData);
      setSelectedFile(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-upload-success-${Date.now()}`,
          role: 'assistant',
          content: 'Currículo enviado com sucesso.',
        },
      ]);
      sendEvent('resume_uploaded');
    } catch (error) {
      setUploadError('Falha no upload. Tente novamente.');
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    // In VERIFY_OTP keep only digits (max 6) so the candidate can't type
    // free text like "não tenho" into the code field.
    if (isOtpState) {
      setInput(onlyDigits(raw).slice(0, 6));
      return;
    }
    if (identifierMode === 'cpf') {
      setInput(formatCpf(raw));
      return;
    }
    if (identifierMode === 'whatsapp') {
      setInput(formatWhatsapp(raw));
      return;
    }
    setInput(raw);
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
    if (identifierMode) {
      submitCandidateReply(
        onlyDigits(input),
        'text',
        maskIdentifierDisplay(identifierMode, input),
      );
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
        {
          id: `local-mode-${mode}-${Date.now()}`,
          role: 'candidate',
          content: mode === 'cpf' ? 'Identificar com CPF' : 'Identificar com WhatsApp',
        },
        {
          id: `local-guidance-${mode}-${Date.now()}`,
          role: 'assistant',
          content: guidance.instruction,
        },
      ]);
      return;
    }
    submitCandidateReply(option.value, 'quick_reply', optionDisplayLabel(option, currentState));
  }

  function handleRetrySend() {
    const failed = lastFailedRef.current;
    if (!failed) return;
    void performSend(failed);
  }

  // ---- Render ----

  return (
    <CandidatePortalLayout maxWidth="content" hideFooter fullHeight>
      <div className="flex flex-1 flex-col overflow-hidden pb-4 pt-4 sm:pb-6 sm:pt-6">
        {/* Compact Header */}
        <div className="mb-4 flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50">
              <Sparkles className="h-5 w-5 text-primary-700" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Assistente de vagas</h1>
              <p className="text-xs text-gray-500 truncate">{stateLabel(currentState)}</p>
            </div>
          </div>
          {phase === 'ready' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void restartConversation()}
              className="flex-shrink-0 h-9 px-3"
              aria-label="Recomeçar"
            >
              <RotateCcw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Recomeçar</span>
            </Button>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
          {/* Messages Scroll Area */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
            aria-live="polite"
          >
            {phase === 'loading' && (
              <div className="flex h-full flex-col items-center justify-center text-gray-400">
                <Loader2 className="mb-2 h-8 w-8 animate-spin" />
                <p className="text-sm">Iniciando o assistente…</p>
              </div>
            )}

            {phase === 'init-error' && (
              <div className="flex h-full flex-col items-center justify-center text-center p-6">
                <AlertCircle className="mb-3 h-10 w-10 text-primary-700" />
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

            {phase === 'ready' && (
              <>
                {resumed && (
                  <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-xs text-gray-600 mb-2">
                    <RefreshCw className="h-3.5 w-3.5 text-primary-700" />
                    <span>Retomamos sua conversa</span>
                  </div>
                )}
                
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={message.role === 'candidate' ? 'flex justify-end' : 'flex justify-start'}
                  >
                    <div
                      className={[
                        'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm sm:text-base shadow-sm',
                        message.role === 'candidate'
                          ? 'bg-primary-700 text-white rounded-br-none'
                          : 'bg-gray-100 text-gray-900 rounded-bl-none',
                      ].join(' ')}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
                
                {sending && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-400 rounded-2xl rounded-bl-none px-4 py-2.5">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Interaction Controls */}
          <div className="border-t border-gray-100 bg-gray-50/50">
            {phase === 'ready' && isAwaitingResumeState && (
              <div className="p-3 sm:p-4">
                {!selectedFile ? (
                  <>
                    <p className="text-sm text-center text-gray-600 mb-3">
                      Envie seu currículo em PDF, DOC, ou DOCX (max 10MB).
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        size="md"
                        className="flex-1"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        <UploadCloud className="h-4 w-4 mr-2" />
                        Selecionar currículo
                      </Button>
                      <Button
                        variant="outline"
                        size="md"
                        className="bg-white flex-1"
                        onClick={() =>
                          submitCandidateReply(
                            'skip_resume',
                            'quick_reply',
                            'Continuar sem currículo',
                          )
                        }
                        disabled={uploading}
                      >
                        Continuar sem currículo
                      </Button>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="hidden"
                      accept=".pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    />
                  </>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 text-sm text-gray-700 mb-3 p-2 border border-gray-200 rounded-md bg-gray-50 w-full">
                      <FileIcon className="h-5 w-5 text-gray-500 shrink-0" />
                      <span className="truncate flex-1">{selectedFile.name}</span>
                      <button
                        onClick={() => setSelectedFile(null)}
                        className="p-1 text-gray-500 hover:text-gray-700 shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <Button
                      variant="primary"
                      size="md"
                      className="w-full"
                      onClick={handleUploadResume}
                      loading={uploading}
                    >
                      Enviar currículo
                    </Button>
                  </div>
                )}
                {uploadError && (
                  <div className="px-4 pb-2 pt-2 text-xs font-medium text-red-800 text-center">
                    {uploadError}
                  </div>
                )}
              </div>
            )}

            {/* Quick replies */}
            {phase === 'ready' && options.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 sm:p-4">
                {options.map((option) => (
                  <Button
                    key={option.value}
                    variant="outline"
                    size="md"
                    className="bg-white hover:bg-gray-50 text-gray-700 border-gray-200 flex-1 min-w-[140px] sm:flex-none sm:min-w-0"
                    disabled={sending}
                    onClick={() => handleQuickReply(option)}
                  >
                    {optionDisplayLabel(option, currentState)}
                  </Button>
                ))}
              </div>
            )}

            {/* OTP step helpers */}
            {phase === 'ready' && isOtpState && (
              <div className="flex flex-col gap-2 p-3 sm:p-4">
                {!otpHelpShown ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white flex-1"
                      onClick={focusCodeInput}
                    >
                      Digitar código
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white flex-1"
                      onClick={showOtpHelp}
                    >
                      Não recebi
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      onClick={() => void restartConversation()}
                    >
                      Trocar dados
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white flex-1"
                      onClick={focusCodeInput}
                    >
                      Tentar digitar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      onClick={() => void restartConversation()}
                    >
                      Trocar dados
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Send error */}
            {sendError && (
              <div className="flex items-center justify-between gap-3 bg-red-50 px-4 py-2 border-t border-red-100">
                <p className="text-xs font-medium text-red-800">{sendError}</p>
                <button
                  onClick={handleRetrySend}
                  disabled={sending}
                  className="inline-flex items-center gap-1 text-xs font-bold text-red-700 uppercase tracking-wider hover:text-red-900 disabled:opacity-50"
                >
                  <RefreshCw className="h-3 w-3" />
                  Repetir
                </button>
              </div>
            )}

            {/* Input Form */}
            {phase === 'ready' && !isAwaitingResumeState && (
              <form onSubmit={handleFormSubmit} className="flex items-center gap-2 p-3 sm:p-4">
                <div className="relative flex-1">
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
                    inputMode={isOtpState || identifierMode ? 'numeric' : undefined}
                    maxLength={
                      isOtpState
                        ? 6
                        : identifierMode === 'cpf'
                          ? 14
                          : identifierMode === 'whatsapp'
                            ? 15
                            : undefined
                    }
                    aria-label="Sua mensagem"
                    disabled={sending}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-700/10 disabled:opacity-60 sm:text-base shadow-sm"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="rounded-xl h-[46px] w-[46px] p-0 flex items-center justify-center shrink-0"
                  loading={sending}
                  disabled={!canSubmit}
                >
                  <Send className="h-5 w-5" />
                  <span className="sr-only">Enviar</span>
                </Button>
              </form>
            )}
          </div>
        </div>

        <p className="mt-3 text-center text-[10px] uppercase tracking-widest font-semibold text-gray-400">
          Experiência Segura e Protegida
        </p>
      </div>
    </CandidatePortalLayout>
  );
}
