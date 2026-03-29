import type { HostCapabilities } from "./host-capabilities.js";
import type { RuntimeExtensionInfo } from "./runtime-extension.js";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "custom";
  content: string;
  customType?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ToolDef {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
}

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
  messages: Message[];
  thread: ThreadNode[];
  branches?: Branch[];
  tools: ToolDef[];
  activeTools: string[];
  extensions: RuntimeExtensionInfo[];
  capabilities: HostCapabilities;
}
