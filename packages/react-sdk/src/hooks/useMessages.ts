// ============================================================================
// useMessages — read message history and subscribe to live message events
// ============================================================================

import { useEffect, useState } from "react";
import { useSessionStore } from "./useSessionStore.js";

type MessageLike = {
  id?: string;
  timestamp?: number;
  content?: string;
};

type ApexWindow = Window & {
  __APEX_SDK__?: {
    events?: {
      onMessage?: (fn: (msg: unknown) => void) => () => void;
    };
  };
};

function dedupeMessages(messages: unknown[]): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];

  for (const message of messages) {
    const id = typeof message === "object" && message !== null ? (message as MessageLike).id : undefined;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    result.push(message);
  }

  return result;
}

export function useMessages() {
  const { snapshot } = useSessionStore();
  const [messages, setMessages] = useState<unknown[]>([]);

  useEffect(() => {
    if (snapshot && Array.isArray(snapshot.messages)) {
      setMessages(dedupeMessages(snapshot.messages));
    }
  }, [snapshot]);

  useEffect(() => {
    const sdk = (window as ApexWindow).__APEX_SDK__;
    const events = sdk?.events;
    if (!events?.onMessage) return;

    const unsubscribe = events.onMessage((msg: unknown) => {
      setMessages((prev) => dedupeMessages([...prev, msg]));
    });

    return unsubscribe;
  }, []);

  return messages;
}
