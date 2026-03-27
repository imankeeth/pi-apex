// ============================================================================
// pi-apex Shell — client-side runtime.
// Minimal: loads extensions, manages tabs, wires iframe bridge to SDK.
// All UI is built via the SDK by extensions.
// ============================================================================

import { IframeBridge, loadExtensionBundle, type ExtensionManifest, type PiSDK } from "@pi-apex/sdk";

declare global {
  interface Window {
    __PI_APEX_CONFIG__: {
      extensions: { type: string; id?: string; name?: string; path?: string }[];
      theme?: "dark" | "light";
      defaults?: { activeTab?: string; tabOrder?: string[] };
    };
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

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
  private sdkBridge: Partial<PiSDK> = {};
  private tabBar: HTMLElement;
  private iframeContainer: HTMLElement;
  private iframe: HTMLIFrameElement;

  constructor() {
    this.tabBar = document.getElementById("tab-bar")!;
    this.iframeContainer = document.getElementById("pi-apex-iframe-container")!;
    this.iframe = document.getElementById("pi-apex-ext-iframe") as HTMLIFrameElement;
  }

  async start(): Promise<void> {
    await this.loadExtensions();
    this.buildTabBar();
    await this.buildSdkBridge();
    const defaultTab = this.config.defaults?.activeTab ?? this.firstExtensionId();
    if (defaultTab) this.activateTab(defaultTab);
  }

  private firstExtensionId(): string | null {
    for (const ext of this.config.extensions) {
      if ("id" in ext && ext.id) return ext.id;
    }
    return null;
  }

  // ─── Load all extension manifests ─────────────────────────────────────────

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
        console.error(`[pi-apex] Failed to load extension:`, err);
      }
    }
  }

  private async fetchManifest(id: string): Promise<ExtensionManifest> {
    const res = await fetch(`/extensions/${id}/manifest.json`);
    if (!res.ok) throw new Error(`Manifest not found: ${id}`);
    return res.json() as Promise<ExtensionManifest>;
  }

  private createIframe(): HTMLIFrameElement {
    const iframe = document.createElement("iframe");
    iframe.className = "pi-apex-iframe";
    iframe.sandbox.add("allow-scripts", "allow-same-origin");
    iframe.style.display = "none";
    return iframe;
  }

  // ─── Build the SDK bridge — what extensions can call ─────────────────────

  private async buildSdkBridge(): Promise<void> {
    // Real implementation wires to pi backend API
    // For now: mock implementation so extensions work standalone
    this.sdkBridge = {
      session: {
        getMessages: async () => [],
        getThread: async () => [],
        getBranches: async () => [],
        fork: async (label?: string) => ({
          id: `branch-${Date.now()}`,
          label: label ?? "new branch",
          createdAt: Date.now(),
          headNodeId: null,
          isActive: true,
        }),
        switch: (_branchId: string) => {},
        getActiveBranch: async () => null,
      },
      messaging: {
        send: (text: string, _opts?: unknown) => {
          console.log("[pi-apex] messaging.send:", text);
          // Proxy to pi backend
          fetch("/api/pi/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text }),
          }).catch(console.error);
        },
        sendAsUser: (text: string) => this.sdkBridge.messaging!.send(text, { deliverAs: "user" }),
        sendAsSystem: (text: string) => this.sdkBridge.messaging!.send(text, { deliverAs: "system" }),
        append: (_type: string, _data: unknown) => {},
      },
      tools: {
        getAll: async () => [],
        getActive: () => [],
        setActive: () => {},
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
        get: async () => ({
          cwd: "",
          projectName: "",
          gitBranch: null,
          env: {},
          files: null,
        }),
      },
    };
  }

  // ─── Build tab bar ────────────────────────────────────────────────────────

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

  // ─── Activate a tab ──────────────────────────────────────────────────────

  private async activateTab(id: string): Promise<void> {
    const ext = this.extensions.get(id);
    if (!ext) return;

    // Deactivate current tab
    if (this.activeTabId) {
      const prevExt = this.extensions.get(this.activeTabId);
      if (prevExt) {
        prevExt.unmount?.();
        prevExt.iframe.style.display = "none";
        prevExt.iframe.classList.remove("active");
      }
    }

    this.activeTabId = id;
    this.buildTabBar(); // re-render to update active state

    // Mount extension iframe
    const iframe = ext.iframe;
    iframe.classList.add("active");
    iframe.style.display = "block";

    if (!this.iframeContainer.contains(iframe)) {
      this.iframeContainer.appendChild(iframe);
    }

    // Create bridge for this extension
    ext.bridge = new IframeBridge(iframe, {
      exposed: this.sdkBridge as Record<string, (...args: unknown[]) => unknown>,
    });

    // Wire iframe load → mount extension
    iframe.onload = () => {
      if (iframe.contentWindow) {
        ext.bridge?.setTargetOrigin("*");
      }
        const cleanup = ext.entry.mount(ext.bridge as unknown as PiSDK);
        if (typeof cleanup === "function") ext.unmount = cleanup;
    };

    // Load extension bundle
    iframe.src = `/extensions/${id}/bundle.js`;
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

const shell = new PiApexShell();
shell.start().catch(console.error);
