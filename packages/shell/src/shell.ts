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
  type ThreadNode,
  type ToolDef,
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
    this.sdkBridge = this.buildSdkBridge(this.sessionStore);
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

  private buildSdkBridge(store: ApexSessionStore): Record<string, unknown> {
    const readSnapshot = (): ApexSessionSnapshot | null => store.get();
    const sessionId = (): string => readSnapshot()?.session.id ?? "";

    const postAction = async (action: string, payload?: unknown) => {
      const activeSessionId = sessionId();
      if (!activeSessionId) {
        throw new Error(`No active session for action ${action}`);
      }
      return apexHttp.post<{ ok: boolean; result?: { actionId: string }; error?: string }>("/action", {
        sessionId: activeSessionId,
        action,
        payload,
      });
    };

    return {
      session: {
        getMessages: async () => {
          const snapshot = await readSnapshot();
          return (snapshot?.messages ?? []) as Message[];
        },
        getThread: async () => {
          const snapshot = await readSnapshot();
          return (snapshot?.thread ?? []) as ThreadNode[];
        },
        getBranches: async () => {
          const snapshot = await readSnapshot();
          return (snapshot?.branches ?? []) as Branch[];
        },
        fork: async (label?: string) => {
          const res = await postAction("session.fork", { label });
          return {
            id: res.result?.actionId ?? `${sessionId()}:${Date.now()}`,
            label: label ?? "new branch",
            createdAt: Date.now(),
            headNodeId: null,
            isActive: true,
          } as Branch;
        },
        switch: async (branchId: string) => {
          await postAction("session.switch", { branchId });
        },
        abort: async () => {
          await postAction("session.abort");
        },
        compact: async () => {
          await postAction("session.compact");
        },
        getActiveBranch: async () => {
          const snapshot = await readSnapshot();
          const branches = (snapshot?.branches ?? []) as Branch[];
          return branches.find((branch) => branch.isActive) ?? null;
        },
      },
      messaging: {
        send: async (text: string, _opts?: unknown) => {
          await postAction("messaging.send", { text });
        },
        sendAsUser: async (text: string) => {
          await postAction("messaging.sendAsUser", { text });
        },
        sendAsSystem: async (text: string) => {
          await postAction("messaging.sendAsSystem", { text });
        },
        prompt: async (text: string, _opts?: unknown) => {
          await postAction("session.prompt", { text });
        },
        steer: async (text: string) => {
          await postAction("session.steer", { text });
        },
        followUp: async (text: string) => {
          await postAction("session.followUp", { text });
        },
        append: (_type: string, _data: unknown) => {},
      },
      tools: {
        getAll: async () => {
          const snapshot = await readSnapshot();
          return (snapshot?.tools ?? []) as ToolDef[];
        },
        getActive: () => store.get()?.activeTools ?? [],
        setActive: (_names: string[]) => {},
        call: async (_name: string, _args: Record<string, unknown>) => ({
          id: "",
          callId: "",
          toolName: "",
          content: [],
          isError: false,
          timestamp: Date.now(),
        }),
        intercept: () => {},
      },
      events: {
        onToolCall: (_fn: unknown) => () => {},
        onToolResult: (_fn: unknown) => () => {},
        onMessage: (_fn: unknown) => () => {},
        onThinking: (_fn: unknown) => () => {},
        onFork: (_fn: unknown) => () => {},
        onSwitch: (_fn: unknown) => () => {},
        onReset: (_fn: unknown) => () => {},
      },
      context: {
        get: async () => {
          const snapshot = await readSnapshot();
          return {
            cwd: snapshot?.session.cwd ?? "",
            projectName: snapshot?.session.projectName ?? "",
            gitBranch: snapshot?.session.gitBranch ?? null,
            env: {},
            files: null,
          };
        },
      },
    };
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
        ext.bridge?.setTargetOrigin("*");
      }
      const cleanup = ext.entry.mount(ext.bridge as unknown as PiSDK);
      if (typeof cleanup === "function") ext.unmount = cleanup;
    };

    iframe.src = `/extensions/${id}/bundle.js`;
  }
}

const shell = new PiApexShell();
shell.start().catch(console.error);
