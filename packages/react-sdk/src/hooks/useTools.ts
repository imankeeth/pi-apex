// ============================================================================
// useTools — read available tools, call them, intercept them
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import { usePi } from "./usePi";
import type { ToolDef, ToolResult, ToolCall, InterceptHandler } from "@pi-apex/sdk";
import { useSessionStore } from "./useSessionStore.js";

export interface UseToolsReturn {
  tools: ToolDef[];
  activeTools: string[];
  isLoading: boolean;
  error: string | null;
  setActive: (names: string[]) => void;
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  intercept: (name: string, handler: InterceptHandler) => void;
  refetch: () => void;
}

export function useTools(): UseToolsReturn {
  const { tools } = usePi();
  const { snapshot } = useSessionStore();

  const [tools_, setTools] = useState<ToolDef[]>([]);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [all, active] = await Promise.all([
        tools.getAll(),
        tools.getActive(),
      ]);
      setTools(all);
      setActiveTools(active);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [tools]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (!snapshot) return;
    if (Array.isArray(snapshot.tools)) {
      setTools(snapshot.tools as ToolDef[]);
    }
    if (Array.isArray(snapshot.activeTools)) {
      setActiveTools(snapshot.activeTools as string[]);
    }
  }, [snapshot]);

  const callTool = useCallback(
    (name: string, args: Record<string, unknown>) => tools.call(name, args),
    [tools]
  );

  const setActive = useCallback(
    (names: string[]) => {
      void tools.setActive(names);
      setActiveTools(names);
    },
    [tools]
  );

  const intercept = useCallback(
    (name: string, handler: InterceptHandler) => tools.intercept(name, handler),
    [tools]
  );

  return { tools: tools_, activeTools, isLoading, error, setActive, callTool, intercept, refetch: fetch };
}
