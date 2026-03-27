// ============================================================================
// IFRAME BRIDGE — postMessage-based RPC between shell (parent) and
// extensions (child iframes). Framework-agnostic.
// Uses a request/response pattern with unique message IDs.
// ============================================================================

export type MessageHandler = (payload: unknown) => unknown | Promise<unknown>;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

type IncomingMessage =
  | { type: "rpc"; id: string; method: string; params?: unknown }
  | { type: "event_sub"; event: string; handlerId: string }
  | { type: "event_unsub"; handlerId: string }
  | { type: "ping" }
  | { type: "rpc_response"; id: string; result?: unknown; error?: string }
  | { type: "event"; event: string; payload: unknown };

// Incoming from extension iframe (sent by IframeClient)
type ChildIncomingMessage =
  | { type: "rpc_response"; id: string; result?: unknown; error?: string }
  | { type: "event"; event: string; payload: unknown };

// Outgoing message types from shell to extension iframe
type OutgoingMessage =
  | { type: "rpc_response"; id: string; result?: unknown; error?: string }
  | { type: "event"; event: string; payload: unknown }
  | { type: "pong" };

/**
 * IframeBridge — sits on the shell (parent) side.
 * Provided an iframe element and an object of exposed methods,
 * it handles all postMessage communication and forwards events
 * registered by the extension.
 *
 * The extension receives the `exposed` object as its `pi` global.
 */
export class IframeBridge {
  private iframe: HTMLIFrameElement;
  private exposed: Record<string, MessageHandler>;
  private pending = new Map<string, PendingRequest>();
  private eventSubscriptions = new Map<string, Set<string>>(); // event → Set<handlerId>
  private handlerIdCounter = 0;
  private origin: string;
  private removeListener: (() => void) | null = null;

  constructor(iframe: HTMLIFrameElement, opts: { exposed: Record<string, MessageHandler> }) {
    this.iframe = iframe;
    this.exposed = opts.exposed;
    // Wildcard initially — once iframe loads we restrict to its origin
    this.origin = "*";
    this.setupListener();
  }

  private setupListener(): void {
    const handler = (event: MessageEvent<IncomingMessage>) => {
      // Accept from any origin initially (extension iframe origin)
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;

      switch (msg.type) {
        case "ping":
          this.send({ type: "pong" });
          break;

        case "rpc": {
          const { id, method, params } = msg;
          void id;
          void method;
          void params;
          const result = this.handleRPC(msg.id, msg.method, msg.params);
          // result can be sync or async — handled below
          void result; // handled in next line
          Promise.resolve(result).then(
            (res) => this.send({ type: "rpc_response", id: msg.id, result: res }),
            (err) => this.send({ type: "rpc_response", id: msg.id, error: String(err) })
          );
          break;
        }

        case "event_sub": {
          const { event, handlerId } = msg;
          if (!this.eventSubscriptions.has(event)) {
            this.eventSubscriptions.set(event, new Set());
          }
          this.eventSubscriptions.get(event)!.add(handlerId);
          break;
        }

        case "event_unsub": {
          const { handlerId } = msg;
          for (const handlers of this.eventSubscriptions.values()) {
            handlers.delete(handlerId);
          }
          break;
        }
      }
    };

    this.removeListener = () => window.removeEventListener("message", handler);
    window.addEventListener("message", handler as EventListener);
  }

  private send(msg: OutgoingMessage): void {
    this.iframe.contentWindow?.postMessage(msg, this.origin);
  }

  private async handleRPC(id: string, method: string, params?: unknown): Promise<unknown> {
    // Split "namespace.method" e.g. "session.getMessages"
    const dot = method.indexOf(".");
    if (dot === -1) {
      const handler = this.exposed[method];
      if (!handler) throw new Error(`Unknown method: ${method}`);
      return handler(params);
    }

    const ns = method.slice(0, dot);
    const name = method.slice(dot + 1);
    const handler = this.exposed[ns];
    if (!handler || typeof handler !== "object") {
      throw new Error(`Unknown namespace: ${ns}`);
    }
    const fn = (handler as Record<string, MessageHandler>)[name];
    if (typeof fn !== "function") {
      throw new Error(`Unknown method: ${ns}.${name}`);
    }
    return fn(params);
  }

  /**
   * Emit an event to the extension iframe.
   * Called by the shell when something happens in the pi session.
   */
  emit(event: string, payload: unknown): void {
    this.send({ type: "event", event, payload });
  }

  /**
   * Called when the iframe has loaded — restrict postMessage origin
   * to the iframe's actual origin for security.
   */
  setTargetOrigin(origin: string): void {
    this.origin = origin;
  }

