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
  messages: unknown[];
  thread: unknown[];
  branches?: unknown[];
  tools: unknown[];
  activeTools: string[];
  extensions: unknown[];
  capabilities: unknown;
}
