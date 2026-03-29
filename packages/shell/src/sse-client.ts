import type { ApexEvent } from "@pi-apex/types";

type EventHandler = (event: ApexEvent) => void;
type ErrorHandler = () => void;

function parseEvent(data: string): ApexEvent {
  try {
    const parsed = JSON.parse(data) as { type?: unknown; payload?: unknown; ts?: unknown };
    if (typeof parsed.type !== "string") return null;
    return {
      type: parsed.type as ApexEvent["type"],
      payload: parsed.payload,
      ts: typeof parsed.ts === "number" ? parsed.ts : Date.now(),
    };
  } catch {
    return {
      type: "message" as ApexEvent["type"],
      payload: data,
      ts: Date.now(),
    };
  }
}

export class BrowserEventSource {
  private eventHandlers = new Set<EventHandler>();
  private errorHandlers = new Set<ErrorHandler>();
  private source: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private retryDelay = 1000;
  private closed = false;

  constructor(private readonly url: string) {
    this.connect();
  }

  onEvent(handler: EventHandler): void {
    this.eventHandlers.add(handler);
  }

  onError(handler: ErrorHandler): void {
    this.errorHandlers.add(handler);
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      globalThis.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.source?.close();
    this.source = null;
  }

  private connect(): void {
    if (this.closed) return;

    const source = new EventSource(this.url);
    this.source = source;

    source.onmessage = (event) => {
      const parsed = parseEvent(event.data);
      if (!parsed) return;
      for (const handler of this.eventHandlers) {
        try {
          handler(parsed);
        } catch {
          // Ignore subscriber failures so one consumer cannot stop the stream.
        }
      }
    };

    source.onerror = () => {
      for (const handler of this.errorHandlers) {
        try {
          handler();
        } catch {
          // Ignore subscriber failures.
        }
      }

      if (this.closed) return;

      source.close();
      this.source = null;

      if (this.reconnectTimer !== null) {
        globalThis.clearTimeout(this.reconnectTimer);
      }

      const delay = this.retryDelay;
      this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
      this.reconnectTimer = globalThis.setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
    };
  }
}
