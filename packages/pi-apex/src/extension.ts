import type { ApexSessionSnapshot, RegisterSessionResponse } from "@pi-apex/types";
import { registerSession } from "./http-client.js";
import { RuntimeEventPublisher } from "./event-stream.js";
import { gatherSessionSnapshot } from "./snapshot.js";

type RegisterCommandHandler = (...args: unknown[]) => unknown;

type PiRuntime = {
  registerCommand?: (...args: unknown[]) => unknown;
  openUrl?: (url: string) => unknown;
  shell?: { openUrl?: (url: string) => unknown };
};

const runtime = new RuntimeEventPublisher();

function getPiRuntime(): PiRuntime {
  return (globalThis as { pi?: PiRuntime }).pi ?? {};
}

function openBrowserUrl(url: string): void {
  const pi = getPiRuntime();

  if (typeof pi.openUrl === "function") {
    void pi.openUrl(url);
    return;
  }

  if (pi.shell && typeof pi.shell.openUrl === "function") {
    void pi.shell.openUrl(url);
    return;
  }

  globalThis.open?.(url, "_blank", "noopener");
}

async function registerRuntimeSession(snapshot: ApexSessionSnapshot): Promise<RegisterSessionResponse> {
  return registerSession(snapshot);
}

async function handleApexCommand(): Promise<void> {
  const snapshot = gatherSessionSnapshot();
  const registration = await registerRuntimeSession(snapshot);
  runtime.start(registration.sessionId);
  openBrowserUrl(registration.url);
}

function registerApexCommand(): void {
  const pi = getPiRuntime();
  if (typeof pi.registerCommand !== "function") {
    return;
  }

  const attempts: Array<() => unknown> = [
    () => pi.registerCommand?.("/apex", handleApexCommand),
    () => pi.registerCommand?.("apex", handleApexCommand),
    () => pi.registerCommand?.({ name: "/apex", handler: handleApexCommand }),
    () => pi.registerCommand?.({ command: "/apex", run: handleApexCommand }),
  ];

  for (const attempt of attempts) {
    try {
      attempt();
      return;
    } catch {
      // Ignore registration failures; the host API shape is not fixed yet.
    }
  }
}

registerApexCommand();

export { runtime as runtimeEventPublisher };
