import type { ApexEvent } from "@pi-apex/types";

const encoder = new TextEncoder();
export const sseConnections = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>();

function getConnections(sessionId: string): Set<ReadableStreamDefaultController<Uint8Array>> {
  let connections = sseConnections.get(sessionId);
  if (!connections) {
    connections = new Set();
    sseConnections.set(sessionId, connections);
  }
  return connections;
}

function encodeLine(line: string): Uint8Array {
  return encoder.encode(`${line}\n`);
}

function encodeEvent(event: ApexEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify({ type: event.type, payload: event.payload, ts: event.ts })}\n\n`);
}

export function createSSEStream(sessionId: string): Response {
  let cleanup = (): void => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const connections = getConnections(sessionId);
      connections.add(controller);

      controller.enqueue(encodeLine("retry: 2000"));
      controller.enqueue(encodeLine(""));

      const keepalive = globalThis.setInterval(() => {
        try {
          controller.enqueue(encodeLine(": keepalive"));
          controller.enqueue(encodeLine(""));
        } catch {
          cleanup();
        }
      }, 15_000);

      cleanup = () => {
        globalThis.clearInterval(keepalive);
        connections.delete(controller);
        if (connections.size === 0) {
          sseConnections.delete(sessionId);
        }
      };
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export function formatSSEEvent(event: ApexEvent): Uint8Array {
  return encodeEvent(event);
}
