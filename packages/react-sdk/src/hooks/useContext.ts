// ============================================================================
// useContext — get the current session context (cwd, project, env)
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import { usePi } from "./usePi";
import type { SessionContext } from "@pi-apex/sdk";

export interface UseContextReturn {
  context: SessionContext | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useContext_(): UseContextReturn {
  const { context } = usePi();

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

  return { context: ctx, isLoading, error, refetch: fetch };
}
