import type {
  ApexSessionSnapshot,
  Branch,
  HostCapabilities,
  Message,
  RuntimeExtensionInfo,
  ThreadNode,
  ToolDef,
} from "@pi-apex/types";

interface PiRuntimeExtension {
  name?: string;
  source?: string;
  commands?: { name: string; description?: string }[];
  uiCapabilities?: string[];
  status?: string;
}

interface PiRuntimeSession {
  id?: string;
  projectName?: string;
  projectRoot?: string;
  cwd?: string;
  gitBranch?: string | null;
  messages?: Message[];
  thread?: ThreadNode[];
  branches?: Branch[];
  tools?: ToolDef[];
  activeTools?: string[];
  capabilities?: Partial<HostCapabilities>;
}

interface PiRuntime {
  session?: PiRuntimeSession;
  extensions?: Record<string, PiRuntimeExtension>;
  capabilities?: Partial<HostCapabilities>;
  messages?: Message[];
  thread?: ThreadNode[];
  branches?: Branch[];
  tools?: ToolDef[];
  activeTools?: string[];
}

function getRuntime(): PiRuntime {
  const runtime = globalThis as typeof globalThis & { pi?: PiRuntime };
  return runtime.pi ?? {};
}

function gatherSessionInfo(): ApexSessionSnapshot["session"] {
  const runtime = getRuntime();
  const session = runtime.session ?? {};

  return {
    id: session.id ?? "current",
    projectName: session.projectName ?? "Unknown project",
    projectRoot: session.projectRoot ?? session.cwd ?? "",
    cwd: session.cwd ?? "",
    gitBranch: session.gitBranch ?? null,
  };
}

export function gatherMessageHistory(): Message[] {
  const runtime = getRuntime();
  return runtime.messages ?? runtime.session?.messages ?? [];
}

export function gatherThread(): ThreadNode[] {
  const runtime = getRuntime();
  return runtime.thread ?? runtime.session?.thread ?? [];
}

export function gatherBranches(): Branch[] {
  const runtime = getRuntime();
  return runtime.branches ?? runtime.session?.branches ?? [];
}

export function gatherTools(): { tools: ToolDef[]; activeTools: string[] } {
  const runtime = getRuntime();
  return {
    tools: runtime.tools ?? runtime.session?.tools ?? [],
    activeTools: runtime.activeTools ?? runtime.session?.activeTools ?? [],
  };
}

export function gatherRuntimeExtensions(): RuntimeExtensionInfo[] {
  const extensions: RuntimeExtensionInfo[] = [];

  // @ts-ignore - pi is injected by the Pi runtime.
  const piExtensions = (globalThis.pi as { extensions?: Record<string, unknown> } | undefined)?.extensions ?? {};

  for (const [id, ext] of Object.entries(piExtensions)) {
    const extInfo = ext as PiRuntimeExtension;

    extensions.push({
      id,
      name: extInfo.name ?? id,
      source: extInfo.source ?? "project",
      compatibility: "runtime-compatible",
      commands: extInfo.commands ?? [],
      uiCapabilities: extInfo.uiCapabilities ?? [],
      status: extInfo.status,
    });
  }

  return extensions;
}

export function gatherHostCapabilities(): HostCapabilities {
  const runtime = getRuntime();
  const capabilities = runtime.capabilities ?? runtime.session?.capabilities ?? {};

  return {
    session: {
      fork: capabilities.session?.fork ?? false,
      switch: capabilities.session?.switch ?? false,
      compact: capabilities.session?.compact ?? false,
      abort: capabilities.session?.abort ?? false,
    },
    messaging: {
      prompt: capabilities.messaging?.prompt ?? false,
      steer: capabilities.messaging?.steer ?? false,
      followUp: capabilities.messaging?.followUp ?? false,
    },
    ui: {
      notify: capabilities.ui?.notify ?? false,
      confirm: capabilities.ui?.confirm ?? false,
      input: capabilities.ui?.input ?? false,
      select: capabilities.ui?.select ?? false,
      form: capabilities.ui?.form ?? false,
      customView: capabilities.ui?.customView ?? false,
    },
    tools: {
      call: capabilities.tools?.call ?? false,
      intercept: capabilities.tools?.intercept ?? false,
    },
  };
}

export function gatherSessionSnapshot(): ApexSessionSnapshot {
  const runtime = getRuntime();
  const session = gatherSessionInfo();
  const tools = gatherTools();

  return {
    session,
    messages: gatherMessageHistory(),
    thread: gatherThread(),
    branches: gatherBranches(),
    tools: tools.tools,
    activeTools: tools.activeTools,
    extensions: gatherRuntimeExtensions(),
    capabilities: gatherHostCapabilities(),
  };
}
