const defaultBridgeBase = "http://localhost:4200";
const configuredBridgeBase = (globalThis as { __PI_APEX_BRIDGE_BASE__?: string }).__PI_APEX_BRIDGE_BASE__;

export const bridgeBase = (configuredBridgeBase ?? defaultBridgeBase).replace(/\/+$/, "");

export interface ApexActionRequest {
  id?: string;
  sessionId: string;
  action: string;
  payload?: unknown;
  createdAt?: number;
}

export async function getPendingActions(sessionId: string): Promise<ApexActionRequest[]> {
  const res = await fetch(`${bridgeBase}/api/apex/runtime/actions/${encodeURIComponent(sessionId)}`);
  if (!res.ok) {
    return [];
  }
  return (await res.json()) as ApexActionRequest[];
}

export async function submitActionResult(result: {
  actionId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}): Promise<void> {
  await fetch(`${bridgeBase}/api/apex/runtime/action-result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  }).catch(() => {});
}
