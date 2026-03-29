export interface ApexMessage {
  id: string;
  role: "user" | "assistant" | "system" | "custom";
  content: string;
  customType?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ApexThreadNode {
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
  children: ApexThreadNode[];
  depth: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ApexBranch {
  id: string;
  label: string;
  createdAt: number;
  headNodeId: string | null;
  isActive: boolean;
}

export interface ApexToolDef {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ApexSessionInfo {
  id: string;
  file?: string;
  name?: string;
  cwd: string;
  projectName?: string;
  projectRoot?: string;
  gitBranch?: string;
  provider?: string;
  model?: string;
  isStreaming: boolean;
}

export interface ApexSessionSummary extends ApexSessionInfo {
  lastActivityAt?: number;
  registeredAt: number;
}

export interface ApexSessionSnapshot {
  session: ApexSessionInfo;
  messages: ApexMessage[];
  thread: ApexThreadNode[];
  branches?: ApexBranch[];
  tools: ApexToolDef[];
  activeTools: string[];
  extensions: RuntimeExtensionInfo[];
  capabilities: HostCapabilities;
}
