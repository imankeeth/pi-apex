import type { ApexEvent } from "@pi-apex/types";
import { registry } from "./registry.js";
import { formatSSEEvent, sseConnections } from "./sse.js";

export function broadcastEvent(sessionId: string, event: ApexEvent): void {
  registry.update(sessionId, {});

  const connections = sseConnections.get(sessionId);
  if (!connections || connections.size === 0) return;

  const staleControllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  const bytes = formatSSEEvent(event);

  for (const controller of connections) {
    try {
      controller.enqueue(bytes);
    } catch {
      staleControllers.push(controller);
    }
  }

  for (const controller of staleControllers) {
    connections.delete(controller);
  }

  if (connections.size === 0) {
    sseConnections.delete(sessionId);
  }
}
