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

export type AiAssistantPageDomain =
  | "job"
  | "candidate"
  | "admission"
  | "admin"
  | "knowledge"
  | "generic";

export type AiAssistantHistoryItem = {
  id: string;
  label: string;
  intent: string;
  kind: AiAssistantHistoryKind;
  domain?: AiAssistantPageDomain;
  entityId?: string | null;
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

export type AiAssistantContextAction =
  | {
      id: string;
      kind: "assistant";
      label: string;
      description: string;
      intent: string;
      arguments: Record<string, unknown>;
      section?: "actions" | "suggestions";
    }
  | {
      id: string;
      kind: "knowledge";
      label: string;
      description: string;
      intent: "knowledge.search" | "knowledge.answer";
      query: string;
      arguments: Record<string, unknown>;
      section?: "actions" | "suggestions";
    }
  | {
      id: string;
      kind: "navigation";
      label: string;
      description: string;
      href: string;
      section?: "actions" | "suggestions";
    };

export type AiAssistantPageContext = {
  route: string;
  domain: AiAssistantPageDomain;
  entityId?: string;
  entityLabel?: string;
  title: string;
  subtitle: string;
  guidance: string;
  emptyTitle: string;
  emptyDescription: string;
  availableActions: AiAssistantContextAction[];
  suggestedActions: AiAssistantContextAction[];
};
