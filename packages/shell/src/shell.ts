// ============================================================================
// pi-apex Shell — client-side runtime.
// Loads extensions, manages tabs, and wires the SDK bridge to the bridge API.
// ============================================================================

import type { ApexSessionSnapshot } from "@pi-apex/types";
import {
  IframeBridge,
  loadExtensionBundle,
  type Branch,
  type ExtensionManifest,
  type Message,
  type PiSDK,
  type SessionContext,
  type ToolCall,
  type ThreadNode,
  type ToolDef,
  type ToolResult,
} from "@pi-apex/sdk";
import { ApexSessionStore } from "./store.js";
import { BrowserEventSource } from "./sse-client.js";

declare global {
  interface Window {
    __PI_APEX_CONFIG__: {
      extensions: { type: string; id?: string; name?: string; path?: string }[];
      theme?: "dark" | "light";
      defaults?: { activeTab?: string; tabOrder?: string[] };
    };
    __APEX_STORE__?: ApexSessionSnapshot | null;
    __APEX_SDK__?: PiSDK;
  }
}

class ApexHttp {
  private base: string;
  private timeoutMs: number;

  constructor(timeoutMs = 10000) {
    this.base = "/api/apex";
    this.timeoutMs = timeoutMs;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  eventsource(
    path: string,
    handlers: { onEvent: (event: unknown) => void; onError?: () => void }
  ): { close: () => void } {
    const source = new BrowserEventSource(`${this.base}${path}`);
    source.onEvent((event) => handlers.onEvent(event));
    if (handlers.onError) {
      source.onError(handlers.onError);
    }
    return {
      close: () => source.close(),
    };
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.base}${path}`, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await res.text();
      const parsed = text.length > 0 ? (JSON.parse(text) as unknown) : undefined;

      if (!res.ok) {
        const error =
          parsed &&
          typeof parsed === "object" &&
          "error" in parsed &&
          typeof (parsed as { error?: unknown }).error === "string"
            ? ((parsed as { error?: string }).error as string)
            : `${method} ${path} failed (${res.status})`;
        throw new Error(error);
      }

      if (parsed && typeof parsed === "object" && "ok" in parsed && (parsed as { ok?: boolean }).ok === false) {
        const error =
          typeof (parsed as { error?: unknown }).error === "string"
            ? ((parsed as { error?: string }).error as string)
            : `Action request failed: ${path}`;
        throw new Error(error);
      }

      return parsed as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`${method} ${path} timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}

const apexHttp = new ApexHttp();

interface ShellSnapshot {
  session: {
    id: string;
    cwd: string;
    projectName: string;
    gitBranch?: string;
    model?: string;
    isStreaming: boolean;
  };
  messages: Message[];
  thread: ThreadNode[];
  branches: Branch[];
  tools: ToolDef[];
  activeTools: string[];
  extensions: unknown[];
  capabilities: unknown;
}

interface LoadedExtension {
  manifest: ExtensionManifest;
  entry: Awaited<ReturnType<typeof loadExtensionBundle>>;
  bridge: IframeBridge | null;
  iframe: HTMLIFrameElement;
  unmount?: () => void;
}

class PiApexShell {
  private extensions = new Map<string, LoadedExtension>();
  private activeTabId: string | null = null;
  private config = window.__PI_APEX_CONFIG__;
  private sdkBridge: Record<string, unknown> = {};
  private tabBar: HTMLElement;
  private iframeContainer: HTMLElement;
  private iframe: HTMLIFrameElement;
  private sessionStore: ApexSessionStore | null = null;
  private sdkEventHandlers = new Map<string, Set<(payload: unknown) => void>>();

  constructor() {
    this.tabBar = document.getElementById("tab-bar")!;
    this.iframeContainer = document.getElementById("pi-apex-iframe-container")!;
    this.iframe = document.getElementById("pi-apex-ext-iframe") as HTMLIFrameElement;
  }

