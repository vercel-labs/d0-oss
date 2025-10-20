export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface AssistantResponseStep {
  id: string;
  status: "thinking" | "active" | "completed";
  text: string;
  timestamp: number;
}

export interface AssistantResponse {
  id: string;
  steps: AssistantResponseStep[];
  results: {
    columns: Array<{ name: string; type?: string }>;
    rows: Array<Record<string, unknown>>;
    sql?: string | null;
    totalRows: number;
  } | null;
  interpretation: string;
  error: string | null;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: any[];
  model?: string;
}
