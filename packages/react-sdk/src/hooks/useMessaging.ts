// ============================================================================
// useMessaging — send messages to the pi session
// ============================================================================

import { useCallback } from "react";
import { usePi } from "./usePi";
import type { SendOptions } from "@pi-apex/sdk";

export interface UseMessagingReturn {
  send: (text: string, options?: SendOptions) => Promise<void> | void;
  sendAsUser: (text: string) => Promise<void> | void;
  sendAsSystem: (text: string) => Promise<void> | void;
  prompt: (text: string, options?: SendOptions) => Promise<void> | void;
  steer: (text: string) => Promise<void> | void;
  followUp: (text: string) => Promise<void> | void;
  append: (type: string, data: unknown) => Promise<void> | void;
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

  const prompt = useCallback(
    (text: string, options?: SendOptions) => messaging.prompt(text, options),
    [messaging]
  );

  const steer = useCallback(
    (text: string) => messaging.steer(text),
    [messaging]
  );

  const followUp = useCallback(
    (text: string) => messaging.followUp(text),
    [messaging]
  );

  const append = useCallback(
    (type: string, data: unknown) => messaging.append(type, data),
    [messaging]
  );

  return { send, sendAsUser, sendAsSystem, prompt, steer, followUp, append };
}
