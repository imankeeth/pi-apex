// ============================================================================
// useContext — get the current session context (cwd, project, env)
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import { usePi } from "./usePi";
import type { SessionContext } from "@pi-apex/sdk";
import { useSessionStore } from "./useSessionStore.js";

export interface UseContextReturn {
  context: SessionContext | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useContext_(): UseContextReturn {
  const { context } = usePi();
  const { snapshot } = useSessionStore();

  const [ctx, setCtx] = useState<SessionContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await context.get();
      setCtx(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [context]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (!snapshot) return;
    setCtx({
      cwd: snapshot.session.cwd,
      projectName: snapshot.session.projectName ?? "",
      gitBranch: snapshot.session.gitBranch ?? null,
      model: snapshot.session.model ?? null,
      env: {},
      files: null,
    });
  }, [snapshot]);

  return { context: ctx, isLoading, error, refetch: fetch };
}
