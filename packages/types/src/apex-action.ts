import type { ApexSessionSnapshot } from "./apex-session.js";

export interface ApexActionRequest {
  sessionId: string;
  action: string;
  payload?: unknown;
}

export interface ApexActionResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface RuntimeActionEnvelope {
  id: string;
  sessionId: string;
  action: string;
  payload?: unknown;
  createdAt: number;
}

export interface RuntimeActionResult {
  id: string;
  sessionId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  completedAt: number;
}

export interface RegisterSessionRequest extends ApexSessionSnapshot {
  session: ApexSessionSnapshot["session"];
  messages: ApexSessionSnapshot["messages"];
  thread: ApexSessionSnapshot["thread"];
  branches?: ApexSessionSnapshot["branches"];
  tools: ApexSessionSnapshot["tools"];
  activeTools: ApexSessionSnapshot["activeTools"];
  extensions: ApexSessionSnapshot["extensions"];
  capabilities: ApexSessionSnapshot["capabilities"];
}

export interface RegisterSessionResponse {
  ok: true;
  sessionId: string;
  url: string;
}
