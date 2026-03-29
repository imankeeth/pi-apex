// ============================================================================
// useThread — read the current session thread from the shell snapshot
// ============================================================================

import { useEffect, useState } from "react";
import type { ThreadNode } from "@pi-apex/sdk";
import { useSessionStore } from "./useSessionStore.js";

export function useThread() {
  const { snapshot } = useSessionStore();
  const [thread, setThread] = useState<ThreadNode[]>([]);

  useEffect(() => {
    if (snapshot && Array.isArray(snapshot.thread)) {
      setThread(snapshot.thread as ThreadNode[]);
    }
  }, [snapshot]);

  return thread;
}