  async start(): Promise<void> {
    const targetSessionId = new URL(window.location.href).searchParams.get("session");
    this.sessionStore = new ApexSessionStore();
    await this.sessionStore.init(targetSessionId);
    await this.loadExtensions();
    this.buildTabBar();
    await this.buildSdkBridge(this.sessionStore);
    window.__APEX_STORE__ = this.sessionStore.get();
    window.__APEX_SDK__ = this.sdkBridge as PiSDK;
    const defaultTab = this.config.defaults?.activeTab ?? this.firstExtensionId();
    if (defaultTab) this.activateTab(defaultTab);
  }

  private firstExtensionId(): string | null {
    for (const ext of this.config.extensions) {
      if ("id" in ext && ext.id) return ext.id;
    }
    return null;
  }

  private async loadExtensions(): Promise<void> {
    for (const extSource of this.config.extensions) {
      try {
        if (extSource.type === "builtin" && extSource.id) {
          const manifest = await this.fetchManifest(extSource.id);
          const entry = await loadExtensionBundle(`/extensions/${extSource.id}/bundle.js`);
          this.extensions.set(extSource.id, {
            manifest,
            entry,
            bridge: null,
            iframe: this.createIframe(),
          });
        }
      } catch (err) {
        console.error("[pi-apex] Failed to load extension:", err);
      }
    }
  }

  private async fetchManifest(id: string): Promise<ExtensionManifest> {
    const res = await fetch(`/extensions/${id}/manifest.json`);
    if (!res.ok) throw new Error(`Manifest not found: ${id}`);
    return (await res.json()) as ExtensionManifest;
  }

  private createIframe(): HTMLIFrameElement {
    const iframe = document.createElement("iframe");
    iframe.className = "pi-apex-iframe";
    iframe.sandbox.add("allow-scripts", "allow-same-origin");
    iframe.style.display = "none";
    return iframe;
  }

  private async buildSdkBridge(store: ApexSessionStore): Promise<void> {
    store.subscribe((snapshot) => {
      window.__APEX_STORE__ = snapshot;
    });

    store.subscribeToEvents((event) => {
      this.dispatchSdkEvent(event.type, event.payload);
    });

    const readSnapshot = (): ShellSnapshot | null => {
      return (store.get() as ShellSnapshot | null) ?? (window.__APEX_STORE__ as ShellSnapshot | null) ?? null;
    };

    const cloneSnapshot = (snapshot: ShellSnapshot): ShellSnapshot =>
      JSON.parse(JSON.stringify(snapshot)) as ShellSnapshot;

    const ensureSnapshot = (): ShellSnapshot => {
      const existing = readSnapshot();
      if (existing) return existing;

      const session = {
        id: "current",
        cwd: "",
        projectName: "",
        gitBranch: undefined,
        model: undefined,
        isStreaming: false,
      };

      const snapshot: ShellSnapshot = {
        session,
        messages: [],
        thread: [],
        branches: [],
        tools: [],
        activeTools: [],
        extensions: [],
        capabilities: {},
      };

      store.replace(snapshot);
      window.__APEX_STORE__ = snapshot;
      return snapshot;
    };

    const updateSnapshot = (mutator: (snapshot: ShellSnapshot) => ShellSnapshot): ShellSnapshot => {
      const next = mutator(cloneSnapshot(ensureSnapshot()));
      store.replace(next);
      window.__APEX_STORE__ = next;
      return next;
    };

    const emit = (event: string, payload: unknown): void => {
      const handlers = this.sdkEventHandlers.get(event);
      if (!handlers) return;
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch {
          // Ignore handler failures so one extension does not break the stream.
        }
      }
    };

