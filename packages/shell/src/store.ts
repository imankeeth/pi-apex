import type { ApexEvent, ApexSessionSnapshot } from "@pi-apex/types";
import { BrowserEventSource } from "./sse-client.js";

type Subscriber = (snapshot: ApexSessionSnapshot | null) => void;

export class ApexSessionStore {
  private snapshot: ApexSessionSnapshot | null = null;
  private subscribers = new Set<Subscriber>();
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

  get(): ApexSessionSnapshot | null {
    return this.snapshot;
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

    if (this.snapshot) {
      switch (event.type) {
        case "message":
        case "message_delta":
        case "tool_call":
        case "tool_result":
        case "thinking":
          this.notify();
          return;
        case "session_registered":
        case "session_updated":
        case "status":
        case "extension_notification":
        case "extension_command_registered":
        case "extension_state_changed":
          this.snapshot = await this.fetchSnapshot(this.sessionId);
          this.notify();
          return;
        default:
          this.snapshot = await this.fetchSnapshot(this.sessionId);
          this.notify();
          return;
      }
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
