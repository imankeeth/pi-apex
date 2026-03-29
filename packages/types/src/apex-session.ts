import type { HostCapabilities } from "./host-capabilities.js";
import type { RuntimeExtensionInfo } from "./runtime-extension.js";

export interface ApexSessionInfo {
  id: string;
  projectName: string;
  projectRoot: string;
  cwd: string;
  gitBranch?: string | null;
}

export interface ApexSessionSummary extends ApexSessionInfo {
  registeredAt: number;
  lastActivityAt: number;
}

export interface Message {
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

export interface ApexSessionSnapshot {
  session: ApexSessionInfo;
  messages: Message[];
  thread: ThreadNode[];
  branches: Branch[];
  tools: ToolDef[];
  activeTools: string[];
  extensions: RuntimeExtensionInfo[];
  capabilities: HostCapabilities;
}
