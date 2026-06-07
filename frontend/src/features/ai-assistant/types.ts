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

export type QuickAction = {
  id: string;
  label: string;
  description: string;
  intent: string;
  buildArgs: (params: Record<string, string>) => Record<string, unknown> | null;
};
