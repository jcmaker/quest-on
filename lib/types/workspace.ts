/** Hybrid workspace type definitions for code, ERD, and mindmap assignments */

/** Valid task types for exams/assignments */
export type TaskType = "exam" | "report" | "code" | "erd" | "mindmap";

/** Supported programming languages for the code editor */
export type CodeLanguage =
  | "sql"
  | "python"
  | "javascript"
  | "typescript"
  | "java"
  | "c"
  | "cpp"
  | "go"
  | "rust"
  | "plaintext";

/** Column definition within an ERD table node */
export interface ErdColumn {
  name: string;
  type: string;
  isPrimary?: boolean;
  isForeignKey?: boolean;
  references?: string; // "table.column"
}

/** ERD table node for React Flow */
export interface ErdNode {
  id: string;
  type: "table";
  position: { x: number; y: number };
  data: {
    tableName: string;
    columns: ErdColumn[];
  };
}

/** ERD relationship edge for React Flow */
export interface ErdEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: "one-to-one" | "one-to-many" | "many-to-many";
}

/** ERD diagram state */
export interface ErdState {
  nodes: ErdNode[];
  edges: ErdEdge[];
}

/**
 * Single source of truth for the student's hybrid workspace.
 * Stored in submissions.workspace_state (JSONB).
 */
export interface WorkspaceState {
  code: string;
  language: CodeLanguage;
  erd: ErdState;
  notes: string; // HTML from TipTap or plain text
  lastUpdated: string; // ISO 8601 timestamp
}

/**
 * Instructor-provided template stored in exams.initial_state (JSONB).
 * Used to initialize the student's workspace on first load.
 */
export interface InitialState {
  starterCode?: string;
  language?: CodeLanguage;
  initialErd?: ErdState;
  instructions?: string;
}

/**
 * Canvas layout configuration stored in exams.canvas_config (JSONB).
 * Controls which panes are visible in the student workspace.
 */
export interface CanvasConfig {
  secondaryCanvas: boolean;
  layout?: "horizontal" | "vertical";
  codeEnabled?: boolean;
  erdEnabled?: boolean;
  notesEnabled?: boolean;
}

/** Creates a default empty workspace state */
export function createDefaultWorkspaceState(
  initial?: InitialState
): WorkspaceState {
  return {
    code: initial?.starterCode ?? "",
    language: initial?.language ?? "sql",
    erd: initial?.initialErd ?? { nodes: [], edges: [] },
    notes: initial?.instructions ?? "",
    lastUpdated: new Date().toISOString(),
  };
}
