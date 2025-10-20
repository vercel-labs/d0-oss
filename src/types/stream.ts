export interface StreamEvent {
  type:
    | "start"
    | "start-step"
    | "reasoning-start"
    | "reasoning-delta"
    | "reasoning-end"
    | "tool-input-start"
    | "tool-input-end"
    | "tool-input-available"
    | "tool-output-available"
    | "data-table-start"
    | "data-table-delta"
    | "data-table-end"
    | "text-start"
    | "text-delta"
    | "text-end"
    | "finish-step"
    | "finish"
    | "error"
    | "done";
  toolName?: string;
  sql?: string;
  columns?: Column[];
  rows?: Record<string, unknown>[];
  delta?: string;
  id?: string;
  error?: string;
  errorText?: string;
  input?: unknown;
  output?: unknown;
}

export interface Step {
  id: string;
  status: "thinking" | "active" | "completed" | "error";
  text: string;
  timestamp: number;
  detailText?: string;
}

export interface Column {
  name: string;
  type: string;
}

export interface TableData {
  columns: Column[];
  rows: Record<string, unknown>[];
  sql?: string;
  totalRows?: number;
  executionTime?: number;
}

export interface QueryState {
  isLoading: boolean;
  steps: Step[];
  results: TableData | null;
  interpretation: string;
  error: string | null;
}
