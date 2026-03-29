// ============================================================================
// TYPES — All shared types for the pi-apex SDK
// Pure data + events. No UI opinions.
// ============================================================================

// --- Core primitives ---

export type Unsubscribe = () => void;

export interface SessionContext {
  cwd: string;
  projectName: string;
  gitBranch: string | null;
  model?: string | null;
  env: Record<string, string>;
  files: string[] | null;
}

export interface ApexSessionSnapshot {
  session: {
    id: string;
    cwd: string;
    projectName: string;
    gitBranch: string | null;
    model?: string | null;
  };
  messages: Message[];
  thread: ThreadNode[];
  branches: Branch[];
  tools: ToolDef[];
  activeTools: string[];
}

// --- Messaging ---

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "custom";
  content: string;
  customType?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface SendOptions {
  deliverAs?: "user" | "followUp" | "steer" | "system";
  injectAt?: string; // thread node ID to branch from
  branchLabel?: string;
}

// --- Tools ---

export interface ToolDef {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  timestamp: number;
}

export interface ToolResult {
  id: string;
  callId: string;
  toolName: string;
  content: ToolResultContent[];
  isError: boolean;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ToolResultContent {
  type: "text" | "image" | "resource" | "custom";
  text?: string;
  data?: string;
  mimeType?: string;
  path?: string;
  customType?: string;
}

export type InterceptHandler = (
  toolCall: ToolCall,
  next: (toolCall: ToolCall) => Promise<ToolResult>
) => Promise<ToolResult>;

// --- Thread / Branching ---

export interface ThreadNode {
  id: string;
  type:
    | "user_message"
    | "assistant_message"
    | "tool_call"
    | "tool_result"
    | "system_message"
    | "custom";
  label: string;
  content: string;
  parentId: string | null;
  children: ThreadNode[];
  depth: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface Branch {
  id: string;
  label: string;
  createdAt: number;
  headNodeId: string | null;
  isActive: boolean;
}

// --- Thinking ---

export interface ThinkingState {
  isThinking: boolean;
  reasonerSteps: string[];
  currentStep: string | null;
}

// --- Events ---

export interface SessionEventMap {
  tool_call: ToolCall;
  tool_result: ToolResult;
  message: Message;
  thinking: ThinkingState;
  session_fork: Branch;
  session_switch: Branch;
  session_reset: void;
}

// --- Extension manifest ---

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string;
  type: "ui-extension" | "tool-extension" | "full-extension";
  entry: string;
  tools?: string[];
  events?: (keyof SessionEventMap)[];
}

// --- SDK shape ---

export interface PiSDK {
  session: SessionAPI;
  messaging: MessagingAPI;
  tools: ToolsAPI;
  events: EventsAPI;
  context: ContextAPI;
}

export interface SessionAPI {
  getMessages(): Promise<Message[]>;
  getThread(): Promise<ThreadNode[]>;
  getBranches(): Promise<Branch[]>;
  fork(label?: string): Promise<Branch>;
  switch(branchId: string): Promise<void>;
  abort(): Promise<void>;
  compact(): Promise<void>;
  getActiveBranch(): Promise<Branch | null>;
}

export interface MessagingAPI {
  send(text: string, options?: SendOptions): Promise<void>;
  sendAsUser(text: string): Promise<void>;
  sendAsSystem(text: string): Promise<void>;
  prompt(text: string, options?: SendOptions): Promise<void>;
  steer(text: string): Promise<void>;
  followUp(text: string): Promise<void>;
  append(type: string, data: unknown): Promise<void>;
}

export interface ToolsAPI {
  getAll(): Promise<ToolDef[]>;
  getActive(): Promise<string[]>;
  setActive(names: string[]): Promise<void>;
  call(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  intercept(name: string, handler: InterceptHandler): void;
}

export interface EventsAPI {
  onToolCall(fn: (tc: ToolCall) => void): Unsubscribe;
  onToolResult(fn: (tr: ToolResult) => void): Unsubscribe;
  onMessage(fn: (msg: Message) => void): Unsubscribe;
  onThinking(fn: (state: ThinkingState) => void): Unsubscribe;
  onFork(fn: (branch: Branch) => void): Unsubscribe;
  onSwitch(fn: (branch: Branch) => void): Unsubscribe;
  onReset(fn: () => void): Unsubscribe;
}

export interface ContextAPI {
  get(): Promise<SessionContext>;
}
