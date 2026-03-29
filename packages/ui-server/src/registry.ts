import type { ApexSessionSnapshot, ApexSessionSummary } from "@pi-apex/types";

interface RegistryEntry {
  snapshot: ApexSessionSnapshot;
  registeredAt: number;
  lastActivityAt: number;
}

const sessions = new Map<string, RegistryEntry>();
let currentSessionId: string | null = null;

function cloneSnapshot(snapshot: ApexSessionSnapshot): ApexSessionSnapshot {
  return {
    session: { ...snapshot.session },
    messages: [...snapshot.messages],
    thread: [...snapshot.thread],
    branches: snapshot.branches ? [...snapshot.branches] : undefined,
    tools: [...snapshot.tools],
    activeTools: [...snapshot.activeTools],
    extensions: [...snapshot.extensions],
    capabilities: {
      session: { ...snapshot.capabilities.session },
      messaging: { ...snapshot.capabilities.messaging },
      ui: { ...snapshot.capabilities.ui },
      tools: { ...snapshot.capabilities.tools },
    },
  };
}

function mergeSnapshot(
  current: ApexSessionSnapshot,
  patch: Partial<ApexSessionSnapshot>
): ApexSessionSnapshot {
  return {
    session: patch.session ? { ...current.session, ...patch.session } : current.session,
    messages: patch.messages !== undefined ? [...patch.messages] : current.messages,
    thread: patch.thread !== undefined ? [...patch.thread] : current.thread,
    branches: patch.branches !== undefined ? [...patch.branches] : current.branches,
    tools: patch.tools !== undefined ? [...patch.tools] : current.tools,
    activeTools: patch.activeTools !== undefined ? [...patch.activeTools] : current.activeTools,
    extensions: patch.extensions !== undefined ? [...patch.extensions] : current.extensions,
    capabilities: patch.capabilities ?? current.capabilities,
  };
}

export const registry = {
  register(snapshot: ApexSessionSnapshot): string {
    const id = snapshot.session.id;
    const now = Date.now();
    sessions.set(id, {
      snapshot: cloneSnapshot(snapshot),
      registeredAt: now,
      lastActivityAt: now,
    });
    return id;
  },

  get(sessionId: string): ApexSessionSnapshot | null {
    const entry = sessions.get(sessionId);
    return entry ? cloneSnapshot(entry.snapshot) : null;
  },

  getCurrent(): ApexSessionSnapshot | null {
    return currentSessionId ? this.get(currentSessionId) : null;
  },

  list(): ApexSessionSummary[] {
    return [...sessions.entries()].map(([id, entry]) => ({
      ...entry.snapshot.session,
      id,
      lastActivityAt: entry.lastActivityAt,
      registeredAt: entry.registeredAt,
    }));
  },

  setCurrent(sessionId: string | null): void {
    currentSessionId = sessionId;
  },

  getCurrentSessionId(): string | null {
    return currentSessionId;
  },

  update(sessionId: string, patch: Partial<ApexSessionSnapshot>): ApexSessionSnapshot | null {
    const entry = sessions.get(sessionId);
    if (!entry) return null;

    entry.snapshot = mergeSnapshot(entry.snapshot, patch);
    entry.lastActivityAt = Date.now();
    return cloneSnapshot(entry.snapshot);
  },

  remove(sessionId: string): boolean {
    const removed = sessions.delete(sessionId);
    if (removed && currentSessionId === sessionId) {
      currentSessionId = null;
    }
    return removed;
  },
};
