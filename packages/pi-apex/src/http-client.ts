import type { ApexEvent, ApexSessionSnapshot, RegisterSessionResponse } from "@pi-apex/types";

// Lightweight fetch client for runtime -> bridge communication.

export const bridgeBase = process.env.PI_APEX_BRIDGE_URL ?? "http://127.0.0.1:4200";

export async function registerSession(
  snapshot: ApexSessionSnapshot
): Promise<RegisterSessionResponse> {
  const res = await fetch(`${bridgeBase}/api/apex/runtime/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });

  if (!res.ok) {
    throw new Error(`Registration failed: ${res.status}`);
  }

  return (await res.json()) as RegisterSessionResponse;
}

export async function publishEvent(sessionId: string, event: ApexEvent): Promise<void> {
  const res = await fetch(`${bridgeBase}/api/apex/runtime/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, event, ts: Date.now() }),
  });

  if (!res.ok) {
    throw new Error(`Event publish failed: ${res.status}`);
  }
}

export async function fetchCurrentSession(): Promise<ApexSessionSnapshot | null> {
  const res = await fetch(`${bridgeBase}/api/apex/session/current`);
  if (!res.ok) {
    throw new Error(`Failed to fetch current session: ${res.status}`);
  }

  return (await res.json()) as ApexSessionSnapshot | null;
}
