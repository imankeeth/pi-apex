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

export interface RegisterSessionRequest extends ApexSessionSnapshot {}

export interface RegisterSessionResponse {
  ok: true;
  sessionId: string;
  url: string;
}