  destroy(): void {
    this.removeListener?.();
    this.pending.clear();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// EXTENSION SIDE — runs inside the child iframe
// ──────────────────────────────────────────────────────────────────────────────

type ExposedAPI = Record<string, Record<string, MessageHandler>>;

/**
 * createExtensionBridge — called inside the extension iframe.
 * Returns a promise that resolves to the full PiSDK interface.
 *
 * Usage in extension bundle:
 *   const sdk = await createExtensionBridge();
 *   const messages = await sdk.session.getMessages();
 */
export function createExtensionBridge(): Promise<ExposedAPI> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent<OutgoingMessage>) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "pong") {
        window.removeEventListener("message", handler);
        resolve(createRPCClient());
        return;
      }

      if (msg.type === "rpc_response") {
        const pending = IframeClient.pendingRequests.get(msg.id);
        if (pending) {
          IframeClient.pendingRequests.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.result);
          }
        }
        return;
      }

      if (msg.type === "event") {
        const handlers = IframeClient.eventHandlers.get(msg.event);
        if (handlers) {
          for (const fn of handlers.values()) {
            try { fn(msg.payload); } catch { /* noop */ }
          }
        }
        return;
      }
    };

    window.addEventListener("message", handler as EventListener);
    // Signal to parent that we're ready
    window.parent.postMessage({ type: "ping" }, "*");
  });
}

class IframeClient {
  static pendingRequests = new Map<string, PendingRequest>();
  static eventHandlers = new Map<string, Set<(payload: unknown) => void>>();
  static handlerIdCounter = 0;
  static origin = "*";

  static init(): void {
    window.addEventListener("message", IframeClient.handleMessage as EventListener);
  }

  private static handleMessage(event: MessageEvent<ChildIncomingMessage>): void {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    this.origin = event.origin;

    if (msg.type === "rpc_response") {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error));
        else pending.resolve(msg.result);
      }
      return;
    }

    if (msg.type === "event") {
      const handlers = this.eventHandlers.get(msg.event);
      if (handlers) {
        for (const fn of handlers.values()) {
          try { fn(msg.payload); } catch { /* noop */ }
        }
      }
    }
  }

  static call(method: string, params?: unknown): Promise<unknown> {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      window.parent.postMessage({ type: "rpc", id, method, params }, this.origin);
      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`RPC timeout: ${method}`));
        }
      }, 30000);
    });
  }

  static on(event: string, fn: (payload: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
      // Inform parent we want this event
      window.parent.postMessage({
        type: "event_sub",
        event,
        handlerId: event, // use event name as handlerId for now
      }, this.origin);
    }
    this.eventHandlers.get(event)!.add(fn);
    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.delete(fn);
        if (handlers.size === 0) {
          this.eventHandlers.delete(event);
          window.parent.postMessage({
            type: "event_unsub",
            handlerId: event,
          }, this.origin);
        }
      }
    };
  }
}

// Build the full exposed API shape from the RPC client
function createRPCClient(): ExposedAPI {
  const apis = [
    "session",
    "messaging",
    "tools",
    "events",
    "context",
  ];

  const client: ExposedAPI = {};

  for (const ns of apis) {
    client[ns] = new Proxy({}, {
      get(_target, prop) {
        if (typeof prop !== "string") return;
        return (...args: unknown[]) => IframeClient.call(`${ns}.${prop}`, args[0]);
      },
    });
  }

  // Events is special — it has both call and subscribe
  client.events = new Proxy({
    onToolCall: (fn: (tc: unknown) => void) => IframeClient.on("tool_call", fn as (p: unknown) => void),
    onToolResult: (fn: (tr: unknown) => void) => IframeClient.on("tool_result", fn as (p: unknown) => void),
    onMessage: (fn: (msg: unknown) => void) => IframeClient.on("message", fn as (p: unknown) => void),
    onThinking: (fn: (s: unknown) => void) => IframeClient.on("thinking", fn as (p: unknown) => void),
    onFork: (fn: (b: unknown) => void) => IframeClient.on("session_fork", fn as (p: unknown) => void),
    onSwitch: (fn: (b: unknown) => void) => IframeClient.on("session_switch", fn as (p: unknown) => void),
    onReset: (fn: () => void) => IframeClient.on("session_reset", fn as (p: unknown) => void),
    // RPC calls too
    _rpc: (method: string, params?: unknown) => IframeClient.call(method, params),
  } as ExposedAPI["events"], {
    get(_target, prop) {
      if (typeof prop !== "string") return;
      const val = (client.events as Record<string, unknown>)[prop];
      if (typeof val === "function") return val;
      return (...args: unknown[]) => IframeClient.call(`events.${prop}`, args[0]);
    },
  });

  return client;
}

IframeClient.init();
