import type {
  ApexSessionSnapshot,
  Branch,
  HostCapabilities,
  Message,
  RuntimeExtensionInfo,
  ThreadNode,
  ToolDef,
} from "@pi-apex/types";

type PiRuntime = Record<string, unknown> & {
  session?: Record<string, unknown>;
  tools?: Record<string, unknown>;
  events?: Record<string, unknown>;
  extensions?: unknown;
  runtimeExtensions?: unknown;
  model?: string;
  provider?: string;
  cwd?: string;
  projectName?: string;
  projectRoot?: string;
  gitBranch?: string;
  isStreaming?: boolean;
};

function getPiRuntime(): PiRuntime {
  return (globalThis as { pi?: PiRuntime }).pi ?? {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function readSessionValue<T>(runtime: PiRuntime, key: string, fallback?: T): T | undefined {
  const session = runtime.session;
  if (session && key in session) {
    return session[key] as T;
  }
  if (key in runtime) {
    return runtime[key] as T;
  }
  return fallback;
}

function gatherBranches(runtime: PiRuntime): Branch[] {
  const session = runtime.session;
  const branchSource =
    session && "getBranches" in session && typeof session.getBranches === "function"
      ? session.getBranches
      : session?.branches;

  if (typeof branchSource === "function") {
    return asArray<Branch>(branchSource.call(session));
  }

  return asArray<Branch>(branchSource);
}

export function gatherHostCapabilities(): HostCapabilities {
  return {
    session: { getMessages: true, getThread: true, getBranches: true, fork: true, switch: true, getActiveBranch: true },
    messaging: { send: true, sendAsUser: true, sendAsSystem: true, append: true },
    ui: { theme: true, tabs: true, panels: true },
    tools: { getAll: true, getActive: true, setActive: true, call: true, intercept: true },
  };
}

export function gatherMessageHistory(): Message[] {
  const runtime = getPiRuntime();
  const session = runtime.session;

  if (session && typeof session.getMessages === "function") {
    return asArray<Message>(session.getMessages.call(session));
  }

  return asArray<Message>(
    readSessionValue<unknown>(runtime, "messages", readSessionValue<unknown>(runtime, "history", []))
  );
}

export function gatherThread(): ThreadNode[] {
  const runtime = getPiRuntime();
  const session = runtime.session;

  if (session && typeof session.getThread === "function") {
    return asArray<ThreadNode>(session.getThread.call(session));
  }

  return asArray<ThreadNode>(readSessionValue<unknown>(runtime, "thread", []));
}

export function gatherTools(): { tools: ToolDef[]; activeTools: string[] } {
  const runtime = getPiRuntime();
  const tools = runtime.tools;

  const gatheredTools =
    tools && typeof tools.getAll === "function"
      ? asArray<ToolDef>(tools.getAll.call(tools))
      : asArray<ToolDef>(readSessionValue<unknown>(runtime, "tools", []));

  const activeTools =
    tools && typeof tools.getActive === "function"
      ? asArray<string>(tools.getActive.call(tools))
      : asArray<string>(readSessionValue<unknown>(runtime, "activeTools", []));

  return { tools: gatheredTools, activeTools };
}

export function gatherRuntimeExtensions(): RuntimeExtensionInfo[] {
  const runtime = getPiRuntime();
  return asArray<RuntimeExtensionInfo>(runtime.runtimeExtensions ?? runtime.extensions ?? []);
}

export function gatherSessionSnapshot(): ApexSessionSnapshot {
  const runtime = getPiRuntime();
  const { tools, activeTools } = gatherTools();
  const sessionId =
    (readSessionValue<string>(runtime, "id") ?? readSessionValue<string>(runtime, "sessionId") ?? "unknown-session");

  return {
    session: {
      id: sessionId,
      file: readSessionValue<string>(runtime, "file"),
      name: readSessionValue<string>(runtime, "name"),
      cwd: readSessionValue<string>(runtime, "cwd") ?? process.cwd(),
      projectName: readSessionValue<string>(runtime, "projectName"),
      projectRoot: readSessionValue<string>(runtime, "projectRoot"),
      gitBranch: readSessionValue<string>(runtime, "gitBranch"),
      provider: readSessionValue<string>(runtime, "provider"),
      model: readSessionValue<string>(runtime, "model"),
      isStreaming: Boolean(readSessionValue<boolean>(runtime, "isStreaming", false)),
    },
    messages: gatherMessageHistory(),
    thread: gatherThread(),
    branches: gatherBranches(runtime),
    tools,
    activeTools,
    extensions: gatherRuntimeExtensions(),
    capabilities: gatherHostCapabilities(),
  };
}
