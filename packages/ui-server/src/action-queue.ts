import type { ApexActionRequest, RuntimeActionEnvelope } from "@pi-apex/types";

const pendingActions = new Map<string, RuntimeActionEnvelope[]>();
let actionCounter = 0;

function generateActionId(sessionId: string): string {
  actionCounter += 1;
  return `${sessionId}:${Date.now()}:${actionCounter}`;
}

export const actionQueue = {
  enqueue(sessionId: string, action: ApexActionRequest): RuntimeActionEnvelope {
    const envelope: RuntimeActionEnvelope = {
      id: generateActionId(sessionId),
      sessionId: action.sessionId,
      action: action.action,
      payload: action.payload,
      createdAt: Date.now(),
    };

    const queue = pendingActions.get(sessionId) ?? [];
    queue.push(envelope);
    pendingActions.set(sessionId, queue);
    return envelope;
  },

  dequeueAll(sessionId: string): RuntimeActionEnvelope[] {
    const actions = pendingActions.get(sessionId) ?? [];
    pendingActions.set(sessionId, []);
    return actions;
  },

  submitResult(_result: { actionId: string; ok: boolean; result?: unknown; error?: string }): void {
    // v1: results are acknowledged by the runtime and discarded.
  },
};
