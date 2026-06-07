export type AiAssistantRequest = {
  intent: string;
  arguments: Record<string, unknown>;
  session_id?: string;
};

export type AiAssistantResponse = {
  ok: boolean;
  intent: string;
  tool_name: string | null;
  data: unknown;
  error_code: string | null;
  message: string | null;
  requires_approval: boolean;
  warnings: string[];
};

export type AiAssistantHistoryStatus = "success" | "error";

export type AiAssistantHistoryKind =
  | "vaga"
  | "candidato"
  | "admissao"
  | "conhecimento"
  | "geral";

export type AiAssistantHistoryItem = {
  id: string;
  label: string;
  intent: string;
  kind: AiAssistantHistoryKind;
  status: AiAssistantHistoryStatus;
  timestamp: string;
  query: string | null;
  summary: string;
  result: AiAssistantResponse | null;
  errorMessage: string | null;
};

export type QuickAction = {
  id: string;
  label: string;
  description: string;
  intent: string;
  buildArgs: (params: Record<string, string>) => Record<string, unknown> | null;
};