    return {
      session: {
        getMessages: async () => (readSnapshot()?.messages ?? []) as Message[],
        getThread: async () => (readSnapshot()?.thread ?? []) as ThreadNode[],
        getBranches: async () => (readSnapshot()?.branches ?? []) as Branch[],
        fork: async (label?: string) => {
          const branch: Branch = {
            id: `branch-${Date.now()}`,
            label: label ?? "new branch",
            createdAt: Date.now(),
            headNodeId: null,
            isActive: true,
          };

          updateSnapshot((snapshot) => ({
            ...snapshot,
            branches: [
              ...snapshot.branches.map((item) => ({ ...item, isActive: false })),
              branch,
            ],
          }));
          emit("session_fork", branch);
          return branch;
        },
        switch: async (branchId: string) => {
          updateSnapshot((snapshot) => ({
            ...snapshot,
            branches: snapshot.branches.map((branch) => ({
              ...branch,
              isActive: branch.id === branchId,
            })),
          }));
          const branch = readSnapshot()?.branches.find((item) => item.id === branchId);
          if (branch) emit("session_switch", branch);
        },
        abort: async () => {},
        compact: async () => {},
        getActiveBranch: async () => readSnapshot()?.branches.find((branch) => branch.isActive) ?? null,
      },
      messaging: {
        send: async (text: string, opts?: unknown) => {
          console.log("[pi-apex] messaging.send:", text, opts);
          const role = typeof opts === "object" && opts !== null && "deliverAs" in opts
            ? (opts as { deliverAs?: string }).deliverAs
            : undefined;
          const message: Message = {
            id: `msg-${Date.now()}`,
            role: role === "system" ? "system" : role === "followUp" || role === "steer" ? "custom" : "user",
            content: text,
            customType: role === "followUp" ? "followUp" : role === "steer" ? "steer" : undefined,
            timestamp: Date.now(),
          };
          updateSnapshot((snapshot) => ({ ...snapshot, messages: [...snapshot.messages, message] }));
          emit("message", message);
        },
        sendAsUser: async (text: string) => {
          await this.sdkBridge.messaging?.send?.(text, { deliverAs: "user" });
        },
        sendAsSystem: async (text: string) => {
          await this.sdkBridge.messaging?.send?.(text, { deliverAs: "system" });
        },
        prompt: async (text: string, opts?: unknown) => {
          await this.sdkBridge.messaging?.send?.(text, opts as never);
        },
        steer: async (text: string) => {
          await this.sdkBridge.messaging?.send?.(text, { deliverAs: "steer" });
        },
        followUp: async (text: string) => {
          await this.sdkBridge.messaging?.send?.(text, { deliverAs: "followUp" });
        },
        append: async (_type: string, _data: unknown) => {},
      },
      tools: {
        getAll: async () => {
          return (readSnapshot()?.tools ?? []) as ToolDef[];
        },
        getActive: async () => (readSnapshot()?.activeTools ?? []).slice(),
        setActive: async (names: string[]) => {
          updateSnapshot((snapshot) => ({ ...snapshot, activeTools: names.slice() }));
        },
        call: async (name: string, args: Record<string, unknown>) => {
          const callId = `call-${Date.now()}`;
          const toolCall: ToolCall = {
            id: callId,
            toolName: name,
            args,
            timestamp: Date.now(),
          };
          emit("tool_call", toolCall);

          const result: ToolResult = {
            id: `result-${Date.now()}`,
            callId,
            toolName: name,
            content: [{ type: "text", text: JSON.stringify({ ok: true, args }, null, 2) }],
            isError: false,
            timestamp: Date.now(),
          };
          emit("tool_result", result);
          return result;
        },
        intercept: () => {},
      },
      events: {
        onToolCall: (fn: unknown) => this.subscribeSdkEvent("tool_call", fn as (payload: unknown) => void),
        onToolResult: (fn: unknown) => this.subscribeSdkEvent("tool_result", fn as (payload: unknown) => void),
        onMessage: (fn: unknown) => this.subscribeSdkEvent("message", fn as (payload: unknown) => void),
        onThinking: (fn: unknown) => this.subscribeSdkEvent("thinking", fn as (payload: unknown) => void),
        onFork: (fn: unknown) => this.subscribeSdkEvent("session_fork", fn as (payload: unknown) => void),
        onSwitch: (fn: unknown) => this.subscribeSdkEvent("session_switch", fn as (payload: unknown) => void),
        onReset: (fn: unknown) => this.subscribeSdkEvent("session_reset", fn as (payload: unknown) => void),
      },
      context: {
        get: async (): Promise<SessionContext> => {
          const snapshot = readSnapshot();
          return {
            cwd: snapshot?.session.cwd ?? "",
            projectName: snapshot?.session.projectName ?? "",
            gitBranch: snapshot?.session.gitBranch ?? null,
            model: snapshot?.session.model ?? null,
            env: {},
            files: null,
          };
        },
      },
    };
  }

