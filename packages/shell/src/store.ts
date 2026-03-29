import type { ApexEvent, ApexSessionSnapshot } from "@pi-apex/types";
import { BrowserEventSource } from "./sse-client.js";

type Subscriber = (snapshot: ApexSessionSnapshot | null) => void;
type EventSubscriber = (event: ApexEvent) => void;

export class ApexSessionStore {
  private snapshot: ApexSessionSnapshot | null = null;
  private subscribers = new Set<Subscriber>();
  private eventSubscribers = new Set<EventSubscriber>();
  private eventSource: BrowserEventSource | null = null;
  private sessionId: string | null = null;

  async init(targetSessionId?: string | null): Promise<void> {
    this.sessionId = targetSessionId ?? null;

    if (this.sessionId) {
      this.snapshot = await this.fetchSnapshot(this.sessionId);
      if (!this.snapshot) {
        console.warn(
          `[ApexSessionStore] Session ${this.sessionId} not found, waiting for registration...`
        );
      }
    } else {
      this.snapshot = await this.fetchCurrentSnapshot();
      this.sessionId = this.snapshot?.session.id ?? null;
    }

    this.notify();

    if (this.sessionId) {
      this.subscribeToSession(this.sessionId);
    }
  }

  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  subscribeToEvents(cb: EventSubscriber): () => void {
    this.eventSubscribers.add(cb);
    return () => {
      this.eventSubscribers.delete(cb);
    };
  }

  get(): ApexSessionSnapshot | null {
    return this.snapshot;
  }

  replace(snapshot: ApexSessionSnapshot | null): void {
    this.snapshot = snapshot;
    this.notify();
  }

  private async fetchCurrentSnapshot(): Promise<ApexSessionSnapshot | null> {
    const res = await fetch("/api/apex/session/current");
    if (!res.ok) {
      throw new Error(`Failed to load current session (${res.status})`);
    }
    return (await res.json()) as ApexSessionSnapshot | null;
  }

  private async fetchSnapshot(sessionId: string): Promise<ApexSessionSnapshot | null> {
    const res = await fetch(`/api/apex/session/${encodeURIComponent(sessionId)}`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`Failed to load session ${sessionId} (${res.status})`);
    }
    return (await res.json()) as ApexSessionSnapshot | null;
  }

  private subscribeToSession(sessionId: string): void {
    this.eventSource?.close();
    this.eventSource = new BrowserEventSource(`/api/apex/session/${encodeURIComponent(sessionId)}/events`);
    this.eventSource.onEvent((event: ApexEvent) => {
      this.handleEvent(event).catch((err) =>
        console.error("[pi-apex] store event error:", err)
      );
    });
  }

  private async handleEvent(event: ApexEvent): Promise<void> {
    if (!this.sessionId) return;

    for (const subscriber of this.eventSubscribers) {
      try {
        subscriber(event);
      } catch {
        // Ignore subscriber failures.
      }
    }

    if (
      event.type === "session_registered" ||
      event.type === "session_updated" ||
      event.type === "message" ||
      event.type === "message_delta" ||
      event.type === "tool_call" ||
      event.type === "tool_result" ||
      event.type === "thinking" ||
      event.type === "status" ||
      event.type === "extension_notification" ||
      event.type === "extension_command_registered" ||
      event.type === "extension_state_changed"
    ) {
      this.snapshot = await this.fetchSnapshot(this.sessionId);
      this.notify();
    }
  }

  private notify(): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(this.snapshot);
      } catch {
        // Ignore subscriber failures.
      }
    }
  }
}
