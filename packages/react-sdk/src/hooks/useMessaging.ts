// ============================================================================
// useMessaging — send messages to the pi session
// ============================================================================

import { useCallback } from "react";
import { usePi } from "./usePi";
import type { SendOptions } from "@pi-apex/sdk";

export interface UseMessagingReturn {
  send: (text: string, options?: SendOptions) => void;
  sendAsUser: (text: string) => void;
  sendAsSystem: (text: string) => void;
  append: (type: string, data: unknown) => void;
}

export function useMessaging(): UseMessagingReturn {
  const { messaging } = usePi();

  const send = useCallback(
    (text: string, options?: SendOptions) => messaging.send(text, options),
    [messaging]
  );

  const sendAsUser = useCallback(
    (text: string) => messaging.sendAsUser(text),
    [messaging]
  );

  const sendAsSystem = useCallback(
    (text: string) => messaging.sendAsSystem(text),
    [messaging]
  );

  const append = useCallback(
    (type: string, data: unknown) => messaging.append(type, data),
    [messaging]
  );

  return { send, sendAsUser, sendAsSystem, append };
}
