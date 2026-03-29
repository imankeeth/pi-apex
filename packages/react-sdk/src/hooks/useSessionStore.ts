// ============================================================================
// useSessionStore — lightweight snapshot bridge for React extensions
// Reads the shell-provided `window.__APEX_STORE__` snapshot and falls back to
// the injected SDK if the store has not been populated yet.
// ============================================================================

import { useEffect, useState } from "react";
import type { ApexSessionSnapshot } from "@pi-apex/types";

type ApexWindow = Window & {
  __APEX_STORE__?: ApexSessionSnapshot | null;
  __APEX_SDK__?: {
    session?: {
      getMessages?: () => Promise<unknown[]>;
      getThread?: () => Promise<unknown[]>;
      getBranches?: () => Promise<unknown[]>;
      getActiveBranch?: () => Promise<unknown>;
    };
    tools?: {
      getAll?: () => Promise<unknown[]>;
      getActive?: () => Promise<string[]>;
    };
    context?: {
      get?: () => Promise<{
        cwd: string;
        projectName: string;
        gitBranch: string | null;
        model?: string | null;
      }>;
    };
  };
};

async function readSnapshotFromSdk(sdk: NonNullable<ApexWindow["__APEX_SDK__"]>): Promise<ApexSessionSnapshot | null> {
  if (!sdk.session || !sdk.tools || !sdk.context) return null;

  const [messages, thread, branches, tools, activeTools, context] = await Promise.all([
    sdk.session.getMessages?.() ?? Promise.resolve([]),
    sdk.session.getThread?.() ?? Promise.resolve([]),
    sdk.session.getBranches?.() ?? Promise.resolve([]),
    sdk.tools.getAll?.() ?? Promise.resolve([]),
    sdk.tools.getActive?.() ?? Promise.resolve([]),
    sdk.context.get?.() ?? Promise.resolve({
      cwd: "",
      projectName: "",
      gitBranch: null,
      model: null,
    }),
  ]);

  return {
    session: {
      id: "current",
      cwd: context.cwd,
      projectName: context.projectName,
      gitBranch: context.gitBranch,
      model: context.model ?? null,
    },
    messages,
    thread,
    branches,
    tools,
    activeTools,
  } as ApexSessionSnapshot;
}

export function useSessionStore() {
  const [snapshot, setSnapshot] = useState<ApexSessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const win = window as ApexWindow;

    const refresh = async () => {
      const store = win.__APEX_STORE__;
      if (store) {
        if (!mounted) return;
        setSnapshot(store);
        setLoading(false);
        return;
      }

      const sdk = win.__APEX_SDK__;
      if (!sdk) return;

      const next = await readSnapshotFromSdk(sdk);
      if (!mounted || !next) return;
      setSnapshot(next);
      setLoading(false);
    };

    void refresh();
    const interval = globalThis.setInterval(() => {
      void refresh();
    }, 1000);

    return () => {
      mounted = false;
      globalThis.clearInterval(interval);
    };
  }, []);

  return { snapshot, loading };
}
