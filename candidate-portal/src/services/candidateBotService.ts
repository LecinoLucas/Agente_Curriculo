import { publicApiClient } from './publicApiClient';
import type {
  ConversationMessage,
  ConversationOption,
  ConversationSession,
  ConversationTurn,
} from './conversationsService';

export interface CandidateBotSessionEnvelope {
  session: ConversationSession;
  messages: ConversationMessage[];
  handoff_required: boolean;
}

export interface CandidateBotMessagePayload {
  session_id?: string | null;
  message: string;
  job_id?: string | null;
  operational_unit_id?: string | null;
}

export const candidateBotService = {
  getSession(sessionId: string): Promise<CandidateBotSessionEnvelope> {
    return publicApiClient.get<CandidateBotSessionEnvelope>(`/candidate-bot/sessions/${sessionId}`);
  },

  sendMessage(payload: CandidateBotMessagePayload): Promise<ConversationTurn> {
    return publicApiClient.post<ConversationTurn>('/candidate-bot/message', payload);
  },
};

export type { ConversationMessage, ConversationOption, ConversationSession, ConversationTurn };
