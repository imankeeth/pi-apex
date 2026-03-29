import type {
  ApexEvent,
  ApexEventType,
  ApexSessionSnapshot,
  Branch,
  Message,
  ThreadNode,
  ToolDef,
} from "@pi-apex/types";
import { publishEvent } from "./http-client.js";
import { gatherSessionSnapshot } from "./snapshot.js";

type Unsubscribe = () => void;

type EventBusLike = {
  onMessage?: (handler: (payload: unknown) => unknown) => Unsubscribe | void;
  onMessageDelta?: (handler: (payload: unknown) => unknown) => Unsubscribe | void;
  onToolCall?: (handler: (payload: unknown) => unknown) => Unsubscribe | void;
  onToolResult?: (handler: (payload: unknown) => unknown) => Unsubscribe | void;
  onThinking?: (handler: (payload: unknown) => unknown) => Unsubscribe | void;
  onStatus?: (handler: (payload: unknown) => unknown) => Unsubscribe | void;
  onNotification?: (handler: (payload: unknown) => unknown) => Unsubscribe | void;
  onExtensionStateChanged?: (handler: (payload: unknown) => unknown) => Unsubscribe | void;
};

type PiRuntime = {
  events?: EventBusLike;
  session?: { events?: EventBusLike };
};

function getPiRuntime(): PiRuntime {
  return (globalThis as { pi?: PiRuntime }).pi ?? {};
}

function normalizeEvent(type: ApexEventType, payload: unknown): ApexEvent {
  return { type, payload, ts: Date.now() };
}

function snapshotSignature(snapshot: ApexSessionSnapshot): string {
  return JSON.stringify({
    session: snapshot.session,
    messages: snapshot.messages.map((m: Message) => [m.id, m.role, m.content, m.timestamp]),
    thread: snapshot.thread.map((node: ThreadNode) => [node.id, node.type, node.content, node.timestamp]),
    branches: snapshot.branches?.map((branch: Branch) => [branch.id, branch.label, branch.isActive]),
    tools: snapshot.tools.map((tool: ToolDef) => [tool.name, tool.label, tool.description]),
    activeTools: snapshot.activeTools,
    extensions: snapshot.extensions,
    capabilities: snapshot.capabilities,
  });
}

export class RuntimeEventPublisher {
  private sessionId: string | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupFns: Unsubscribe[] = [];
  private lastSnapshot: ApexSessionSnapshot | null = null;

  start(sessionId: string): void {
    this.stop();
    this.sessionId = sessionId;
    this.lastSnapshot = null;

    if (!this.tryAttachEventBus()) {
      this.pollInterval = setInterval(() => {
        void this.poll();
      }, 500);
    }
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    for (const cleanup of this.cleanupFns) {
      try {
        cleanup();
      } catch {
        // Ignore cleanup failures from host callbacks.
      }
    }
    this.cleanupFns = [];
    this.sessionId = null;
    this.lastSnapshot = null;
  }

  emit(type: ApexEventType, payload: unknown): void {
    if (!this.sessionId) return;
    void publishEvent(this.sessionId, normalizeEvent(type, payload));
  }

  private tryAttachEventBus(): boolean {
    const runtime = getPiRuntime();
    const bus = runtime.events ?? runtime.session?.events;
    if (!bus) return false;

    const attach = (key: keyof EventBusLike, type: ApexEventType): void => {
      const handler = bus[key];
      if (typeof handler !== "function") return;
      const cleanup = handler.call(bus, (payload: unknown) => {
        this.emit(type, payload);
      });
      if (typeof cleanup === "function") {
        this.cleanupFns.push(cleanup);
      }
    };

    attach("onMessage", "message");
    attach("onMessageDelta", "message_delta");
    attach("onToolCall", "tool_call");
    attach("onToolResult", "tool_result");
    attach("onThinking", "thinking");
    attach("onStatus", "status");
    attach("onNotification", "extension_notification");
    attach("onExtensionStateChanged", "extension_state_changed");

    return this.cleanupFns.length > 0;
  }

  private async poll(): Promise<void> {
    if (!this.sessionId) return;

    const snapshot = gatherSessionSnapshot();
    if (this.lastSnapshot && snapshotSignature(this.lastSnapshot) === snapshotSignature(snapshot)) {
      return;
    }

    this.diffAndEmit(this.lastSnapshot, snapshot);
    this.lastSnapshot = snapshot;
  }

  private diffAndEmit(prev: ApexSessionSnapshot | null, next: ApexSessionSnapshot): void {
    if (!prev) {
      this.emit("session_registered", next);
      this.emit("status", next.session);
      if (next.messages.length > 0) {
        for (const message of next.messages) this.emit("message", message);
      }
      if (next.thread.length > 0) {
        for (const node of next.thread) {
          if (node.type === "tool_call") this.emit("tool_call", node);
          if (node.type === "tool_result") this.emit("tool_result", node);
        }
      }
      return;
    }

    if (JSON.stringify(prev.session) !== JSON.stringify(next.session)) {
      this.emit("session_updated", next.session);
      this.emit("status", next.session);
    }

    if (JSON.stringify(prev.extensions) !== JSON.stringify(next.extensions)) {
      this.emit("extension_state_changed", next.extensions);
    }

    const prevMessageCount = prev.messages.length;
    const nextMessages = next.messages.slice(prevMessageCount);
    for (const message of nextMessages) {
      this.emit("message", message);
    }

    if (prev.messages.length > 0 && next.messages.length > 0) {
      const prevLast = prev.messages[prev.messages.length - 1];
      const nextLast = next.messages[next.messages.length - 1];
      if (prevLast && nextLast && prevLast.id === nextLast.id && prevLast.content !== nextLast.content) {
        this.emit("message_delta", {
          id: nextLast.id,
          delta: nextLast.content.slice(prevLast.content.length),
          content: nextLast.content,
        });
      }
    }

    const prevThreadIds = new Set(prev.thread.map((node: ThreadNode) => node.id));
    for (const node of next.thread) {
      if (prevThreadIds.has(node.id)) continue;
      if (node.type === "tool_call") this.emit("tool_call", node);
      if (node.type === "tool_result") this.emit("tool_result", node);
    }

    if (JSON.stringify(prev.activeTools) !== JSON.stringify(next.activeTools)) {
      this.emit("status", { activeTools: next.activeTools });
    }

    if (JSON.stringify(prev.branches) !== JSON.stringify(next.branches)) {
      this.emit("status", { branches: next.branches });
    }
  }
}
