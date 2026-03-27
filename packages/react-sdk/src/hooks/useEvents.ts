// ============================================================================
// useEvents — subscribe to real-time pi session events
// ============================================================================

import { useEffect, useRef } from "react";
import { usePi } from "./usePi";
import type { ToolCall, ToolResult, Message, ThinkingState, Branch, Unsubscribe } from "@pi-apex/sdk";

export interface UseEventsOptions {
  onToolCall?: (tc: ToolCall) => void;
  onToolResult?: (tr: ToolResult) => void;
  onMessage?: (msg: Message) => void;
  onThinking?: (state: ThinkingState) => void;
  onFork?: (branch: Branch) => void;
  onSwitch?: (branch: Branch) => void;
  onReset?: () => void;
}

/**
 * useEvents — subscribe to pi session events.
 * Automatically cleans up subscriptions on unmount.
 *
 * @example
 * useEvents({
 *   onToolResult: (tr) => console.log('tool result:', tr),
 *   onMessage: (msg) => console.log('message:', msg),
 * });
 */
export function useEvents(opts: UseEventsOptions): void {
  const { events } = usePi();
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const unsubs: Unsubscribe[] = [];

    if (optsRef.current.onToolCall) {
      unsubs.push(events.onToolCall(optsRef.current.onToolCall));
    }
    if (optsRef.current.onToolResult) {
      unsubs.push(events.onToolResult(optsRef.current.onToolResult));
    }
    if (optsRef.current.onMessage) {
      unsubs.push(events.onMessage(optsRef.current.onMessage));
    }
    if (optsRef.current.onThinking) {
      unsubs.push(events.onThinking(optsRef.current.onThinking));
    }
    if (optsRef.current.onFork) {
      unsubs.push(events.onFork(optsRef.current.onFork));
    }
    if (optsRef.current.onSwitch) {
      unsubs.push(events.onSwitch(optsRef.current.onSwitch));
    }
    if (optsRef.current.onReset) {
      unsubs.push(events.onReset(optsRef.current.onReset));
    }

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [events]);
}

// ─── Typed individual hooks for granular use ─────────────────────────────────

export function useOnToolCall(fn: (tc: ToolCall) => void): void {
  useEvents({ onToolCall: fn });
}

export function useOnToolResult(fn: (tr: ToolResult) => void): void {
  useEvents({ onToolResult: fn });
}

export function useOnMessage(fn: (msg: Message) => void): void {
  useEvents({ onMessage: fn });
}
