import type { RuntimeExtensionInfo } from "@pi-apex/types";

type ExtensionEventType =
  | "extension_notification"
  | "extension_command_registered"
  | "extension_state_changed";

export interface RuntimeBridgeEvent {
  type: ExtensionEventType;
  sessionId?: string;
  payload: unknown;
  timestamp: number;
}

type RuntimeEventEmitter = {
  on?: (event: string, handler: (payload: unknown) => void) => (() => void) | void;
  addEventListener?: (event: string, handler: (payload: unknown) => void) => void;
  removeEventListener?: (event: string, handler: (payload: unknown) => void) => void;
};

type ExtensionRegistryLike = Record<
  string,
  {
    name?: string;
    source?: string;
    commands?: { name: string; description?: string }[];
    uiCapabilities?: string[];
    status?: string;
  }
>;

interface RuntimeBridge {
  emit: (event: RuntimeBridgeEvent) => void;
}

function getPiRuntime(): {
  events?: RuntimeEventEmitter;
  extensions?: ExtensionRegistryLike;
  on?: RuntimeEventEmitter["on"];
  addEventListener?: RuntimeEventEmitter["addEventListener"];
  removeEventListener?: RuntimeEventEmitter["removeEventListener"];
} {
  // @ts-ignore - pi is injected by the Pi runtime.
  const runtime = globalThis as typeof globalThis & {
    pi?: {
      events?: RuntimeEventEmitter;
      extensions?: ExtensionRegistryLike;
      on?: RuntimeEventEmitter["on"];
      addEventListener?: RuntimeEventEmitter["addEventListener"];
      removeEventListener?: RuntimeEventEmitter["removeEventListener"];
    };
  };
  return runtime.pi ?? {};
}

function emitExtensionSnapshot(bridge: RuntimeBridge, sessionId?: string): void {
  const runtime = getPiRuntime();
  const extensions = runtime.extensions ?? {};

  for (const [id, ext] of Object.entries(extensions)) {
    const normalized: RuntimeExtensionInfo = {
      id,
      name: ext.name ?? id,
      source: ext.source ?? "project",
      compatibility: "runtime-compatible",
      commands: ext.commands ?? [],
      uiCapabilities: ext.uiCapabilities ?? [],
      status: ext.status,
    };

    bridge.emit({
      type: "extension_notification",
      sessionId,
      payload: normalized,
      timestamp: Date.now(),
    });

    for (const command of normalized.commands) {
      bridge.emit({
        type: "extension_command_registered",
        sessionId,
        payload: { extensionId: id, command },
        timestamp: Date.now(),
      });
    }

    if (normalized.status) {
      bridge.emit({
        type: "extension_state_changed",
        sessionId,
        payload: { extensionId: id, status: normalized.status },
        timestamp: Date.now(),
      });
    }
  }
}

function subscribe(
  emitter: RuntimeEventEmitter | undefined,
  event: string,
  handler: (payload: unknown) => void
): () => void {
  if (!emitter) return () => {};

  if (typeof emitter.on === "function") {
    const cleanup = emitter.on(event, handler);
    return typeof cleanup === "function" ? cleanup : () => {};
  }

  if (typeof emitter.addEventListener === "function") {
    emitter.addEventListener(event, handler);
    return () => emitter.removeEventListener?.(event, handler);
  }

  return () => {};
}

export function publishExtensionEvents(
  bridge: RuntimeBridge,
  opts?: { sessionId?: string }
): () => void {
  const runtime = getPiRuntime();
  const sessionId = opts?.sessionId;
  const cleanup: Array<() => void> = [];

  emitExtensionSnapshot(bridge, sessionId);

  const onExtensionEvent = (payload: unknown) => {
    bridge.emit({
      type: "extension_notification",
      sessionId,
      payload,
      timestamp: Date.now(),
    });
  };

  const onCommandRegistered = (payload: unknown) => {
    bridge.emit({
      type: "extension_command_registered",
      sessionId,
      payload,
      timestamp: Date.now(),
    });
  };

  const onStateChanged = (payload: unknown) => {
    bridge.emit({
      type: "extension_state_changed",
      sessionId,
      payload,
      timestamp: Date.now(),
    });
  };

  cleanup.push(subscribe(runtime.events ?? runtime, "extension_registered", onExtensionEvent));
  cleanup.push(subscribe(runtime.events ?? runtime, "extension_notification", onExtensionEvent));
  cleanup.push(subscribe(runtime.events ?? runtime, "extension_command_registered", onCommandRegistered));
  cleanup.push(subscribe(runtime.events ?? runtime, "extension_state_changed", onStateChanged));

  return () => {
    for (const dispose of cleanup) dispose();
  };
}