  private subscribeSdkEvent(event: string, fn: (payload: unknown) => void): () => void {
    if (!this.sdkEventHandlers.has(event)) {
      this.sdkEventHandlers.set(event, new Set());
    }

    const handlers = this.sdkEventHandlers.get(event)!;
    handlers.add(fn);

    return () => {
      handlers.delete(fn);
      if (handlers.size === 0) {
        this.sdkEventHandlers.delete(event);
      }
    };
  }

  private dispatchSdkEvent(event: string, payload: unknown): void {
    const handlers = this.sdkEventHandlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch {
        // Ignore subscriber failures.
      }
    }
  }

  private buildTabBar(): void {
    this.tabBar.innerHTML = "";
    this.tabBar.style.cssText = `
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-subtle);
      overflow-x: auto;
      flex-shrink: 0;
    `;

    const logo = document.createElement("span");
    logo.textContent = "π";
    logo.style.cssText = `
      font-size: 18px;
      font-weight: 700;
      color: var(--accent);
      padding: 0 8px;
      flex-shrink: 0;
    `;
    this.tabBar.appendChild(logo);

    for (const [id, ext] of this.extensions) {
      const btn = this.createTabButton(id, ext.manifest);
      this.tabBar.appendChild(btn);
    }
  }

  private createTabButton(id: string, manifest: ExtensionManifest): HTMLButtonElement {
    const btn = document.createElement("button");
    const isActive = id === this.activeTabId;

    btn.dataset.tabId = id;
    btn.textContent = manifest.name;
    btn.title = manifest.description ?? manifest.name;
    if (manifest.icon) {
      const icon = document.createElement("span");
      icon.textContent = manifest.icon;
      btn.prepend(icon, " ");
    }

    btn.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      background: ${isActive ? "var(--bg-elevated)" : "transparent"};
      border: 1px solid ${isActive ? "var(--border)" : "transparent"};
      border-bottom: ${isActive ? "1px solid var(--bg-elevated)" : "none"};
      border-radius: 6px 6px 0 0;
      color: ${isActive ? "var(--accent)" : "var(--text-muted)"};
      font-size: 12px;
      font-weight: ${isActive ? "600" : "400"};
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
      margin-bottom: -1px;
    `;

    btn.addEventListener("click", () => this.activateTab(id));
    return btn;
  }

  private async activateTab(id: string): Promise<void> {
    const ext = this.extensions.get(id);
    if (!ext) return;

    if (this.activeTabId) {
      const prevExt = this.extensions.get(this.activeTabId);
      if (prevExt) {
        prevExt.unmount?.();
        prevExt.iframe.style.display = "none";
        prevExt.iframe.classList.remove("active");
      }
    }

    this.activeTabId = id;
    this.buildTabBar();

    const iframe = ext.iframe;
    iframe.classList.add("active");
    iframe.style.display = "block";

    if (!this.iframeContainer.contains(iframe)) {
      this.iframeContainer.appendChild(iframe);
    }

    ext.bridge = new IframeBridge(iframe, {
      exposed: this.sdkBridge as Record<string, (...args: unknown[]) => unknown>,
    });

    iframe.onload = () => {
      if (iframe.contentWindow) {
        ext.bridge?.setTargetOrigin(window.location.origin);
      }
      const cleanup = ext.entry.mount(ext.bridge as unknown as PiSDK);
      if (typeof cleanup === "function") ext.unmount = cleanup;
    };

    iframe.src = `/extensions/${id}/bundle.js`;
  }
}

const shell = new PiApexShell();
shell.start().catch(console.error);
