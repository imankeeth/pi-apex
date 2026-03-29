// ============================================================================
// useSession — read and manipulate the pi conversation session
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import { usePi } from "./usePi";
import type { Message, ThreadNode, Branch } from "@pi-apex/sdk";
import { useSessionStore } from "./useSessionStore.js";

export interface UseSessionReturn {
  messages: Message[];
  thread: ThreadNode[];
  branches: Branch[];
  activeBranch: Branch | null;
  isLoading: boolean;
  error: string | null;
  fork: (label?: string) => Promise<Branch>;
  switchBranch: (branchId: string) => void;
  refetch: () => void;
}

export function useSession(): UseSessionReturn {
  const { session } = usePi();
  const { snapshot, loading: storeLoading } = useSessionStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [thread, setThread] = useState<ThreadNode[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!snapshot) return;
    if (Array.isArray(snapshot.messages)) {
      setMessages(snapshot.messages as Message[]);
    }
    if (Array.isArray(snapshot.thread)) {
      setThread(snapshot.thread as ThreadNode[]);
    }
    if (Array.isArray(snapshot.branches)) {
      setBranches(snapshot.branches as Branch[]);
      setActiveBranch((snapshot.branches as Branch[]).find((branch) => branch.isActive) ?? null);
    }
  }, [snapshot]);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [msgs, thr, brs, active] = await Promise.all([
        session.getMessages(),
        session.getThread(),
        session.getBranches(),
        session.getActiveBranch(),
      ]);
      setMessages(msgs);
      setThread(thr);
      setBranches(brs);
      setActiveBranch(active);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const fork = useCallback(async (label?: string) => {
    const branch = await session.fork(label);
    await fetch();
    return branch;
  }, [session, fetch]);

  const switchBranch = useCallback((branchId: string) => {
    void session.switch(branchId).then(fetch);
  }, [session, fetch]);

  return {
    messages,
    thread,
    branches,
    activeBranch,
    isLoading: isLoading || storeLoading,
    error,
    fork,
    switchBranch,
    refetch: fetch,
  };
}
